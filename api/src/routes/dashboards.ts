import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { safeJsonParse } from '../utils/json.js';
import {
  generatePanel,
  generateDefaultDashboard,
  calculatePosition,
  type PanelConfig,
} from '../services/dashboard-generator.js';
import {
  getDashboards,
  getDashboard,
  getDashboardPanels,
  createDashboard,
  createDashboardPanel,
  updateDashboardPanel,
  deleteDashboardPanel,
  getDashboardPanel,
  copyDashboardPanel,
  getPanelProvenance,
  deleteDashboard,
  updateDashboard,
  getDashboardByToken,
  updatePanelPositions,
  getDashboardVariables,
  getDashboardVariable,
  createDashboardVariable,
  updateDashboardVariable,
  deleteDashboardVariable,
  getDashboardAnnotations,
  createDashboardAnnotation,
  deleteDashboardAnnotation,
  getDashboardTemplates,
  getDashboardTemplate,
  createDashboardTemplate,
  incrementTemplateDownloads,
  getAppScopes,
  getDashboardPages,
  getDashboardPage,
  createDashboardPage,
  updateDashboardPage,
  deleteDashboardPage,
  reorderDashboardPages,
  addDashboardLogo,
  getDashboardLogos,
  removeDashboardLogo,
  reorderDashboardLogos,
  getProjects,
} from '../db/sqlite.js';
import { authenticate, denyReadonly, rateLimit } from '../auth/middleware.js';
import { requireOwnerOrAdmin, withOwnership } from '../auth/ownership.js';
import { executeDSLQuery } from '../db/backend.js';

const router = Router();

// Never hand the bcrypt hash of a share password to API clients; expose only
// whether one is set. (The share modal used to pre-fill its password field
// with the hash and re-submit it.)
function presentDashboard<T extends { public_password?: string | null }>(d: T): Omit<T, 'public_password'> & { has_password: boolean } {
  const { public_password, ...rest } = d;
  return { ...rest, has_password: !!public_password };
}

// ---- Dashboard variables ----
//
// The `query` column doubles as the value list for `custom` variables (one
// value per line). API clients see it as `custom_values`; the DSL query only
// for `query` variables.
const INTERVAL_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d', '7d'];
const MAX_VARIABLE_OPTIONS = 500;

function splitCustomValues(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(/[\n,]/).map(v => v.trim()).filter(Boolean)));
}

function variableSource(type: string | undefined, query: unknown, customValues: unknown): string | undefined {
  if (type === 'custom') return typeof customValues === 'string' ? customValues : (typeof query === 'string' ? query : '');
  if (type === 'query') return typeof query === 'string' ? query : '';
  if (type === undefined) return typeof query === 'string' ? query : undefined;
  return '';
}

function presentVariable<T extends { type: string; query?: string | null }>(v: T): T & { custom_values: string } {
  return { ...v, custom_values: v.type === 'custom' ? (v.query || '') : '' };
}

async function resolveVariableOptions(
  type: string,
  source: string | null | undefined,
  opts: { earliest: string; latest: string; allowedIndexes?: string[] }
): Promise<string[]> {
  if (type === 'custom') return splitCustomValues(source);
  if (type === 'interval') return INTERVAL_OPTIONS;
  if (type !== 'query' || !source) return [];

  const { results } = await executeDSLQuery(source, opts);
  const rows = results as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const column = Object.keys(rows[0])[0];
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined || value === '') continue;
    seen.add(String(value));
    if (seen.size >= MAX_VARIABLE_OPTIONS) break;
  }
  return Array.from(seen);
}

// #35 CARVE-OUT: public dashboard viewing by share token must stay reachable
// WITHOUT a logged-in user. It is registered BEFORE router.use(authenticate) so
// the auth guard below never applies to it. Access is gated by the unguessable
// token (+ optional password) instead.
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    // Prefer the header (query-string passwords leak into access logs); fall
    // back to the query param for older links.
    const password = req.header('X-Dashboard-Password') || req.query.password;

    const dashboard = getDashboardByToken(token);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found or link expired' });
    }

    // Check password if required
    if (dashboard.public_password) {
      if (!password) {
        return res.status(401).json({ error: 'Password required', needs_password: true });
      }
      const passwordMatch = await bcrypt.compare(String(password), dashboard.public_password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid password', needs_password: true });
      }
    }

    // Get panels for the dashboard. Rows carry flat position_x/y/width/height;
    // the public viewer (like the authenticated one) expects a `position`
    // object, and without it every shared dashboard with panels white-screened.
    const panels = getDashboardPanels(dashboard.id).map(p => ({
      ...p,
      options: safeJsonParse(p.options, {}),
      position: { x: p.position_x, y: p.position_y, w: p.width, h: p.height },
    }));
    const pages = getDashboardPages(dashboard.id);
    const variables = getDashboardVariables(dashboard.id);

    return res.json({
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      layout: dashboard.layout,
      logo_url: dashboard.logo_url,
      accent_color: dashboard.accent_color,
      header_color: dashboard.header_color,
      panels,
      pages,
      variables,
    });
  } catch (error) {
    console.error('Error fetching public dashboard:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Public panel data for a shared dashboard. Anonymous viewers previously got
// empty panels because the public page called the AUTHENTICATED /search/query
// and silently 401'd. This runs ONLY a stored panel's own query (looked up by
// panelId within the shared dashboard), so a public viewer can't run arbitrary
// queries. Password is taken from the body (not the query string) so it doesn't
// leak into access logs. Registered BEFORE the auth guard.
router.post('/public/:token/query', rateLimit(60, 60000), async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { panelId, earliest, latest, password } = req.body || {};

    const dashboard = getDashboardByToken(token);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found or link expired' });
    }

    if (dashboard.public_password) {
      if (!password) {
        return res.status(401).json({ error: 'Password required', needs_password: true });
      }
      const ok = await bcrypt.compare(String(password), dashboard.public_password);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid password', needs_password: true });
      }
    }

    const panels = getDashboardPanels(dashboard.id);
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) {
      return res.status(404).json({ error: 'Panel not found' });
    }

    // Substitute variable placeholders with their stored default values so
    // parameterized panels don't fail for anonymous viewers.
    let query = panel.query;
    const variables = getDashboardVariables(dashboard.id);
    for (const v of variables) {
      if (v.default_value != null) {
        query = query.split(`$${v.name}$`).join(String(v.default_value));
      }
    }

    const result = await executeDSLQuery(query, {
      earliest: earliest || '-24h',
      latest: latest || 'now',
    });
    return res.json({ results: result.results });
  } catch (error) {
    console.error('Error running public panel query:', error);
    return res.status(500).json({ error: 'Failed to run panel query' });
  }
});

// #35/#36: every other dashboard route requires auth; read-only roles cannot
// mutate. Dashboards are user-owned, so normal authenticated users keep access.
router.use(authenticate);
router.use(denyReadonly);

// Ownership: any mutation of an existing dashboard (its panels, pages,
// variables, share settings, branding, layout, logos …) is limited to the
// owner or an admin. Applied once here rather than in 28 handlers; reads are
// open to every authenticated user. Legacy dashboards with no owner stay
// editable by everyone.
router.use('/:id', (req: Request, res: Response, next) => {
  if (req.method === 'GET') return next();
  // Collection-level POSTs (e.g. /from-wizard, /import) are not dashboard ids.
  const dashboard = getDashboard(req.params.id);
  if (!dashboard) return next();
  if (!requireOwnerOrAdmin(req, res, dashboard, 'dashboard')) return;
  next();
});

// Get all available app scopes
router.get('/app-scopes', (_req: Request, res: Response) => {
  try {
    const scopes = getAppScopes();
    return res.json(scopes);
  } catch (error) {
    console.error('Error fetching app scopes:', error);
    return res.status(500).json({ error: 'Failed to fetch app scopes' });
  }
});

// Get all dashboards (optionally filtered by app_scope)
router.get('/', (req: Request, res: Response) => {
  try {
    const appScope = req.query.app_scope as string | undefined;
    const dashboards = getDashboards(appScope);
    return res.json(dashboards.map(d => withOwnership(req, presentDashboard(d))));
  } catch (error) {
    console.error('Error fetching dashboards:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

// Get all panels from all dashboards (for panel picker)
// NOTE: This route MUST be before /:id to avoid path matching issues
router.get('/all-panels', (_req: Request, res: Response) => {
  try {
    const dashboards = getDashboards();
    const projects = getProjects();

    const projectMap = new Map(projects.map(p => [p.id, p]));

    const result = dashboards.map(dashboard => {
      const panels = getDashboardPanels(dashboard.id);
      const project = dashboard.project_id ? projectMap.get(dashboard.project_id) : null;

      return {
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          project: project ? { id: project.id, name: project.name } : null,
        },
        panels: panels.map(panel => ({
          id: panel.id,
          title: panel.title,
          visualization: panel.visualization,
          query: panel.query,
        })),
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('Error fetching all panels:', error);
    return res.status(500).json({ error: 'Failed to fetch panels' });
  }
});

// Template routes MUST be registered before '/:id', otherwise GET /templates
// is matched as getDashboard('templates') and 404s (breaking the onboarding
// template gallery).
router.get('/templates', (_req: Request, res: Response) => {
  try {
    const category = _req.query.category as string | undefined;
    const templates = getDashboardTemplates(category);
    return res.json(templates.map(t => ({
      ...t,
      template_json: undefined, // Don't send full template in list
      required_sources: safeJsonParse(t.required_sources, []),
    })));
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/templates/:templateId', (req: Request, res: Response) => {
  try {
    const template = getDashboardTemplate(req.params.templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    incrementTemplateDownloads(template.id);

    return res.json({
      ...template,
      template_json: safeJsonParse(template.template_json, {}),
      required_sources: safeJsonParse(template.required_sources, []),
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Get a single dashboard with its panels and pages
router.get('/:id', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const panels = getDashboardPanels(req.params.id);
    const pages = getDashboardPages(req.params.id);

    return res.json({
      ...withOwnership(req, presentDashboard(dashboard)),
      panels: panels.map(p => ({
        ...p,
        options: safeJsonParse(p.options, {}),
      })),
      pages,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Create a new dashboard
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, app_scope, category, project_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const dashboard = createDashboard(name, description, app_scope, category, project_id, req.user?.id ?? null);
    return res.status(201).json(withOwnership(req, dashboard));
  } catch (error) {
    console.error('Error creating dashboard:', error);
    return res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

// Create dashboard from wizard (index-based auto-generation)
router.post('/from-wizard', (req: Request, res: Response) => {
  try {
    const { name, index, panels, useDefaults, app_scope } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Dashboard name is required' });
    }

    if (!index) {
      return res.status(400).json({ error: 'Index name is required' });
    }

    // Create the dashboard - use app_scope if provided, otherwise use the index as the scope
    const dashboard = createDashboard(name, `Auto-generated dashboard for index: ${index}`, app_scope || index);

    let createdPanels: Array<{ id: string; title: string; vizType: string }> = [];

    // If useDefaults is true and no panels specified, generate default dashboard
    if (useDefaults && (!panels || panels.length === 0)) {
      // Generate default panels based on common fields
      const defaultFields = [
        { name: 'timestamp', recommended_viz: ['line'] },
        { name: 'severity', recommended_viz: ['pie', 'heatmap', 'bar'] },
        { name: 'hostname', recommended_viz: ['bar', 'pie', 'table'] },
        { name: 'app_name', recommended_viz: ['bar', 'pie', 'table'] },
      ];

      const defaultPanels = generateDefaultDashboard(index, defaultFields);

      for (const panelConfig of defaultPanels) {
        const panel = createDashboardPanel(
          dashboard.id,
          panelConfig.title,
          panelConfig.query,
          panelConfig.vizType,
          {},
          {
            x: panelConfig.position.x,
            y: panelConfig.position.y,
            width: panelConfig.position.w,
            height: panelConfig.position.h,
          }
        );
        createdPanels.push({
          id: panel.id,
          title: panelConfig.title,
          vizType: panelConfig.vizType,
        });
      }
    } else if (panels && panels.length > 0) {
      // Create panels from wizard selections
      for (let i = 0; i < panels.length; i++) {
        const panelSpec = panels[i];
        const { field, vizType, position } = panelSpec;

        // Generate panel config using the dashboard-generator service
        const panelConfig = generatePanel({
          field,
          vizType,
          index,
          position: position || calculatePosition(i, panels.length),
        });

        const panel = createDashboardPanel(
          dashboard.id,
          panelConfig.title,
          panelConfig.query,
          panelConfig.vizType,
          {},
          {
            x: panelConfig.position.x,
            y: panelConfig.position.y,
            width: panelConfig.position.w,
            height: panelConfig.position.h,
          }
        );

        createdPanels.push({
          id: panel.id,
          title: panelConfig.title,
          vizType: panelConfig.vizType,
        });
      }
    }

    // Return the created dashboard with summary
    const allPanels = getDashboardPanels(dashboard.id);
    return res.status(201).json({
      dashboard_id: dashboard.id,
      name: dashboard.name,
      panels_created: createdPanels.length,
      panels: allPanels.map(p => ({
        ...p,
        options: safeJsonParse(p.options, {}),
      })),
    });
  } catch (error) {
    console.error('Error creating dashboard from wizard:', error);
    return res.status(500).json({ error: 'Failed to create dashboard from wizard' });
  }
});

// Add a panel to a dashboard
router.post('/:id/panels', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { title, description, query, visualization, options, position, page_id } = req.body;

    if (!title || !query) {
      return res.status(400).json({ error: 'Title and query are required' });
    }

    if (page_id && !getDashboardPages(req.params.id).some(p => p.id === page_id)) {
      return res.status(400).json({ error: 'page_id does not belong to this dashboard' });
    }

    const panel = createDashboardPanel(
      req.params.id,
      title,
      query,
      visualization,
      options,
      position,
      description,
      page_id || null
    );

    return res.status(201).json({
      ...panel,
      options: safeJsonParse(panel.options, {}),
    });
  } catch (error) {
    console.error('Error creating panel:', error);
    return res.status(500).json({ error: 'Failed to create panel' });
  }
});

// Update a panel
router.put('/:id/panels/:panelId', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { title, description, query, visualization, options, position_x, position_y, width, height, page_id } = req.body;

    if (page_id && !getDashboardPages(req.params.id).some(p => p.id === page_id)) {
      return res.status(400).json({ error: 'page_id does not belong to this dashboard' });
    }

    const panel = updateDashboardPanel(req.params.panelId, {
      title,
      description,
      query,
      visualization,
      options,
      position_x,
      position_y,
      width,
      height,
      page_id,
    });

    if (!panel) {
      return res.status(404).json({ error: 'Panel not found' });
    }

    return res.json({
      ...panel,
      options: safeJsonParse(panel.options, {}),
    });
  } catch (error) {
    console.error('Error updating panel:', error);
    return res.status(500).json({ error: 'Failed to update panel' });
  }
});

// Delete a panel
router.delete('/:id/panels/:panelId', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const deleted = deleteDashboardPanel(req.params.panelId);
    if (!deleted) {
      return res.status(404).json({ error: 'Panel not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting panel:', error);
    return res.status(500).json({ error: 'Failed to delete panel' });
  }
});

// Copy a panel from another dashboard
router.post('/:id/panels/copy', (req: Request, res: Response) => {
  try {
    const targetDashboard = getDashboard(req.params.id);
    if (!targetDashboard) {
      return res.status(404).json({ error: 'Target dashboard not found' });
    }

    const { sourcePanelId, title, position } = req.body;

    if (!sourcePanelId) {
      return res.status(400).json({ error: 'sourcePanelId is required' });
    }

    // Verify source panel exists
    const sourcePanel = getDashboardPanel(sourcePanelId);
    if (!sourcePanel) {
      return res.status(404).json({ error: 'Source panel not found' });
    }

    // Copy the panel
    const copiedPanel = copyDashboardPanel(sourcePanelId, req.params.id, {
      title,
      position,
    });

    if (!copiedPanel) {
      return res.status(500).json({ error: 'Failed to copy panel' });
    }

    // Get provenance info for the response
    const provenance = getPanelProvenance(copiedPanel.id);

    return res.status(201).json({
      panel: copiedPanel,
      provenance,
    });
  } catch (error) {
    console.error('Error copying panel:', error);
    return res.status(500).json({ error: 'Failed to copy panel' });
  }
});

// Get panel provenance (origin tracking)
router.get('/:id/panels/:panelId/provenance', (req: Request, res: Response) => {
  try {
    const panel = getDashboardPanel(req.params.panelId);
    if (!panel) {
      return res.status(404).json({ error: 'Panel not found' });
    }

    const provenance = getPanelProvenance(req.params.panelId);
    return res.json(provenance);
  } catch (error) {
    console.error('Error fetching panel provenance:', error);
    return res.status(500).json({ error: 'Failed to fetch panel provenance' });
  }
});

// Delete a dashboard
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteDashboard(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting dashboard:', error);
    return res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

// Update dashboard (branding, sharing, etc.)
router.put('/:id', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { name, description, logo_url, accent_color, header_color, category, project_id } = req.body;
    const updated = updateDashboard(req.params.id, {
      name,
      description,
      logo_url,
      accent_color,
      header_color,
      category,
      project_id,
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error updating dashboard:', error);
    return res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

// Update dashboard branding
router.put('/:id/branding', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { logo_url, accent_color, header_color, description, app_scope } = req.body;
    const updated = updateDashboard(req.params.id, {
      logo_url,
      accent_color,
      header_color,
      description,
      app_scope,
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error updating dashboard branding:', error);
    return res.status(500).json({ error: 'Failed to update branding' });
  }
});

// Batch update panel layout positions
router.put('/:id/layout', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { layout } = req.body;
    if (!Array.isArray(layout)) {
      return res.status(400).json({ error: 'Layout must be an array' });
    }

    updatePanelPositions(layout.map((l: { panelId: string; x: number; y: number; w: number; h: number }) => ({
      panelId: l.panelId,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    })));

    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating layout:', error);
    return res.status(500).json({ error: 'Failed to update layout' });
  }
});

// Enable public sharing
router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { password, expires_at } = req.body;
    const token = uuidv4();
    let hashedPassword = null;

    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    updateDashboard(req.params.id, {
      is_public: true,
      public_token: token,
      public_password: hashedPassword || undefined,
      public_expires_at: expires_at || undefined,
    });

    return res.json({
      is_public: true,
      public_token: token,
      public_url: `/public/dashboard/${token}`,
    });
  } catch (error) {
    console.error('Error enabling sharing:', error);
    return res.status(500).json({ error: 'Failed to enable sharing' });
  }
});

// Update sharing settings (unified enable/disable/edit). The UI's share modal
// PUTs { is_public, public_password?, public_expires_at? }; previously only
// POST/DELETE existed, so the PUT 404'd and the modal silently "saved" nothing.
router.put('/:id/share', async (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { is_public, public_password, public_expires_at } = req.body;

    if (!is_public) {
      updateDashboard(req.params.id, {
        is_public: false,
        public_token: '',
        public_password: '',
        public_expires_at: '',
      });
      return res.json({ is_public: false });
    }

    // Enabling (or updating an already-public dashboard): keep the existing
    // token if there is one so old links don't break.
    const token = dashboard.public_token || uuidv4();

    // Empty string => explicitly clear; undefined => leave unchanged.
    let passwordUpdate: string | undefined;
    if (public_password === '' || public_password === null) {
      passwordUpdate = '';
    } else if (typeof public_password === 'string') {
      passwordUpdate = await bcrypt.hash(public_password, 10);
    }

    updateDashboard(req.params.id, {
      is_public: true,
      public_token: token,
      ...(passwordUpdate !== undefined ? { public_password: passwordUpdate } : {}),
      ...(public_expires_at !== undefined ? { public_expires_at: public_expires_at || '' } : {}),
    });

    return res.json({
      is_public: true,
      public_token: token,
      public_url: `/public/dashboard/${token}`,
    });
  } catch (error) {
    console.error('Error updating sharing:', error);
    return res.status(500).json({ error: 'Failed to update sharing' });
  }
});

// Disable public sharing
router.delete('/:id/share', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    updateDashboard(req.params.id, {
      is_public: false,
      public_token: '',
      public_password: '',
      public_expires_at: '',
    });

    return res.json({ is_public: false });
  } catch (error) {
    console.error('Error disabling sharing:', error);
    return res.status(500).json({ error: 'Failed to disable sharing' });
  }
});

// (Public dashboard-by-token route is defined above, before router.use(authenticate).)

// Get dashboard variables
router.get('/:id/variables', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const variables = getDashboardVariables(req.params.id);
    return res.json(variables.map(presentVariable));
  } catch (error) {
    console.error('Error fetching variables:', error);
    return res.status(500).json({ error: 'Failed to fetch variables' });
  }
});

// Resolve the dropdown options for a variable. Query variables run their
// search and take the first column; custom variables split their stored
// list; interval variables are a fixed set. Previously nothing populated
// dropdowns at all (the editor's custom values were discarded and query
// variables were never executed), so every variable was a plain textbox.
router.post('/:id/variables/:varId/options', async (req: Request, res: Response) => {
  try {
    const variable = getDashboardVariable(req.params.varId);
    if (!variable || variable.dashboard_id !== req.params.id) {
      return res.status(404).json({ error: 'Variable not found' });
    }
    const { earliest = '-24h', latest = 'now' } = req.body ?? {};
    const options = await resolveVariableOptions(variable.type, variable.query, {
      earliest: String(earliest),
      latest: String(latest),
      allowedIndexes: req.allowedIndexes ?? undefined,
    });
    return res.json({ options });
  } catch (error) {
    console.error('Error resolving variable options:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to resolve options' });
  }
});

// Preview options for a not-yet-saved query (the editor's "Test Query").
router.post('/:id/variables/preview-options', async (req: Request, res: Response) => {
  try {
    const { query, earliest = '-24h', latest = 'now' } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }
    const options = await resolveVariableOptions('query', query, {
      earliest: String(earliest),
      latest: String(latest),
      allowedIndexes: req.allowedIndexes ?? undefined,
    });
    return res.json({ options });
  } catch (error) {
    console.error('Error previewing variable options:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to run query' });
  }
});

// Create dashboard variable
router.post('/:id/variables', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { name, label, type, query, custom_values, default_value, multi_select, include_all, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate default_value type matches variable type
    if (type === 'number' && default_value !== undefined && default_value !== null && default_value !== '') {
      if (isNaN(Number(default_value))) {
        return res.status(400).json({ error: 'default_value must be a number when type is "number"' });
      }
    }

    const variable = createDashboardVariable(req.params.id, name, {
      label,
      type,
      query: variableSource(type, query, custom_values),
      default_value,
      multi_select,
      include_all,
      sort_order,
    });

    return res.status(201).json(presentVariable(variable));
  } catch (error) {
    console.error('Error creating variable:', error);
    return res.status(500).json({ error: 'Failed to create variable' });
  }
});

// Update dashboard variable
router.put('/:id/variables/:varId', (req: Request, res: Response) => {
  try {
    const { name, label, type, query, custom_values, default_value, multi_select, include_all, sort_order } = req.body;

    const variable = updateDashboardVariable(req.params.varId, {
      name,
      label,
      type,
      query: type !== undefined || query !== undefined || custom_values !== undefined
        ? variableSource(type, query, custom_values)
        : undefined,
      default_value,
      multi_select,
      include_all,
      sort_order,
    });

    if (!variable) {
      return res.status(404).json({ error: 'Variable not found' });
    }

    return res.json(presentVariable(variable));
  } catch (error) {
    console.error('Error updating variable:', error);
    return res.status(500).json({ error: 'Failed to update variable' });
  }
});

// Delete dashboard variable
router.delete('/:id/variables/:varId', (req: Request, res: Response) => {
  try {
    const deleted = deleteDashboardVariable(req.params.varId);
    if (!deleted) {
      return res.status(404).json({ error: 'Variable not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting variable:', error);
    return res.status(500).json({ error: 'Failed to delete variable' });
  }
});

// Get dashboard annotations
router.get('/:id/annotations', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const annotations = getDashboardAnnotations(req.params.id);
    return res.json(annotations);
  } catch (error) {
    console.error('Error fetching annotations:', error);
    return res.status(500).json({ error: 'Failed to fetch annotations' });
  }
});

// Create dashboard annotation
router.post('/:id/annotations', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { timestamp, title, description, color, created_by } = req.body;

    if (!timestamp || !title) {
      return res.status(400).json({ error: 'Timestamp and title are required' });
    }

    // Validate color format if provided (hex or CSS color name)
    if (color && !/^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{3}$|^[a-zA-Z]+$/.test(color)) {
      return res.status(400).json({ error: 'Invalid color format. Use hex (#RGB or #RRGGBB) or CSS color name' });
    }

    const annotation = createDashboardAnnotation(req.params.id, timestamp, title, {
      description,
      color,
      created_by,
    });

    return res.status(201).json(annotation);
  } catch (error) {
    console.error('Error creating annotation:', error);
    return res.status(500).json({ error: 'Failed to create annotation' });
  }
});

// Delete dashboard annotation
router.delete('/:id/annotations/:annotationId', (req: Request, res: Response) => {
  try {
    const deleted = deleteDashboardAnnotation(req.params.annotationId);
    if (!deleted) {
      return res.status(404).json({ error: 'Annotation not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting annotation:', error);
    return res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

// Dashboard Pages (for multi-tab dashboards)
router.get('/:id/pages', (req: Request, res: Response) => {
  try {
    const pages = getDashboardPages(req.params.id);
    return res.json(pages);
  } catch (error) {
    console.error('Error fetching pages:', error);
    return res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

router.post('/:id/pages', (req: Request, res: Response) => {
  try {
    const { name, icon, sort_order } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const page = createDashboardPage(req.params.id, name, { icon, sort_order });
    return res.status(201).json(page);
  } catch (error) {
    console.error('Error creating page:', error);
    return res.status(500).json({ error: 'Failed to create page' });
  }
});

// Reorder pages — MUST be registered before '/:id/pages/:pageId', otherwise
// Express matches 'reorder' as :pageId and the reorder call 404s.
router.put('/:id/pages/reorder', (req: Request, res: Response) => {
  try {
    const { pageIds } = req.body;
    if (!Array.isArray(pageIds)) {
      return res.status(400).json({ error: 'pageIds array is required' });
    }
    reorderDashboardPages(req.params.id, pageIds);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error reordering pages:', error);
    return res.status(500).json({ error: 'Failed to reorder pages' });
  }
});

router.put('/:id/pages/:pageId', (req: Request, res: Response) => {
  try {
    const { name, icon, sort_order } = req.body;
    const page = updateDashboardPage(req.params.pageId, { name, icon, sort_order });
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    return res.json(page);
  } catch (error) {
    console.error('Error updating page:', error);
    return res.status(500).json({ error: 'Failed to update page' });
  }
});

router.delete('/:id/pages/:pageId', (req: Request, res: Response) => {
  try {
    const deleted = deleteDashboardPage(req.params.pageId);
    if (!deleted) {
      return res.status(404).json({ error: 'Page not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting page:', error);
    return res.status(500).json({ error: 'Failed to delete page' });
  }
});

// Export dashboard as template
router.post('/:id/export', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const panels = getDashboardPanels(req.params.id);
    const variables = getDashboardVariables(req.params.id);
    const pages = getDashboardPages(req.params.id);

    // Everything a dashboard is made of round-trips through export/import:
    // pages (panels reference them by name), panel descriptions and page
    // membership, scope/category. Previously all of these were dropped.
    const exportData = {
      name: dashboard.name,
      description: dashboard.description,
      app_scope: dashboard.app_scope,
      category: dashboard.category,
      logo_url: dashboard.logo_url,
      accent_color: dashboard.accent_color,
      header_color: dashboard.header_color,
      pages: pages.map(pg => ({ name: pg.name, icon: pg.icon, sort_order: pg.sort_order })),
      panels: panels.map(p => ({
        title: p.title,
        description: p.description,
        query: p.query,
        visualization: p.visualization,
        options: safeJsonParse(p.options, {}),
        position_x: p.position_x,
        position_y: p.position_y,
        width: p.width,
        height: p.height,
        page: pages.find(pg => pg.id === p.page_id)?.name,
      })),
      variables: variables.map(v => ({
        name: v.name,
        label: v.label,
        type: v.type,
        query: v.query,
        default_value: v.default_value,
        multi_select: v.multi_select === 1,
        include_all: v.include_all === 1,
        sort_order: v.sort_order,
      })),
      exported_at: new Date().toISOString(),
      version: '1.1',
    };

    return res.json(exportData);
  } catch (error) {
    console.error('Error exporting dashboard:', error);
    return res.status(500).json({ error: 'Failed to export dashboard' });
  }
});

// Duplicate dashboard
router.post('/:id/duplicate', (req: Request, res: Response) => {
  try {
    const sourceDashboard = getDashboard(req.params.id);
    if (!sourceDashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const sourcePanels = getDashboardPanels(req.params.id);
    const sourceVariables = getDashboardVariables(req.params.id);
    const sourcePages = getDashboardPages(req.params.id);

    // Create new dashboard with "- Copy" suffix in the same scope/category so
    // the copy shows up next to the original in a scope-filtered list.
    const newDashboard = createDashboard(
      `${sourceDashboard.name} - Copy`,
      sourceDashboard.description,
      sourceDashboard.app_scope,
      sourceDashboard.category,
      sourceDashboard.project_id
    );

    // Copy branding settings
    if (sourceDashboard.logo_url || sourceDashboard.accent_color || sourceDashboard.header_color) {
      updateDashboard(newDashboard.id, {
        logo_url: sourceDashboard.logo_url,
        accent_color: sourceDashboard.accent_color,
        header_color: sourceDashboard.header_color,
      });
    }

    // Copy pages, keeping a map so panels land on the corresponding new page
    const pageIdMap = new Map<string, string>();
    for (const page of sourcePages) {
      const copy = createDashboardPage(newDashboard.id, page.name, { icon: page.icon, sort_order: page.sort_order });
      pageIdMap.set(page.id, copy.id);
    }

    // Copy all panels with their positions, options, descriptions and pages
    for (const panel of sourcePanels) {
      createDashboardPanel(
        newDashboard.id,
        panel.title,
        panel.query,
        panel.visualization,
        safeJsonParse(panel.options, {}),
        {
          x: panel.position_x,
          y: panel.position_y,
          width: panel.width,
          height: panel.height,
        },
        panel.description,
        panel.page_id ? pageIdMap.get(panel.page_id) ?? null : null
      );
    }

    // Copy all variables
    for (const variable of sourceVariables) {
      createDashboardVariable(newDashboard.id, variable.name, {
        label: variable.label,
        type: variable.type,
        query: variable.query,
        default_value: variable.default_value,
        multi_select: variable.multi_select === 1,
        include_all: variable.include_all === 1,
        sort_order: variable.sort_order,
      });
    }

    // Return the new dashboard with panels
    const newPanels = getDashboardPanels(newDashboard.id);
    return res.status(201).json({
      ...newDashboard,
      panels: newPanels.map(p => ({
        ...p,
        options: safeJsonParse(p.options, {}),
      })),
    });
  } catch (error) {
    console.error('Error duplicating dashboard:', error);
    return res.status(500).json({ error: 'Failed to duplicate dashboard' });
  }
});

// Import dashboard from template
router.post('/import', (req: Request, res: Response) => {
  try {
    const { template, name } = req.body;

    if (!template || !template.panels) {
      return res.status(400).json({ error: 'Invalid template format' });
    }

    // Create dashboard
    const dashboard = createDashboard(
      name || template.name || 'Imported Dashboard',
      template.description,
      typeof template.app_scope === 'string' ? template.app_scope : undefined,
      typeof template.category === 'string' ? template.category : undefined
    );

    // Apply branding
    if (template.logo_url || template.accent_color || template.header_color) {
      updateDashboard(dashboard.id, {
        logo_url: template.logo_url,
        accent_color: template.accent_color,
        header_color: template.header_color,
      });
    }

    // Recreate pages; exported panels reference them by name
    const pageIdByName = new Map<string, string>();
    if (Array.isArray(template.pages)) {
      for (const page of template.pages) {
        if (!page || typeof page.name !== 'string') continue;
        const created = createDashboardPage(dashboard.id, page.name, { icon: page.icon, sort_order: page.sort_order });
        pageIdByName.set(page.name, created.id);
      }
    }

    // Create panels
    for (const panel of template.panels) {
      createDashboardPanel(
        dashboard.id,
        panel.title,
        panel.query,
        panel.visualization,
        panel.options || {},
        {
          x: panel.position_x || 0,
          y: panel.position_y || 0,
          width: panel.width || 6,
          height: panel.height || 4,
        },
        typeof panel.description === 'string' ? panel.description : undefined,
        typeof panel.page === 'string' ? pageIdByName.get(panel.page) ?? null : null
      );
    }

    // Create variables
    if (template.variables) {
      for (const v of template.variables) {
        createDashboardVariable(dashboard.id, v.name, {
          label: v.label,
          type: v.type,
          query: v.query,
          default_value: v.default_value,
          multi_select: v.multi_select,
          include_all: v.include_all,
          sort_order: v.sort_order,
        });
      }
    }

    // Return full dashboard with panels
    const panels = getDashboardPanels(dashboard.id);
    return res.status(201).json({
      ...dashboard,
      panels: panels.map(p => ({
        ...p,
        options: safeJsonParse(p.options, {}),
      })),
    });
  } catch (error) {
    console.error('Error importing dashboard:', error);
    return res.status(500).json({ error: 'Failed to import dashboard' });
  }
});

// Template data structure for type safety
interface TemplateData {
  name?: string;
  description?: string;
  logo_url?: string;
  accent_color?: string;
  header_color?: string;
  panels?: Array<{
    title: string;
    query: string;
    visualization: string;
    options?: Record<string, unknown>;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }>;
  variables?: Array<{
    name: string;
    label?: string;
    type?: 'query' | 'custom' | 'textbox' | 'interval';
    query?: string;
    default_value?: string;
    multi_select?: boolean;
    include_all?: boolean;
    sort_order?: number;
  }>;
}

// Create dashboard from template
router.post('/templates/:templateId/create', (req: Request, res: Response) => {
  try {
    const template = getDashboardTemplate(req.params.templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const templateData = safeJsonParse<TemplateData>(template.template_json, {});
    const { name } = req.body;

    // Create dashboard from template
    const dashboard = createDashboard(
      name || templateData.name || template.name,
      templateData.description || template.description
    );

    // Apply branding
    if (templateData.logo_url || templateData.accent_color || templateData.header_color) {
      updateDashboard(dashboard.id, {
        logo_url: templateData.logo_url,
        accent_color: templateData.accent_color,
        header_color: templateData.header_color,
      });
    }

    // Create panels
    if (templateData.panels) {
      for (const panel of templateData.panels) {
        createDashboardPanel(
          dashboard.id,
          panel.title,
          panel.query,
          panel.visualization,
          panel.options || {},
          {
            x: panel.position_x || 0,
            y: panel.position_y || 0,
            width: panel.width || 6,
            height: panel.height || 4,
          }
        );
      }
    }

    // Create variables
    if (templateData.variables) {
      for (const v of templateData.variables) {
        createDashboardVariable(dashboard.id, v.name, {
          label: v.label,
          type: v.type,
          query: v.query,
          default_value: v.default_value,
          multi_select: v.multi_select,
          include_all: v.include_all,
          sort_order: v.sort_order,
        });
      }
    }

    incrementTemplateDownloads(template.id);

    // Return full dashboard
    const panels = getDashboardPanels(dashboard.id);
    return res.status(201).json({
      ...dashboard,
      panels: panels.map(p => ({
        ...p,
        options: safeJsonParse(p.options, {}),
      })),
    });
  } catch (error) {
    console.error('Error creating from template:', error);
    return res.status(500).json({ error: 'Failed to create from template' });
  }
});

// Dashboard Logos
router.get('/:id/logos', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const logos = getDashboardLogos(req.params.id);
    return res.json(logos);
  } catch (error) {
    console.error('Error fetching dashboard logos:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard logos' });
  }
});

router.post('/:id/logos', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { logo_url, label, position } = req.body;

    if (!logo_url) {
      return res.status(400).json({ error: 'logo_url is required' });
    }

    const logo = addDashboardLogo(req.params.id, logo_url, { label, position });
    return res.status(201).json(logo);
  } catch (error) {
    console.error('Error adding dashboard logo:', error);
    return res.status(500).json({ error: 'Failed to add dashboard logo' });
  }
});

router.delete('/:id/logos/:logoId', (req: Request, res: Response) => {
  try {
    const deleted = removeDashboardLogo(req.params.logoId);
    if (!deleted) {
      return res.status(404).json({ error: 'Logo not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting dashboard logo:', error);
    return res.status(500).json({ error: 'Failed to delete dashboard logo' });
  }
});

router.put('/:id/logos/reorder', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { logoIds } = req.body;

    if (!Array.isArray(logoIds)) {
      return res.status(400).json({ error: 'logoIds array is required' });
    }

    reorderDashboardLogos(req.params.id, logoIds);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error reordering dashboard logos:', error);
    return res.status(500).json({ error: 'Failed to reorder dashboard logos' });
  }
});

export default router;

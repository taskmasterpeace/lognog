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
  deleteDashboard,
  updateDashboard,
  getDashboardByToken,
  updatePanelPositions,
  getDashboardVariables,
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
} from '../db/sqlite.js';

const router = Router();

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
    return res.json(dashboards);
  } catch (error) {
    console.error('Error fetching dashboards:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboards' });
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
      ...dashboard,
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
    const { name, description, app_scope, category } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const dashboard = createDashboard(name, description, app_scope, category);
    return res.status(201).json(dashboard);
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

    const { title, query, visualization, options, position } = req.body;

    if (!title || !query) {
      return res.status(400).json({ error: 'Title and query are required' });
    }

    const panel = createDashboardPanel(
      req.params.id,
      title,
      query,
      visualization,
      options,
      position
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

    const { title, query, visualization, options, position_x, position_y, width, height } = req.body;

    const panel = updateDashboardPanel(req.params.panelId, {
      title,
      query,
      visualization,
      options,
      position_x,
      position_y,
      width,
      height,
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

    const { name, description, logo_url, accent_color, header_color, category } = req.body;
    const updated = updateDashboard(req.params.id, {
      name,
      description,
      logo_url,
      accent_color,
      header_color,
      category,
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

// Get public dashboard by token (no auth required)
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

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

    // Get panels for the dashboard
    const panels = getDashboardPanels(dashboard.id);
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

// Get dashboard variables
router.get('/:id/variables', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const variables = getDashboardVariables(req.params.id);
    return res.json(variables);
  } catch (error) {
    console.error('Error fetching variables:', error);
    return res.status(500).json({ error: 'Failed to fetch variables' });
  }
});

// Create dashboard variable
router.post('/:id/variables', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const { name, label, type, query, default_value, multi_select, include_all, sort_order } = req.body;

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
      query,
      default_value,
      multi_select,
      include_all,
      sort_order,
    });

    return res.status(201).json(variable);
  } catch (error) {
    console.error('Error creating variable:', error);
    return res.status(500).json({ error: 'Failed to create variable' });
  }
});

// Update dashboard variable
router.put('/:id/variables/:varId', (req: Request, res: Response) => {
  try {
    const { name, label, type, query, default_value, multi_select, include_all, sort_order } = req.body;

    const variable = updateDashboardVariable(req.params.varId, {
      name,
      label,
      type,
      query,
      default_value,
      multi_select,
      include_all,
      sort_order,
    });

    if (!variable) {
      return res.status(404).json({ error: 'Variable not found' });
    }

    return res.json(variable);
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

// Export dashboard as template
router.post('/:id/export', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const panels = getDashboardPanels(req.params.id);
    const variables = getDashboardVariables(req.params.id);

    const exportData = {
      name: dashboard.name,
      description: dashboard.description,
      logo_url: dashboard.logo_url,
      accent_color: dashboard.accent_color,
      header_color: dashboard.header_color,
      panels: panels.map(p => ({
        title: p.title,
        query: p.query,
        visualization: p.visualization,
        options: safeJsonParse(p.options, {}),
        position_x: p.position_x,
        position_y: p.position_y,
        width: p.width,
        height: p.height,
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
      version: '1.0',
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

    // Create new dashboard with "- Copy" suffix
    const newDashboard = createDashboard(
      `${sourceDashboard.name} - Copy`,
      sourceDashboard.description
    );

    // Copy branding settings
    if (sourceDashboard.logo_url || sourceDashboard.accent_color || sourceDashboard.header_color) {
      updateDashboard(newDashboard.id, {
        logo_url: sourceDashboard.logo_url,
        accent_color: sourceDashboard.accent_color,
        header_color: sourceDashboard.header_color,
      });
    }

    // Copy all panels with their positions and options
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
        }
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
      template.description
    );

    // Apply branding
    if (template.logo_url || template.accent_color || template.header_color) {
      updateDashboard(dashboard.id, {
        logo_url: template.logo_url,
        accent_color: template.accent_color,
        header_color: template.header_color,
      });
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
        }
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

// Get dashboard templates
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

// Get single dashboard template
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

export default router;

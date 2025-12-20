import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
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
} from '../db/sqlite.js';

const router = Router();

// Get all dashboards
router.get('/', (_req: Request, res: Response) => {
  try {
    const dashboards = getDashboards();
    return res.json(dashboards);
  } catch (error) {
    console.error('Error fetching dashboards:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

// Get a single dashboard with its panels
router.get('/:id', (req: Request, res: Response) => {
  try {
    const dashboard = getDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const panels = getDashboardPanels(req.params.id);

    return res.json({
      ...dashboard,
      panels: panels.map(p => ({
        ...p,
        options: JSON.parse(p.options),
      })),
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Create a new dashboard
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const dashboard = createDashboard(name, description);
    return res.status(201).json(dashboard);
  } catch (error) {
    console.error('Error creating dashboard:', error);
    return res.status(500).json({ error: 'Failed to create dashboard' });
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
      options: JSON.parse(panel.options),
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
      options: JSON.parse(panel.options),
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

    const { name, description, logo_url, accent_color, header_color } = req.body;
    const updated = updateDashboard(req.params.id, {
      name,
      description,
      logo_url,
      accent_color,
      header_color,
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

    const { logo_url, accent_color, header_color, description } = req.body;
    const updated = updateDashboard(req.params.id, {
      logo_url,
      accent_color,
      header_color,
      description,
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
        options: JSON.parse(p.options),
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
        options: JSON.parse(p.options),
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
      required_sources: t.required_sources ? JSON.parse(t.required_sources) : [],
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
      template_json: JSON.parse(template.template_json),
      required_sources: template.required_sources ? JSON.parse(template.required_sources) : [],
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create dashboard from template
router.post('/templates/:templateId/create', (req: Request, res: Response) => {
  try {
    const template = getDashboardTemplate(req.params.templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const templateData = JSON.parse(template.template_json);
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
        options: JSON.parse(p.options),
      })),
    });
  } catch (error) {
    console.error('Error creating from template:', error);
    return res.status(500).json({ error: 'Failed to create from template' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import {
  getDashboards,
  getDashboard,
  getDashboardPanels,
  createDashboard,
  createDashboardPanel,
  updateDashboardPanel,
  deleteDashboardPanel,
  deleteDashboard,
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

export default router;

import { Router, Request, Response } from 'express';
import {
  createProject,
  getProjects,
  getProject,
  getProjectBySlug,
  updateProject,
  deleteProject,
  getDashboardsByProject,
} from '../db/sqlite.js';

const router = Router();

// Get all projects
router.get('/', (_req: Request, res: Response) => {
  try {
    const projects = getProjects();
    return res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Get project by slug
router.get('/slug/:slug', (req: Request, res: Response) => {
  try {
    const project = getProjectBySlug(req.params.slug);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create new project
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, slug, description, logo_url, accent_color, sort_order } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    // Check if slug already exists
    const existing = getProjectBySlug(slug);
    if (existing) {
      return res.status(400).json({ error: 'A project with this slug already exists' });
    }

    const project = createProject(name, slug, {
      description,
      logo_url,
      accent_color,
      sort_order,
    });

    return res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', (req: Request, res: Response) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { name, slug, description, logo_url, accent_color, sort_order, is_archived } = req.body;

    // If slug is being changed, check it doesn't conflict
    if (slug && slug !== project.slug) {
      const existing = getProjectBySlug(slug);
      if (existing) {
        return res.status(400).json({ error: 'A project with this slug already exists' });
      }
    }

    const updated = updateProject(req.params.id, {
      name,
      slug,
      description,
      logo_url,
      accent_color,
      sort_order,
      is_archived: is_archived !== undefined ? (is_archived ? 1 : 0) : undefined,
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error updating project:', error);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Get dashboards in a project
router.get('/:id/dashboards', (req: Request, res: Response) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const dashboards = getDashboardsByProject(req.params.id);
    return res.json(dashboards);
  } catch (error) {
    console.error('Error fetching project dashboards:', error);
    return res.status(500).json({ error: 'Failed to fetch project dashboards' });
  }
});

export default router;

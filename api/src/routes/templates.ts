/**
 * Source Templates API Routes
 *
 * Endpoints for managing source templates - pre-configured patterns
 * for common log sources (MySQL, PostgreSQL, MongoDB, Windows, etc.)
 */

import { Router, Request, Response } from 'express';
import {
  getSourceTemplates,
  getSourceTemplate,
  createSourceTemplate,
  updateSourceTemplate,
  deleteSourceTemplate,
  SourceCategory,
  FieldExtractionPattern,
} from '../db/sqlite.js';
import {
  validateTemplate,
  getTemplatesByCategory,
  getTemplateStats,
  formatTemplateForResponse,
} from '../services/templates.js';

const router = Router();

// Get all templates (optionally filtered by category)
router.get('/', (req: Request, res: Response) => {
  try {
    const category = req.query.category as SourceCategory | undefined;
    const templates = getSourceTemplates(category);

    // Parse JSON fields for response
    const formattedTemplates = templates.map(formatTemplateForResponse);

    res.json(formattedTemplates);
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// Get templates grouped by category
router.get('/by-category', (_req: Request, res: Response) => {
  try {
    const grouped = getTemplatesByCategory();

    // Format each template
    const formatted: Record<SourceCategory, unknown[]> = {
      database: grouped.database.map(formatTemplateForResponse),
      security: grouped.security.map(formatTemplateForResponse),
      web: grouped.web.map(formatTemplateForResponse),
      system: grouped.system.map(formatTemplateForResponse),
      application: grouped.application.map(formatTemplateForResponse),
    };

    res.json(formatted);
  } catch (error) {
    console.error('Error getting templates by category:', error);
    res.status(500).json({ error: 'Failed to get templates by category' });
  }
});

// Get template statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getTemplateStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting template stats:', error);
    res.status(500).json({ error: 'Failed to get template stats' });
  }
});

// Get single template by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const template = getSourceTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(formatTemplateForResponse(template));
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Test template against sample log
router.post('/:id/test', (req: Request, res: Response) => {
  try {
    const template = getSourceTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { log_line } = req.body;

    if (!log_line || typeof log_line !== 'string') {
      return res.status(400).json({ error: 'log_line (string) is required' });
    }

    const result = validateTemplate(template, log_line);

    res.json(result);
  } catch (error) {
    console.error('Error testing template:', error);
    res.status(500).json({ error: 'Failed to test template' });
  }
});

// Create custom template (admin only - could add auth middleware here)
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name,
      source_type,
      category,
      description,
      setup_instructions,
      agent_config_example,
      syslog_config_example,
      field_extractions,
      default_index,
      default_severity,
      sample_log,
      sample_query,
      icon,
      dashboard_widgets,
      alert_templates,
    } = req.body;

    if (!name || !source_type || !category) {
      return res.status(400).json({
        error: 'name, source_type, and category are required',
      });
    }

    // Validate category
    const validCategories: SourceCategory[] = ['database', 'security', 'web', 'system', 'application'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category. Must be one of: database, security, web, system, application',
      });
    }

    const template = createSourceTemplate(name, source_type, category, {
      description,
      setup_instructions,
      agent_config_example,
      syslog_config_example,
      field_extractions: field_extractions as FieldExtractionPattern[],
      default_index,
      default_severity,
      sample_log,
      sample_query,
      icon,
      dashboard_widgets,
      alert_templates,
      built_in: false, // User-created templates are not built-in
    });

    res.status(201).json(formatTemplateForResponse(template));
  } catch (error) {
    console.error('Error creating template:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to create template: ' + message });
  }
});

// Update template
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getSourceTemplate(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Prevent editing built-in templates
    if (existing.built_in) {
      return res.status(403).json({
        error: 'Cannot modify built-in templates. Create a custom template instead.',
      });
    }

    const {
      name,
      source_type,
      category,
      description,
      setup_instructions,
      agent_config_example,
      syslog_config_example,
      field_extractions,
      default_index,
      default_severity,
      sample_log,
      sample_query,
      icon,
      dashboard_widgets,
      alert_templates,
      enabled,
    } = req.body;

    const template = updateSourceTemplate(req.params.id, {
      name,
      source_type,
      category: category as SourceCategory,
      description,
      setup_instructions,
      agent_config_example,
      syslog_config_example,
      field_extractions: field_extractions as FieldExtractionPattern[],
      default_index,
      default_severity,
      sample_log,
      sample_query,
      icon,
      dashboard_widgets,
      alert_templates,
      enabled,
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(formatTemplateForResponse(template));
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete custom template (cannot delete built-in)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = getSourceTemplate(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (existing.built_in) {
      return res.status(403).json({
        error: 'Cannot delete built-in templates',
      });
    }

    const deleted = deleteSourceTemplate(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found or is built-in' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;

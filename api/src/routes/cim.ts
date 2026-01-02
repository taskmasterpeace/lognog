/**
 * CIM (Common Information Model) API Routes
 *
 * Manages data models and field mappings for log normalization.
 */

import { Router, Request, Response } from 'express';
import {
  getDataModels,
  getDataModel,
  createDataModel,
  updateDataModel,
  deleteDataModel,
  getFieldMappings,
  getFieldMapping,
  createFieldMapping,
  updateFieldMapping,
  deleteFieldMapping,
  getDataModelStats,
} from '../db/sqlite.js';
import {
  normalizeEvent,
  normalizeEvents,
  autoDetectMappings,
  validateEventAgainstModel,
  getSourceCompliance,
  applyAutoMappings,
} from '../services/cim-normalizer.js';

const router = Router();

// ============================================================================
// Data Models Routes
// ============================================================================

/**
 * GET /cim/models - List all data models
 */
router.get('/models', (req: Request, res: Response) => {
  try {
    const { category, enabled } = req.query;

    const models = getDataModels({
      category: category as string | undefined,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
    });

    res.json({
      models,
      count: models.length,
    });
  } catch (error) {
    console.error('Error fetching data models:', error);
    res.status(500).json({ error: 'Failed to fetch data models' });
  }
});

/**
 * GET /cim/models/stats - Get statistics about data models
 */
router.get('/models/stats', (_req: Request, res: Response) => {
  try {
    const stats = getDataModelStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching model stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /cim/models/:name - Get a specific data model
 */
router.get('/models/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const model = getDataModel(name);

    if (!model) {
      return res.status(404).json({ error: 'Data model not found' });
    }

    // Also get mappings that use this model
    const mappings = getFieldMappings({ data_model: name });

    res.json({
      model,
      mappings,
      mappings_count: mappings.length,
    });
  } catch (error) {
    console.error('Error fetching data model:', error);
    res.status(500).json({ error: 'Failed to fetch data model' });
  }
});

/**
 * POST /cim/models - Create a new data model
 */
router.post('/models', (req: Request, res: Response) => {
  try {
    const { name, description, category, fields, constraints } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Model name is required' });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'At least one field is required' });
    }

    // Check if model already exists
    const existing = getDataModel(name);
    if (existing) {
      return res.status(409).json({ error: 'Data model already exists' });
    }

    const model = createDataModel({
      name,
      description,
      category: category || 'custom',
      fields,
      constraints: constraints || [],
      is_builtin: false,
      enabled: true,
    });

    res.status(201).json({ model });
  } catch (error) {
    console.error('Error creating data model:', error);
    res.status(500).json({ error: 'Failed to create data model' });
  }
});

/**
 * PUT /cim/models/:name - Update a data model
 */
router.put('/models/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const updates = req.body;

    const model = updateDataModel(name, updates);
    if (!model) {
      return res.status(404).json({ error: 'Data model not found' });
    }

    res.json({ model });
  } catch (error) {
    if ((error as Error).message.includes('Cannot modify built-in')) {
      return res.status(403).json({ error: (error as Error).message });
    }
    console.error('Error updating data model:', error);
    res.status(500).json({ error: 'Failed to update data model' });
  }
});

/**
 * DELETE /cim/models/:name - Delete a data model
 */
router.delete('/models/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const deleted = deleteDataModel(name);
    if (!deleted) {
      return res.status(404).json({ error: 'Data model not found' });
    }

    res.json({ success: true, message: `Data model '${name}' deleted` });
  } catch (error) {
    if ((error as Error).message.includes('Cannot delete built-in')) {
      return res.status(403).json({ error: (error as Error).message });
    }
    console.error('Error deleting data model:', error);
    res.status(500).json({ error: 'Failed to delete data model' });
  }
});

// ============================================================================
// Field Mappings Routes
// ============================================================================

/**
 * GET /cim/mappings - List all field mappings
 */
router.get('/mappings', (req: Request, res: Response) => {
  try {
    const { source_type, data_model, enabled } = req.query;

    const mappings = getFieldMappings({
      source_type: source_type as string | undefined,
      data_model: data_model as string | undefined,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
    });

    res.json({
      mappings,
      count: mappings.length,
    });
  } catch (error) {
    console.error('Error fetching field mappings:', error);
    res.status(500).json({ error: 'Failed to fetch field mappings' });
  }
});

/**
 * GET /cim/mappings/:id - Get a specific field mapping
 */
router.get('/mappings/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mapping = getFieldMapping(id);

    if (!mapping) {
      return res.status(404).json({ error: 'Field mapping not found' });
    }

    res.json({ mapping });
  } catch (error) {
    console.error('Error fetching field mapping:', error);
    res.status(500).json({ error: 'Failed to fetch field mapping' });
  }
});

/**
 * POST /cim/mappings - Create a new field mapping
 */
router.post('/mappings', (req: Request, res: Response) => {
  try {
    const { source_type, source_field, data_model, cim_field, transform, priority } = req.body;

    if (!source_type || !source_field || !data_model || !cim_field) {
      return res.status(400).json({
        error: 'source_type, source_field, data_model, and cim_field are required',
      });
    }

    // Verify data model exists
    const model = getDataModel(data_model);
    if (!model) {
      return res.status(400).json({ error: `Data model '${data_model}' not found` });
    }

    // Verify cim_field is valid for the model
    const validField = model.fields.some(f => f.name === cim_field);
    if (!validField) {
      return res.status(400).json({
        error: `Field '${cim_field}' is not defined in data model '${data_model}'`,
      });
    }

    const mapping = createFieldMapping({
      source_type,
      source_field,
      data_model,
      cim_field,
      transform,
      priority: priority ?? 100,
      enabled: true,
    });

    res.status(201).json({ mapping });
  } catch (error) {
    console.error('Error creating field mapping:', error);
    res.status(500).json({ error: 'Failed to create field mapping' });
  }
});

/**
 * PUT /cim/mappings/:id - Update a field mapping
 */
router.put('/mappings/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const mapping = updateFieldMapping(id, updates);
    if (!mapping) {
      return res.status(404).json({ error: 'Field mapping not found' });
    }

    res.json({ mapping });
  } catch (error) {
    console.error('Error updating field mapping:', error);
    res.status(500).json({ error: 'Failed to update field mapping' });
  }
});

/**
 * DELETE /cim/mappings/:id - Delete a field mapping
 */
router.delete('/mappings/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = deleteFieldMapping(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Field mapping not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting field mapping:', error);
    res.status(500).json({ error: 'Failed to delete field mapping' });
  }
});

// ============================================================================
// Normalization & Validation Routes
// ============================================================================

/**
 * POST /cim/normalize - Normalize events using configured mappings
 */
router.post('/normalize', (req: Request, res: Response) => {
  try {
    const { events, source_type } = req.body;

    if (!source_type) {
      return res.status(400).json({ error: 'source_type is required' });
    }

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'events array is required' });
    }

    const normalized = normalizeEvents(events, source_type);

    res.json({
      normalized,
      count: normalized.length,
      normalized_count: normalized.filter(e => e._normalized).length,
    });
  } catch (error) {
    console.error('Error normalizing events:', error);
    res.status(500).json({ error: 'Failed to normalize events' });
  }
});

/**
 * POST /cim/validate - Validate events against a data model
 */
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { events, data_model, source_type } = req.body;

    if (!data_model) {
      return res.status(400).json({ error: 'data_model is required' });
    }

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'events array is required' });
    }

    // Normalize first if source_type is provided
    const eventsToValidate = source_type
      ? normalizeEvents(events, source_type)
      : events;

    const results = eventsToValidate.map(event =>
      validateEventAgainstModel(event as Record<string, unknown>, data_model)
    );

    const validCount = results.filter(r => r.valid).length;

    res.json({
      results,
      summary: {
        total: results.length,
        valid: validCount,
        invalid: results.length - validCount,
        compliance_rate: results.length > 0
          ? Math.round((validCount / results.length) * 100)
          : 0,
      },
    });
  } catch (error) {
    console.error('Error validating events:', error);
    res.status(500).json({ error: 'Failed to validate events' });
  }
});

/**
 * POST /cim/auto-detect - Auto-detect field mappings from sample events
 */
router.post('/auto-detect', (req: Request, res: Response) => {
  try {
    const { events, source_type } = req.body;

    if (!source_type) {
      return res.status(400).json({ error: 'source_type is required' });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array with at least one event is required' });
    }

    const suggestions = autoDetectMappings(events, source_type);

    res.json({
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error('Error auto-detecting mappings:', error);
    res.status(500).json({ error: 'Failed to auto-detect mappings' });
  }
});

/**
 * POST /cim/auto-detect/apply - Apply auto-detected mappings
 */
router.post('/auto-detect/apply', (req: Request, res: Response) => {
  try {
    const { suggestions } = req.body;

    if (!suggestions || !Array.isArray(suggestions)) {
      return res.status(400).json({ error: 'suggestions array is required' });
    }

    const result = applyAutoMappings(suggestions);

    res.json({
      applied: result.applied,
      skipped: result.skipped,
      message: `Applied ${result.applied} mappings, skipped ${result.skipped}`,
    });
  } catch (error) {
    console.error('Error applying mappings:', error);
    res.status(500).json({ error: 'Failed to apply mappings' });
  }
});

/**
 * POST /cim/compliance - Check source compliance against all models
 */
router.post('/compliance', (req: Request, res: Response) => {
  try {
    const { events, source_type } = req.body;

    if (!source_type) {
      return res.status(400).json({ error: 'source_type is required' });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array with at least one event is required' });
    }

    const compliance = getSourceCompliance(events, source_type);

    res.json(compliance);
  } catch (error) {
    console.error('Error checking compliance:', error);
    res.status(500).json({ error: 'Failed to check compliance' });
  }
});

/**
 * GET /cim/sources - List all configured source types with mapping counts
 */
router.get('/sources', (_req: Request, res: Response) => {
  try {
    const stats = getDataModelStats();
    const sources = Object.entries(stats.mappings_by_source).map(([source_type, count]) => ({
      source_type,
      mapping_count: count,
    }));

    res.json({
      sources,
      count: sources.length,
    });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

export default router;

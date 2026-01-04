import { Router, Request, Response } from 'express';
import {
  getSourceAnnotations,
  getSourceAnnotation,
  getSourceAnnotationById,
  getSourceAnnotationsBatch,
  createSourceAnnotation,
  updateSourceAnnotation,
  deleteSourceAnnotation,
  getLookup,
} from '../db/sqlite.js';

const router = Router();

// GET /source-annotations - List all source annotations
router.get('/', (req: Request, res: Response) => {
  try {
    const { field } = req.query;
    const annotations = getSourceAnnotations(field as string | undefined);
    return res.json(annotations);
  } catch (error) {
    console.error('Error fetching source annotations:', error);
    return res.status(500).json({ error: 'Failed to fetch source annotations' });
  }
});

// GET /source-annotations/batch - Batch lookup for LogViewer
router.get('/batch', (req: Request, res: Response) => {
  try {
    const { items } = req.query;

    if (!items || typeof items !== 'string') {
      return res.status(400).json({ error: 'items query parameter is required (JSON array)' });
    }

    let parsedItems: Array<{ field: string; value: string }>;
    try {
      parsedItems = JSON.parse(items);
    } catch {
      return res.status(400).json({ error: 'items must be a valid JSON array' });
    }

    if (!Array.isArray(parsedItems)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    // Validate each item has field and value
    for (const item of parsedItems) {
      if (!item.field || !item.value) {
        return res.status(400).json({ error: 'Each item must have field and value properties' });
      }
    }

    const annotationsMap = getSourceAnnotationsBatch(parsedItems);

    // Convert Map to object for JSON serialization
    const result: Record<string, unknown> = {};
    annotationsMap.forEach((annotation, key) => {
      result[key] = annotation;
    });

    return res.json(result);
  } catch (error) {
    console.error('Error batch fetching source annotations:', error);
    return res.status(500).json({ error: 'Failed to batch fetch source annotations' });
  }
});

// GET /source-annotations/:field/:value - Get single annotation by field and value
router.get('/:field/:value', (req: Request, res: Response) => {
  try {
    const { field, value } = req.params;
    const annotation = getSourceAnnotation(field, decodeURIComponent(value));

    if (!annotation) {
      return res.status(404).json({ error: 'Source annotation not found' });
    }

    // If annotation has a linked lookup, include lookup data
    let lookupData = null;
    if (annotation.lookup_id) {
      const lookup = getLookup(annotation.lookup_id);
      if (lookup && lookup.data) {
        try {
          const data = JSON.parse(lookup.data);
          const keyField = lookup.key_field;
          const record = data.find(
            (item: Record<string, unknown>) => String(item[keyField]) === annotation.field_value
          );
          if (record) {
            lookupData = record;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return res.json({ ...annotation, lookupData });
  } catch (error) {
    console.error('Error fetching source annotation:', error);
    return res.status(500).json({ error: 'Failed to fetch source annotation' });
  }
});

// POST /source-annotations - Create new annotation
router.post('/', (req: Request, res: Response) => {
  try {
    const { field_name, field_value, title, description, details, icon, color, lookup_id, tags } = req.body;

    if (!field_name || !field_value) {
      return res.status(400).json({ error: 'field_name and field_value are required' });
    }

    // Check if annotation already exists for this field/value
    const existing = getSourceAnnotation(field_name, field_value);
    if (existing) {
      return res.status(409).json({ error: 'Annotation already exists for this field/value combination' });
    }

    const annotation = createSourceAnnotation({
      field_name,
      field_value,
      title,
      description,
      details,
      icon,
      color,
      lookup_id,
      tags: tags || [],
    });

    return res.status(201).json(annotation);
  } catch (error) {
    console.error('Error creating source annotation:', error);
    return res.status(500).json({ error: 'Failed to create source annotation' });
  }
});

// PUT /source-annotations/:id - Update annotation
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { title, description, details, icon, color, lookup_id, tags } = req.body;

    const updates: {
      title?: string;
      description?: string;
      details?: string;
      icon?: string;
      color?: string;
      lookup_id?: string | null;
      tags?: string[];
    } = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (details !== undefined) updates.details = details;
    if (icon !== undefined) updates.icon = icon;
    if (color !== undefined) updates.color = color;
    if (lookup_id !== undefined) updates.lookup_id = lookup_id;
    if (tags !== undefined) updates.tags = tags;

    const annotation = updateSourceAnnotation(req.params.id, updates);
    if (!annotation) {
      return res.status(404).json({ error: 'Source annotation not found' });
    }

    return res.json(annotation);
  } catch (error) {
    console.error('Error updating source annotation:', error);
    return res.status(500).json({ error: 'Failed to update source annotation' });
  }
});

// DELETE /source-annotations/:id - Delete annotation
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteSourceAnnotation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Source annotation not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting source annotation:', error);
    return res.status(500).json({ error: 'Failed to delete source annotation' });
  }
});

// GET /source-annotations/by-id/:id - Get annotation by ID
router.get('/by-id/:id', (req: Request, res: Response) => {
  try {
    const annotation = getSourceAnnotationById(req.params.id);
    if (!annotation) {
      return res.status(404).json({ error: 'Source annotation not found' });
    }

    // If annotation has a linked lookup, include lookup data
    let lookupData = null;
    if (annotation.lookup_id) {
      const lookup = getLookup(annotation.lookup_id);
      if (lookup && lookup.data) {
        try {
          const data = JSON.parse(lookup.data);
          const keyField = lookup.key_field;
          const record = data.find(
            (item: Record<string, unknown>) => String(item[keyField]) === annotation.field_value
          );
          if (record) {
            lookupData = record;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return res.json({ ...annotation, lookupData });
  } catch (error) {
    console.error('Error fetching source annotation:', error);
    return res.status(500).json({ error: 'Failed to fetch source annotation' });
  }
});

export default router;

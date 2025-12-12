import { Router, Request, Response } from 'express';
import {
  getFieldExtractions,
  getFieldExtraction,
  createFieldExtraction,
  updateFieldExtraction,
  deleteFieldExtraction,
} from '../db/sqlite.js';
import { testPattern, getBuiltInPatterns } from '../services/field-extractor.js';

const router = Router();

/**
 * Get all field extraction patterns
 * Optional query param: source_type
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { source_type } = req.query;
    const patterns = getFieldExtractions(source_type as string | undefined);
    return res.json(patterns);
  } catch (error) {
    console.error('Error fetching field extractions:', error);
    return res.status(500).json({ error: 'Failed to fetch field extractions' });
  }
});

/**
 * Get a specific field extraction pattern by ID
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const pattern = getFieldExtraction(req.params.id);
    if (!pattern) {
      return res.status(404).json({ error: 'Field extraction not found' });
    }
    return res.json(pattern);
  } catch (error) {
    console.error('Error fetching field extraction:', error);
    return res.status(500).json({ error: 'Failed to fetch field extraction' });
  }
});

/**
 * Create a new field extraction pattern
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name,
      source_type,
      field_name,
      pattern,
      pattern_type,
      priority = 100,
      enabled = true,
    } = req.body;

    // Validate required fields
    if (!name || !source_type || !field_name || !pattern || !pattern_type) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['name', 'source_type', 'field_name', 'pattern', 'pattern_type'],
      });
    }

    // Validate pattern type
    if (pattern_type !== 'grok' && pattern_type !== 'regex') {
      return res.status(400).json({
        error: 'Invalid pattern_type',
        message: 'pattern_type must be either "grok" or "regex"',
      });
    }

    const extraction = createFieldExtraction(
      name,
      source_type,
      field_name,
      pattern,
      pattern_type,
      priority,
      enabled
    );

    return res.status(201).json(extraction);
  } catch (error) {
    console.error('Error creating field extraction:', error);
    return res.status(500).json({ error: 'Failed to create field extraction' });
  }
});

/**
 * Update an existing field extraction pattern
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, source_type, field_name, pattern, pattern_type, priority, enabled } = req.body;

    // Validate pattern type if provided
    if (pattern_type && pattern_type !== 'grok' && pattern_type !== 'regex') {
      return res.status(400).json({
        error: 'Invalid pattern_type',
        message: 'pattern_type must be either "grok" or "regex"',
      });
    }

    const extraction = updateFieldExtraction(req.params.id, {
      name,
      source_type,
      field_name,
      pattern,
      pattern_type,
      priority,
      enabled,
    });

    if (!extraction) {
      return res.status(404).json({ error: 'Field extraction not found' });
    }

    return res.json(extraction);
  } catch (error) {
    console.error('Error updating field extraction:', error);
    return res.status(500).json({ error: 'Failed to update field extraction' });
  }
});

/**
 * Delete a field extraction pattern
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteFieldExtraction(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Field extraction not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting field extraction:', error);
    return res.status(500).json({ error: 'Failed to delete field extraction' });
  }
});

/**
 * Test a pattern against a sample log line
 */
router.post('/test', (req: Request, res: Response) => {
  try {
    const { pattern, pattern_type, sample } = req.body;

    // Validate required fields
    if (!pattern || !pattern_type || !sample) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['pattern', 'pattern_type', 'sample'],
      });
    }

    // Validate pattern type
    if (pattern_type !== 'grok' && pattern_type !== 'regex') {
      return res.status(400).json({
        error: 'Invalid pattern_type',
        message: 'pattern_type must be either "grok" or "regex"',
      });
    }

    const result = testPattern(pattern, pattern_type, sample);

    if (result.success) {
      return res.json({
        success: true,
        fields: result.fields,
        message: 'Pattern matched successfully',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: 'Pattern did not match sample or contains errors',
      });
    }
  } catch (error) {
    console.error('Error testing pattern:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test pattern',
      message: String(error),
    });
  }
});

/**
 * Get built-in pre-configured patterns
 */
router.get('/built-in/patterns', (_req: Request, res: Response) => {
  try {
    const patterns = getBuiltInPatterns();
    return res.json(patterns);
  } catch (error) {
    console.error('Error fetching built-in patterns:', error);
    return res.status(500).json({ error: 'Failed to fetch built-in patterns' });
  }
});

/**
 * Seed database with built-in patterns
 */
router.post('/built-in/seed', (req: Request, res: Response) => {
  try {
    const { overwrite = false } = req.body;
    const builtInPatterns = getBuiltInPatterns();
    const created: string[] = [];
    const skipped: string[] = [];

    for (const pattern of builtInPatterns) {
      try {
        // Check if pattern already exists
        const existing = getFieldExtractions(pattern.source_type).find(
          p => p.name === pattern.name
        );

        if (existing && !overwrite) {
          skipped.push(pattern.name);
          continue;
        }

        if (existing && overwrite) {
          // Update existing pattern
          updateFieldExtraction(existing.id, {
            name: pattern.name,
            source_type: pattern.source_type,
            field_name: pattern.field_name,
            pattern: pattern.pattern,
            pattern_type: pattern.pattern_type,
            priority: pattern.priority,
          });
          created.push(`${pattern.name} (updated)`);
        } else {
          // Create new pattern
          createFieldExtraction(
            pattern.name,
            pattern.source_type,
            pattern.field_name,
            pattern.pattern,
            pattern.pattern_type,
            pattern.priority
          );
          created.push(pattern.name);
        }
      } catch (err) {
        console.error(`Error seeding pattern ${pattern.name}:`, err);
        skipped.push(`${pattern.name} (error)`);
      }
    }

    return res.json({
      success: true,
      created,
      skipped,
      total: builtInPatterns.length,
      message: `Seeded ${created.length} patterns, skipped ${skipped.length}`,
    });
  } catch (error) {
    console.error('Error seeding built-in patterns:', error);
    return res.status(500).json({ error: 'Failed to seed built-in patterns' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import {
  getSourceConfigs,
  getSourceConfig,
  createSourceConfig,
  updateSourceConfig,
  deleteSourceConfig,
  getSourceConfigExtractions,
  getSourceConfigExtraction,
  createSourceConfigExtraction,
  updateSourceConfigExtraction,
  deleteSourceConfigExtraction,
  getSourceConfigTransforms,
  getSourceConfigTransform,
  createSourceConfigTransform,
  updateSourceConfigTransform,
  deleteSourceConfigTransform,
  getSourceRoutingRules,
  getSourceRoutingRule,
  createSourceRoutingRule,
  updateSourceRoutingRule,
  deleteSourceRoutingRule,
  SourceConfig,
  SourceConfigExtraction,
  SourceConfigTransform,
  SourceRoutingRule,
} from '../db/sqlite.js';

const router = Router();

// ============================================================================
// Source Configs
// ============================================================================

// Get all source configs
router.get('/', (_req: Request, res: Response) => {
  try {
    const enabled = _req.query.enabled === 'true' ? true : _req.query.enabled === 'false' ? false : undefined;
    const configs = getSourceConfigs(enabled);

    // Include extraction and transform counts
    const configsWithCounts = configs.map(config => ({
      ...config,
      extraction_count: getSourceConfigExtractions(config.id).length,
      transform_count: getSourceConfigTransforms(config.id).length,
    }));

    return res.json(configsWithCounts);
  } catch (error) {
    console.error('Error fetching source configs:', error);
    return res.status(500).json({ error: 'Failed to fetch source configs' });
  }
});

// Get single source config with extractions and transforms
router.get('/:id', (req: Request, res: Response) => {
  try {
    const config = getSourceConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    return res.json({
      ...config,
      extractions: getSourceConfigExtractions(config.id),
      transforms: getSourceConfigTransforms(config.id),
    });
  } catch (error) {
    console.error('Error fetching source config:', error);
    return res.status(500).json({ error: 'Failed to fetch source config' });
  }
});

// Create source config
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, hostname_pattern, app_name_pattern, source_type, priority, template_id, target_index, parsing_mode, time_format, time_field, enabled } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const config = createSourceConfig({
      name,
      description,
      hostname_pattern,
      app_name_pattern,
      source_type,
      priority: priority ?? 100,
      template_id,
      target_index,
      parsing_mode: parsing_mode || 'auto',
      time_format,
      time_field,
      enabled: enabled ?? 1,
    });

    return res.status(201).json(config);
  } catch (error) {
    console.error('Error creating source config:', error);
    return res.status(500).json({ error: 'Failed to create source config' });
  }
});

// Update source config
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getSourceConfig(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    const updated = updateSourceConfig(req.params.id, req.body);
    return res.json(updated);
  } catch (error) {
    console.error('Error updating source config:', error);
    return res.status(500).json({ error: 'Failed to update source config' });
  }
});

// Delete source config
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteSourceConfig(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Source config not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting source config:', error);
    return res.status(500).json({ error: 'Failed to delete source config' });
  }
});

// Test source config against sample log
router.post('/:id/test', (req: Request, res: Response) => {
  try {
    const config = getSourceConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    const { sample_log } = req.body;
    if (!sample_log) {
      return res.status(400).json({ error: 'sample_log is required' });
    }

    const extractions = getSourceConfigExtractions(config.id);
    const transforms = getSourceConfigTransforms(config.id);

    // Test hostname pattern
    let hostnameMatch = null;
    if (config.hostname_pattern) {
      try {
        const regex = new RegExp(config.hostname_pattern);
        hostnameMatch = regex.test(sample_log);
      } catch {
        hostnameMatch = false;
      }
    }

    // Test extractions
    const extractionResults: Array<{
      field_name: string;
      pattern: string;
      matched: boolean;
      value?: string;
    }> = [];

    for (const extraction of extractions) {
      if (!extraction.enabled) continue;

      let matched = false;
      let value: string | undefined;

      try {
        if (extraction.pattern_type === 'regex') {
          const regex = new RegExp(extraction.pattern);
          const match = sample_log.match(regex);
          if (match) {
            matched = true;
            value = match[1] || match[0];
          }
        } else if (extraction.pattern_type === 'json_path') {
          // Simple JSON path extraction
          try {
            const parsed = JSON.parse(sample_log);
            const parts = extraction.pattern.split('.');
            let current = parsed;
            for (const part of parts) {
              if (current && typeof current === 'object' && part in current) {
                current = current[part];
              } else {
                current = undefined;
                break;
              }
            }
            if (current !== undefined) {
              matched = true;
              value = String(current);
            }
          } catch {
            matched = false;
          }
        }
      } catch {
        matched = false;
      }

      extractionResults.push({
        field_name: extraction.field_name,
        pattern: extraction.pattern,
        matched,
        value,
      });
    }

    return res.json({
      config_matches: hostnameMatch !== false,
      hostname_match: hostnameMatch,
      target_index: config.target_index,
      parsing_mode: config.parsing_mode,
      extractions: extractionResults,
      transform_count: transforms.filter(t => t.enabled).length,
    });
  } catch (error) {
    console.error('Error testing source config:', error);
    return res.status(500).json({ error: 'Failed to test source config' });
  }
});

// ============================================================================
// Source Config Extractions
// ============================================================================

router.get('/:id/extractions', (req: Request, res: Response) => {
  try {
    const config = getSourceConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    const extractions = getSourceConfigExtractions(req.params.id);
    return res.json(extractions);
  } catch (error) {
    console.error('Error fetching extractions:', error);
    return res.status(500).json({ error: 'Failed to fetch extractions' });
  }
});

router.post('/:id/extractions', (req: Request, res: Response) => {
  try {
    const config = getSourceConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    const { field_name, pattern, pattern_type, priority, enabled } = req.body;

    if (!field_name || !pattern) {
      return res.status(400).json({ error: 'field_name and pattern are required' });
    }

    // Validate regex pattern
    if (pattern_type === 'regex' || !pattern_type) {
      try {
        new RegExp(pattern);
      } catch {
        return res.status(400).json({ error: 'Invalid regex pattern' });
      }
    }

    const extraction = createSourceConfigExtraction({
      source_config_id: req.params.id,
      field_name,
      pattern,
      pattern_type: pattern_type || 'regex',
      priority: priority ?? 100,
      enabled: enabled ?? 1,
    });

    return res.status(201).json(extraction);
  } catch (error) {
    console.error('Error creating extraction:', error);
    return res.status(500).json({ error: 'Failed to create extraction' });
  }
});

router.put('/:id/extractions/:extractionId', (req: Request, res: Response) => {
  try {
    const extraction = getSourceConfigExtraction(req.params.extractionId);
    if (!extraction) {
      return res.status(404).json({ error: 'Extraction not found' });
    }

    // Validate regex pattern if provided
    if (req.body.pattern && (req.body.pattern_type === 'regex' || extraction.pattern_type === 'regex')) {
      try {
        new RegExp(req.body.pattern);
      } catch {
        return res.status(400).json({ error: 'Invalid regex pattern' });
      }
    }

    const updated = updateSourceConfigExtraction(req.params.extractionId, req.body);
    return res.json(updated);
  } catch (error) {
    console.error('Error updating extraction:', error);
    return res.status(500).json({ error: 'Failed to update extraction' });
  }
});

router.delete('/:id/extractions/:extractionId', (req: Request, res: Response) => {
  try {
    const deleted = deleteSourceConfigExtraction(req.params.extractionId);
    if (!deleted) {
      return res.status(404).json({ error: 'Extraction not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting extraction:', error);
    return res.status(500).json({ error: 'Failed to delete extraction' });
  }
});

// ============================================================================
// Source Config Transforms
// ============================================================================

router.get('/:id/transforms', (req: Request, res: Response) => {
  try {
    const config = getSourceConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    const transforms = getSourceConfigTransforms(req.params.id);
    return res.json(transforms);
  } catch (error) {
    console.error('Error fetching transforms:', error);
    return res.status(500).json({ error: 'Failed to fetch transforms' });
  }
});

router.post('/:id/transforms', (req: Request, res: Response) => {
  try {
    const config = getSourceConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Source config not found' });
    }

    const { transform_type, source_field, target_field, config: transformConfig, priority, enabled } = req.body;

    if (!transform_type || !target_field) {
      return res.status(400).json({ error: 'transform_type and target_field are required' });
    }

    const validTypes = ['rename', 'value_map', 'static', 'eval'];
    if (!validTypes.includes(transform_type)) {
      return res.status(400).json({ error: `transform_type must be one of: ${validTypes.join(', ')}` });
    }

    const transform = createSourceConfigTransform({
      source_config_id: req.params.id,
      transform_type,
      source_field,
      target_field,
      config: transformConfig ? JSON.stringify(transformConfig) : undefined,
      priority: priority ?? 100,
      enabled: enabled ?? 1,
    });

    return res.status(201).json(transform);
  } catch (error) {
    console.error('Error creating transform:', error);
    return res.status(500).json({ error: 'Failed to create transform' });
  }
});

router.put('/:id/transforms/:transformId', (req: Request, res: Response) => {
  try {
    const transform = getSourceConfigTransform(req.params.transformId);
    if (!transform) {
      return res.status(404).json({ error: 'Transform not found' });
    }

    const updateData = { ...req.body };
    if (updateData.config && typeof updateData.config === 'object') {
      updateData.config = JSON.stringify(updateData.config);
    }

    const updated = updateSourceConfigTransform(req.params.transformId, updateData);
    return res.json(updated);
  } catch (error) {
    console.error('Error updating transform:', error);
    return res.status(500).json({ error: 'Failed to update transform' });
  }
});

router.delete('/:id/transforms/:transformId', (req: Request, res: Response) => {
  try {
    const deleted = deleteSourceConfigTransform(req.params.transformId);
    if (!deleted) {
      return res.status(404).json({ error: 'Transform not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting transform:', error);
    return res.status(500).json({ error: 'Failed to delete transform' });
  }
});

export default router;

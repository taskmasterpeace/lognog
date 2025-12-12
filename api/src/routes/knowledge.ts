import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { testPattern } from '../services/field-extractor.js';
import {
  // Field Extractions
  getFieldExtractions,
  getFieldExtraction,
  createFieldExtraction,
  updateFieldExtraction,
  deleteFieldExtraction,
  // Event Types
  getEventTypes,
  getEventType,
  createEventType,
  updateEventType,
  deleteEventType,
  // Tags
  getTags,
  getTag,
  getTagsByValue,
  createTag,
  deleteTag,
  // Lookups
  getLookups,
  getLookup,
  getLookupByName,
  createLookup,
  updateLookup,
  deleteLookup,
  // Workflow Actions
  getWorkflowActions,
  getWorkflowAction,
  createWorkflowAction,
  updateWorkflowAction,
  deleteWorkflowAction,
} from '../db/sqlite.js';

const router = Router();

// ============================================================================
// FIELD EXTRACTIONS
// ============================================================================

// GET /knowledge/field-extractions - List all field extractions
router.get('/field-extractions', (req: Request, res: Response) => {
  try {
    const { source_type } = req.query;
    const extractions = getFieldExtractions(source_type as string | undefined);
    return res.json(extractions);
  } catch (error) {
    console.error('Error fetching field extractions:', error);
    return res.status(500).json({ error: 'Failed to fetch field extractions' });
  }
});

// POST /knowledge/field-extractions - Create new extraction
router.post('/field-extractions', (req: Request, res: Response) => {
  try {
    const { name, source_type, field_name, pattern, pattern_type = 'grok', priority = 100, enabled = true } = req.body;

    if (!name || !source_type || !field_name || !pattern) {
      return res.status(400).json({ error: 'Name, source_type, field_name, and pattern are required' });
    }

    if (pattern_type !== 'grok' && pattern_type !== 'regex') {
      return res.status(400).json({ error: 'pattern_type must be either "grok" or "regex"' });
    }

    const extraction = createFieldExtraction(name, source_type, field_name, pattern, pattern_type, priority, enabled);
    return res.status(201).json(extraction);
  } catch (error) {
    console.error('Error creating field extraction:', error);
    return res.status(500).json({ error: 'Failed to create field extraction' });
  }
});

// PUT /knowledge/field-extractions/:id - Update extraction
router.put('/field-extractions/:id', (req: Request, res: Response) => {
  try {
    const { name, source_type, field_name, pattern, pattern_type, priority, enabled } = req.body;

    if (pattern_type && pattern_type !== 'grok' && pattern_type !== 'regex') {
      return res.status(400).json({ error: 'pattern_type must be either "grok" or "regex"' });
    }

    const updates: {
      name?: string;
      source_type?: string;
      field_name?: string;
      pattern?: string;
      pattern_type?: 'grok' | 'regex';
      priority?: number;
      enabled?: boolean;
    } = {};

    if (name !== undefined) updates.name = name;
    if (source_type !== undefined) updates.source_type = source_type;
    if (field_name !== undefined) updates.field_name = field_name;
    if (pattern !== undefined) updates.pattern = pattern;
    if (pattern_type !== undefined) updates.pattern_type = pattern_type;
    if (priority !== undefined) updates.priority = priority;
    if (enabled !== undefined) updates.enabled = enabled;

    const extraction = updateFieldExtraction(req.params.id, updates);
    if (!extraction) {
      return res.status(404).json({ error: 'Field extraction not found' });
    }

    return res.json(extraction);
  } catch (error) {
    console.error('Error updating field extraction:', error);
    return res.status(500).json({ error: 'Failed to update field extraction' });
  }
});

// DELETE /knowledge/field-extractions/:id - Delete extraction
router.delete('/field-extractions/:id', (req: Request, res: Response) => {
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

// POST /knowledge/field-extractions/:id/test - Test extraction against sample log line
router.post('/field-extractions/:id/test', (req: Request, res: Response) => {
  try {
    const { log_line } = req.body;

    if (!log_line || typeof log_line !== 'string') {
      return res.status(400).json({ error: 'log_line is required' });
    }

    const extraction = getFieldExtraction(req.params.id);
    if (!extraction) {
      return res.status(404).json({ error: 'Field extraction not found' });
    }

    try {
      // Use our testPattern function
      const result = testPattern(extraction.pattern, extraction.pattern_type, log_line);

      if (result.success) {
        return res.json({
          success: true,
          extracted_fields: result.fields,
          field_name: extraction.field_name,
          pattern_type: extraction.pattern_type,
        });
      } else {
        return res.json({
          success: false,
          message: result.error || 'Pattern did not match the log line',
          extracted_fields: null,
        });
      }
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid pattern',
        message: String(parseError),
      });
    }
  } catch (error) {
    console.error('Error testing field extraction:', error);
    return res.status(500).json({ error: 'Failed to test field extraction' });
  }
});

// ============================================================================
// EVENT TYPES
// ============================================================================

// GET /knowledge/event-types - List all event types
router.get('/event-types', (_req: Request, res: Response) => {
  try {
    const eventTypes = getEventTypes();
    return res.json(eventTypes);
  } catch (error) {
    console.error('Error fetching event types:', error);
    return res.status(500).json({ error: 'Failed to fetch event types' });
  }
});

// POST /knowledge/event-types - Create new event type
router.post('/event-types', (req: Request, res: Response) => {
  try {
    const { name, search_string, description, priority = 100, enabled = true } = req.body;

    if (!name || !search_string) {
      return res.status(400).json({ error: 'Name and search_string are required' });
    }

    const eventType = createEventType(name, search_string, description, priority, enabled);
    return res.status(201).json(eventType);
  } catch (error) {
    console.error('Error creating event type:', error);
    return res.status(500).json({ error: 'Failed to create event type' });
  }
});

// PUT /knowledge/event-types/:id - Update event type
router.put('/event-types/:id', (req: Request, res: Response) => {
  try {
    const { name, search_string, description, priority, enabled } = req.body;

    const updates: {
      name?: string;
      search_string?: string;
      description?: string;
      priority?: number;
      enabled?: boolean;
    } = {};

    if (name !== undefined) updates.name = name;
    if (search_string !== undefined) updates.search_string = search_string;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (enabled !== undefined) updates.enabled = enabled;

    const eventType = updateEventType(req.params.id, updates);
    if (!eventType) {
      return res.status(404).json({ error: 'Event type not found' });
    }

    return res.json(eventType);
  } catch (error) {
    console.error('Error updating event type:', error);
    return res.status(500).json({ error: 'Failed to update event type' });
  }
});

// DELETE /knowledge/event-types/:id - Delete event type
router.delete('/event-types/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteEventType(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Event type not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting event type:', error);
    return res.status(500).json({ error: 'Failed to delete event type' });
  }
});

// ============================================================================
// TAGS
// ============================================================================

// GET /knowledge/tags - List all tags
router.get('/tags', (req: Request, res: Response) => {
  try {
    const { field } = req.query;
    const tags = getTags(field as string | undefined);
    return res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// GET /knowledge/tags/by-value - Get tags by field and value
router.get('/tags/by-value', (req: Request, res: Response) => {
  try {
    const { field, value } = req.query;

    if (!field || !value) {
      return res.status(400).json({ error: 'field and value query parameters are required' });
    }

    const tags = getTagsByValue(field as string, value as string);
    return res.json(tags);
  } catch (error) {
    console.error('Error fetching tags by value:', error);
    return res.status(500).json({ error: 'Failed to fetch tags by value' });
  }
});

// POST /knowledge/tags - Create new tag
router.post('/tags', (req: Request, res: Response) => {
  try {
    const { tag_name, field, value } = req.body;

    if (!tag_name || !field || !value) {
      return res.status(400).json({ error: 'tag_name, field, and value are required' });
    }

    const tag = createTag(tag_name, field, value);
    return res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    return res.status(500).json({ error: 'Failed to create tag' });
  }
});

// DELETE /knowledge/tags/:id - Delete tag
router.delete('/tags/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteTag(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting tag:', error);
    return res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ============================================================================
// LOOKUPS
// ============================================================================

// GET /knowledge/lookups - List all lookups
router.get('/lookups', (_req: Request, res: Response) => {
  try {
    const lookups = getLookups();
    return res.json(lookups);
  } catch (error) {
    console.error('Error fetching lookups:', error);
    return res.status(500).json({ error: 'Failed to fetch lookups' });
  }
});

// GET /knowledge/lookups/by-name/:name - Get lookup by name
router.get('/lookups/by-name/:name', (req: Request, res: Response) => {
  try {
    const lookup = getLookupByName(req.params.name);
    if (!lookup) {
      return res.status(404).json({ error: 'Lookup not found' });
    }
    return res.json(lookup);
  } catch (error) {
    console.error('Error fetching lookup:', error);
    return res.status(500).json({ error: 'Failed to fetch lookup' });
  }
});

// POST /knowledge/lookups - Create lookup
router.post('/lookups', (req: Request, res: Response) => {
  try {
    const { name, type = 'manual', key_field, output_fields, data, file_path } = req.body;

    if (!name || !key_field || !output_fields) {
      return res.status(400).json({ error: 'Name, key_field, and output_fields are required' });
    }

    if (type !== 'csv' && type !== 'manual') {
      return res.status(400).json({ error: 'type must be either "csv" or "manual"' });
    }

    if (!Array.isArray(output_fields)) {
      return res.status(400).json({ error: 'output_fields must be an array' });
    }

    if (type === 'manual' && !data) {
      return res.status(400).json({ error: 'data is required for manual lookups' });
    }

    if (type === 'csv' && !file_path) {
      return res.status(400).json({ error: 'file_path is required for CSV lookups' });
    }

    const lookup = createLookup(name, type, key_field, output_fields, data, file_path);
    return res.status(201).json(lookup);
  } catch (error) {
    console.error('Error creating lookup:', error);
    return res.status(500).json({ error: 'Failed to create lookup' });
  }
});

// PUT /knowledge/lookups/:id - Update lookup
router.put('/lookups/:id', (req: Request, res: Response) => {
  try {
    const { name, type, key_field, output_fields, data, file_path } = req.body;

    if (type && type !== 'csv' && type !== 'manual') {
      return res.status(400).json({ error: 'type must be either "csv" or "manual"' });
    }

    if (output_fields && !Array.isArray(output_fields)) {
      return res.status(400).json({ error: 'output_fields must be an array' });
    }

    const updates: {
      name?: string;
      type?: 'csv' | 'manual';
      key_field?: string;
      output_fields?: string[];
      data?: Record<string, unknown>[];
      file_path?: string;
    } = {};

    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (key_field !== undefined) updates.key_field = key_field;
    if (output_fields !== undefined) updates.output_fields = output_fields;
    if (data !== undefined) updates.data = data;
    if (file_path !== undefined) updates.file_path = file_path;

    const lookup = updateLookup(req.params.id, updates);
    if (!lookup) {
      return res.status(404).json({ error: 'Lookup not found' });
    }

    return res.json(lookup);
  } catch (error) {
    console.error('Error updating lookup:', error);
    return res.status(500).json({ error: 'Failed to update lookup' });
  }
});

// DELETE /knowledge/lookups/:id - Delete lookup
router.delete('/lookups/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteLookup(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Lookup not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting lookup:', error);
    return res.status(500).json({ error: 'Failed to delete lookup' });
  }
});

// GET /knowledge/lookups/:id/search - Search lookup by key
router.get('/lookups/:id/search', (req: Request, res: Response) => {
  try {
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'key query parameter is required' });
    }

    const lookup = getLookup(req.params.id);
    if (!lookup) {
      return res.status(404).json({ error: 'Lookup not found' });
    }

    try {
      if (lookup.type === 'manual' && lookup.data) {
        const data = JSON.parse(lookup.data);
        const keyField = lookup.key_field;
        const outputFields = JSON.parse(lookup.output_fields);

        // Find the record matching the key
        const record = data.find((item: Record<string, unknown>) => String(item[keyField]) === key);

        if (record) {
          // Extract only the output fields
          const result: Record<string, unknown> = {};
          outputFields.forEach((field: string) => {
            result[field] = record[field];
          });

          return res.json({
            key,
            found: true,
            data: result,
          });
        } else {
          return res.json({
            key,
            found: false,
            data: null,
          });
        }
      } else if (lookup.type === 'csv') {
        return res.status(501).json({ error: 'CSV lookup search not yet implemented' });
      } else {
        return res.status(400).json({ error: 'Lookup has no data' });
      }
    } catch (parseError) {
      console.error('Error parsing lookup data:', parseError);
      return res.status(500).json({ error: 'Invalid lookup data format' });
    }
  } catch (error) {
    console.error('Error searching lookup:', error);
    return res.status(500).json({ error: 'Failed to search lookup' });
  }
});

// ============================================================================
// WORKFLOW ACTIONS
// ============================================================================

// GET /knowledge/workflow-actions - List all workflow actions
router.get('/workflow-actions', (req: Request, res: Response) => {
  try {
    const { field } = req.query;
    const actions = getWorkflowActions(field as string | undefined);
    return res.json(actions);
  } catch (error) {
    console.error('Error fetching workflow actions:', error);
    return res.status(500).json({ error: 'Failed to fetch workflow actions' });
  }
});

// POST /knowledge/workflow-actions - Create workflow action
router.post('/workflow-actions', (req: Request, res: Response) => {
  try {
    const { name, label, field, action_type = 'link', action_value, enabled = true } = req.body;

    if (!name || !label || !field || !action_value) {
      return res.status(400).json({ error: 'Name, label, field, and action_value are required' });
    }

    if (action_type !== 'link' && action_type !== 'search' && action_type !== 'script') {
      return res.status(400).json({ error: 'action_type must be "link", "search", or "script"' });
    }

    const action = createWorkflowAction(name, label, field, action_type, action_value, enabled);
    return res.status(201).json(action);
  } catch (error) {
    console.error('Error creating workflow action:', error);
    return res.status(500).json({ error: 'Failed to create workflow action' });
  }
});

// PUT /knowledge/workflow-actions/:id - Update workflow action
router.put('/workflow-actions/:id', (req: Request, res: Response) => {
  try {
    const { name, label, field, action_type, action_value, enabled } = req.body;

    if (action_type && action_type !== 'link' && action_type !== 'search' && action_type !== 'script') {
      return res.status(400).json({ error: 'action_type must be "link", "search", or "script"' });
    }

    const updates: {
      name?: string;
      label?: string;
      field?: string;
      action_type?: 'link' | 'search' | 'script';
      action_value?: string;
      enabled?: boolean;
    } = {};

    if (name !== undefined) updates.name = name;
    if (label !== undefined) updates.label = label;
    if (field !== undefined) updates.field = field;
    if (action_type !== undefined) updates.action_type = action_type;
    if (action_value !== undefined) updates.action_value = action_value;
    if (enabled !== undefined) updates.enabled = enabled;

    const action = updateWorkflowAction(req.params.id, updates);
    if (!action) {
      return res.status(404).json({ error: 'Workflow action not found' });
    }

    return res.json(action);
  } catch (error) {
    console.error('Error updating workflow action:', error);
    return res.status(500).json({ error: 'Failed to update workflow action' });
  }
});

// DELETE /knowledge/workflow-actions/:id - Delete workflow action
router.delete('/workflow-actions/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteWorkflowAction(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Workflow action not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting workflow action:', error);
    return res.status(500).json({ error: 'Failed to delete workflow action' });
  }
});

// POST /knowledge/workflow-actions/:id/execute - Execute a workflow action
router.post('/workflow-actions/:id/execute', async (req: Request, res: Response) => {
  try {
    const { context } = req.body;

    if (!context || typeof context !== 'object') {
      return res.status(400).json({ error: 'Context object is required' });
    }

    const action = getWorkflowAction(req.params.id);
    if (!action) {
      return res.status(404).json({ error: 'Workflow action not found' });
    }

    if (!action.enabled) {
      return res.status(400).json({ error: 'Workflow action is disabled' });
    }

    // Handle different action types
    switch (action.action_type) {
      case 'link': {
        // Replace $field$ placeholders with context values
        let url = action.action_value;
        for (const [key, value] of Object.entries(context)) {
          url = url.replace(new RegExp(`\\$${key}\\$`, 'g'), encodeURIComponent(String(value)));
        }
        // Also replace $value$ with the field value
        if (context[action.field]) {
          url = url.replace(/\$value\$/g, encodeURIComponent(String(context[action.field])));
        }
        return res.json({ type: 'link', url, action: action.label });
      }

      case 'search': {
        // Replace placeholders in search query
        let query = action.action_value;
        for (const [key, value] of Object.entries(context)) {
          query = query.replace(new RegExp(`\\$${key}\\$`, 'g'), String(value));
        }
        if (context[action.field]) {
          query = query.replace(/\$value\$/g, String(context[action.field]));
        }
        return res.json({ type: 'search', query, action: action.label });
      }

      case 'script': {
        // Execute Python script with context as JSON input
        const result = await executePythonScript(action.action_value, context);
        return res.json({ type: 'script', result, action: action.label });
      }

      default:
        return res.status(400).json({ error: `Unknown action type: ${action.action_type}` });
    }
  } catch (error) {
    console.error('Error executing workflow action:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// Helper function to execute Python scripts safely
async function executePythonScript(
  scriptContent: string,
  context: Record<string, unknown>
): Promise<{ stdout: string; stderr: string; exitCode: number; output?: unknown }> {
  return new Promise((resolve, reject) => {
    // Create a temporary script file
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `spunk_script_${Date.now()}.py`);

    // Wrap the script with context injection and output capture
    const wrappedScript = `
import json
import sys

# Context passed from Spunk
context = json.loads('''${JSON.stringify(context).replace(/'/g, "\\'")}''')

# User script output
_spunk_output = None

def set_output(value):
    """Set the output value to return to Spunk"""
    global _spunk_output
    _spunk_output = value

def get_field(name, default=None):
    """Get a field value from the log context"""
    return context.get(name, default)

# --- USER SCRIPT STARTS HERE ---
${scriptContent}
# --- USER SCRIPT ENDS HERE ---

# Output the result
if _spunk_output is not None:
    print("__SPUNK_OUTPUT__:" + json.dumps(_spunk_output))
`;

    try {
      fs.writeFileSync(scriptPath, wrappedScript);

      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pythonProcess = spawn(pythonCmd, [scriptPath], {
        timeout: 30000, // 30 second timeout
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }

        // Parse output
        let output: unknown = null;
        const outputMatch = stdout.match(/__SPUNK_OUTPUT__:(.+)/);
        if (outputMatch) {
          try {
            output = JSON.parse(outputMatch[1]);
            stdout = stdout.replace(/__SPUNK_OUTPUT__:.+\n?/, '').trim();
          } catch (e) {
            // Output wasn't valid JSON
          }
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 0,
          output,
        });
      });

      pythonProcess.on('error', (error) => {
        // Clean up temp file
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        reject(new Error(`Failed to execute Python: ${error.message}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

// POST /knowledge/scripts/test - Test a Python script without saving
router.post('/scripts/test', async (req: Request, res: Response) => {
  try {
    const { script, context = {} } = req.body;

    if (!script || typeof script !== 'string') {
      return res.status(400).json({ error: 'Script is required' });
    }

    const result = await executePythonScript(script, context);
    return res.json(result);
  } catch (error) {
    console.error('Error testing script:', error);
    return res.status(500).json({ error: String(error) });
  }
});

export default router;

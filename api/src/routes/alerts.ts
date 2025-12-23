/**
 * Alerts API Routes
 *
 * CRUD operations for Splunk-style alerts.
 */

import { Router, Request, Response } from 'express';
import {
  getAlerts,
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
  getAlertHistory,
  getAlertHistoryEntry,
  acknowledgeAlertHistory,
  AlertAction,
  AlertTriggerType,
  AlertTriggerCondition,
  AlertSeverity,
  AlertScheduleType,
} from '../db/sqlite.js';
import { evaluateAlert, testAlert, evaluateAllAlerts } from '../services/alerts.js';

const router = Router();

// Get all alerts
router.get('/', (_req: Request, res: Response) => {
  try {
    const alerts = getAlerts();
    // Parse actions JSON for each alert
    const alertsWithParsedActions = alerts.map(alert => ({
      ...alert,
      actions: JSON.parse(alert.actions || '[]'),
    }));
    res.json(alertsWithParsedActions);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Get single alert
router.get('/:id', (req: Request, res: Response) => {
  try {
    const alert = getAlert(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({
      ...alert,
      actions: JSON.parse(alert.actions || '[]'),
    });
  } catch (error) {
    console.error('Error getting alert:', error);
    res.status(500).json({ error: 'Failed to get alert' });
  }
});

// Create alert
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      search_query,
      trigger_type,
      trigger_condition,
      trigger_threshold,
      schedule_type,
      cron_expression,
      time_range,
      actions,
      throttle_enabled,
      throttle_window_seconds,
      severity,
      enabled,
    } = req.body;

    if (!name || !search_query) {
      return res.status(400).json({ error: 'Name and search_query are required' });
    }

    const alert = createAlert(name, search_query, {
      description,
      trigger_type: trigger_type as AlertTriggerType,
      trigger_condition: trigger_condition as AlertTriggerCondition,
      trigger_threshold,
      schedule_type: schedule_type as AlertScheduleType,
      cron_expression,
      time_range,
      actions: actions as AlertAction[],
      throttle_enabled,
      throttle_window_seconds,
      severity: severity as AlertSeverity,
      enabled,
    });

    res.status(201).json({
      ...alert,
      actions: JSON.parse(alert.actions || '[]'),
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// Update alert
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const {
      name,
      description,
      search_query,
      trigger_type,
      trigger_condition,
      trigger_threshold,
      schedule_type,
      cron_expression,
      time_range,
      actions,
      throttle_enabled,
      throttle_window_seconds,
      severity,
      enabled,
    } = req.body;

    const alert = updateAlert(req.params.id, {
      name,
      description,
      search_query,
      trigger_type: trigger_type as AlertTriggerType,
      trigger_condition: trigger_condition as AlertTriggerCondition,
      trigger_threshold,
      schedule_type: schedule_type as AlertScheduleType,
      cron_expression,
      time_range,
      actions: actions as AlertAction[],
      throttle_enabled,
      throttle_window_seconds,
      severity: severity as AlertSeverity,
      enabled,
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      ...alert,
      actions: JSON.parse(alert.actions || '[]'),
    });
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// Delete alert
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteAlert(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// Enable/disable alert
router.post('/:id/toggle', (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = updateAlert(req.params.id, {
      enabled: !existing.enabled,
    });

    res.json({
      ...alert,
      actions: JSON.parse(alert?.actions || '[]'),
    });
  } catch (error) {
    console.error('Error toggling alert:', error);
    res.status(500).json({ error: 'Failed to toggle alert' });
  }
});

// Manually trigger/evaluate an alert
router.post('/:id/evaluate', async (req: Request, res: Response) => {
  try {
    const result = await evaluateAlert(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error evaluating alert:', error);
    res.status(500).json({ error: 'Failed to evaluate alert' });
  }
});

// Test alert configuration (without saving)
router.post('/test', async (req: Request, res: Response) => {
  try {
    const {
      search_query,
      trigger_type,
      trigger_condition,
      trigger_threshold,
      time_range,
    } = req.body;

    if (!search_query) {
      return res.status(400).json({ error: 'search_query is required' });
    }

    const result = await testAlert(
      search_query,
      trigger_type || 'number_of_results',
      trigger_condition || 'greater_than',
      trigger_threshold ?? 0,
      time_range || '-5m'
    );

    res.json(result);
  } catch (error) {
    console.error('Error testing alert:', error);
    res.status(500).json({ error: 'Failed to test alert' });
  }
});

// Evaluate all enabled alerts (for manual trigger or testing)
router.post('/evaluate-all', async (_req: Request, res: Response) => {
  try {
    const result = await evaluateAllAlerts();
    res.json(result);
  } catch (error) {
    console.error('Error evaluating all alerts:', error);
    res.status(500).json({ error: 'Failed to evaluate alerts' });
  }
});

// Export all alerts as template array
router.post('/export-all', (_req: Request, res: Response) => {
  try {
    const alerts = getAlerts();

    // Export all alerts in the same format as single export
    const exportedAlerts = alerts.map(alert => ({
      name: alert.name,
      description: alert.description,
      search_query: alert.search_query,
      trigger_type: alert.trigger_type,
      trigger_condition: alert.trigger_condition,
      trigger_threshold: alert.trigger_threshold,
      schedule_type: alert.schedule_type,
      cron_expression: alert.cron_expression,
      time_range: alert.time_range,
      actions: JSON.parse(alert.actions || '[]'),
      throttle_enabled: alert.throttle_enabled,
      throttle_window_seconds: alert.throttle_window_seconds,
      severity: alert.severity,
      enabled: alert.enabled,
    }));

    const exportData = {
      alerts: exportedAlerts,
      count: exportedAlerts.length,
      exported_at: new Date().toISOString(),
      version: '1.0',
    };

    return res.json(exportData);
  } catch (error) {
    console.error('Error exporting alerts:', error);
    return res.status(500).json({ error: 'Failed to export alerts' });
  }
});

// Valid enum values for validation
const VALID_TRIGGER_TYPES: AlertTriggerType[] = ['number_of_results', 'number_of_hosts', 'custom_condition'];
const VALID_TRIGGER_CONDITIONS: AlertTriggerCondition[] = ['greater_than', 'less_than', 'equal_to', 'not_equal_to', 'drops_by', 'rises_by'];
const VALID_SEVERITIES: AlertSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
const VALID_SCHEDULE_TYPES: AlertScheduleType[] = ['cron', 'realtime'];

// Validate an alert template and return errors if any
function validateAlertTemplate(template: Record<string, unknown>, index?: number): string[] {
  const errors: string[] = [];
  const prefix = index !== undefined ? `Alert ${index + 1}: ` : '';

  // Required fields
  if (!template.name || typeof template.name !== 'string' || !template.name.trim()) {
    errors.push(`${prefix}name is required`);
  }
  if (!template.search_query || typeof template.search_query !== 'string' || !template.search_query.trim()) {
    errors.push(`${prefix}search_query is required`);
  }

  // Enum validations
  if (template.trigger_type !== undefined && !VALID_TRIGGER_TYPES.includes(template.trigger_type as AlertTriggerType)) {
    errors.push(`${prefix}trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`);
  }
  if (template.trigger_condition !== undefined && !VALID_TRIGGER_CONDITIONS.includes(template.trigger_condition as AlertTriggerCondition)) {
    errors.push(`${prefix}trigger_condition must be one of: ${VALID_TRIGGER_CONDITIONS.join(', ')}`);
  }
  if (template.severity !== undefined && !VALID_SEVERITIES.includes(template.severity as AlertSeverity)) {
    errors.push(`${prefix}severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }
  if (template.schedule_type !== undefined && !VALID_SCHEDULE_TYPES.includes(template.schedule_type as AlertScheduleType)) {
    errors.push(`${prefix}schedule_type must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}`);
  }

  // Validate actions
  if (template.actions !== undefined) {
    if (!Array.isArray(template.actions)) {
      errors.push(`${prefix}actions must be an array`);
    } else {
      template.actions.forEach((action: Record<string, unknown>, actionIndex: number) => {
        if (!action.type || !['email', 'webhook', 'log', 'script'].includes(action.type as string)) {
          errors.push(`${prefix}action ${actionIndex + 1}: type must be one of: email, webhook, log, script`);
        } else if (!action.config || typeof action.config !== 'object') {
          errors.push(`${prefix}action ${actionIndex + 1}: config is required`);
        } else {
          const config = action.config as Record<string, unknown>;
          // Email requires 'to'
          if (action.type === 'email' && (!config.to || typeof config.to !== 'string' || !config.to.trim())) {
            errors.push(`${prefix}action ${actionIndex + 1}: email action requires 'to' in config`);
          }
          // Webhook requires 'url'
          if (action.type === 'webhook' && (!config.url || typeof config.url !== 'string' || !config.url.trim())) {
            errors.push(`${prefix}action ${actionIndex + 1}: webhook action requires 'url' in config`);
          }
        }
      });
    }
  }

  return errors;
}

// Generate unique name for imported alert (handles duplicates)
function generateUniqueName(baseName: string, existingNames: Set<string>): string {
  let name = baseName;
  if (existingNames.has(name)) {
    name = `${baseName} (imported)`;
    let counter = 2;
    while (existingNames.has(name)) {
      name = `${baseName} (imported ${counter})`;
      counter++;
    }
  }
  return name;
}

// Import alerts from template
router.post('/import', (req: Request, res: Response) => {
  try {
    const { templates, template } = req.body;

    // Accept either 'templates' array, 'template' single object, or direct array/object
    let alertTemplates: Record<string, unknown>[];
    if (templates) {
      // { templates: [...] } format (from bulk export)
      alertTemplates = Array.isArray(templates) ? templates : [templates];
    } else if (template) {
      // { template: {...} } format (single import)
      alertTemplates = Array.isArray(template) ? template : [template];
    } else if (req.body.alerts) {
      // { alerts: [...] } format (from export-all response)
      alertTemplates = Array.isArray(req.body.alerts) ? req.body.alerts : [req.body.alerts];
    } else if (Array.isArray(req.body)) {
      // Direct array format
      alertTemplates = req.body;
    } else if (req.body.name || req.body.search_query) {
      // Direct single object format (exported alert)
      alertTemplates = [req.body];
    } else {
      return res.status(400).json({
        error: 'Invalid request format. Provide templates array, template object, alerts array, or alert template directly.'
      });
    }

    if (alertTemplates.length === 0) {
      return res.status(400).json({ error: 'No alert templates provided' });
    }

    // Validate all templates first
    const allErrors: string[] = [];
    alertTemplates.forEach((tmpl, index) => {
      const errors = validateAlertTemplate(tmpl, alertTemplates.length > 1 ? index : undefined);
      allErrors.push(...errors);
    });

    if (allErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: allErrors
      });
    }

    // Get existing alert names for duplicate handling
    const existingAlerts = getAlerts();
    const existingNames = new Set(existingAlerts.map(a => a.name));
    const usedNames = new Set(existingNames);

    // Create alerts
    const createdAlerts: Array<Record<string, unknown>> = [];
    for (const tmpl of alertTemplates) {
      // Generate unique name
      const name = generateUniqueName(tmpl.name as string, usedNames);
      usedNames.add(name);

      const alert = createAlert(name, tmpl.search_query as string, {
        description: tmpl.description as string | undefined,
        trigger_type: (tmpl.trigger_type as AlertTriggerType) || undefined,
        trigger_condition: (tmpl.trigger_condition as AlertTriggerCondition) || undefined,
        trigger_threshold: tmpl.trigger_threshold as number | undefined,
        schedule_type: (tmpl.schedule_type as AlertScheduleType) || undefined,
        cron_expression: tmpl.cron_expression as string | undefined,
        time_range: tmpl.time_range as string | undefined,
        actions: tmpl.actions as AlertAction[] | undefined,
        throttle_enabled: tmpl.throttle_enabled === 1 || tmpl.throttle_enabled === true,
        throttle_window_seconds: tmpl.throttle_window_seconds as number | undefined,
        severity: (tmpl.severity as AlertSeverity) || undefined,
        enabled: tmpl.enabled === 1 || tmpl.enabled === true,
      });

      createdAlerts.push({
        ...alert,
        actions: JSON.parse(alert.actions || '[]'),
      });
    }

    return res.status(201).json({
      imported: createdAlerts,
      count: createdAlerts.length,
    });
  } catch (error) {
    console.error('Error importing alerts:', error);
    return res.status(500).json({ error: 'Failed to import alerts' });
  }
});

// Get alert history
router.get('/history', (_req: Request, res: Response) => {
  try {
    const limit = parseInt(_req.query.limit as string) || 100;
    const history = getAlertHistory(undefined, limit);

    // Parse JSON fields
    const historyWithParsed = history.map(h => ({
      ...h,
      actions_executed: h.actions_executed ? JSON.parse(h.actions_executed) : null,
      sample_results: h.sample_results ? JSON.parse(h.sample_results) : null,
    }));

    res.json(historyWithParsed);
  } catch (error) {
    console.error('Error getting alert history:', error);
    res.status(500).json({ error: 'Failed to get alert history' });
  }
});

// Get history for specific alert
router.get('/:id/history', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const history = getAlertHistory(req.params.id, limit);

    // Parse JSON fields
    const historyWithParsed = history.map(h => ({
      ...h,
      actions_executed: h.actions_executed ? JSON.parse(h.actions_executed) : null,
      sample_results: h.sample_results ? JSON.parse(h.sample_results) : null,
    }));

    res.json(historyWithParsed);
  } catch (error) {
    console.error('Error getting alert history:', error);
    res.status(500).json({ error: 'Failed to get alert history' });
  }
});

// Acknowledge alert history entry
router.post('/history/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const { acknowledged_by, notes } = req.body;

    if (!acknowledged_by) {
      return res.status(400).json({ error: 'acknowledged_by is required' });
    }

    const entry = acknowledgeAlertHistory(req.params.id, acknowledged_by, notes);
    if (!entry) {
      return res.status(404).json({ error: 'History entry not found' });
    }

    res.json({
      ...entry,
      actions_executed: entry.actions_executed ? JSON.parse(entry.actions_executed) : null,
      sample_results: entry.sample_results ? JSON.parse(entry.sample_results) : null,
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Export single alert as template
router.post('/:id/export', (req: Request, res: Response) => {
  try {
    const alert = getAlert(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Export all configuration fields, excluding runtime data
    const exportData = {
      name: alert.name,
      description: alert.description,
      search_query: alert.search_query,
      trigger_type: alert.trigger_type,
      trigger_condition: alert.trigger_condition,
      trigger_threshold: alert.trigger_threshold,
      schedule_type: alert.schedule_type,
      cron_expression: alert.cron_expression,
      time_range: alert.time_range,
      actions: JSON.parse(alert.actions || '[]'),
      throttle_enabled: alert.throttle_enabled,
      throttle_window_seconds: alert.throttle_window_seconds,
      severity: alert.severity,
      enabled: alert.enabled,
      exported_at: new Date().toISOString(),
      version: '1.0',
    };

    return res.json(exportData);
  } catch (error) {
    console.error('Error exporting alert:', error);
    return res.status(500).json({ error: 'Failed to export alert' });
  }
});

export default router;

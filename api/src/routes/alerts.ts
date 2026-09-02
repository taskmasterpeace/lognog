/**
 * Alerts API Routes
 *
 * CRUD operations for Splunk-style alerts.
 *
 * Route order matters: every static path (`/history`, `/test`, `/templates`,
 * `/evaluate-all`, ...) is registered BEFORE the `/:id` family, otherwise
 * Express matches `/history` as an alert id and the history view 404s.
 */

import { Router, Request, Response } from 'express';
import * as cron from 'node-cron';
import {
  getAlerts,
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
  getAlertHistory,
  acknowledgeAlertHistory,
  AlertAction,
  AlertTriggerCondition,
  AlertSeverity,
  AlertScheduleType,
} from '../db/sqlite.js';
import { evaluateAlert, testAlert, evaluateAllAlerts, normalizeTriggerType } from '../services/alerts.js';
import { validateDslCondition } from '../db/backend.js';
import { requireOwnerOrAdmin, withOwnership } from '../auth/ownership.js';
import { ALERT_TEMPLATES } from '../data/alert-templates.js';
import { authenticate, denyReadonly } from '../auth/middleware.js';

const router = Router();

// #35: require auth on all alert routes; #36: block writes for read-only roles.
// Alerts are user-usable (not admin-only), so normal users keep full access.
router.use(authenticate);
router.use(denyReadonly);

// Safe JSON parse helper to prevent crashes on corrupted data
function safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn('[Alerts] Failed to parse JSON:', json.substring(0, 100));
    return defaultValue;
  }
}

// Script actions run arbitrary commands on the API host, so only admins may
// attach one. Returns an error message when the caller is not allowed.
function scriptActionForbidden(req: Request, actions: unknown): string | null {
  if (!Array.isArray(actions)) return null;
  const hasScript = actions.some(a => a && typeof a === 'object' && (a as AlertAction).type === 'script');
  if (hasScript && req.user?.role !== 'admin') {
    return 'Only administrators can attach script actions to alerts';
  }
  return null;
}

// An invalid cron silently never fires (the scheduler's matcher returns
// false forever), so reject it up front with a usable message.
function invalidCron(cronExpression: unknown): string | null {
  if (cronExpression === undefined || cronExpression === null || cronExpression === '') return null;
  if (typeof cronExpression !== 'string' || !cron.validate(cronExpression)) {
    return `Invalid schedule "${String(cronExpression)}": use a 5-field cron expression such as "*/5 * * * *"`;
  }
  return null;
}

// A custom-condition alert needs a parseable DSL condition, otherwise it would
// silently fall back to "any results".
function invalidCustomCondition(triggerType: unknown, condition: unknown): string | null {
  if (condition === undefined || condition === null || condition === '') {
    return normalizeTriggerType(String(triggerType ?? '')) === 'custom_condition' && triggerType !== undefined
      ? 'A custom condition is required for the "custom condition" trigger, e.g. count > 100'
      : null;
  }
  if (typeof condition !== 'string') return 'custom_condition must be a string';
  const error = validateDslCondition(condition);
  return error ? `Invalid custom condition: ${error}` : null;
}

function parseHistoryLimit(raw: unknown): number {
  return Math.min(parseInt(String(raw ?? ''), 10) || 100, 1000);
}

function presentHistory<T extends { actions_executed?: string | null; sample_results?: string | null }>(h: T) {
  return {
    ...h,
    actions_executed: safeJsonParse(h.actions_executed, null),
    sample_results: safeJsonParse(h.sample_results, null),
  };
}

// Get all alerts (optionally filtered by app_scope)
router.get('/', (req: Request, res: Response) => {
  try {
    const appScope = req.query.app_scope as string | undefined;
    const alerts = getAlerts(false, appScope);
    // Parse actions JSON for each alert
    const alertsWithParsedActions = alerts.map(alert => withOwnership(req, {
      ...alert,
      actions: safeJsonParse<AlertAction[]>(alert.actions, []),
    }));
    res.json(alertsWithParsedActions);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Get alert templates (for onboarding wizard)
router.get('/templates', (_req: Request, res: Response) => {
  try {
    res.json(ALERT_TEMPLATES);
  } catch (error) {
    console.error('Error getting alert templates:', error);
    res.status(500).json({ error: 'Failed to get alert templates' });
  }
});

// Get alert history (all alerts)
router.get('/history', (req: Request, res: Response) => {
  try {
    const history = getAlertHistory(undefined, parseHistoryLimit(req.query.limit));
    res.json(history.map(presentHistory));
  } catch (error) {
    console.error('Error getting alert history:', error);
    res.status(500).json({ error: 'Failed to get alert history' });
  }
});

// Acknowledge alert history entry. The acknowledger is always the
// authenticated user — a client-supplied name is not trusted.
router.post('/history/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const { notes } = req.body ?? {};
    const acknowledgedBy = req.user?.username;
    if (!acknowledgedBy) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const entry = acknowledgeAlertHistory(req.params.id, acknowledgedBy, notes);
    if (!entry) {
      return res.status(404).json({ error: 'History entry not found' });
    }

    res.json(presentHistory(entry));
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
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
      custom_condition,
    } = req.body;

    if (!search_query) {
      return res.status(400).json({ error: 'search_query is required' });
    }
    const badCondition = invalidCustomCondition(trigger_type, custom_condition);
    if (badCondition) {
      return res.status(400).json({ error: badCondition });
    }

    const result = await testAlert(
      search_query,
      normalizeTriggerType(trigger_type),
      trigger_condition || 'greater_than',
      trigger_threshold ?? 0,
      time_range || '-5m',
      typeof custom_condition === 'string' ? custom_condition : undefined
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

// Create alert from template
router.post('/from-template/:templateId', (req: Request, res: Response) => {
  try {
    const template = ALERT_TEMPLATES.find(t => t.id === req.params.templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { app_scope } = req.body;

    const alert = createAlert(template.name, template.search_query, {
      description: template.description,
      trigger_type: template.trigger_type,
      trigger_condition: template.trigger_condition,
      trigger_threshold: template.trigger_threshold,
      schedule_type: template.schedule_type,
      cron_expression: template.cron_expression,
      time_range: template.time_range,
      severity: template.severity,
      throttle_enabled: template.throttle_enabled,
      throttle_window_seconds: template.throttle_window_seconds,
      actions: [],
      enabled: true,
      app_scope,
    });

    res.status(201).json({
      ...alert,
      actions: safeJsonParse<AlertAction[]>(alert.actions, []),
    });
  } catch (error) {
    console.error('Error creating alert from template:', error);
    res.status(500).json({ error: 'Failed to create alert from template' });
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
      app_scope,
      trigger_mode,
      throttle_fields,
      custom_condition,
      max_triggers,
    } = req.body;

    if (!name || !search_query) {
      return res.status(400).json({ error: 'Name and search_query are required' });
    }
    if (schedule_type !== undefined && schedule_type !== 'cron') {
      return res.status(400).json({ error: 'Only schedule_type "cron" is supported; real-time alerts are not implemented' });
    }

    const badCron = invalidCron(cron_expression);
    if (badCron) {
      return res.status(400).json({ error: badCron });
    }
    const badCondition = invalidCustomCondition(trigger_type, custom_condition);
    if (badCondition) {
      return res.status(400).json({ error: badCondition });
    }

    const forbidden = scriptActionForbidden(req, actions);
    if (forbidden) {
      return res.status(403).json({ error: forbidden });
    }

    const alert = createAlert(name, search_query, {
      description,
      trigger_type: normalizeTriggerType(trigger_type),
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
      app_scope,
      trigger_mode,
      throttle_fields,
      custom_condition,
      max_triggers,
      owner_id: req.user?.id ?? null,
    });

    res.status(201).json({
      ...alert,
      actions: safeJsonParse<AlertAction[]>(alert.actions, []),
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// ---- /:id family (must stay below every static route) ----

// Get single alert
router.get('/:id', (req: Request, res: Response) => {
  try {
    const alert = getAlert(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({
      ...alert,
      actions: safeJsonParse<AlertAction[]>(alert.actions, []),
    });
  } catch (error) {
    console.error('Error getting alert:', error);
    res.status(500).json({ error: 'Failed to get alert' });
  }
});

// Update alert
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    if (!requireOwnerOrAdmin(req, res, existing, 'alert')) return;

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
      app_scope,
      trigger_mode,
      throttle_fields,
      custom_condition,
      max_triggers,
    } = req.body;

    if (schedule_type !== undefined && schedule_type !== 'cron') {
      return res.status(400).json({ error: 'Only schedule_type "cron" is supported; real-time alerts are not implemented' });
    }

    const badCron = invalidCron(cron_expression);
    if (badCron) {
      return res.status(400).json({ error: badCron });
    }
    const badCondition = invalidCustomCondition(trigger_type ?? existing.trigger_type, custom_condition);
    if (badCondition) {
      return res.status(400).json({ error: badCondition });
    }

    const forbidden = scriptActionForbidden(req, actions);
    if (forbidden) {
      return res.status(403).json({ error: forbidden });
    }

    const alert = updateAlert(req.params.id, {
      name,
      description,
      search_query,
      trigger_type: trigger_type !== undefined ? normalizeTriggerType(trigger_type) : undefined,
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
      app_scope,
      trigger_mode,
      throttle_fields,
      custom_condition,
      max_triggers,
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      ...alert,
      actions: safeJsonParse<AlertAction[]>(alert.actions, []),
    });
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// Delete alert
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    if (!requireOwnerOrAdmin(req, res, existing, 'alert')) return;
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
    if (!requireOwnerOrAdmin(req, res, existing, 'alert')) return;

    const alert = updateAlert(req.params.id, {
      enabled: !existing.enabled,
    });

    // Check if update succeeded
    if (!alert) {
      return res.status(500).json({ error: 'Failed to update alert' });
    }

    res.json({
      ...alert,
      actions: safeJsonParse<AlertAction[]>(alert.actions, []),
    });
  } catch (error) {
    console.error('Error toggling alert:', error);
    res.status(500).json({ error: 'Failed to toggle alert' });
  }
});

// Manually trigger/evaluate an alert
router.post('/:id/evaluate', async (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    if (!requireOwnerOrAdmin(req, res, existing, 'alert')) return;
    const result = await evaluateAlert(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error evaluating alert:', error);
    res.status(500).json({ error: 'Failed to evaluate alert' });
  }
});

// Get history for specific alert
router.get('/:id/history', (req: Request, res: Response) => {
  try {
    const history = getAlertHistory(req.params.id, parseHistoryLimit(req.query.limit));
    res.json(history.map(presentHistory));
  } catch (error) {
    console.error('Error getting alert history:', error);
    res.status(500).json({ error: 'Failed to get alert history' });
  }
});

export default router;

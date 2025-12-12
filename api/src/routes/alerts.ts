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

export default router;

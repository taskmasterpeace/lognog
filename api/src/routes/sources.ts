/**
 * Sources / Heartbeat API (Phase 3)
 *
 * Exposes the cheap presence-tracking table for "tell me when an entity goes
 * silent" monitoring. These reads hit the tiny source_heartbeats table only —
 * they never scan log data.
 */
import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import { listSources, getStaleSources } from '../services/heartbeat.js';
import { createApiKey, deleteApiKey } from '../auth/auth.js';
import { createSourceConfig, deleteSourceConfig } from '../db/sqlite-source-config.js';
import { createAlert, deleteAlert } from '../db/sqlite-alerts.js';
import {
  createDashboard,
  createDashboardPanel,
  deleteDashboard,
} from '../db/sqlite-dashboards.js';

const router = Router();

const INDEX_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

// GET /sources/heartbeats — all tracked sources, newest-last_seen first
router.get('/heartbeats', authenticate, (_req: Request, res: Response) => {
  try {
    const sources = listSources();
    return res.json(sources);
  } catch (error) {
    console.error('Error listing source heartbeats:', error);
    return res.status(500).json({ error: 'Failed to list source heartbeats' });
  }
});

// GET /sources/heartbeats/stale?minutes=15 — sources silent for >= minutes
router.get('/heartbeats/stale', authenticate, (req: Request, res: Response) => {
  try {
    const raw = req.query.minutes;
    const parsed = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
    const stale = getStaleSources(minutes);
    return res.json(stale);
  } catch (error) {
    console.error('Error listing stale sources:', error);
    return res.status(500).json({ error: 'Failed to list stale sources' });
  }
});

/**
 * POST /sources/provision — one-call entity onboarding.
 *
 * Atomically creates everything a new source needs to start sending logs:
 *   1. a scoped write-only API key (returned ONCE)
 *   2. a source config routing matching logs to the target index
 *   3. a starter "no data" heartbeat alert
 *   4. a starter dashboard with 3 panels
 *
 * Best-effort rollback: if any later step throws, the already-created entities
 * are deleted and the call returns 500.
 */
router.post('/provision', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    name?: unknown;
    index?: unknown;
    sourceType?: unknown;
    hostnamePattern?: unknown;
    appNamePattern?: unknown;
    heartbeatMinutes?: unknown;
  };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const index = typeof body.index === 'string' ? body.index : '';
  const sourceType = typeof body.sourceType === 'string' && body.sourceType.trim() ? body.sourceType.trim() : 'generic';
  const hostnamePattern = typeof body.hostnamePattern === 'string' && body.hostnamePattern.trim() ? body.hostnamePattern.trim() : null;
  const appNamePattern = typeof body.appNamePattern === 'string' && body.appNamePattern.trim() ? body.appNamePattern.trim() : null;
  const heartbeatMinutes =
    typeof body.heartbeatMinutes === 'number' && Number.isFinite(body.heartbeatMinutes) && body.heartbeatMinutes > 0
      ? body.heartbeatMinutes
      : 30;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!INDEX_PATTERN.test(index)) {
    return res.status(400).json({
      error: 'index must be a lowercase slug matching /^[a-z0-9][a-z0-9_-]*$/',
    });
  }

  const userId = req.user!.id;

  // Track created entities so we can roll back if a later step fails.
  let apiKeyId: string | null = null;
  let sourceConfigId: string | null = null;
  let alertId: string | null = null;
  let dashboardId: string | null = null;

  const rollback = () => {
    if (dashboardId) {
      try {
        deleteDashboard(dashboardId);
      } catch (e) {
        console.error('Rollback: failed to delete dashboard', dashboardId, e);
      }
    }
    if (alertId) {
      try {
        deleteAlert(alertId);
      } catch (e) {
        console.error('Rollback: failed to delete alert', alertId, e);
      }
    }
    if (sourceConfigId) {
      try {
        deleteSourceConfig(sourceConfigId);
      } catch (e) {
        console.error('Rollback: failed to delete source config', sourceConfigId, e);
      }
    }
    if (apiKeyId) {
      try {
        deleteApiKey(apiKeyId, userId);
      } catch (e) {
        console.error('Rollback: failed to delete API key', apiKeyId, e);
      }
    }
  };

  try {
    // 1. Scoped write key (shown once).
    const { apiKey, keyData } = await createApiKey(userId, `${name} ingest key`, ['write'], undefined, [index]);
    apiKeyId = keyData.id;

    // 2. Source config routing to the target index.
    const sourceConfig = createSourceConfig({
      name,
      description: `Auto-provisioned for ${name}`,
      hostname_pattern: hostnamePattern ?? undefined,
      app_name_pattern: appNamePattern ?? undefined,
      source_type: sourceType,
      priority: 100,
      template_id: undefined,
      target_index: index,
      parsing_mode: 'auto',
      time_format: undefined,
      time_field: undefined,
      enabled: 1,
    });
    sourceConfigId = sourceConfig.id;

    // 3. Starter "no data" heartbeat alert.
    const alert = createAlert(`${name} — no data`, `search index=${index}`, {
      description: `Fires if ${name} stops sending logs`,
      trigger_type: 'no_data',
      schedule_type: 'cron',
      cron_expression: '*/15 * * * *',
      time_range: `-${heartbeatMinutes}m`,
      severity: 'high',
      enabled: true,
      app_scope: index,
      actions: [],
    });
    alertId = alert.id;

    // 4. Starter dashboard with 3 panels.
    const dashboard = createDashboard(name, `Auto-provisioned dashboard for ${name}`, index);
    dashboardId = dashboard.id;

    createDashboardPanel(
      dashboard.id,
      'Event volume',
      `search index=${index} | timechart count`,
      'area',
      {},
      { x: 0, y: 0, width: 12, height: 4 },
    );
    createDashboardPanel(
      dashboard.id,
      'By severity',
      `search index=${index} | stats count by severity`,
      'pie',
      {},
      { x: 0, y: 4, width: 6, height: 4 },
    );
    createDashboardPanel(
      dashboard.id,
      'Recent events',
      `search index=${index} | table timestamp hostname severity message | limit 50`,
      'table',
      {},
      { x: 6, y: 4, width: 6, height: 4 },
    );

    return res.json({
      index,
      apiKey,
      apiKeyId,
      sourceConfigId,
      alertId,
      dashboardId,
      message: 'Source provisioned. Save the apiKey now — it will not be shown again.',
    });
  } catch (error) {
    console.error('Error provisioning source:', error);
    rollback();
    return res.status(500).json({
      error: 'Failed to provision source',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

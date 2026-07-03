/**
 * Agent API — a stable, self-describing surface for AI agents (and any program)
 * to READ LogNog (search logs, check status) and ACT on it (create/manage
 * alerts) using an API key — no browser login, no CSRF token.
 *
 * Auth: `X-API-Key: <key>` or `Authorization: ApiKey <key>` (a JWT also works).
 *   - `read`  permission: search, indexes, fields, summary, list/get alerts, test.
 *   - `write` permission: create / update / delete / evaluate alerts.
 * Index-scoped keys automatically restrict what searches can see.
 *
 * Mounted at /api/agent. This path is CSRF-exempt (see middleware/csrf.ts) and
 * should be added to the Cloudflare Access bypass (like /api/ingest) so external
 * agents can reach it.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate, requirePermission, rateLimit } from '../auth/middleware.js';
import { executeDSLQuery } from '../db/backend.js';
import {
  getAlerts,
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
} from '../db/sqlite.js';
import type { AlertAction } from '../db/sqlite.js';
import { safeJsonParse } from '../utils/json.js';
import { normalizeTriggerType, testAlert, evaluateAlert } from '../services/alerts.js';

const router = Router();

// Accept the key via the `X-API-Key` header too (same ergonomics as the ingest
// API), by normalizing it into the Authorization header `authenticate` reads.
router.use((req, _res, next) => {
  const k = req.headers['x-api-key'];
  if (k && !req.headers.authorization) {
    req.headers.authorization = `ApiKey ${Array.isArray(k) ? k[0] : k}`;
  }
  next();
});

// Every agent route authenticates (API key or JWT) and is rate-limited.
router.use(authenticate);
router.use(rateLimit(120, 60000));

const READ = requirePermission('read', 'write', 'admin', '*');
const WRITE = requirePermission('write', 'admin', '*');

function firstCount(results: unknown[]): number {
  const row = (results?.[0] || {}) as Record<string, unknown>;
  const key = Object.keys(row).find((k) => k === 'count' || k === 'count_all') || Object.keys(row)[0];
  const n = Number(row[key as string]);
  return Number.isFinite(n) ? n : results?.length || 0;
}

function shapeAlert(a: Record<string, unknown>) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    enabled: !!a.enabled,
    search_query: a.search_query,
    trigger_type: a.trigger_type,
    trigger_condition: a.trigger_condition,
    trigger_threshold: a.trigger_threshold,
    schedule_type: a.schedule_type,
    cron_expression: a.cron_expression,
    time_range: a.time_range,
    severity: a.severity,
    app_scope: a.app_scope,
    last_run: a.last_run,
    last_status: a.last_status ?? null,
    last_error: a.last_error ?? null,
    trigger_count: a.trigger_count,
    actions: safeJsonParse<AlertAction[]>(a.actions as string, []),
  };
}

// ── Self-describing index ────────────────────────────────────────────────────
router.get('/', READ, (req: Request, res: Response) => {
  res.json({
    name: 'lognog-agent-api',
    description: 'Read LogNog (search logs, check status) and act on it (manage alerts) with an API key.',
    auth: 'Send your key as `X-API-Key: <key>` or `Authorization: ApiKey <key>`.',
    you: {
      permissions: req.apiKeyPermissions ?? (req.authMethod === 'jwt' ? ['(jwt role: ' + req.user?.role + ')'] : []),
      allowed_indexes: req.allowedIndexes ?? 'all',
      auth_method: req.authMethod,
    },
    endpoints: {
      'POST /api/agent/search': 'Run a DSL query. Body: { query, earliest?, latest?, limit? }. Needs: read.',
      'GET /api/agent/summary': 'Health snapshot: 24h totals, errors, per-index freshness, alert status. Needs: read.',
      'GET /api/agent/indexes': 'List indexes/sources with 24h counts and last-seen. Needs: read.',
      'GET /api/agent/fields': 'List the core searchable fields. Needs: read.',
      'GET /api/agent/alerts': 'List alerts with health (last_status/last_error). Needs: read.',
      'GET /api/agent/alerts/:id': 'Get one alert. Needs: read.',
      'POST /api/agent/alerts/test': 'Preview whether a query+condition would fire (no save). Needs: read.',
      'POST /api/agent/alerts': 'Create an alert. Needs: write.',
      'PATCH /api/agent/alerts/:id': 'Update an alert. Needs: write.',
      'POST /api/agent/alerts/:id/evaluate': 'Evaluate an alert now. Needs: write.',
      'DELETE /api/agent/alerts/:id': 'Delete an alert. Needs: write.',
    },
    dsl: 'Splunk-like: `search severity<=3 | stats count by app_name | sort -count | head 10`. Commands: search, filter, where, stats, sort, limit/head/tail, table, fields, dedup, rename, top, rare, bin, timechart, rex, eval, lookup.',
    docs: '/api/ingest/guide',
  });
});

// ── READ: search ─────────────────────────────────────────────────────────────
router.post('/search', READ, async (req: Request, res: Response) => {
  try {
    const { query, earliest, latest, limit } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Body must include a `query` string (LogNog DSL).' });
    }
    if (query.length > 50000) return res.status(400).json({ error: 'Query too long.' });

    const q = typeof limit === 'number' && limit > 0 ? `${query} | head ${Math.min(limit, 10000)}` : query;
    const result = await executeDSLQuery(q, {
      earliest: earliest || '-24h',
      latest: latest || 'now',
      allowedIndexes: req.allowedIndexes ?? undefined,
    });
    const results = (result.results || []) as Record<string, unknown>[];
    return res.json({
      query: q,
      earliest: earliest || '-24h',
      latest: latest || 'now',
      count: results.length,
      fields: results.length ? Object.keys(results[0]) : [],
      results,
    });
  } catch (error) {
    return res.status(400).json({ error: 'Query failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ── READ: summary (check things) ─────────────────────────────────────────────
router.get('/summary', READ, async (req: Request, res: Response) => {
  try {
    const opts = { earliest: '-24h', latest: 'now', allowedIndexes: req.allowedIndexes ?? undefined };
    const [total, errors, byIndex] = await Promise.all([
      executeDSLQuery('search * | stats count', opts).catch(() => ({ results: [] })),
      executeDSLQuery('search severity<=3 | stats count', opts).catch(() => ({ results: [] })),
      executeDSLQuery('search * | stats count by index_name', opts).catch(() => ({ results: [] })),
    ]);
    const alerts = getAlerts() as unknown as Record<string, unknown>[];
    const broken = alerts.filter((a) => a.last_status === 'error');
    return res.json({
      window: 'last 24h',
      events_total: firstCount((total as { results: unknown[] }).results),
      errors_total: firstCount((errors as { results: unknown[] }).results),
      indexes: ((byIndex as { results: Record<string, unknown>[] }).results || []).map((r) => ({
        index: r.index_name,
        count_24h: Number(r.count) || 0,
      })),
      alerts: {
        total: alerts.length,
        enabled: alerts.filter((a) => a.enabled).length,
        failing: broken.length,
        failing_detail: broken.map((a) => ({ id: a.id, name: a.name, last_error: a.last_error })),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to build summary', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ── READ: indexes ────────────────────────────────────────────────────────────
router.get('/indexes', READ, async (req: Request, res: Response) => {
  try {
    const result = await executeDSLQuery(
      'search * | stats count by index_name | sort -count',
      { earliest: '-30d', latest: 'now', allowedIndexes: req.allowedIndexes ?? undefined }
    );
    const rows = (result.results || []) as Record<string, unknown>[];
    return res.json({ indexes: rows.map((r) => ({ index: r.index_name, count_30d: Number(r.count) || 0 })) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list indexes', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ── READ: fields ─────────────────────────────────────────────────────────────
router.get('/fields', READ, (_req: Request, res: Response) => {
  res.json({
    core_fields: [
      { name: 'timestamp', type: 'datetime' },
      { name: 'message', type: 'string' },
      { name: 'severity', type: 'number', note: '0=emergency .. 7=debug; use severity<=3 for errors' },
      { name: 'hostname', type: 'string' },
      { name: 'app_name', type: 'string' },
      { name: 'source', type: 'string' },
      { name: 'index_name', type: 'string', note: 'search with index=<name>' },
    ],
    custom_fields: 'Any extra keys you ingest (structured_data) are searchable by name, e.g. user_id, route, status_code, duration_ms.',
    tip: 'Run POST /api/agent/search with `<query> | head 1` to see the exact fields on your data.',
  });
});

// ── READ: alerts ─────────────────────────────────────────────────────────────
router.get('/alerts', READ, (_req: Request, res: Response) => {
  const alerts = getAlerts() as unknown as Record<string, unknown>[];
  res.json({ count: alerts.length, alerts: alerts.map(shapeAlert) });
});

router.get('/alerts/:id', READ, (req: Request, res: Response) => {
  const a = getAlert(req.params.id) as unknown as Record<string, unknown> | undefined;
  if (!a) return res.status(404).json({ error: 'Alert not found' });
  return res.json(shapeAlert(a));
});

// Preview whether a query + condition would fire, without saving.
router.post('/alerts/test', READ, async (req: Request, res: Response) => {
  try {
    const { search_query, trigger_type, trigger_condition, trigger_threshold, time_range } = req.body || {};
    if (!search_query) return res.status(400).json({ error: '`search_query` is required.' });
    const result = await testAlert(
      search_query,
      normalizeTriggerType(trigger_type),
      trigger_condition || 'greater_than',
      trigger_threshold ?? 0,
      time_range || '-1h'
    );
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: 'Test failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ── WRITE: create / update / delete / evaluate alerts ────────────────────────
router.post('/alerts', WRITE, (req: Request, res: Response) => {
  try {
    const {
      name, description, search_query, trigger_type, trigger_condition, trigger_threshold,
      schedule_type, cron_expression, time_range, actions, throttle_enabled,
      throttle_window_seconds, severity, enabled, app_scope,
    } = req.body || {};
    if (!name || !search_query) {
      return res.status(400).json({ error: '`name` and `search_query` are required.' });
    }
    const alert = createAlert(name, search_query, {
      description,
      trigger_type: normalizeTriggerType(trigger_type),
      trigger_condition,
      trigger_threshold,
      schedule_type,
      cron_expression,
      time_range,
      actions: actions as AlertAction[],
      throttle_enabled,
      throttle_window_seconds,
      severity,
      enabled,
      app_scope,
    });
    return res.status(201).json(shapeAlert(alert as unknown as Record<string, unknown>));
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create alert', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch('/alerts/:id', WRITE, (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    const b = req.body || {};
    const alert = updateAlert(req.params.id, {
      ...b,
      trigger_type: b.trigger_type !== undefined ? normalizeTriggerType(b.trigger_type) : undefined,
      actions: b.actions as AlertAction[] | undefined,
    });
    return res.json(shapeAlert(alert as unknown as Record<string, unknown>));
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update alert', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/alerts/:id/evaluate', WRITE, async (req: Request, res: Response) => {
  try {
    const existing = getAlert(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    const result = await evaluateAlert(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to evaluate alert', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/alerts/:id', WRITE, (req: Request, res: Response) => {
  const deleted = deleteAlert(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Alert not found' });
  return res.json({ success: true });
});

export default router;

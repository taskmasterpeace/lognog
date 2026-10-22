/**
 * GET /reports/weekly (live: /api/reports/weekly?week=YYYY-Www): The LogNog Weekly as JSON.
 * Needs auth; bad or future weeks and unknown zones are a 400 with a code;
 * a scoped read key only gets its own indexes and no alert names.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-reports-weekly-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);

import { getSQLiteDB, createAlert } from '../db/sqlite.js';
import { insertLogs } from '../db/backend.js';
import { createApiKey } from '../auth/auth.js';
import reportsRouter from './reports.js';

const USER_ID = 'weekly-route-user';
let scopedKey = '';
let fullKey = '';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/reports', reportsRouter);
  return a;
}

beforeAll(async () => {
  getSQLiteDB()
    .prepare(`INSERT OR IGNORE INTO users_v2 (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`)
    .run(USER_ID, 'weekly-route', 'weekly-route@example.invalid', 'x');
  scopedKey = (await createApiKey(USER_ID, 'board read', ['read'], undefined, ['uptime'])).apiKey;
  fullKey = (await createApiKey(USER_ID, 'full read', ['read'])).apiKey;
  const ts = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace('Z', '');
  await insertLogs([
    { timestamp: ts(60_000), index_name: 'uptime', app_name: 'octavia-uptime', severity: 6, message: 'up' },
    { timestamp: ts(60_000), index_name: 'money', app_name: 'money-watch', severity: 6, message: 'money day total',
      structured_data: JSON.stringify({ kind: 'day', day: '2000-01-01', out: 1 }) },
  ]);
  const alert = createAlert('Money rule secret name', 'search index=money', {
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 0,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    actions: [{ type: 'apprise', config: { channel: 'no-such-channel' } }],
    severity: 'high',
    enabled: true,
  });
  getSQLiteDB()
    .prepare(`INSERT INTO alert_history (id, alert_id, triggered_at, result_count, severity, actions_executed) VALUES (?, ?, ?, 1, 'high', ?)`)
    .run(randomUUID(), alert.id, new Date(Date.now() - 120_000).toISOString().replace('T', ' ').slice(0, 19),
      JSON.stringify([{ type: 'apprise', success: false, message: 'Channel not found' }]));
});

describe('GET /reports/weekly', () => {
  it('needs a login or key', async () => {
    const res = await request(app()).get('/reports/weekly');
    expect(res.status).toBe(401);
  });

  it('a read key gets this week\'s paper', async () => {
    const res = await request(app()).get('/reports/weekly').set('Authorization', `ApiKey ${fullKey}`);
    expect(res.status).toBe(200);
    expect(res.body.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(res.body.complete).toBe(false);
    expect(res.body.tiles.logs.this_week).toBe(2);
    expect(res.body.tiles.alerts).toMatchObject({ fired: 1, reached: 0, lost: 1 });
    expect(res.body.apps.map((a: { app_name: string }) => a.app_name).sort()).toEqual(['money-watch', 'octavia-uptime']);
    expect(res.body.broke.map((i: { kind: string }) => i.kind)).toContain('alert_fired');
    expect(res.body.alerts_hidden).toBe(false);
    expect(typeof res.body.spoken).toBe('string');
  });

  it('takes ?week= and ?tz=', async () => {
    const res = await request(app()).get('/reports/weekly?week=2026-W01&tz=UTC').set('Authorization', `ApiKey ${fullKey}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ week: '2026-W01', tz: 'UTC', monday: '2025-12-29', complete: true, start: '2025-12-29T00:00:00.000Z' });
    expect(res.body.apps).toEqual([]);
  });

  it('a bad week, a future week or an unknown zone is a 400 that says why', async () => {
    const bad = await request(app()).get('/reports/weekly?week=2026-43').set('Authorization', `ApiKey ${fullKey}`);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('bad_week');
    const future = await request(app()).get('/reports/weekly?week=2099-W01').set('Authorization', `ApiKey ${fullKey}`);
    expect(future.status).toBe(400);
    expect(future.body.code).toBe('future');
    const tz = await request(app()).get('/reports/weekly?tz=Mars/Olympus').set('Authorization', `ApiKey ${fullKey}`);
    expect(tz.status).toBe(400);
    expect(tz.body.code).toBe('bad_tz');
  });

  it('a key scoped to uptime sees only uptime, no money and no alert names', async () => {
    const res = await request(app()).get('/reports/weekly').set('Authorization', `ApiKey ${scopedKey}`);
    expect(res.status).toBe(200);
    expect(res.body.apps.map((a: { app_name: string }) => a.app_name)).toEqual(['octavia-uptime']);
    expect(res.body.money.bank.status).toBe('not_visible');
    expect(res.body.alerts_hidden).toBe(true);
    expect(res.body.scope_indexes).toEqual(['uptime']);
    expect(res.body.tiles.logs.this_week).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('Money rule secret name');
  });

  it('does not swallow the scheduled-report routes', async () => {
    const res = await request(app()).get('/reports/templates').set('Authorization', `ApiKey ${fullKey}`);
    expect(res.status).toBe(200);
  });
});

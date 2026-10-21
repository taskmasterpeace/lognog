/**
 * GET /stats/home (live: /api/stats/home): the Home page's data.
 * Needs auth, and a scoped read key only gets the indexes it may read.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-stats-home-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);

import { getSQLiteDB, createAlert } from '../db/sqlite.js';
import { insertLogs } from '../db/backend.js';
import { createApiKey } from '../auth/auth.js';
import statsRouter from './stats.js';

const USER_ID = 'home-route-user';
let scopedKey = '';
let fullKey = '';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/stats', statsRouter);
  return a;
}

beforeAll(async () => {
  getSQLiteDB()
    .prepare(`INSERT OR IGNORE INTO users_v2 (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`)
    .run(USER_ID, 'home-route', 'home-route@example.invalid', 'x');
  scopedKey = (await createApiKey(USER_ID, 'board read', ['read'], undefined, ['uptime'])).apiKey;
  fullKey = (await createApiKey(USER_ID, 'full read', ['read'])).apiKey;
  const ts = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace('Z', '');
  await insertLogs([
    { timestamp: ts(60_000), index_name: 'uptime', app_name: 'octavia-uptime', severity: 6, message: 'up' },
    { timestamp: ts(60_000), index_name: 'money', app_name: 'money-watch', severity: 6, message: 'money snapshot',
      structured_data: JSON.stringify({ kind: 'snapshot', out_24h: 1, out_7d: 2 }) },
  ]);
  createAlert('Money rule secret name', 'search index=money', {
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
});

describe('GET /stats/home', () => {
  it('needs a login or key', async () => {
    const res = await request(app()).get('/stats/home');
    expect(res.status).toBe(401);
  });

  it('a full read key sees money and every app', async () => {
    const res = await request(app()).get('/stats/home').set('Authorization', `ApiKey ${fullKey}`);
    expect(res.status).toBe(200);
    expect(res.body.money.bank).toMatchObject({ status: 'ok', out_24h: 1, out_7d: 2 });
    expect(res.body.apps.map((a: { app_name: string }) => a.app_name).sort()).toEqual(['money-watch', 'octavia-uptime']);
    expect(res.body.scoped).toBe(false);
    expect(res.body.alerts_hidden).toBe(false);
    expect(res.body.needs_you.map((i: { kind: string }) => i.kind)).toContain('alert_unreachable');
  });

  it('a key scoped to uptime sees only uptime, and money says it is not visible', async () => {
    const res = await request(app()).get('/stats/home').set('Authorization', `ApiKey ${scopedKey}`);
    expect(res.status).toBe(200);
    expect(res.body.money.bank.status).toBe('not_visible');
    expect(res.body.apps.map((a: { app_name: string }) => a.app_name)).toEqual(['octavia-uptime']);
    expect(res.body.scoped).toBe(true);
    // alert rules aren't tied to an index, so a scoped key sees none of their names
    expect(res.body.alerts_hidden).toBe(true);
    expect(res.body.scope_indexes).toEqual(['uptime']);
    expect(JSON.stringify(res.body)).not.toContain('Money rule secret name');
  });
});

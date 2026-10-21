/**
 * GET /status/lights through the real auth middleware with real API keys
 * (read key, write-only key, index-scoped key) over real Lite logs.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
const tag = `${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}`;
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-status-logs-${tag}.db`);
process.env.SQLITE_PATH = join(tmpdir(), `lognog-status-main-${tag}.db`);

import { getSQLiteDB } from '../db/sqlite.js';
import { insertLogs } from '../db/backend.js';
import { createApiKey } from '../auth/auth.js';
import statusRouter, { parseAppsParam } from './status.js';
import { _labLightsTesting } from '../services/lab-lights.js';

const USER_ID = 'lights-user';
let readKey = '';
let writeOnlyKey = '';
let scopedKey = '';
let app: Express;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeAll(async () => {
  getSQLiteDB()
    .prepare(`INSERT OR IGNORE INTO users_v2 (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'user')`)
    .run(USER_ID, 'lights-user', 'lights@example.com', 'x');
  readKey = (await createApiKey(USER_ID, 'lights read', ['read'])).apiKey;
  writeOnlyKey = (await createApiKey(USER_ID, 'ingest only', ['write'])).apiKey;
  scopedKey = (await createApiKey(USER_ID, 'hyh only', ['read'], undefined, ['hyh'])).apiKey;

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 12; i++) rows.push({ timestamp: ago(60_000), app_name: 'knuckle-up', index_name: 'knuckle-up', severity: 3, message: 'boom' });
  for (let i = 0; i < 5; i++) rows.push({ timestamp: ago(60_000), app_name: 'hyh', index_name: 'hyh', severity: 6, message: 'ok' });
  await insertLogs(rows);

  app = express();
  app.use('/status', statusRouter);
});

beforeEach(() => _labLightsTesting.reset());

describe('GET /status/lights', () => {
  it('needs a login or an API key', async () => {
    const res = await request(app).get('/status/lights');
    expect(res.status).toBe(401);
    expect(res.body.apps).toBeUndefined();
  });

  it('refuses a key without the read permission', async () => {
    const res = await request(app).get('/status/lights').set('Authorization', `ApiKey ${writeOnlyKey}`);
    expect(res.status).toBe(403);
    expect(res.body.apps).toBeUndefined();
  });

  it('answers a read key with one light per app, uncached by proxies', async () => {
    const res = await request(app).get('/status/lights').set('Authorization', `ApiKey ${readKey}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.refresh_seconds).toBe(30);
    expect(typeof res.body.generated_at).toBe('string');
    expect(res.body.apps).toEqual([
      expect.objectContaining({ app: 'hyh', label: 'HYH', state: 'green', why: 'Fine: 5 logs in 15 min, no errors', logs_last_15m: 5, errors_last_15m: 0, indexes: ['hyh'] }),
      expect.objectContaining({ app: 'knuckle-up', state: 'red', why: 'Error spike: 12 in 15 min, usually none', logs_last_15m: 12, errors_last_15m: 12 }),
    ]);
    for (const a of res.body.apps) {
      expect(Object.keys(a).sort()).toEqual(
        ['app', 'errors_last_15m', 'indexes', 'label', 'last_seen', 'logs_last_15m', 'since', 'state', 'why'].sort(),
      );
    }
  });

  it('?apps= picks apps in the asked order (what one screen polls)', async () => {
    const res = await request(app).get('/status/lights?apps=knuckle-up').set('Authorization', `ApiKey ${readKey}`);
    expect(res.status).toBe(200);
    expect(res.body.apps.map((a: { app: string }) => a.app)).toEqual(['knuckle-up']);
    const two = await request(app).get('/status/lights?apps=knuckle-up,%20hyh').set('Authorization', `ApiKey ${readKey}`);
    expect(two.body.apps.map((a: { app: string }) => a.app)).toEqual(['knuckle-up', 'hyh']);
    expect(_labLightsTesting.queries()).toBe(1);
  });

  it('a key scoped to hyh never sees knuckle-up, even when it asks by name', async () => {
    const all = await request(app).get('/status/lights').set('Authorization', `ApiKey ${scopedKey}`);
    expect(all.body.apps.map((a: { app: string }) => a.app)).toEqual(['hyh']);
    const asked = await request(app).get('/status/lights?apps=knuckle-up').set('Authorization', `ApiKey ${scopedKey}`);
    expect(asked.body.apps[0]).toMatchObject({ app: 'knuckle-up', state: 'red', why: 'Gone quiet: no logs in 7 days', errors_last_15m: 0, indexes: [] });
  });

  it('turns away a bad ?apps= list with a plain reason', async () => {
    const many = Array.from({ length: 21 }, (_, i) => `a${i}`).join(',');
    const res = await request(app).get(`/status/lights?apps=${many}`).set('Authorization', `ApiKey ${readKey}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('at most 20 apps at a time');
    const odd = await request(app).get(`/status/lights?apps=${encodeURIComponent("x';drop")}`).set('Authorization', `ApiKey ${readKey}`);
    expect(odd.status).toBe(400);
    const twice = await request(app).get('/status/lights?apps=a&apps=b').set('Authorization', `ApiKey ${readKey}`);
    expect(twice.status).toBe(400);
  });
});

describe('parseAppsParam', () => {
  it('trims, drops blanks and repeats (any case), keeps order', () => {
    expect(parseAppsParam(' hyh, ,Knuckle-Up,HYH ')).toEqual(['hyh', 'Knuckle-Up']);
    expect(parseAppsParam('')).toBeUndefined();
    expect(parseAppsParam(undefined)).toBeUndefined();
    expect(parseAppsParam('x'.repeat(101))).toEqual({ error: 'app names are at most 100 characters' });
  });
});

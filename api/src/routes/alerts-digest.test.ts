/**
 * Daily alert digest routes: admin only, validated settings, a preview that
 * never calls the relay, and `/alerts/digest` not swallowed by `/alerts/:id`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const who = vi.hoisted(() => ({ role: 'admin' }));

import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(() => ({ userId: 'test-user-id', username: 'digest-user', role: who.role, type: 'access' })),
  };
});

import alertsRouter from './alerts.js';
import { closeDatabase, getSQLiteDB, getSystemSetting, createAlert } from '../db/sqlite.js';

const KEY = 'test-bus-key-not-real-digest-route-1';

describe('alert digest routes', () => {
  let app: Express;
  let server: http.Server;
  let relayCalls = 0;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (!req.headers['x-test-anonymous']) req.headers.authorization = 'Bearer test-token';
      next();
    });
    app.use('/alerts', alertsRouter);

    server = http.createServer((req, res) => {
      relayCalls += 1;
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true,"sent":true}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '::1', () => r()));
    process.env.RELAY_URL = `http://[::1]:${(server.address() as AddressInfo).port}/`;
    process.env.RELAY_BUS_KEY = KEY;
  });

  afterAll(async () => {
    delete process.env.RELAY_URL;
    delete process.env.RELAY_BUS_KEY;
    await new Promise<void>((r) => server.close(() => r()));
    closeDatabase();
  });

  beforeEach(() => {
    who.role = 'admin';
    relayCalls = 0;
    getSQLiteDB().prepare("DELETE FROM system_settings WHERE key LIKE 'alert_digest_%'").run();
  });

  it('GET shows the defaults, whether it is due, and whether the relay is set up (never the URL or key)', async () => {
    const res = await request(app).get('/alerts/digest');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: false,
      time: '08:30',
      tz: 'America/New_York',
      send_when_quiet: false,
      last_sent: null,
      due: false,
      relayConfigured: true,
    });
    expect(res.text).not.toContain(KEY);
    expect(res.text).not.toContain('::1');
  });

  it('PUT changes the settings and GET shows them', async () => {
    const res = await request(app)
      .put('/alerts/digest')
      .send({ enabled: true, time: '00:00', tz: 'Europe/London', send_when_quiet: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, time: '00:00', tz: 'Europe/London', send_when_quiet: true, due: true });
    expect(getSystemSetting('alert_digest_enabled')).toBe('true');
    expect(getSystemSetting('alert_digest_time')).toBe('00:00');

    const one = await request(app).put('/alerts/digest').send({ time: '23:59' });
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ enabled: true, time: '23:59', tz: 'Europe/London' });

    const got = await request(app).get('/alerts/digest');
    expect(got.body).toMatchObject({ enabled: true, time: '23:59', tz: 'Europe/London', send_when_quiet: true });
    expect(relayCalls).toBe(0);
  });

  it('PUT refuses bad values and changes nothing', async () => {
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ time: '24:00' }, /time must be HH:MM/],
      [{ time: '8:30' }, /time must be HH:MM/],
      [{ time: '12:60' }, /time must be HH:MM/],
      [{ time: 830 }, /time must be HH:MM/],
      [{ tz: 'Mars/Olympus' }, /tz must be a time zone/],
      [{ tz: '' }, /tz must be a time zone/],
      [{ tz: 5 }, /tz must be a time zone/],
      [{ enabled: 'yes' }, /enabled must be true or false/],
      [{ send_when_quiet: 1 }, /send_when_quiet must be true or false/],
      [{ enabled: true, time: 'noon' }, /time must be HH:MM/],
      [{}, /Nothing to change/],
      [{ alert_digest_last_sent: '2020-01-01' }, /Nothing to change/],
    ];
    for (const [body, error] of bad) {
      const res = await request(app).put('/alerts/digest').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toMatch(error);
    }
    expect(getSystemSetting('alert_digest_enabled')).toBeNull();
    expect(getSystemSetting('alert_digest_time')).toBeNull();
    expect(getSystemSetting('alert_digest_last_sent')).toBeNull();
  });

  it('preview builds from the real history and never calls the relay', async () => {
    const alert = createAlert('App down', 'search severity<=3', {});
    const insert = getSQLiteDB().prepare(
      "INSERT INTO alert_history (id, alert_id, triggered_at, result_count, severity, actions_executed) VALUES (?, ?, datetime('now', ?), 1, 'critical', ?)"
    );
    insert.run('dg-1', alert.id, '-1 hours', JSON.stringify([{ type: 'relay', success: true, message: 'Relay sent to Telegram' }]));
    insert.run('dg-2', alert.id, '-2 hours', null);
    insert.run('dg-3', alert.id, '-30 hours', null); // too old

    const res = await request(app).post('/alerts/digest/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text:
        'LogNog daily digest: 2 alerts in the last 24 hours. 1 was texted to you when it happened, 1 was only recorded. ' +
        '2 were critical. Most often: App down ×2. Open LogNog → Alerts → History for details.',
      total: 2,
      texted: 1,
      recordedOnly: 1,
      critical: 2,
      byRule: [{ name: 'App down', severity: 'medium', count: 2, texted: 1 }],
    });
    expect(relayCalls).toBe(0);
    expect(getSystemSetting('alert_digest_last_sent')).toBeNull();
  });

  it('refuses anyone who is not an admin, and anyone not signed in', async () => {
    who.role = 'user';
    const get = await request(app).get('/alerts/digest');
    expect(get.status).toBe(403);
    expect(get.body.error).toMatch(/Only an administrator/);
    expect(get.body.time).toBeUndefined();

    const put = await request(app).put('/alerts/digest').send({ enabled: true });
    expect(put.status).toBe(403);
    expect(getSystemSetting('alert_digest_enabled')).toBeNull();

    const preview = await request(app).post('/alerts/digest/preview');
    expect(preview.status).toBe(403);
    expect(preview.body.text).toBeUndefined();

    who.role = 'admin';
    for (const call of [
      request(app).get('/alerts/digest'),
      request(app).put('/alerts/digest').send({ enabled: true }),
      request(app).post('/alerts/digest/preview'),
    ]) {
      expect((await call.set('x-test-anonymous', '1')).status).toBe(401);
    }
    expect(getSystemSetting('alert_digest_enabled')).toBeNull();
    expect(relayCalls).toBe(0);
  });
});

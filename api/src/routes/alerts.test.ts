/**
 * Alerts / silences / notifications route tests.
 *
 * Covers the 2026-09 alerting audit: static routes shadowed by `/:id`, the
 * notification-channel listing leaking raw Apprise URLs without auth, and
 * acknowledgements trusting a client-supplied identity.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

// Mutable role so a single mocked verifier can act as admin or plain user.
const authState = vi.hoisted(() => ({ role: 'admin' }));

import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(() => ({
      userId: 'test-user-id',
      username: 'audit-user',
      role: authState.role,
      type: 'access',
    })),
  };
});

import alertsRouter from './alerts.js';
import silencesRouter from './silences.js';
import notificationsRouter from './notifications.js';
import {
  closeDatabase,
  createAlert,
  createAlertHistoryEntry,
  createNotificationChannel,
} from '../db/sqlite.js';

// Injects a Bearer header unless the test opts out with `x-test-anonymous`.
function withAuth(): express.RequestHandler {
  return (req, _res, next) => {
    if (!req.headers['x-test-anonymous']) {
      req.headers.authorization = 'Bearer test-token';
    }
    next();
  };
}

describe('alert routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(withAuth());
    app.use('/alerts', alertsRouter);
    app.use('/silences', silencesRouter);
    app.use('/notifications', notificationsRouter);
  });

  afterAll(() => {
    closeDatabase();
  });

  describe('static routes are not shadowed by /:id', () => {
    it('GET /alerts/history returns the global history list', async () => {
      const res = await request(app).get('/alerts/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /silences/check answers for an unknown alert instead of 404', async () => {
      const res = await request(app).get('/silences/check?alert_id=does-not-exist');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('silenced');
    });
  });

  describe('acknowledgements', () => {
    it('records the authenticated user, ignoring a client-supplied name', async () => {
      const alert = createAlert('ack test', 'search *', {});
      const entry = createAlertHistoryEntry(alert.id, 3, 'medium', { trigger_value: '3' });

      const res = await request(app)
        .post(`/alerts/history/${entry.id}/acknowledge`)
        .send({ acknowledged_by: 'someone-else', notes: 'looked at it' });

      expect(res.status).toBe(200);
      expect(res.body.acknowledged).toBe(1);
      expect(res.body.acknowledged_by).toBe('audit-user');
      expect(res.body.notes).toBe('looked at it');
    });
  });

  describe('schedule validation', () => {
    it('rejects an invalid cron expression on create and update', async () => {
      const bad = await request(app)
        .post('/alerts')
        .send({ name: 'bad cron', search_query: 'search *', cron_expression: 'every 5 minutes' });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toMatch(/schedule/i);

      const alert = createAlert('cron update', 'search *', {});
      const upd = await request(app).put(`/alerts/${alert.id}`).send({ cron_expression: '* * *' });
      expect(upd.status).toBe(400);
    });

    it('accepts a custom 5-field cron', async () => {
      const res = await request(app)
        .post('/alerts')
        .send({ name: 'biz hours', search_query: 'search *', cron_expression: '*/10 8-18 * * 1-5' });
      expect(res.status).toBe(201);
      expect(res.body.cron_expression).toBe('*/10 8-18 * * 1-5');
    });
  });

  describe('script actions are admin-only', () => {
    const scriptAlert = {
      name: 'script alert',
      search_query: 'search severity<=3',
      actions: [{ type: 'script', config: { command: 'echo hi' } }],
    };

    it('rejects a non-admin creating an alert with a script action', async () => {
      authState.role = 'user';
      try {
        const res = await request(app).post('/alerts').send(scriptAlert);
        expect(res.status).toBe(403);
      } finally {
        authState.role = 'admin';
      }
    });

    it('rejects a non-admin adding a script action on update', async () => {
      const alert = createAlert('plain alert', 'search *', {});
      authState.role = 'user';
      try {
        const res = await request(app)
          .put(`/alerts/${alert.id}`)
          .send({ actions: [{ type: 'script', config: { command: 'echo hi' } }] });
        expect(res.status).toBe(403);
      } finally {
        authState.role = 'admin';
      }
    });

    it('lets an admin create a script action', async () => {
      const res = await request(app).post('/alerts').send(scriptAlert);
      expect(res.status).toBe(201);
    });
  });

  describe('notification channels', () => {
    beforeAll(() => {
      createNotificationChannel('ops-slack', 'slack', 'slack://T/B/secret-token', {});
    });

    it('requires authentication to list channels', async () => {
      const res = await request(app)
        .get('/notifications/channels')
        .set('x-test-anonymous', '1');
      expect(res.status).toBe(401);
    });

    it('never returns the raw apprise_url in the list', async () => {
      const res = await request(app).get('/notifications/channels');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const ch of res.body) {
        expect(ch).not.toHaveProperty('apprise_url');
        expect(ch.apprise_url_masked).toBeTruthy();
        expect(JSON.stringify(ch)).not.toContain('secret-token');
      }
    });
  });
});

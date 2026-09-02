/**
 * Ownership on alerts, reports and dashboards: anyone can read team objects,
 * but only the owner (or an admin) can change, delete, run or share them.
 * Legacy rows with no owner stay editable by everyone.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

const who = vi.hoisted(() => ({ id: 'alice', username: 'alice', role: 'user' }));

import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(() => ({ userId: who.id, username: who.username, role: who.role, type: 'access' })),
  };
});
vi.mock('../services/scheduler.js', () => ({ triggerReport: vi.fn().mockResolvedValue({ status: 'sent', row_count: 1, duration_ms: 1 }) }));

import alertsRouter from './alerts.js';
import reportsRouter from './reports.js';
import dashboardsRouter from './dashboards.js';
import { closeDatabase } from '../db/sqlite.js';

function as(user: { id: string; username: string; role: string }) {
  who.id = user.id; who.username = user.username; who.role = user.role;
}
const alice = { id: 'alice', username: 'alice', role: 'user' };
const bob = { id: 'bob', username: 'bob', role: 'user' };
const admin = { id: 'root', username: 'admin', role: 'admin' };

describe('ownership', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.headers.authorization = 'Bearer t'; next(); });
    app.use('/alerts', alertsRouter);
    app.use('/reports', reportsRouter);
    app.use('/dashboards', dashboardsRouter);
  });
  afterAll(() => closeDatabase());

  it('alerts: owner and admin can mutate, others cannot; everyone can read', async () => {
    as(alice);
    const created = await request(app).post('/alerts').send({ name: 'mine', search_query: 'search *' });
    expect(created.status).toBe(201);
    expect(created.body.owner_id).toBe('alice');
    const id = created.body.id;

    as(bob);
    expect((await request(app).get(`/alerts/${id}`)).status).toBe(200);
    expect((await request(app).put(`/alerts/${id}`).send({ name: 'hijacked' })).status).toBe(403);
    expect((await request(app).post(`/alerts/${id}/toggle`)).status).toBe(403);
    expect((await request(app).delete(`/alerts/${id}`)).status).toBe(403);

    as(alice);
    expect((await request(app).put(`/alerts/${id}`).send({ name: 'still mine' })).status).toBe(200);

    as(admin);
    expect((await request(app).delete(`/alerts/${id}`)).status).toBe(200);
  });

  it('reports: only owner/admin can edit, delete or run', async () => {
    as(alice);
    const created = await request(app).post('/reports').send({
      name: 'weekly', query: 'search *', schedule: '0 8 * * 1', recipients: 'ops@example.com',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    as(bob);
    expect((await request(app).put(`/reports/${id}`).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).post(`/reports/${id}/trigger`)).status).toBe(403);
    expect((await request(app).delete(`/reports/${id}`)).status).toBe(403);
    expect((await request(app).get('/reports')).body.some((r: { id: string }) => r.id === id)).toBe(true);

    as(alice);
    expect((await request(app).delete(`/reports/${id}`)).status).toBe(204);
  });

  it('dashboards: only owner/admin can edit, share or delete', async () => {
    as(alice);
    const created = await request(app).post('/dashboards').send({ name: 'ops board' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    as(bob);
    expect((await request(app).get(`/dashboards/${id}`)).status).toBe(200);
    expect((await request(app).put(`/dashboards/${id}`).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).put(`/dashboards/${id}/share`).send({ is_public: true })).status).toBe(403);
    expect((await request(app).post(`/dashboards/${id}/panels`).send({ title: 't', query: 'search *' })).status).toBe(403);
    expect((await request(app).delete(`/dashboards/${id}`)).status).toBe(403);

    as(admin);
    expect((await request(app).delete(`/dashboards/${id}`)).status).toBe(204);
  });
});

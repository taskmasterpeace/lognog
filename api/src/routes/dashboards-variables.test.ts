import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(() => ({ userId: 'test-admin', username: 'admin', role: 'admin', type: 'access' })),
  };
});

import dashboardsRouter from './dashboards.js';
import { closeDatabase } from '../db/sqlite.js';

function withAuth(): express.RequestHandler {
  return (req, _res, next) => {
    req.headers.authorization = 'Bearer test-token';
    next();
  };
}

describe('dashboard variables', () => {
  let app: Express;
  let dashboardId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(withAuth());
    app.use('/dashboards', dashboardsRouter);
    const created = await request(app).post('/dashboards').send({ name: 'Vars board' });
    dashboardId = created.body.id;
  });

  afterAll(() => closeDatabase());

  it('persists custom values and serves them as dropdown options', async () => {
    const created = await request(app)
      .post(`/dashboards/${dashboardId}/variables`)
      .send({ name: 'env', type: 'custom', custom_values: 'prod\nstaging\n dev , prod', multi_select: true });
    expect(created.status).toBe(201);
    expect(created.body.custom_values).toBe('prod\nstaging\n dev , prod');

    const listed = await request(app).get(`/dashboards/${dashboardId}/variables`);
    expect(listed.body[0].custom_values).toContain('staging');

    const options = await request(app)
      .post(`/dashboards/${dashboardId}/variables/${created.body.id}/options`)
      .send({});
    expect(options.status).toBe(200);
    expect(options.body.options).toEqual(['prod', 'staging', 'dev']);
  });

  it('serves the fixed interval set and updates custom values in place', async () => {
    const created = await request(app)
      .post(`/dashboards/${dashboardId}/variables`)
      .send({ name: 'span', type: 'interval' });
    const options = await request(app)
      .post(`/dashboards/${dashboardId}/variables/${created.body.id}/options`)
      .send({});
    expect(options.body.options).toContain('1h');

    const updated = await request(app)
      .put(`/dashboards/${dashboardId}/variables/${created.body.id}`)
      .send({ type: 'custom', custom_values: 'a\nb' });
    expect(updated.status).toBe(200);
    expect(updated.body.custom_values).toBe('a\nb');
  });

  it('404s for a variable that belongs to another dashboard', async () => {
    const other = await request(app).post('/dashboards').send({ name: 'Other board' });
    const created = await request(app)
      .post(`/dashboards/${other.body.id}/variables`)
      .send({ name: 'x', type: 'custom', custom_values: '1' });
    const res = await request(app)
      .post(`/dashboards/${dashboardId}/variables/${created.body.id}/options`)
      .send({});
    expect(res.status).toBe(404);
  });
});

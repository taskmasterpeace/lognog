import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

// Authenticate as admin for the setup calls; the public route itself must
// work with no credentials at all.
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
    if (!req.headers['x-test-anonymous']) req.headers.authorization = 'Bearer test-token';
    next();
  };
}

describe('public dashboard share link', () => {
  let app: Express;
  let token: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(withAuth());
    app.use('/dashboards', dashboardsRouter);

    const created = await request(app).post('/dashboards').send({ name: 'Shared ops board' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const panel = await request(app).post(`/dashboards/${id}/panels`).send({
      title: 'Errors by host',
      query: 'search severity<=3 | stats count by hostname',
      visualization: 'bar',
      options: { max: 500 },
      position: { x: 2, y: 1, width: 8, height: 5 },
    });
    expect(panel.status).toBe(201);

    const shared = await request(app).post(`/dashboards/${id}/share`).send({});
    expect(shared.status).toBe(200);
    token = shared.body.public_token;
    expect(token).toBeTruthy();
  });

  afterAll(() => closeDatabase());

  it('returns panels with a position object and parsed options, anonymously', async () => {
    const res = await request(app)
      .get(`/dashboards/public/${token}`)
      .set('x-test-anonymous', '1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Shared ops board');
    expect(res.body.panels).toHaveLength(1);
    const panel = res.body.panels[0];
    expect(panel.position).toEqual({ x: 2, y: 1, w: 8, h: 5 });
    expect(panel.options).toEqual({ max: 500 });
  });

  it('assigns panels to pages on create and update', async () => {
    const created = await request(app).post('/dashboards').send({ name: 'Paged board' });
    const id = created.body.id;
    const page = await request(app).post(`/dashboards/${id}/pages`).send({ name: 'Ops' });
    expect(page.status).toBe(201);

    const onPage = await request(app).post(`/dashboards/${id}/panels`).send({
      title: 'On the Ops tab', query: 'search *', visualization: 'table', page_id: page.body.id,
    });
    expect(onPage.status).toBe(201);
    expect(onPage.body.page_id).toBe(page.body.id);

    const moved = await request(app).put(`/dashboards/${id}/panels/${onPage.body.id}`).send({ page_id: null });
    expect(moved.status).toBe(200);
    expect(moved.body.page_id).toBeNull();

    const foreign = await request(app).post(`/dashboards/${id}/panels`).send({
      title: 'Bad page', query: 'search *', visualization: 'table', page_id: 'not-a-page',
    });
    expect(foreign.status).toBe(400);
  });

  it('round-trips pages, descriptions and scope through export → import and duplicate', async () => {
    const created = await request(app).post('/dashboards').send({ name: 'Round trip', app_scope: 'web-app', category: 'ops' });
    const id = created.body.id;
    const page = await request(app).post(`/dashboards/${id}/pages`).send({ name: 'Traffic' });
    await request(app).post(`/dashboards/${id}/panels`).send({
      title: 'Requests', description: 'per host', query: 'search *', visualization: 'bar', page_id: page.body.id,
      position: { x: 0, y: 0, width: 12, height: 5 },
    });

    const exported = await request(app).post(`/dashboards/${id}/export`);
    expect(exported.status).toBe(200);
    expect(exported.body.pages).toEqual([expect.objectContaining({ name: 'Traffic' })]);
    expect(exported.body.panels[0]).toMatchObject({ description: 'per host', page: 'Traffic' });
    expect(exported.body.app_scope).toBe('web-app');

    const imported = await request(app).post('/dashboards/import').send({ template: exported.body, name: 'Imported copy' });
    expect(imported.status).toBe(201);
    const importedFull = await request(app).get(`/dashboards/${imported.body.id}`);
    expect(importedFull.body.app_scope).toBe('web-app');
    expect(importedFull.body.pages).toHaveLength(1);
    expect(importedFull.body.panels[0].description).toBe('per host');
    expect(importedFull.body.panels[0].page_id).toBe(importedFull.body.pages[0].id);

    const dup = await request(app).post(`/dashboards/${id}/duplicate`);
    expect(dup.status).toBe(201);
    const dupFull = await request(app).get(`/dashboards/${dup.body.id}`);
    expect(dupFull.body.app_scope).toBe('web-app');
    expect(dupFull.body.pages).toHaveLength(1);
    expect(dupFull.body.panels[0].page_id).toBe(dupFull.body.pages[0].id);
    expect(dupFull.body.panels[0].description).toBe('per host');
  });

  it('never exposes the share-password hash to API clients', async () => {
    const list = await request(app).get('/dashboards');
    expect(list.status).toBe(200);
    for (const d of list.body) {
      expect(d).not.toHaveProperty('public_password');
      expect(typeof d.has_password).toBe('boolean');
    }
  });

  it('honours ISO expiry timestamps as datetimes, not strings', async () => {
    const created = await request(app).post('/dashboards').send({ name: 'Expiring board' });
    const id = created.body.id;

    const past = new Date(Date.now() - 60_000).toISOString();
    const expired = await request(app).put(`/dashboards/${id}/share`).send({ is_public: true, public_expires_at: past });
    expect(expired.status).toBe(200);
    const gone = await request(app).get(`/dashboards/public/${expired.body.public_token}`).set('x-test-anonymous', '1');
    expect(gone.status).toBe(404);

    const future = new Date(Date.now() + 60_000).toISOString();
    const live = await request(app).put(`/dashboards/${id}/share`).send({ is_public: true, public_expires_at: future });
    const ok = await request(app).get(`/dashboards/public/${live.body.public_token}`).set('x-test-anonymous', '1');
    expect(ok.status).toBe(200);

    // "Never" clears the expiry explicitly.
    await request(app).put(`/dashboards/${id}/share`).send({ is_public: true, public_expires_at: '' });
    const cleared = await request(app).get(`/dashboards/public/${live.body.public_token}`).set('x-test-anonymous', '1');
    expect(cleared.status).toBe(200);
  });
});

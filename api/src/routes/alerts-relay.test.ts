/**
 * Studio relay routes: GET /alerts/relay/status never leaks the relay URL or
 * key and is not swallowed by /alerts/:id; create/update reject relay actions
 * the relay can't honour (lab-only, no project, empty message).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(() => ({ userId: 'test-user-id', username: 'relay-user', role: 'admin', type: 'access' })),
  };
});

import alertsRouter from './alerts.js';
import { closeDatabase } from '../db/sqlite.js';

const URL_ = 'https://relay.example.invalid/secret-path/';
const KEY = 'test-bus-key-not-real-route-9876';

describe('alert relay routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (!req.headers['x-test-anonymous']) req.headers.authorization = 'Bearer test-token';
      next();
    });
    app.use('/alerts', alertsRouter);
  });

  afterEach(() => {
    delete process.env.RELAY_URL;
    delete process.env.RELAY_BUS_KEY;
  });

  afterAll(() => closeDatabase());

  it('status says configured and lists projects, never the URL or key', async () => {
    process.env.RELAY_URL = URL_;
    process.env.RELAY_BUS_KEY = KEY;
    const res = await request(app).get('/alerts/relay/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: true,
      projects: ['GAME', 'DIRECTORS PALETTE', 'STUDIO', 'PARTNERS', 'MONEY', 'PRESIDIUM', 'FIRST HUDDLE', 'HOMEWORK TREE'],
    });
    expect(res.text).not.toContain(KEY);
    expect(res.text).not.toContain('relay.example');
  });

  it('status says not configured when either env var is missing', async () => {
    process.env.RELAY_URL = URL_;
    const res = await request(app).get('/alerts/relay/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it('status needs authentication', async () => {
    const res = await request(app).get('/alerts/relay/status').set('x-test-anonymous', '1');
    expect(res.status).toBe(401);
  });

  const base = { name: 'relay rule', search_query: 'search severity<=3' };

  it('saves a relay action and returns it on the alert', async () => {
    const config = { project: 'STUDIO', message: '{{alert_name}} fired', telegram: true, lab: true, urgent: false };
    const res = await request(app).post('/alerts').send({ ...base, actions: [{ type: 'relay', config }] });
    expect(res.status).toBe(201);
    expect(res.body.actions).toEqual([{ type: 'relay', config }]);

    const got = await request(app).get(`/alerts/${res.body.id}`);
    expect(got.body.actions[0]).toEqual({ type: 'relay', config });
  });

  it('rejects a lab-only relay action on create and update', async () => {
    const lab = [{ type: 'relay', config: { project: 'STUDIO', message: 'x', telegram: false, lab: true } }];
    const created = await request(app).post('/alerts').send({ ...base, actions: lab });
    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/ride along with the Telegram text/);

    const ok = await request(app).post('/alerts').send({ ...base, actions: [] });
    const updated = await request(app).put(`/alerts/${ok.body.id}`).send({ actions: lab });
    expect(updated.status).toBe(400);
  });

  it('rejects an unknown project or an empty message', async () => {
    const badProject = await request(app).post('/alerts').send({
      ...base, actions: [{ type: 'relay', config: { project: 'ELSEWHERE', message: 'x', telegram: true } }],
    });
    expect(badProject.status).toBe(400);
    expect(badProject.body.error).toMatch(/Pick a project/);
    const empty = await request(app).post('/alerts').send({
      ...base, actions: [{ type: 'relay', config: { project: 'GAME', message: '', telegram: true } }],
    });
    expect(empty.status).toBe(400);
  });
});

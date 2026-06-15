import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import fs from 'fs';

// Isolated on-disk temp DB so the db/sqlite.ts module singleton is harmless and
// the real create/delete functions exercised by /provision hit a real schema.
const TEST_DB = './lognog-test-sources-provision.db';
process.env.SQLITE_PATH = TEST_DB;

// Mock ONLY the JWT verification so the request authenticates as an admin via the
// real `authenticate` middleware. Everything else in auth.js (createApiKey,
// validateApiKey, deleteApiKey, the api_keys schema init) stays real so we can
// prove the provisioned key is actually scoped.
import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(),
  };
});

import { getSQLiteDB } from '../db/sqlite.js';
import sourcesRouter from './sources.js';
import { validateApiKey } from '../auth/auth.js';
import { getAlert } from '../db/sqlite-alerts.js';
import { getDashboardPanels } from '../db/sqlite-dashboards.js';

const ADMIN_ID = 'admin-user-id';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/sources', sourcesRouter);
  return app;
}

describe('POST /sources/provision', () => {
  let app: Express;

  beforeAll(() => {
    // Ensure schema (dashboards, alerts, source_configs, api_keys, users_v2) is created.
    const db = getSQLiteDB();
    // api_keys.user_id has a FK to users_v2(id); the admin must exist for real
    // createApiKey to succeed.
    db.prepare(
      `INSERT OR IGNORE INTO users_v2 (id, username, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`
    ).run(ADMIN_ID, 'provision-admin', 'provision-admin@example.com', 'x');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Authenticate every request as an admin via a Bearer token.
    vi.mocked(auth.verifyAccessToken).mockReturnValue({
      userId: ADMIN_ID,
      username: 'admin',
      role: 'admin',
      type: 'access',
    });
    app = createApp();
  });

  afterAll(() => {
    try {
      fs.unlinkSync(TEST_DB);
    } catch {
      /* ignore */
    }
  });

  it('provisions all artifacts and returns a one-time scoped write key', async () => {
    const res = await request(app)
      .post('/sources/provision')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'TestApp', index: 'test-app' });

    expect(res.status).toBe(200);
    expect(res.body.index).toBe('test-app');
    expect(typeof res.body.apiKey).toBe('string');
    expect(res.body.apiKey.startsWith('lnog_')).toBe(true);
    expect(res.body.apiKeyId).toBeTruthy();
    expect(res.body.sourceConfigId).toBeTruthy();
    expect(res.body.alertId).toBeTruthy();
    expect(res.body.dashboardId).toBeTruthy();

    // The returned key is REAL and scoped to exactly the provisioned index.
    const validated = await validateApiKey(res.body.apiKey);
    expect(validated).not.toBeNull();
    expect(validated!.permissions).toEqual(['write']);
    expect(validated!.allowedIndexes).toEqual(['test-app']);

    // The starter alert is a no_data heartbeat alert.
    const alert = getAlert(res.body.alertId);
    expect(alert).toBeTruthy();
    expect(alert!.trigger_type).toBe('no_data');

    // The dashboard has exactly 3 panels.
    const panels = getDashboardPanels(res.body.dashboardId);
    expect(panels.length).toBe(3);
  });

  it('rejects an invalid (non-slug) index with 400', async () => {
    const res = await request(app)
      .post('/sources/provision')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Bad', index: 'Bad Index!' });

    expect(res.status).toBe(400);
  });

  it('rejects an empty name with 400', async () => {
    const res = await request(app)
      .post('/sources/provision')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: '', index: 'some-index' });

    expect(res.status).toBe(400);
  });

  it('rejects a non-admin (JWT user role) with 403', async () => {
    vi.mocked(auth.verifyAccessToken).mockReturnValue({
      userId: 'plain-user',
      username: 'user',
      role: 'user',
      type: 'access',
    });

    const res = await request(app)
      .post('/sources/provision')
      .set('Authorization', 'Bearer user-token')
      .send({ name: 'Nope', index: 'nope' });

    expect(res.status).toBe(403);
  });
});

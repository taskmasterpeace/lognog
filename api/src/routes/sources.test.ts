import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import fs from 'fs';

// Isolated on-disk temp DB so the db/sqlite.ts module singleton is harmless and
// the real create/delete functions exercised by /provision hit a real schema.
const TEST_DB = './lognog-test-sources-provision.db';
process.env.SQLITE_PATH = TEST_DB;

// Start from a clean slate: remove any stale DB left behind by a previous
// (possibly crashed) run so leftover rows can't pollute the orphan assertions.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(TEST_DB + suffix);
  } catch {
    /* ignore — file may not exist */
  }
}

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

// Mock the dashboards module so we can force createDashboardPanel to throw in the
// rollback test, while keeping every other export (createDashboard, getDashboard,
// getDashboardPanels, deleteDashboard, etc.) real so the rollback genuinely runs
// against the real schema.
import * as dashboards from '../db/sqlite-dashboards.js';
vi.mock('../db/sqlite-dashboards.js', async () => {
  const actual = await vi.importActual<typeof dashboards>('../db/sqlite-dashboards.js');
  return {
    ...actual,
    createDashboardPanel: vi.fn(actual.createDashboardPanel),
  };
});

import { getSQLiteDB, closeDatabase } from '../db/sqlite.js';
import sourcesRouter from './sources.js';
import { validateApiKey } from '../auth/auth.js';
import { getAlert } from '../db/sqlite-alerts.js';
import { getDashboardPanels, createDashboardPanel } from '../db/sqlite-dashboards.js';

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
    // Close the connection first so Windows lets us delete the file.
    try {
      closeDatabase();
    } catch {
      /* ignore */
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(TEST_DB + suffix);
      } catch {
        /* ignore */
      }
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

  it('rolls back ALL provisioned artifacts (no orphans) when a later step throws', async () => {
    const db = getSQLiteDB();
    const ROLLBACK_INDEX = 'rollback-app';
    const ROLLBACK_NAME = 'RollbackApp';

    // Force the FIRST dashboard panel creation to throw, after the dashboard row
    // (and the api key, source config, and alert) have already been created.
    // This exercises the route's rollback path for real.
    vi.mocked(createDashboardPanel).mockImplementationOnce(() => {
      throw new Error('boom: simulated panel creation failure');
    });

    const res = await request(app)
      .post('/sources/provision')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: ROLLBACK_NAME, index: ROLLBACK_INDEX });

    // The provisioning call fails.
    expect(res.status).toBe(500);

    // --- Now prove via REAL DB reads that nothing was left behind. ---

    // 1. No source config points at the provisioned index.
    const sourceConfigs = db
      .prepare('SELECT id FROM source_configs WHERE target_index = ?')
      .all(ROLLBACK_INDEX) as Array<{ id: string }>;
    expect(sourceConfigs).toEqual([]);

    // 2. No alert with the provisioned name remains.
    const alerts = db
      .prepare('SELECT id FROM alerts WHERE name = ?')
      .all(`${ROLLBACK_NAME} — no data`) as Array<{ id: string }>;
    expect(alerts).toEqual([]);

    // 3. No API key row remains for the provisioned key's name.
    const apiKeys = db
      .prepare('SELECT id FROM api_keys WHERE name = ?')
      .all(`${ROLLBACK_NAME} ingest key`) as Array<{ id: string }>;
    expect(apiKeys).toEqual([]);

    // 4. No dashboard row remains for the attempted dashboard...
    const dashboardRows = db
      .prepare('SELECT id FROM dashboards WHERE name = ?')
      .all(ROLLBACK_NAME) as Array<{ id: string }>;
    expect(dashboardRows).toEqual([]);

    // ...and therefore no orphaned dashboard_panels rows reference it.
    // (The dashboard was created before the panel threw, so this proves the
    //  ON DELETE CASCADE actually fired during deleteDashboard.)
    const orphanPanels = db
      .prepare(
        `SELECT p.id FROM dashboard_panels p
         LEFT JOIN dashboards d ON d.id = p.dashboard_id
         WHERE d.id IS NULL`
      )
      .all() as Array<{ id: string }>;
    expect(orphanPanels).toEqual([]);
  });
});

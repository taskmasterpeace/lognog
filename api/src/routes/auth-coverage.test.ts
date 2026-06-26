/**
 * Auth/authorization hardening coverage (#34, #35, #36, #37).
 *
 * Verifies:
 *  - Previously-unauthenticated routers now return 401 WITHOUT a token
 *    (retention cleanup, demo clear, a dashboards mutation).
 *  - The saved-search IDOR path returns 404 for a non-owner and 200 for the owner.
 *  - Unit behaviour of requirePermission / requireRole / denyReadonly and the
 *    isValidIndexName helper (readonly denied write, admin allowed, etc).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import fs from 'fs';

// Isolated on-disk DB so the sqlite module singleton hits a real schema.
const TEST_DB = './lognog-test-auth-coverage.db';
process.env.SQLITE_PATH = TEST_DB;
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(TEST_DB + suffix);
  } catch {
    /* ignore — file may not exist */
  }
}

// Mock ONLY JWT verification; the rest of auth.js stays real.
import * as auth from '../auth/auth.js';
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    verifyAccessToken: vi.fn(),
  };
});

import {
  requirePermission,
  requireRole,
  requireAdmin,
  denyReadonly,
  isValidIndexName,
} from '../auth/middleware.js';
import retentionRouter from './retention.js';
import demoRouter from './demo.js';
import dashboardsRouter from './dashboards.js';
import savedSearchesRouter from './saved-searches.js';
import { createSavedSearch } from '../db/sqlite-saved-searches.js';
import { closeDatabase } from '../db/sqlite.js';

type JwtUser = { userId: string; username: string; role: string; type: 'access' };
function authAs(user: JwtUser | null): void {
  vi.mocked(auth.verifyAccessToken).mockReturnValue(user as ReturnType<typeof auth.verifyAccessToken>);
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/retention', retentionRouter);
  app.use('/demo', demoRouter);
  app.use('/dashboards', dashboardsRouter);
  app.use('/saved-searches', savedSearchesRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit tests for the middleware/helpers (no HTTP needed).
// ---------------------------------------------------------------------------
describe('isValidIndexName (#37)', () => {
  it('accepts valid index names', () => {
    expect(isValidIndexName('main')).toBe(true);
    expect(isValidIndexName('hey-youre-hired')).toBe(true);
    expect(isValidIndexName('app_logs2')).toBe(true);
  });

  it('rejects injection / malformed names', () => {
    expect(isValidIndexName("a'; DROP TABLE logs;--")).toBe(false);
    expect(isValidIndexName('1leading-digit')).toBe(false);
    expect(isValidIndexName('has space')).toBe(false);
    expect(isValidIndexName('')).toBe(false);
    expect(isValidIndexName(undefined)).toBe(false);
    expect(isValidIndexName(123 as unknown)).toBe(false);
  });
});

// Tiny harness to run a middleware against a fake req and capture the outcome.
function runMiddleware(
  mw: (req: Request, res: Response, next: () => void) => void,
  req: Partial<Request>,
): { status: number | null; nexted: boolean } {
  let status: number | null = null;
  let nexted = false;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  mw(
    { method: 'POST', path: '/x', ip: '127.0.0.1', get: () => undefined, ...req } as unknown as Request,
    res,
    () => {
      nexted = true;
    },
  );
  return { status, nexted };
}

describe('requirePermission write (#36)', () => {
  it('denies a readonly JWT user write access', () => {
    const { status, nexted } = runMiddleware(requirePermission('write'), {
      user: { id: 'u', username: 'ro', role: 'readonly' },
      authMethod: 'jwt',
    });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it('allows an admin JWT user write access', () => {
    const { status, nexted } = runMiddleware(requirePermission('write'), {
      user: { id: 'a', username: 'admin', role: 'admin' },
      authMethod: 'jwt',
    });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });

  it('allows a normal JWT user write access', () => {
    const { nexted } = runMiddleware(requirePermission('write'), {
      user: { id: 'u', username: 'user', role: 'user' },
      authMethod: 'jwt',
    });
    expect(nexted).toBe(true);
  });

  it('allows a readonly JWT user read access', () => {
    const { nexted } = runMiddleware(requirePermission('read'), {
      user: { id: 'u', username: 'ro', role: 'readonly' },
      authMethod: 'jwt',
    });
    expect(nexted).toBe(true);
  });
});

describe('requireRole / requireAdmin (#36)', () => {
  it('requireRole denies a role not in the allow-list', () => {
    const { status, nexted } = runMiddleware(requireRole('admin'), {
      user: { id: 'u', username: 'user', role: 'user' },
      authMethod: 'jwt',
    });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it('requireRole admits an allowed role', () => {
    const { nexted } = runMiddleware(requireRole('admin', 'user'), {
      user: { id: 'u', username: 'user', role: 'user' },
      authMethod: 'jwt',
    });
    expect(nexted).toBe(true);
  });

  it('requireAdmin denies a non-admin', () => {
    const { status } = runMiddleware(requireAdmin, {
      user: { id: 'u', username: 'user', role: 'user' },
      authMethod: 'jwt',
    });
    expect(status).toBe(403);
  });
});

describe('denyReadonly (#36)', () => {
  it('blocks a readonly user on POST', () => {
    const { status, nexted } = runMiddleware(denyReadonly, {
      method: 'POST',
      user: { id: 'u', username: 'ro', role: 'readonly' },
    });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it('passes a GET request through for a readonly user', () => {
    const { nexted } = runMiddleware(denyReadonly, {
      method: 'GET',
      user: { id: 'u', username: 'ro', role: 'readonly' },
    });
    expect(nexted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP tests: previously-public routes now require auth (#35).
// ---------------------------------------------------------------------------
describe('previously-unauthenticated routes now require auth (#35)', () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  afterAll(() => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /retention/cleanup returns 401 without a token', async () => {
    const res = await request(app).post('/retention/cleanup');
    expect(res.status).toBe(401);
  });

  it('DELETE /demo/clear returns 401 without a token', async () => {
    const res = await request(app).delete('/demo/clear?confirm=yes');
    expect(res.status).toBe(401);
  });

  it('POST /dashboards (create) returns 401 without a token', async () => {
    const res = await request(app).post('/dashboards').send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// IDOR: a non-owner cannot read another user's private saved search (#36).
// ---------------------------------------------------------------------------
describe('saved-search IDOR (#36)', () => {
  let app: Express;
  let privateId: string;

  beforeAll(() => {
    app = buildApp();
    const s = createSavedSearch('Owner Private Search', 'search *', {
      owner_id: 'owner-user',
      is_shared: false,
    });
    privateId = s.id;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for a non-owner', async () => {
    authAs({ userId: 'attacker-user', username: 'attacker', role: 'user', type: 'access' });
    const res = await request(app)
      .get(`/saved-searches/${privateId}`)
      .set('Authorization', 'Bearer attacker-token');
    expect(res.status).toBe(404);
  });

  it('returns 200 for the owner', async () => {
    authAs({ userId: 'owner-user', username: 'owner', role: 'user', type: 'access' });
    const res = await request(app)
      .get(`/saved-searches/${privateId}`)
      .set('Authorization', 'Bearer owner-token');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(privateId);
  });
});

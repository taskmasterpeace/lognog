/**
 * The key lock: every mounted route, walked with every kind of API key.
 *
 * Before the lock, `authenticate` set req.apiKeyPermissions but nothing checked
 * them, and requireAdmin only looked at the key OWNER's role (every key belongs
 * to the admin). So an ingest-only key could read every index, change alerts and
 * dashboards, and even mint itself a '*' key at POST /auth/api-keys.
 *
 * This file walks the route table of the real app (routes/mount.ts, the same
 * list index.ts mounts), so a router added later is covered automatically:
 *
 *   1. Ingest-only key ('write') is refused on every route that isn't ingest or
 *      genuinely public, and every "public" route is proven public by calling it
 *      with no credentials at all.
 *   2. Read-only key is refused on every change, except a short, hard-coded
 *      list of POSTs that only read; it is allowed on every GET except a short,
 *      hard-coded list of admin GETs.
 *   3. Index-scoped read key may only read through search / stats / agent.
 *   4. alerts:write and dashboards:write each open only their own changes.
 *   5. Admin key and '*' key are never refused (except ingest for admin);
 *      JWT (browser) sessions are never touched by the gate.
 * plus end-to-end checks on the real routers (refusals happen before any
 * handler runs, so nothing is changed or sent).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

vi.hoisted(() => {
  process.env.LOGNOG_BACKEND = 'sqlite';
  process.env.LOGS_DB_PATH = `${process.env.TMPDIR ?? '/tmp'}/lognog-keylock-${process.pid}-${Date.now()}.db`;
});

// Each key is bcrypt-checked for real, but only once per key for the whole file
// (the gate would otherwise pay one bcrypt per request: 421 routes x 9 keys).
// The validation itself, the gate and the policy are the real code.
vi.mock('../auth/api-key-cache.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../auth/api-key-cache.js')>();
  const memo = new Map<string, ReturnType<typeof real.resolveApiKeyCached>>();
  return {
    resolveApiKeyCached: (req: Parameters<typeof real.resolveApiKeyCached>[0], k: string) => {
      if (!memo.has(k)) memo.set(k, real.resolveApiKeyCached(req, k));
      return memo.get(k)!;
    },
  };
});

import express, { Express, Router } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { createUser, createApiKey, generateTokenPair, getApiKeys } from '../auth/auth.js';
import { apiKeyGate } from '../auth/api-key-gate.js';
import { requireAdmin } from '../auth/middleware.js';
import { apiKeyNeed, decideApiKey } from '../auth/key-policy.js';
import { API_ROUTERS, mountApiRoutes } from './mount.js';
import { closeDatabase } from '../db/sqlite.js';

// ---------------------------------------------------------------------------
// Route table, read from the real routers.
// ---------------------------------------------------------------------------
type RouteRow = { method: string; path: string };

function walk(prefix: string, router: Router, out: RouteRow[]): void {
  for (const layer of (router as unknown as { stack: any[] }).stack) {
    if (layer.route) {
      for (const m of Object.keys(layer.route.methods)) {
        if (m === '_all') continue;
        out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const src: string = layer.regexp?.source ?? '';
      const sub =
        src === '^\\/?(?=\\/|$)' ? '' : src.replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
      walk(prefix + sub, layer.handle, out);
    }
  }
}

function allRoutes(): RouteRow[] {
  const out: RouteRow[] = [];
  for (const [p, r] of API_ROUTERS) walk(p, r as unknown as Router, out);
  // Concrete paths: fill every :param with a value no real row has.
  return out.map((r) => ({
    method: r.method,
    path: (r.path.replace(/:[A-Za-z_]+/g, 'kl-none').replace(/\/+$/, '') || '/'),
  }));
}

const ROUTES = allRoutes();
const key = (r: RouteRow) => `${r.method} ${r.path}`;

// ---------------------------------------------------------------------------
// The expectations below are written out by hand on purpose, so they check the
// policy instead of repeating it.
// ---------------------------------------------------------------------------

/** Routes that answer without any credential at all (key is irrelevant). */
const PUBLIC = new Set([
  'GET /auth/setup-required', 'POST /auth/setup', 'POST /auth/login', 'POST /auth/refresh',
  'GET /ingest/guide', 'GET /ingest/schema', 'GET /ingest/health',
  'GET /search/ai/suggestions', 'POST /search/validate', 'GET /search/backend', 'GET /search/lookup-tables',
  'GET /dashboards/public/kl-none', 'POST /dashboards/public/kl-none/query',
  'GET /utils/classify-ip', 'POST /utils/classify-ip', 'POST /utils/classify-ips', 'GET /utils/ip-info',
  'GET /dsl/reference', 'GET /dsl/commands', 'GET /dsl/operators', 'GET /dsl/functions',
  'GET /dsl/fields', 'GET /dsl/patterns', 'GET /dsl/quick',
  'GET /notifications/services', 'GET /notifications/status',
  'GET /mcp/status', 'GET /mcp/health', 'POST /mcp/messages',
]);

/** The ingest endpoints: the only thing a 'write' key may do. */
const INGEST = new Set([
  'POST /ingest/agent', 'GET /ingest/notifications', 'POST /ingest/notifications/kl-none/ack',
  'POST /ingest/otlp/v1/logs', 'POST /ingest/supabase', 'POST /ingest/http', 'POST /ingest/vercel',
  'POST /ingest/nextjs', 'POST /ingest/smartthings', 'POST /ingest/validate',
]);

/** POSTs that only read, so a read key may call them. */
const READ_POSTS = new Set([
  'POST /search/query', 'POST /search/parse', 'POST /search/ai',
  'POST /agent/search', 'POST /agent/alerts/test', 'POST /alerts/test',
  'POST /dashboards/kl-none/export', 'POST /dashboards/kl-none/variables/preview-options',
  'POST /dashboards/kl-none/variables/kl-none/options',
  'POST /geoip/lookup', 'POST /cim/normalize', 'POST /cim/validate', 'POST /cim/auto-detect', 'POST /cim/compliance',
  'POST /routing-rules/evaluate', 'POST /field-extractions/test', 'POST /knowledge/field-extractions/kl-none/test',
  'POST /templates/kl-none/test', 'POST /saved-searches/kl-none/run', 'POST /reports/generate',
]);

/** GETs a read key may NOT make: they expose secrets, spend money, or dump every index. */
const ADMIN_GET_PREFIXES = [
  '/auth/api-keys', '/auth/users', '/auth/audit-log', '/settings/system', '/settings/ai',
  '/settings/internal-logging', '/settings/logs', '/notifications/channels', '/synthetic/tests',
  '/pull-collectors', '/demo/', '/ai/', '/mcp/sse', '/geoip/cache',
];

/** Reads an index-scoped key may make (each filters to the key's indexes). */
const SCOPED_READS = new Set([
  'POST /search/query', 'POST /search/parse', 'POST /search/ai', 'GET /search/fields', 'GET /search/fields/discover',
  'GET /search/fields/kl-none/values', 'GET /search/logs/kl-none/full-message', 'GET /search/logs/kl-none/context',
  'GET /stats/overview', 'GET /stats/timeseries', 'GET /stats/severity', 'GET /stats/indexes',
  'GET /stats/indexes/details', 'GET /stats/indexes/kl-none/fields', 'GET /stats/sources', 'GET /stats/storage',
  'GET /agent', 'POST /agent/search', 'GET /agent/summary', 'GET /agent/indexes', 'GET /agent/fields',
  'GET /auth/me', 'POST /reports/generate',
]);

const isPublic = (r: RouteRow) => PUBLIC.has(key(r));
const isIngest = (r: RouteRow) => INGEST.has(key(r));
const isAlertChange = (r: RouteRow) =>
  r.method !== 'GET' &&
  !READ_POSTS.has(key(r)) &&
  (/^\/(alerts|silences)(\/|$)/.test(r.path) || /^\/agent\/alerts(\/|$)/.test(r.path) ||
    /^\/saved-searches\/[^/]+\/create-alert$/.test(r.path));
const isDashboardChange = (r: RouteRow) =>
  r.method !== 'GET' &&
  !READ_POSTS.has(key(r)) &&
  ((/^\/dashboards(\/|$)/.test(r.path) && !isPublic(r)) || /^\/saved-searches\/[^/]+\/create-panel$/.test(r.path));
const isRead = (r: RouteRow) =>
  !isPublic(r) && !isIngest(r) &&
  (r.method === 'GET' ? !ADMIN_GET_PREFIXES.some((p) => r.path.startsWith(p)) : READ_POSTS.has(key(r)));

// ---------------------------------------------------------------------------
// Keys and apps.
// ---------------------------------------------------------------------------
const K: Record<string, string> = {};
let jwtAdmin = '';
let gateApp: Express; // the gate in front of a stub that answers 299
let realApp: Express; // the gate + every real router
// One listening server per app: thousands of supertest(app) calls would each
// open (and leave in TIME_WAIT) their own ephemeral server and port.
let gateSrv: Server;
let realSrv: Server;

const REFUSED = 'API key lacks required permissions';

beforeAll(async () => {
  const admin = await createUser('kl-admin', 'kl-admin@example.invalid', 'kl-admin-test-pass-1', 'admin');
  const mk = async (name: string, perms: string[], indexes?: string[]) =>
    (await createApiKey(admin.id, name, perms, undefined, indexes)).apiKey;
  K.ingest = await mk('ingest only', ['write']);
  K.ingestScoped = await mk('ingest money', ['write'], ['money']);
  K.read = await mk('read only', ['read']);
  K.readScoped = await mk('board numbers', ['read'], ['uptime', 'directors-palette']);
  K.search = await mk('dp style', ['write', 'search', 'read']);
  K.alerts = await mk('alerts writer', ['alerts:write']);
  K.dashboards = await mk('dashboards writer', ['dashboards:write']);
  K.admin = await mk('admin key', ['admin']);
  K.star = await mk('star key', ['*']);
  jwtAdmin = (await generateTokenPair(admin)).accessToken;

  gateApp = express();
  gateApp.use(express.json());
  gateApp.use(apiKeyGate);
  gateApp.all('*', (_req, res) => {
    res.status(299).json({ reached: true });
  });

  realApp = express();
  realApp.use(express.json());
  mountApiRoutes(realApp);

  gateSrv = gateApp.listen(0, '127.0.0.1');
  realSrv = realApp.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await new Promise((r) => gateSrv.close(r));
  await new Promise((r) => realSrv.close(r));
  closeDatabase();
});

async function hit(app: Express | Server, r: RouteRow, headers: Record<string, string>) {
  let req = request(app)[r.method.toLowerCase() as 'get'](r.path);
  for (const [h, v] of Object.entries(headers)) req = req.set(h, v);
  if (r.method !== 'GET' && r.method !== 'DELETE') req = req.send({});
  return req;
}

/** For each route, did the key lock refuse this key? (gate in front of a stub) */
async function refusedMap(apiKey: string): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (const r of ROUTES) {
    const res = await hit(gateSrv, r, { Authorization: `ApiKey ${apiKey}` });
    expect([299, 403], `${key(r)} answered ${res.status}`).toContain(res.status);
    out.set(key(r), res.status === 403 && res.body.error === REFUSED);
  }
  return out;
}

function mismatches(map: Map<string, boolean>, shouldRefuse: (r: RouteRow) => boolean): string[] {
  return ROUTES.filter((r) => map.get(key(r)) !== shouldRefuse(r)).map(
    (r) => `${key(r)} -> ${map.get(key(r)) ? 'refused' : 'allowed'}, expected ${shouldRefuse(r) ? 'refused' : 'allowed'}`,
  );
}

// ---------------------------------------------------------------------------
describe('route table', () => {
  it('walks the whole API (every router in routes/mount.ts)', () => {
    expect(ROUTES.length).toBeGreaterThan(400);
    for (const [p] of API_ROUTERS) {
      expect(ROUTES.some((r) => r.path === p || r.path.startsWith(p + '/')), p).toBe(true);
    }
  });

  it('every route the walk calls "public" really answers with no credentials', async () => {
    const notPublic: string[] = [];
    for (const r of ROUTES.filter(isPublic)) {
      if (r.path === '/mcp/messages') continue; // needs a live SSE session id; 400 without one, never 401
      const res = await hit(realSrv, r, {});
      if (res.status === 401) notPublic.push(key(r));
    }
    expect(notPublic).toEqual([]);
    // and the hand list names only routes that exist
    for (const k of PUBLIC) expect(ROUTES.some((r) => key(r) === k), k).toBe(true);
    for (const k of [...INGEST, ...READ_POSTS, ...SCOPED_READS]) expect(ROUTES.some((r) => key(r) === k), k).toBe(true);
  });
});

describe('key lock: every route x every kind of key', () => {
  it('an ingest-only key can only ingest', async () => {
    const m = await refusedMap(K.ingest);
    expect(mismatches(m, (r) => !isPublic(r) && !isIngest(r))).toEqual([]);
  });

  it('an index-scoped ingest key can only ingest', async () => {
    const m = await refusedMap(K.ingestScoped);
    expect(mismatches(m, (r) => !isPublic(r) && !isIngest(r))).toEqual([]);
  });

  it('a read-only key can read but change nothing and send no logs', async () => {
    const m = await refusedMap(K.read);
    expect(mismatches(m, (r) => !isPublic(r) && !isRead(r))).toEqual([]);
  });

  it('an index-scoped read key can only read through index-scoped routes', async () => {
    const m = await refusedMap(K.readScoped);
    expect(mismatches(m, (r) => !isPublic(r) && !SCOPED_READS.has(key(r)))).toEqual([]);
  });

  it("a write+search+read key (Directors Palette / HYH) ingests and reads, nothing more", async () => {
    const m = await refusedMap(K.search);
    expect(mismatches(m, (r) => !isPublic(r) && !isIngest(r) && !isRead(r))).toEqual([]);
  });

  it('an alerts:write key changes alerts and silences only', async () => {
    const m = await refusedMap(K.alerts);
    expect(mismatches(m, (r) => !isPublic(r) && !isAlertChange(r))).toEqual([]);
  });

  it('a dashboards:write key changes dashboards only', async () => {
    const m = await refusedMap(K.dashboards);
    expect(mismatches(m, (r) => !isPublic(r) && !isDashboardChange(r))).toEqual([]);
  });

  it('an admin key does everything except send logs (unchanged: ingest needs write)', async () => {
    const m = await refusedMap(K.admin);
    expect(mismatches(m, (r) => isIngest(r))).toEqual([]);
  });

  it("a '*' key is never refused", async () => {
    const m = await refusedMap(K.star);
    expect(mismatches(m, () => false)).toEqual([]);
  });

  it('a browser session (JWT) is never touched by the gate', async () => {
    for (const r of ROUTES) {
      const res = await hit(gateSrv, r, { Authorization: `Bearer ${jwtAdmin}` });
      expect(res.status, key(r)).toBe(299);
    }
  });

  it('X-API-Key is checked the same way as Authorization: ApiKey', async () => {
    const res = await request(gateSrv).get('/alerts').set('X-API-Key', K.ingest);
    expect(res.status).toBe(403);
    const ok = await request(gateSrv).post('/ingest/http').set('X-API-Key', K.ingest).send([]);
    expect(ok.status).toBe(299);
  });

  it('an invalid key is left to the route (gate never turns it into a pass)', async () => {
    const res = await request(realSrv).get('/alerts').set('Authorization', 'ApiKey lnog_00000000_not_a_real_key_000000000000000000000000');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('key lock on the real routers', () => {
  it('an ingest key can no longer mint itself a "*" key', async () => {
    const before = getApiKeys((await request(realSrv).get('/auth/me').set('Authorization', `Bearer ${jwtAdmin}`)).body.id ?? '').length;
    const res = await request(realSrv)
      .post('/auth/api-keys')
      .set('Authorization', `ApiKey ${K.ingest}`)
      .send({ name: 'escalate', permissions: ['*'] });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: REFUSED, needed: 'admin' });
    expect(res.text).not.toContain('lnog_');
    const all = (await request(realSrv).get('/auth/api-keys').set('Authorization', `ApiKey ${K.admin}`)).body as Array<{ name: string }>;
    expect(all.some((k) => k.name === 'escalate')).toBe(false);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('a read key can list alerts but not create one; an alerts:write key can', async () => {
    expect((await request(realSrv).get('/alerts').set('Authorization', `ApiKey ${K.read}`)).status).toBe(200);
    const denied = await request(realSrv)
      .post('/alerts')
      .set('Authorization', `ApiKey ${K.read}`)
      .send({ name: 'kl rule', search_query: 'search *' });
    expect(denied.status).toBe(403);
    expect(denied.body.needed).toBe('alerts:write');

    const made = await request(realSrv)
      .post('/alerts')
      .set('Authorization', `ApiKey ${K.alerts}`)
      .send({ name: 'kl rule', search_query: 'search *' });
    expect(made.status).toBe(201);
    const del = await request(realSrv).delete(`/alerts/${made.body.id}`).set('Authorization', `ApiKey ${K.alerts}`);
    expect(del.status).toBeLessThan(300);
  });

  it('an ingest key can no longer read alerts, search, or touch dashboards', async () => {
    const h = { Authorization: `ApiKey ${K.ingest}` };
    expect((await request(realSrv).get('/alerts').set(h)).status).toBe(403);
    expect((await request(realSrv).post('/search/query').set(h).send({ query: 'search *' })).status).toBe(403);
    expect((await request(realSrv).post('/dashboards').set(h).send({ name: 'x' })).status).toBe(403);
    expect((await request(realSrv).get('/settings/system').set(h)).status).toBe(403);
  });

  it('ingest still works for ingest keys (X-API-Key, scoped and not)', async () => {
    const ev = [{ message: 'key lock ingest check', index_name: 'money' }];
    const a = await request(realSrv).post('/ingest/http').set('X-API-Key', K.ingestScoped).set('X-Index', 'money').send(ev);
    expect(a.status).toBe(200);
    const b = await request(realSrv).post('/ingest/http').set('X-API-Key', K.search).send([{ message: 'dp style' }]);
    expect(b.status).toBe(200);
    // and a read key still can't send logs (unchanged)
    const c = await request(realSrv).post('/ingest/http').set('X-API-Key', K.read).send([{ message: 'nope' }]);
    expect(c.status).toBe(403);
  });

  it('the board-numbers style key (read, scoped) can still run its search', async () => {
    const res = await request(realSrv)
      .post('/search/query')
      .set('Authorization', `ApiKey ${K.readScoped}`)
      .send({ query: 'search index=uptime | stats count', earliest: '-1h', latest: 'now' });
    expect(res.status).toBe(200);
  });

  it('a browser admin session still does everything it did', async () => {
    const h = { Authorization: `Bearer ${jwtAdmin}` };
    expect((await request(realSrv).get('/alerts').set(h)).status).toBe(200);
    const made = await request(realSrv).post('/alerts').set(h).send({ name: 'jwt rule', search_query: 'search *' });
    expect(made.status).toBe(201);
    expect((await request(realSrv).get('/auth/api-keys').set(h)).status).toBe(200);
  });

  it('the MCP stream needs an unscoped admin key (header or query param)', async () => {
    const viaQuery = await request(realSrv).get(`/mcp/sse?api_key=${encodeURIComponent(K.read)}`);
    expect(viaQuery.status).toBe(403);
    expect(decideApiKey('GET', '/mcp/sse', ['read'], null).allowed).toBe(false);
    expect(decideApiKey('GET', '/mcp/sse', ['admin'], ['money']).allowed).toBe(false);
    expect(decideApiKey('GET', '/mcp/sse', ['admin'], null).allowed).toBe(true);
  });
});

describe('requireAdmin checks the key, not just its owner', () => {
  function run(perms: string[]) {
    let status: number | null = null;
    let nexted = false;
    const res = { status(c: number) { status = c; return this; }, json() { return this; } };
    requireAdmin(
      { user: { id: 'u', username: 'admin', role: 'admin' }, authMethod: 'apikey', apiKeyPermissions: perms,
        ip: '127.0.0.1', path: '/x', get: () => undefined } as never,
      res as never,
      () => { nexted = true; },
    );
    return { status, nexted };
  }
  it('refuses a read key owned by the admin', () => expect(run(['read'])).toEqual({ status: 403, nexted: false }));
  it("allows an 'admin' key and a '*' key", () => {
    expect(run(['admin']).nexted).toBe(true);
    expect(run(['*']).nexted).toBe(true);
  });
});

describe('policy defaults', () => {
  it('an unknown write route defaults to admin, an unknown read to read', () => {
    expect(apiKeyNeed('POST', '/something-new')).toBe('admin');
    expect(apiKeyNeed('DELETE', '/something-new/1')).toBe('admin');
    expect(apiKeyNeed('GET', '/something-new')).toBe('read');
  });
});

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
      // Stands in for a database error while the key is looked up.
      if (k === 'lnog_kl_db_down_000000000000000000000000000000') return Promise.reject(new Error('database is locked'));
      if (!memo.has(k)) memo.set(k, real.resolveApiKeyCached(req, k));
      return memo.get(k)!;
    },
  };
});

// createMCPServer is the real one, wrapped so a test can see which user the
// MCP stream route hands it (whatever MCP creates belongs to that user).
vi.mock('../mcp/server.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mcp/server.js')>();
  return { ...real, createMCPServer: vi.fn(real.createMCPServer) };
});

import express, { Express, Router } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';
import http from 'node:http';
import { createUser, createApiKey, generateTokenPair, getApiKeys, validateApiKey, deactivateUser, updateUserRole, revokeApiKey } from '../auth/auth.js';
import { apiKeyGate, resetDenialRowsForTest, DENIAL_ROW_WINDOW_MS } from '../auth/api-key-gate.js';
import { requireAdmin } from '../auth/middleware.js';
import { apiKeyNeed, decideApiKey, keyHasNeed, effectiveKeyPermissions, permissionsAboveOwner, permissionNameForNeed } from '../auth/key-policy.js';
import { mayUseScripts } from '../auth/alert-action-guard.js';
import { API_ROUTERS, mountApiRoutes } from './mount.js';
import { closeDatabase, getSQLiteDB } from '../db/sqlite.js';
import { createAlertHistoryEntry } from '../db/sqlite-alerts.js';
import { recordReportRun } from '../db/sqlite-report-runs.js';
import { createDashboardTemplate, getDashboard } from '../db/sqlite-dashboards.js';
import { getAlert } from '../db/sqlite-alerts.js';
import { ALERT_TEMPLATES } from '../data/alert-templates.js';
import { createMCPServer } from '../mcp/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

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
  'POST /search/query', 'POST /search/parse',
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
  'POST /search/query', 'POST /search/parse', 'GET /search/fields', 'GET /search/fields/discover',
  'GET /search/fields/kl-none/values', 'GET /search/logs/kl-none/full-message', 'GET /search/logs/kl-none/context',
  'GET /stats/overview', 'GET /stats/timeseries', 'GET /stats/severity', 'GET /stats/indexes',
  'GET /stats/indexes/details', 'GET /stats/indexes/kl-none/fields', 'GET /stats/sources', 'GET /stats/storage',
  'GET /agent', 'POST /agent/search', 'GET /agent/summary', 'GET /agent/indexes', 'GET /agent/fields',
  'GET /auth/me', 'POST /reports/generate',
]);

/** Changes that need an admin key even though they sit under /alerts or /dashboards. */
const ADMIN_CHANGES = new Set([
  'POST /alerts/evaluate-all', // runs every user's alerts, script actions included
  'POST /dashboards/kl-none/share', 'PUT /dashboards/kl-none/share', 'DELETE /dashboards/kl-none/share', // public link
]);

/** Ingest routes (alert pop-ups, which carry any index) that need an unscoped key with read as well as write. */
const INGEST_UNSCOPED = new Set(['GET /ingest/notifications', 'POST /ingest/notifications/kl-none/ack']);

const isPublic = (r: RouteRow) => PUBLIC.has(key(r));
const isIngest = (r: RouteRow) => INGEST.has(key(r));
const isAlertChange = (r: RouteRow) =>
  r.method !== 'GET' &&
  !READ_POSTS.has(key(r)) &&
  !ADMIN_CHANGES.has(key(r)) &&
  (/^\/(alerts|silences)(\/|$)/.test(r.path) || /^\/agent\/alerts(\/|$)/.test(r.path) ||
    /^\/saved-searches\/[^/]+\/create-alert$/.test(r.path));
const isDashboardChange = (r: RouteRow) =>
  r.method !== 'GET' &&
  !READ_POSTS.has(key(r)) &&
  !ADMIN_CHANGES.has(key(r)) &&
  ((/^\/dashboards(\/|$)/.test(r.path) && !isPublic(r)) || /^\/saved-searches\/[^/]+\/create-panel$/.test(r.path));
const isRead = (r: RouteRow) =>
  !isPublic(r) && !isIngest(r) &&
  (r.method === 'GET' ? !ADMIN_GET_PREFIXES.some((p) => r.path.startsWith(p)) : READ_POSTS.has(key(r)));

// ---------------------------------------------------------------------------
// Keys and apps.
// ---------------------------------------------------------------------------
// This file sends thousands of requests. superagent opens a new connection for
// each one by default, and on macOS the closed ones sit in TIME_WAIT until the
// ~16k ephemeral ports run out (ETIMEDOUT, seen as a 1-in-10 flake when other
// test runs share the machine). Every request here goes through one keep-alive
// agent instead.
const keepAlive = new http.Agent({ keepAlive: true, maxSockets: 8 });
const request = (app: Parameters<typeof supertest>[0]): ReturnType<typeof supertest> =>
  new Proxy(supertest(app), {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const out = value.apply(target, args);
        return out && typeof out.agent === 'function' ? out.agent(keepAlive) : out;
      };
    },
  });

const K: Record<string, string> = {};
let jwtAdmin = '';
let klAdminId = '';
let gateApp: Express; // the gate in front of a stub that answers 299
let realApp: Express; // the gate + every real router
// One listening server per app: thousands of supertest(app) calls would each
// open (and leave in TIME_WAIT) their own ephemeral server and port.
// They listen on the IPv6 loopback ::1 only. supertest(app) in the other test
// files listens on the wildcard address and connects to 127.0.0.1; macOS lets
// a 127.0.0.1-only server share that port, and then it receives the other
// file's requests (the likely cause of rare stray answers in other files).
// Nobody else connects to ::1, so these servers never take another's request.
let gateServer: Server;
let realServer: Server;
let gateSrv = ''; // base URL of gateServer
let realSrv = ''; // base URL of realServer

const REFUSED = 'API key lacks required permissions';

beforeAll(async () => {
  const admin = await createUser('kl-admin', 'kl-admin@example.invalid', 'kl-admin-test-pass-1', 'admin');
  klAdminId = admin.id;
  const mk = async (name: string, perms: string[], indexes?: string[]) =>
    (await createApiKey(admin.id, name, perms, undefined, indexes)).apiKey;
  K.ingest = await mk('ingest only', ['write']);
  K.ingestScoped = await mk('ingest money', ['write'], ['money']);
  K.read = await mk('read only', ['read']);
  K.readScoped = await mk('board numbers', ['read'], ['uptime', 'directors-palette']);
  K.search = await mk('dp style', ['write', 'search', 'read']);
  // alerts:write / dashboards:write only count together with read (an alert or
  // panel runs searches and sends or shows the rows), so the working keys are
  // read + X, and the X-only keys are refused everywhere.
  K.alerts = await mk('alerts writer', ['read', 'alerts:write']);
  K.dashboards = await mk('dashboards writer', ['read', 'dashboards:write']);
  K.alertsOnly = await mk('alerts write only', ['alerts:write']);
  K.dashboardsOnly = await mk('dashboards write only', ['dashboards:write']);
  K.admin = await mk('admin key', ['admin']);
  K.alertsRw = await mk('alerts reader-writer', ['read', 'alerts:write']);
  K.searchAlerts = await mk('search + alerts writer', ['search', 'alerts:write']);
  K.searchDashboards = await mk('search + dashboards writer', ['search', 'dashboards:write']);
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

  const listen = async (app: Express) => {
    const srv = app.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    // Node closes an idle keep-alive socket after 5 s; a request the client
    // sends on it at that moment fails. Keep idle sockets open for the run.
    srv.keepAliveTimeout = 10 * 60_000;
    srv.headersTimeout = 10 * 60_000 + 1_000;
    return srv;
  };
  gateServer = await listen(gateApp);
  realServer = await listen(realApp);
  gateSrv = `http://[::1]:${(gateServer.address() as AddressInfo).port}`;
  realSrv = `http://[::1]:${(realServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  keepAlive.destroy();
  gateServer.closeAllConnections();
  realServer.closeAllConnections();
  await new Promise((r) => gateServer.close(r));
  await new Promise((r) => realServer.close(r));
  closeDatabase();
});

async function hit(app: string, r: RouteRow, headers: Record<string, string>) {
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
    for (const k of [...INGEST, ...READ_POSTS, ...SCOPED_READS, ...ADMIN_CHANGES, ...INGEST_UNSCOPED]) expect(ROUTES.some((r) => key(r) === k), k).toBe(true);
  });
});

describe('key lock: every route x every kind of key', () => {
  it('an ingest-only key can only ingest (alert pop-ups need read as well)', async () => {
    const m = await refusedMap(K.ingest);
    expect(mismatches(m, (r) => !isPublic(r) && (!isIngest(r) || INGEST_UNSCOPED.has(key(r))))).toEqual([]);
  });

  it('an index-scoped ingest key can only ingest (and gets no alert pop-ups)', async () => {
    const m = await refusedMap(K.ingestScoped);
    expect(mismatches(m, (r) => !isPublic(r) && (!isIngest(r) || INGEST_UNSCOPED.has(key(r))))).toEqual([]);
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

  it('a read + alerts:write key reads and changes alerts and silences only', async () => {
    const m = await refusedMap(K.alerts);
    expect(mismatches(m, (r) => !isPublic(r) && !isAlertChange(r) && !isRead(r))).toEqual([]);
  });

  it('a read + dashboards:write key reads and changes dashboards only', async () => {
    const m = await refusedMap(K.dashboards);
    expect(mismatches(m, (r) => !isPublic(r) && !isDashboardChange(r) && !isRead(r))).toEqual([]);
  });

  it('alerts:write or dashboards:write WITHOUT read is refused everywhere (an alert or panel would send it any index)', async () => {
    for (const k of [K.alertsOnly, K.dashboardsOnly]) {
      const m = await refusedMap(k);
      expect(mismatches(m, (r) => !isPublic(r))).toEqual([]);
    }
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
    const list = await request(realSrv).get('/alerts').set(h);
    expect(list.status, list.text).toBe(200);
    const made = await request(realSrv).post('/alerts').set(h).send({ name: 'jwt rule', search_query: 'search *' });
    expect(made.status, made.text).toBe(201);
    const keys = await request(realSrv).get('/auth/api-keys').set(h);
    expect(keys.status, keys.text).toBe(200);
  });

  it('the MCP stream needs an unscoped admin key (header or query param)', async () => {
    const viaQuery = await request(realSrv).get(`/mcp/sse?api_key=${encodeURIComponent(K.read)}`);
    expect(viaQuery.status).toBe(403);
    expect(decideApiKey('GET', '/mcp/sse', ['read'], null).allowed).toBe(false);
    expect(decideApiKey('GET', '/mcp/sse', ['admin'], ['money']).allowed).toBe(false);
    expect(decideApiKey('GET', '/mcp/sse', ['admin'], null).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Path tricks (critic round 1 on 50495d9). Express routes paths
// case-insensitively and tolerates repeated slashes, and a dashboard route's
// ":id" can be the word "public". Each spelling must get the same answer as
// the plain one.
// ---------------------------------------------------------------------------
const variants = (p: string) => ({
  upper: p.toUpperCase(),
  doubled: p.replace(/\//g, '//'),
  trailing: p + '/',
  mixed: p.split('/').map((seg, i) => (i % 2 ? seg.toUpperCase() : seg)).join('/'),
});

describe('key lock: other spellings of every route get the same answer', () => {
  for (const kind of ['read', 'ingest', 'readScoped'] as const) {
    it(`${kind} key: UPPER-case, doubled slashes, trailing slash and MiXeD case`, async () => {
      const plain = await refusedMap(K[kind]);
      const wrong: string[] = [];
      for (const r of ROUTES) {
        if (r.path === '/') continue;
        for (const [name, path] of Object.entries(variants(r.path))) {
          const res = await hit(gateSrv, { method: r.method, path }, { Authorization: `ApiKey ${K[kind]}` });
          const refused = res.status === 403 && res.body.error === REFUSED;
          if (refused !== plain.get(key(r))) wrong.push(`${r.method} ${path} (${name}) -> ${refused ? 'refused' : 'allowed'}`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }

  it('every dashboard change is checked the same when its id is the word "public"', async () => {
    const dashRoutes = ROUTES.filter((r) => r.path.startsWith('/dashboards/kl-none/'));
    expect(dashRoutes.length).toBeGreaterThan(20);
    const wrong: string[] = [];
    for (const kind of ['read', 'ingest', 'dashboards'] as const) {
      for (const r of dashRoutes) {
        const pub = { method: r.method, path: r.path.replace('/dashboards/kl-none/', '/dashboards/public/') };
        // GET /dashboards/public/<one word> and POST .../<one word>/query are the
        // share link itself: Express sends them to the share handlers (registered
        // first in dashboards.ts), never to /:id/... (proven on the real router below).
        if ((pub.method === 'GET' && /^\/dashboards\/public\/[^/]+$/.test(pub.path))
          || (pub.method === 'POST' && /^\/dashboards\/public\/[^/]+\/query$/.test(pub.path))) continue;
        const h = { Authorization: `ApiKey ${K[kind]}` };
        const a = await hit(gateSrv, r, h);
        const b = await hit(gateSrv, pub, h);
        if ((a.status === 403) !== (b.status === 403)) wrong.push(`${kind}: ${key(pub)} -> ${b.status}, ${key(r)} -> ${a.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('path tricks on the real routers', () => {
  it('upper-case and doubled-slash admin reads are refused to a read key (and do reach the handler for an admin key)', async () => {
    const asRead = { Authorization: `ApiKey ${K.read}` };
    const asSearch = { Authorization: `ApiKey ${K.search}` };
    for (const p of ['/AUTH/API-KEYS', '/Auth/Api-Keys', '/auth//api-keys', '//auth/api-keys', '/SYNTHETIC/TESTS',
      '/NOTIFICATIONS/CHANNELS', '/DEMO/STATS', '/DEMO/export', '/SETTINGS/SYSTEM']) {
      const a = await request(realSrv).get(p).set(asRead);
      expect(a.status, `read ${p}`).toBe(403);
      expect(a.body.error, p).toBe(REFUSED);
      expect((await request(realSrv).get(p).set(asSearch)).status, `dp-style ${p}`).toBe(403);
    }
    expect((await request(realSrv).head('/AUTH/API-KEYS').set(asRead)).status).toBe(403);
    // Proof the trick is real: Express sends these spellings to the handler.
    expect((await request(realSrv).get('/AUTH/API-KEYS').set('Authorization', `ApiKey ${K.admin}`)).status).toBe(200);
  });

  it('read and ingest keys cannot change dashboard parts through /dashboards/public/...', async () => {
    const jwt = { Authorization: `Bearer ${jwtAdmin}` };
    const dash = (await request(realSrv).post('/dashboards').set(jwt).send({ name: 'kl public trick' })).body;
    const v = await request(realSrv).post(`/dashboards/${dash.id}/variables`).set(jwt).send({ name: 'host', type: 'custom', custom_values: 'a,b' });
    expect(v.status).toBe(201);
    const pg = await request(realSrv).post(`/dashboards/${dash.id}/pages`).set(jwt).send({ name: 'Page two' });
    expect(pg.status).toBe(201);

    const tries: Array<[string, 'put' | 'delete', string]> = [
      [K.read, 'delete', `/dashboards/public/variables/${v.body.id}`],
      [K.read, 'put', `/dashboards/public/variables/${v.body.id}`],
      [K.ingest, 'put', `/dashboards/public/pages/${pg.body.id}`],
      [K.ingestScoped, 'delete', `/dashboards/public/pages/${pg.body.id}`],
      [K.search, 'delete', `/DASHBOARDS/PUBLIC/pages/${pg.body.id}`],
    ];
    for (const [k, m, p] of tries) {
      const res = await request(realSrv)[m](p).set('Authorization', `ApiKey ${k}`).send({ name: 'renamed' });
      expect(res.status, `${m.toUpperCase()} ${p}`).toBe(403);
    }
    const vars = (await request(realSrv).get(`/dashboards/${dash.id}/variables`).set(jwt)).body as Array<{ id: string }>;
    const pages = (await request(realSrv).get(`/dashboards/${dash.id}/pages`).set(jwt)).body as Array<{ id: string; name: string }>;
    expect(vars.map((x) => x.id)).toContain(v.body.id);
    expect(pages.find((x) => x.id === pg.body.id)?.name).toBe('Page two');
  });

  it('GET /dashboards/public/<word> is the share-link lookup, not a dashboard read', async () => {
    const jwt = { Authorization: `Bearer ${jwtAdmin}` };
    const dash = (await request(realSrv).post('/dashboards').set(jwt).send({ name: 'kl share route' })).body;
    expect((await request(realSrv).post(`/dashboards/${dash.id}/pages`).set(jwt).send({ name: 'P' })).status).toBe(201);
    for (const word of ['variables', 'pages', 'annotations', 'logos']) {
      const res = await request(realSrv).get(`/dashboards/public/${word}`).set('Authorization', `ApiKey ${K.ingest}`);
      expect(res.status, word).toBe(404); // no share token called "${word}"
      expect(Array.isArray(res.body), word).toBe(false);
    }
  });

  it('the share link stays public for every method it has (and only those)', () => {
    expect(apiKeyNeed('GET', '/dashboards/public/abc123')).toBe('none');
    expect(apiKeyNeed('POST', '/dashboards/public/abc123/query')).toBe('none');
    expect(apiKeyNeed('DELETE', '/dashboards/public/abc123')).toBe('dashboards:write');
    expect(apiKeyNeed('PUT', '/dashboards/public/pages/p1')).toBe('dashboards:write');
    expect(apiKeyNeed('GET', '/dashboards/public/variables/v1')).toBe('read');
  });

  it('AI search (spends LLM money) needs an admin key, like /ai/*', async () => {
    const res = await request(realSrv).post('/search/ai').set('Authorization', `ApiKey ${K.read}`).send({ prompt: 'errors' });
    expect(res.status).toBe(403);
    expect(res.body.needed).toBe('admin');
    expect(decideApiKey('POST', '/search/ai', ['read'], ['uptime']).allowed).toBe(false);
  });

  it('the MCP stream key check also holds for /MCP/SSE', async () => {
    const res = await request(realSrv).get(`/MCP/SSE?api_key=${encodeURIComponent(K.read)}`);
    expect(res.status).toBe(403);
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

// ---------------------------------------------------------------------------
// Critic round 2 on 7ca2889: script actions, public share links, action
// secrets, a gate that failed open, and alert pop-ups for scoped keys.
// ---------------------------------------------------------------------------
describe('round 3: script actions need an admin key on every route that writes actions', () => {
  const script = [{ type: 'script', config: { command: 'echo kl' } }];
  let scriptAlertId = '';
  let userJwt = '';

  beforeAll(async () => {
    const made = await request(realSrv)
      .post('/alerts')
      .set('Authorization', `ApiKey ${K.admin}`)
      .send({ name: 'kl script alert', search_query: 'search *', actions: script, enabled: false });
    expect(made.status).toBe(201);
    scriptAlertId = made.body.id;
    const u = await createUser('kl-user', 'kl-user@example.invalid', 'kl-user-test-pass-1', 'user');
    userJwt = (await generateTokenPair(u)).accessToken;
  });

  it('an alerts:write key cannot attach a script anywhere; an admin key and a browser admin can', async () => {
    const a = { Authorization: `ApiKey ${K.alerts}` };
    const body = { name: 'kl s', search_query: 'search *', actions: script };
    const plain = (await request(realSrv).post('/alerts').set(a).send({ name: 'kl plain', search_query: 'search *' })).body;
    const ss = (await request(realSrv).post('/saved-searches').set('Authorization', `Bearer ${jwtAdmin}`)
      .send({ name: 'kl saved', query: 'search *' })).body;
    expect(ss.id).toBeTruthy();

    const tries = [
      await request(realSrv).post('/alerts').set(a).send(body),
      await request(realSrv).put(`/alerts/${plain.id}`).set(a).send({ actions: script }),
      await request(realSrv).post('/agent/alerts').set(a).send(body),
      await request(realSrv).patch(`/agent/alerts/${plain.id}`).set(a).send({ actions: script }),
      await request(realSrv).post(`/saved-searches/${ss.id}/create-alert`).set(a).send({ actions: script }),
    ];
    for (const t of tries) {
      expect(t.status, t.text).toBe(403);
      expect(t.body.error).toMatch(/admin/);
    }
    const stored = (await request(realSrv).get(`/alerts/${plain.id}`).set('Authorization', `Bearer ${jwtAdmin}`)).body;
    expect(stored.actions).toEqual([]);

    expect((await request(realSrv).post('/agent/alerts').set('Authorization', `ApiKey ${K.admin}`).send(body)).status).toBe(201);
    expect((await request(realSrv).post('/alerts').set('Authorization', `Bearer ${jwtAdmin}`).send(body)).status).toBe(201);
  });

  it('a non-admin browser user cannot attach a script through a saved search either', async () => {
    const ss = (await request(realSrv).post('/saved-searches').set('Authorization', `Bearer ${userJwt}`)
      .send({ name: 'kl user saved', query: 'search *' })).body;
    expect(ss.id).toBeTruthy();
    const res = await request(realSrv).post(`/saved-searches/${ss.id}/create-alert`)
      .set('Authorization', `Bearer ${userJwt}`).send({ actions: script });
    expect(res.status).toBe(403);
  });

  it('an alert that already runs a script cannot be changed, run, switched or deleted by an alerts:write key', async () => {
    const a = { Authorization: `ApiKey ${K.alerts}` };
    const tries = [
      await request(realSrv).put(`/alerts/${scriptAlertId}`).set(a).send({ name: 'renamed' }),
      await request(realSrv).post(`/alerts/${scriptAlertId}/toggle`).set(a).send({}),
      await request(realSrv).post(`/alerts/${scriptAlertId}/evaluate`).set(a).send({}),
      await request(realSrv).delete(`/alerts/${scriptAlertId}`).set(a),
      await request(realSrv).patch(`/agent/alerts/${scriptAlertId}`).set(a).send({ name: 'renamed' }),
      await request(realSrv).post(`/agent/alerts/${scriptAlertId}/evaluate`).set(a).send({}),
      await request(realSrv).delete(`/agent/alerts/${scriptAlertId}`).set(a),
    ];
    for (const t of tries) expect(t.status, t.text).toBe(403);
    const stored = (await request(realSrv).get(`/alerts/${scriptAlertId}`).set('Authorization', `Bearer ${jwtAdmin}`)).body;
    expect(stored.name).toBe('kl script alert');
    expect(stored.enabled).toBeFalsy();
    // the admin key still can
    expect((await request(realSrv).post(`/alerts/${scriptAlertId}/toggle`).set('Authorization', `ApiKey ${K.admin}`).send({})).status).toBe(200);
    expect((await request(realSrv).post(`/alerts/${scriptAlertId}/toggle`).set('Authorization', `ApiKey ${K.admin}`).send({})).status).toBe(200);
  });

  it('running every alert at once needs an admin key', async () => {
    const res = await request(realSrv).post('/alerts/evaluate-all').set('Authorization', `ApiKey ${K.alerts}`).send({});
    expect(res.status).toBe(403);
    expect(res.body.needed).toBe('admin');
  });
});

describe('round 3: action secrets are hidden from keys without admin', () => {
  const URL_ = 'https://hooks.example.invalid/services/kl-secret-path';
  const HEADERS = { Authorization: 'Bearer kl-secret-header' };
  let id = '';
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });

  beforeAll(async () => {
    const made = await request(realSrv).post('/alerts').set(jwt()).send({
      name: 'kl webhook alert', search_query: 'search *', enabled: false,
      actions: [{ type: 'webhook', config: { url: URL_, method: 'POST', headers: HEADERS } }],
    });
    expect(made.status).toBe(201);
    id = made.body.id;
    createAlertHistoryEntry(id, 1, 'high', {
      actions_executed: [{ type: 'webhook', success: true, message: `Webhook POST ${URL_} - 200` }],
    });
  });

  it('read, read+alerts:write and DP-style keys see [hidden]; admin keys and browsers see the values', async () => {
    for (const k of [K.read, K.alertsRw, K.search]) {
      const h = { Authorization: `ApiKey ${k}` };
      const bodies = [
        (await request(realSrv).get('/alerts').set(h)).body,
        (await request(realSrv).get(`/alerts/${id}`).set(h)).body,
        (await request(realSrv).get('/agent/alerts').set(h)).body,
        (await request(realSrv).get(`/agent/alerts/${id}`).set(h)).body,
        (await request(realSrv).get('/alerts/history').set(h)).body,
        (await request(realSrv).get(`/alerts/${id}/history`).set(h)).body,
      ];
      const text = JSON.stringify(bodies);
      expect(text).not.toContain('kl-secret');
      expect(text).toContain('[hidden]');
      const one = (await request(realSrv).get(`/alerts/${id}`).set(h)).body;
      expect(one.actions[0].config).toEqual({ url: '[hidden]', method: 'POST', headers: '[hidden]' });
    }
    for (const h of [jwt(), { Authorization: `ApiKey ${K.admin}` }]) {
      const one = (await request(realSrv).get(`/alerts/${id}`).set(h)).body;
      expect(one.actions[0].config.url).toBe(URL_);
      const hist = (await request(realSrv).get(`/alerts/${id}/history`).set(h)).body;
      expect(JSON.stringify(hist)).toContain('kl-secret-path');
    }
  });

  it('sending a hidden alert back keeps the stored secrets', async () => {
    const h = { Authorization: `ApiKey ${K.alertsRw}` };
    const got = (await request(realSrv).get(`/alerts/${id}`).set(h)).body;
    const put = await request(realSrv).put(`/alerts/${id}`).set(h).send({ name: 'kl webhook alert 2', actions: got.actions });
    expect(put.status, put.text).toBe(200);
    expect(JSON.stringify(put.body)).not.toContain('kl-secret');
    const patch = await request(realSrv).patch(`/agent/alerts/${id}`).set(h).send({ actions: got.actions });
    expect(patch.status, patch.text).toBe(200);
    const stored = (await request(realSrv).get(`/alerts/${id}`).set(jwt())).body;
    expect(stored.name).toBe('kl webhook alert 2');
    expect(stored.actions[0].config).toEqual({ url: URL_, method: 'POST', headers: HEADERS });
  });

  it('a key cannot keep the hidden headers while pointing the webhook somewhere else', async () => {
    const h = { Authorization: `ApiKey ${K.alertsRw}` };
    const evil = [{ type: 'webhook', config: { url: 'https://evil.example.invalid/', method: 'POST', headers: '[hidden]' } }];
    for (const t of [
      await request(realSrv).put(`/alerts/${id}`).set(h).send({ actions: evil }),
      await request(realSrv).patch(`/agent/alerts/${id}`).set(h).send({ actions: evil }),
      // a hidden value in a NEW place has nothing to keep
      await request(realSrv).put(`/alerts/${id}`).set(h).send({ actions: [{ type: 'log', config: {} }, ...evil] }),
      await request(realSrv).post('/alerts').set(h).send({ name: 'kl copy', search_query: 'search *', actions: evil }),
      await request(realSrv).post('/agent/alerts').set(h).send({ name: 'kl copy', search_query: 'search *', actions: evil }),
    ]) {
      expect(t.status, t.text).toBe(400);
    }
    const stored = (await request(realSrv).get(`/alerts/${id}`).set(jwt())).body;
    expect(stored.actions).toHaveLength(1);
    expect(stored.actions[0].config).toEqual({ url: URL_, method: 'POST', headers: HEADERS });
  });

  it('a key can still replace every secret of an action outright', async () => {
    const h = { Authorization: `ApiKey ${K.alertsRw}` };
    const fresh = [{ type: 'webhook', config: { url: 'https://new.example.invalid/x', method: 'POST' } }];
    const res = await request(realSrv).put(`/alerts/${id}`).set(h).send({ actions: fresh });
    expect(res.status, res.text).toBe(200);
    const stored = (await request(realSrv).get(`/alerts/${id}`).set(jwt())).body;
    expect(stored.actions[0].config.url).toBe('https://new.example.invalid/x');
    // stored headers the caller did not mention are kept only on a hidden round trip, not here
    expect(stored.actions[0].config.headers).toBeUndefined();
  });
});

describe('round 3: public share links and dashboard parts', () => {
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });
  const dk = () => ({ Authorization: `ApiKey ${K.dashboards}` });

  it('a dashboards:write key cannot share a dashboard; an admin key can', async () => {
    const d = (await request(realSrv).post('/dashboards').set(dk()).send({ name: 'kl share me' })).body;
    expect(d.id).toBeTruthy();
    const no = await request(realSrv).post(`/dashboards/${d.id}/share`).set(dk()).send({});
    expect(no.status).toBe(403);
    expect(no.body.needed).toBe('admin');
    expect((await request(realSrv).put(`/dashboards/${d.id}/share`).set(dk()).send({ is_public: true })).status).toBe(403);
    const stored = (await request(realSrv).get(`/dashboards/${d.id}`).set(jwt())).body;
    expect(stored.is_public).toBeFalsy();
    expect((await request(realSrv).post(`/dashboards/${d.id}/share`).set('Authorization', `ApiKey ${K.admin}`).send({})).status).toBe(200);
  });

  it('a dashboards:write key cannot change what an already shared dashboard shows', async () => {
    const d = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl shared' })).body;
    const p = (await request(realSrv).post(`/dashboards/${d.id}/panels`).set(jwt()).send({ title: 'kl', query: 'search index=uptime' })).body;
    expect(p.id).toBeTruthy();
    expect((await request(realSrv).post(`/dashboards/${d.id}/share`).set(jwt()).send({})).status).toBe(200);
    const tries = [
      await request(realSrv).put(`/dashboards/${d.id}/panels/${p.id}`).set(dk()).send({ query: 'search index=money' }),
      await request(realSrv).post(`/dashboards/${d.id}/panels`).set(dk()).send({ title: 'x', query: 'search index=money' }),
      await request(realSrv).put(`/dashboards/${d.id}`).set(dk()).send({ name: 'renamed' }),
      await request(realSrv).delete(`/dashboards/${d.id}`).set(dk()),
    ];
    for (const t of tries) expect(t.status, t.text).toBe(403);
    const panels = (await request(realSrv).get(`/dashboards/${d.id}`).set(jwt())).body.panels as Array<{ id: string; query: string }>;
    expect(panels.find((x) => x.id === p.id)?.query).toBe('search index=uptime');
    expect(panels).toHaveLength(1);
    // copying it into a new (unshared) dashboard is fine, and so is a browser admin
    expect((await request(realSrv).post(`/dashboards/${d.id}/duplicate`).set(dk()).send({})).status).toBeLessThan(300);
    expect((await request(realSrv).put(`/dashboards/${d.id}/panels/${p.id}`).set(jwt()).send({ title: 'ok' })).status).toBe(200);
  });

  it("a user cannot reach someone else's dashboard parts through their own (or a missing) dashboard", async () => {
    const u = await createUser('kl-user2', 'kl-user2@example.invalid', 'kl-user2-test-pass-1', 'user');
    const uj = { Authorization: `Bearer ${(await generateTokenPair(u)).accessToken}` };
    const mine = (await request(realSrv).post('/dashboards').set(uj).send({ name: 'kl mine' })).body;
    const theirs = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl theirs' })).body;
    const v = (await request(realSrv).post(`/dashboards/${theirs.id}/variables`).set(jwt()).send({ name: 'host', type: 'custom', custom_values: 'a,b' })).body;
    const pg = (await request(realSrv).post(`/dashboards/${theirs.id}/pages`).set(jwt()).send({ name: 'Theirs' })).body;
    const p = (await request(realSrv).post(`/dashboards/${theirs.id}/panels`).set(jwt()).send({ title: 'theirs', query: 'search *' })).body;
    const a = (await request(realSrv).post(`/dashboards/${theirs.id}/annotations`).set(jwt()).send({ timestamp: new Date().toISOString(), title: 'theirs' })).body;
    expect([v.id, pg.id, p.id, a.id].every(Boolean)).toBe(true);

    for (const via of [mine.id, 'kl-no-such-dashboard']) {
      const tries = [
        await request(realSrv).delete(`/dashboards/${via}/variables/${v.id}`).set(uj),
        await request(realSrv).put(`/dashboards/${via}/variables/${v.id}`).set(uj).send({ name: 'pwned' }),
        await request(realSrv).put(`/dashboards/${via}/pages/${pg.id}`).set(uj).send({ name: 'pwned' }),
        await request(realSrv).delete(`/dashboards/${via}/pages/${pg.id}`).set(uj),
        await request(realSrv).put(`/dashboards/${via}/panels/${p.id}`).set(uj).send({ title: 'pwned' }),
        await request(realSrv).delete(`/dashboards/${via}/panels/${p.id}`).set(uj),
        await request(realSrv).delete(`/dashboards/${via}/annotations/${a.id}`).set(uj),
      ];
      for (const t of tries) expect(t.status, `${via}: ${t.text}`).toBe(404);
    }
    const full = (await request(realSrv).get(`/dashboards/${theirs.id}`).set(jwt())).body;
    expect(full.panels.map((x: { id: string; title: string }) => [x.id, x.title])).toEqual([[p.id, 'theirs']]);
    const vars = (await request(realSrv).get(`/dashboards/${theirs.id}/variables`).set(jwt())).body as Array<{ id: string; name: string }>;
    expect(vars.find((x) => x.id === v.id)?.name).toBe('host');
    const pages = (await request(realSrv).get(`/dashboards/${theirs.id}/pages`).set(jwt())).body as Array<{ id: string; name: string }>;
    expect(pages.find((x) => x.id === pg.id)?.name).toBe('Theirs');
    const ann = (await request(realSrv).get(`/dashboards/${theirs.id}/annotations`).set(jwt())).body as Array<{ id: string }>;
    expect(ann.map((x) => x.id)).toContain(a.id);
  });

  it("a layout change can only move this dashboard's own panels", async () => {
    const theirs = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl layout theirs' })).body;
    const p = (await request(realSrv).post(`/dashboards/${theirs.id}/panels`).set(jwt()).send({ title: 'theirs', query: 'search *' })).body;
    expect((await request(realSrv).post(`/dashboards/${theirs.id}/share`).set(jwt()).send({})).status).toBe(200);
    const before = (await request(realSrv).get(`/dashboards/${theirs.id}`).set(jwt())).body.panels[0];
    const mine = (await request(realSrv).post('/dashboards').set(dk()).send({ name: 'kl layout mine' })).body;
    const mp = (await request(realSrv).post(`/dashboards/${mine.id}/panels`).set(dk()).send({ title: 'mine', query: 'search *' })).body;
    const move = [{ panelId: p.id, x: 99, y: 99, w: 1, h: 1 }];
    const res = await request(realSrv).put(`/dashboards/${mine.id}/layout`).set(dk()).send({ layout: move });
    expect(res.status, res.text).toBe(404);
    const after = (await request(realSrv).get(`/dashboards/${theirs.id}`).set(jwt())).body.panels[0];
    expect([after.position_x, after.position_y, after.width, after.height]).toEqual([before.position_x, before.position_y, before.width, before.height]);
    // its own panels still move
    const ok = await request(realSrv).put(`/dashboards/${mine.id}/layout`).set(dk()).send({ layout: [{ panelId: mp.id, x: 2, y: 3, w: 4, h: 5 }] });
    expect(ok.status, ok.text).toBe(200);
    const moved = (await request(realSrv).get(`/dashboards/${mine.id}`).set(jwt())).body.panels[0];
    expect([moved.position_x, moved.position_y, moved.width, moved.height]).toEqual([2, 3, 4, 5]);
  });

  // One private dashboard (owned by the browser admin) with a panel and every
  // kind of part, a copy of its panel on a dashboard everyone can read, and a
  // non-admin user with a browser session and a read + dashboards:write key.
  describe("a private dashboard stays private (each fix has its own test)", () => {
    const c = {} as {
      uj: Record<string, string>; uk: Record<string, string>;
      priv: { id: string }; p: { id: string }; shared: { id: string }; mine: { id: string }; copyId: string;
    };
    beforeAll(async () => {
      const u = await createUser('kl-user4', 'kl-user4@example.invalid', 'kl-user4-test-pass-1', 'user');
      c.uj = { Authorization: `Bearer ${(await generateTokenPair(u)).accessToken}` };
      c.uk = { Authorization: `ApiKey ${(await createApiKey(u.id, 'kl user4 key', ['read', 'dashboards:write'])).apiKey}` };
      c.priv = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl private' })).body;
      expect((await request(realSrv).put(`/dashboards/${c.priv.id}`).set(jwt()).send({ visibility: 'private' })).status).toBe(200);
      c.p = (await request(realSrv).post(`/dashboards/${c.priv.id}/panels`).set(jwt()).send({ title: 'kl-private-panel', query: 'search index=money kl-private-query' })).body;
      expect((await request(realSrv).post(`/dashboards/${c.priv.id}/variables`).set(jwt()).send({ name: 'kl_private_var', type: 'custom', custom_values: 'kl-private-a,b' })).status).toBe(201);
      expect((await request(realSrv).post(`/dashboards/${c.priv.id}/pages`).set(jwt()).send({ name: 'kl-private-page' })).status).toBe(201);
      expect((await request(realSrv).post(`/dashboards/${c.priv.id}/annotations`).set(jwt()).send({ timestamp: new Date().toISOString(), title: 'kl-private-note' })).status).toBe(201);
      expect((await request(realSrv).post(`/dashboards/${c.priv.id}/logos`).set(jwt()).send({ logo_url: 'https://example.invalid/kl-private-logo.png', label: 'kl-private-logo' })).status).toBeLessThan(300);
      // the admin's own copy of the panel onto a readable dashboard, so its provenance points at the private one
      c.shared = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl shared target' })).body;
      const adminCopy = await request(realSrv).post(`/dashboards/${c.shared.id}/panels/copy`).set(jwt()).send({ sourcePanelId: c.p.id });
      expect(adminCopy.status, adminCopy.text).toBe(201);
      c.copyId = adminCopy.body.panel.id;
      c.mine = (await request(realSrv).post('/dashboards').set(c.uj).send({ name: 'kl user4 own' })).body;
    });

    it("its variables, pages, annotations and logos answer 404 to a user who cannot open it", async () => {
      for (const who of [c.uj, c.uk]) {
        for (const sub of ['', '/variables', '/pages', '/annotations', '/logos', `/panels/${c.p.id}/provenance`]) {
          const res = await request(realSrv).get(`/dashboards/${c.priv.id}${sub}`).set(who);
          expect(res.status, `GET ${sub}: ${res.text}`).toBe(404);
          expect(res.text).not.toContain('kl-private');
        }
      }
    });

    it('its panels cannot be copied by a user who cannot open it', async () => {
      for (const who of [c.uj, c.uk]) {
        const copy = await request(realSrv).post(`/dashboards/${c.mine.id}/panels/copy`).set(who).send({ sourcePanelId: c.p.id });
        expect(copy.status, copy.text).toBe(404);
        expect(copy.text).not.toContain('kl-private');
      }
      const userPanels = (await request(realSrv).get(`/dashboards/${c.mine.id}`).set(c.uj)).body.panels as unknown[];
      expect(userPanels).toHaveLength(0);
    });

    it("a copy's provenance does not name it, and provenance needs the panel to be on the dashboard in the URL", async () => {
      for (const who of [c.uj, c.uk]) {
        // the admin's copy sits on a dashboard this user CAN read
        const prov = await request(realSrv).get(`/dashboards/${c.shared.id}/panels/${c.copyId}/provenance`).set(who);
        expect(prov.status, prov.text).toBe(200);
        expect(prov.body.sourceDashboard).toBeNull();
        expect(prov.body.sourcePanel).toBeNull();
        expect(prov.text).not.toContain('kl-private');
        expect(prov.text).not.toContain('kl private');
      }
      expect((await request(realSrv).get(`/dashboards/${c.mine.id}/panels/${c.copyId}/provenance`).set(c.uj)).status).toBe(404);
    });

    it('the owner (browser admin) still sees, copies and traces everything', async () => {
      for (const sub of ['/variables', '/pages', '/annotations', '/logos']) {
        const res = await request(realSrv).get(`/dashboards/${c.priv.id}${sub}`).set(jwt());
        expect(res.status).toBe(200);
        expect(res.text).toContain('kl');
      }
      const prov = await request(realSrv).get(`/dashboards/${c.shared.id}/panels/${c.copyId}/provenance`).set(jwt());
      expect(prov.body.sourceDashboard?.id).toBe(c.priv.id);
      expect(prov.body.sourcePanel?.id).toBe(c.p.id);
      const again = await request(realSrv).post(`/dashboards/${c.shared.id}/panels/copy`).set(jwt()).send({ sourcePanelId: c.p.id });
      expect(again.status, again.text).toBe(201);
    });

    it('the panel picker (GET /dashboards/all-panels) leaves it out for a user who cannot open it; the owner sees it', async () => {
      for (const who of [c.uj, c.uk]) {
        const res = await request(realSrv).get('/dashboards/all-panels').set(who);
        expect(res.status, res.text).toBe(200);
        const ids = (res.body as Array<{ dashboard: { id: string } }>).map((x) => x.dashboard.id);
        expect(ids).not.toContain(c.priv.id);
        expect(ids).toContain(c.mine.id);
        // the admin's copy of the panel lives on a shared dashboard and stays listed; the private one does not
        expect(res.text).not.toContain('kl private');
      }
      const own = await request(realSrv).get('/dashboards/all-panels').set(jwt());
      expect((own.body as Array<{ dashboard: { id: string } }>).map((x) => x.dashboard.id)).toContain(c.priv.id);
    });

    it("a project's dashboard list leaves it out for a user who cannot open it, and never carries the share-password hash", async () => {
      const proj = await request(realSrv).post('/projects').set(jwt()).send({ name: 'kl project', slug: 'kl-project' });
      expect(proj.status, proj.text).toBe(201);
      expect((await request(realSrv).put(`/dashboards/${c.priv.id}`).set(jwt()).send({ project_id: proj.body.id })).status).toBe(200);
      expect((await request(realSrv).put(`/dashboards/${c.shared.id}`).set(jwt()).send({ project_id: proj.body.id })).status).toBe(200);
      for (const who of [c.uj, c.uk]) {
        const res = await request(realSrv).get(`/projects/${proj.body.id}/dashboards`).set(who);
        expect(res.status, res.text).toBe(200);
        const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
        expect(ids).toContain(c.shared.id);
        expect(ids).not.toContain(c.priv.id);
        expect(res.text).not.toContain('kl private');
        expect(res.text).not.toContain('public_password');
      }
      const own = await request(realSrv).get(`/projects/${proj.body.id}/dashboards`).set(jwt());
      expect((own.body as Array<{ id: string }>).map((d) => d.id)).toContain(c.priv.id);
      expect(own.text).not.toContain('public_password');
    });

    it('a private dashboard with no owner cannot be exported or duplicated by a user who cannot open it', async () => {
      const legacy = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl legacy private' })).body;
      expect((await request(realSrv).post(`/dashboards/${legacy.id}/panels`).set(jwt()).send({ title: 'kl-legacy-panel', query: 'search index=money kl-legacy-query' })).status).toBe(201);
      expect((await request(realSrv).put(`/dashboards/${legacy.id}`).set(jwt()).send({ visibility: 'private' })).status).toBe(200);
      getSQLiteDB().prepare('UPDATE dashboards SET owner_id = NULL WHERE id = ?').run(legacy.id);
      for (const who of [c.uj, c.uk]) {
        for (const sub of ['/export', '/duplicate']) {
          const res = await request(realSrv).post(`/dashboards/${legacy.id}${sub}`).set(who).send({});
          expect(res.status, `POST ${sub}: ${res.text}`).toBe(404);
          expect(res.text).not.toContain('kl-legacy');
        }
      }
      const exp = await request(realSrv).post(`/dashboards/${legacy.id}/export`).set(jwt()).send({});
      expect(exp.status, exp.text).toBe(200);
      expect(exp.text).toContain('kl-legacy-panel');
    });
  });

  it('a change under a dashboard that does not exist answers 404, even where no child id is checked', async () => {
    for (const [m, path, body] of [
      ['put', '/dashboards/kl-no-such-dashboard/pages/reorder', { pageIds: [] }],
      ['put', '/dashboards/kl-no-such-dashboard/logos/reorder', { logoIds: [] }],
      ['post', '/dashboards/kl-no-such-dashboard/variables/kl-none/options', {}],
    ] as const) {
      const res = await request(realSrv)[m](path).set(jwt()).send(body);
      expect(res.status, `${m} ${path}: ${res.text}`).toBe(404);
    }
  });
});

describe('round 3: the gate fails closed, and alert pop-ups need an unscoped key', () => {
  it('a key that cannot be checked (database error) gets 500 and never reaches the route', async () => {
    const h = { Authorization: 'ApiKey lnog_kl_db_down_000000000000000000000000000000' };
    for (const [m, p] of [['get', '/alerts'], ['post', '/alerts'], ['post', '/ingest/http'], ['get', '/auth/api-keys']] as const) {
      const res = await request(gateSrv)[m](p).set(h).send(m === 'post' ? {} : undefined);
      expect(res.status, `${m} ${p}`).toBe(500);
      expect(res.body.reached).toBeUndefined();
      expect(res.text).not.toContain('lnog_kl_db_down');
    }
    const x = await request(gateSrv).get('/alerts').set('X-API-Key', 'lnog_kl_db_down_000000000000000000000000000000');
    expect(x.status).toBe(500);
  });

  it('an index-scoped ingest key cannot fetch or clear alert pop-ups; an unscoped one can', async () => {
    // The desktop agent sends Authorization: ApiKey (agent/src/lognog_in/shipper.py).
    const scoped = { Authorization: `ApiKey ${K.ingestScoped}` };
    const a = await request(realSrv).get('/ingest/notifications?hostname=kl-host').set(scoped);
    expect(a.status, JSON.stringify(a.body)).toBe(403);
    expect((await request(realSrv).post('/ingest/notifications/kl-none/ack').set(scoped).send({})).status).toBe(403);
    expect((await request(realSrv).get('/INGEST//notifications?hostname=kl-host').set(scoped)).status).toBe(403);
    expect((await request(realSrv).get('/ingest/notifications?hostname=kl-host').set('X-API-Key', K.ingestScoped)).status).toBe(403);
    // An unscoped key with send logs AND read (the desktop agent's key) gets them.
    const b = await request(realSrv).get('/ingest/notifications?hostname=kl-host').set('Authorization', `ApiKey ${K.search}`);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
  });

  it('round 6: a send-logs-only key cannot read or clear alert pop-ups; a read-only key cannot clear them', async () => {
    const { createAgentNotification } = await import('../db/sqlite-notifications.js');
    const n = createAgentNotification('kl-r6 secret alert', 'kl-r6 pop-up title', 'kl-r6 rows from another index', { hostname: 'kl-r6-host', severity: 'high' });
    const writeOnly = { Authorization: `ApiKey ${K.ingest}` };
    const g = await request(realSrv).get('/ingest/notifications?hostname=kl-r6-host').set(writeOnly);
    expect(g.status, JSON.stringify(g.body)).toBe(403);
    expect(g.body.message).toMatch(/together with 'read'/);
    expect(g.text).not.toContain('kl-r6 pop-up title');
    expect((await request(realSrv).get('/ingest/notifications?hostname=kl-r6-host').set('X-API-Key', K.ingest)).status).toBe(403);
    expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(writeOnly).send({ hostname: 'kl-r6-host' })).status).toBe(403);
    // read without write: may not clear a pop-up either (it is the agent's job)
    expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set({ Authorization: `ApiKey ${K.read}` }).send({ hostname: 'kl-r6-host' })).status).toBe(403);
    // still pending: nothing above cleared it, and the agent's key (write + read) sees it, then clears it
    const agent = { Authorization: `ApiKey ${K.search}` };
    const seen = await request(realSrv).get('/ingest/notifications?hostname=kl-r6-host').set(agent);
    expect(seen.status).toBe(200);
    expect(seen.body.notifications.map((x: { id: string }) => x.id)).toContain(n.id);
    expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(agent).send({ hostname: 'kl-r6-host' })).status).toBe(200);
    const after = await request(realSrv).get('/ingest/notifications?hostname=kl-r6-host').set(agent);
    expect(after.body.notifications.map((x: { id: string }) => x.id)).not.toContain(n.id);
    // the rule itself, path tricks included
    for (const [m, p] of [['GET', '/ingest/notifications'], ['GET', '/INGEST//notifications/'], ['POST', '/ingest/notifications/x/ack']] as const) {
      expect(decideApiKey(m, p, ['write'], null).allowed, `${m} ${p} write`).toBe(false);
      expect(decideApiKey(m, p, ['read'], null).allowed, `${m} ${p} read`).toBe(false);
      expect(decideApiKey(m, p, ['write', 'read'], ['money']).allowed, `${m} ${p} scoped`).toBe(false);
      expect(decideApiKey(m, p, ['write', 'read'], null).allowed, `${m} ${p} write+read`).toBe(true);
      expect(decideApiKey(m, p, ['write', 'search'], null).allowed, `${m} ${p} write+search`).toBe(true);
      expect(decideApiKey(m, p, ['*'], null).allowed, `${m} ${p} star`).toBe(true);
    }
    // sending logs still needs only write
    expect(decideApiKey('POST', '/ingest/http', ['write'], null).allowed).toBe(true);
    expect(decideApiKey('POST', '/ingest/agent', ['write'], ['money']).allowed).toBe(true);
  });
});

describe('round 3: no side door from a write permission to reading every index', () => {
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });

  it('alerts:write without read cannot make an alert (it would send it the rows of any index)', async () => {
    const a = { Authorization: `ApiKey ${K.alertsOnly}` };
    const hook = [{ type: 'webhook', config: { url: 'http://127.0.0.1:9/kl-exfil', method: 'POST' } }];
    const body = { name: 'kl exfil', search_query: 'search index=money', actions: hook };
    const before = (await request(realSrv).get('/alerts').set(jwt())).body as unknown[];
    for (const [m, p] of [['post', '/alerts'], ['post', '/agent/alerts']] as const) {
      const res = await request(realSrv)[m](p).set(a).send(body);
      expect(res.status, `${m} ${p}`).toBe(403);
      expect(res.body.needed).toBe('alerts:write');
      expect(res.body.message).toContain("together with 'read'");
    }
    expect(((await request(realSrv).get('/alerts').set(jwt())).body as unknown[]).length).toBe(before.length);
    // the read + alerts:write key (the MONEY recipe's) still works
    const ok = await request(realSrv).post('/alerts').set('Authorization', `ApiKey ${K.alerts}`).send(body);
    expect(ok.status).toBe(201);
    await request(realSrv).delete(`/alerts/${ok.body.id}`).set(jwt());
  });

  it('dashboards:write without read cannot make a panel', async () => {
    const res = await request(realSrv).post('/dashboards').set('Authorization', `ApiKey ${K.dashboardsOnly}`).send({ name: 'kl x' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("together with 'read'");
  });

  it('saved-search create-panel obeys the shared-dashboard and owner rules', async () => {
    const dk = { Authorization: `ApiKey ${K.dashboards}` };
    const ss = (await request(realSrv).post('/saved-searches').set(jwt()).send({ name: 'kl all', query: 'search *' })).body;
    const shared = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl shared 2' })).body;
    expect((await request(realSrv).post(`/dashboards/${shared.id}/share`).set(jwt()).send({})).status).toBe(200);

    const no = await request(realSrv).post(`/saved-searches/${ss.id}/create-panel`).set(dk).send({ dashboard_id: shared.id });
    expect(no.status, no.text).toBe(403);
    let panels = (await request(realSrv).get(`/dashboards/${shared.id}`).set(jwt())).body.panels as unknown[];
    expect(panels).toHaveLength(0);
    // an admin key and a browser admin may; so may a dashboards key on an unshared dashboard
    expect((await request(realSrv).post(`/saved-searches/${ss.id}/create-panel`).set('Authorization', `ApiKey ${K.admin}`)
      .send({ dashboard_id: shared.id })).status).toBe(201);
    const own = (await request(realSrv).post('/dashboards').set(dk).send({ name: 'kl own' })).body;
    expect((await request(realSrv).post(`/saved-searches/${ss.id}/create-panel`).set(dk).send({ dashboard_id: own.id })).status).toBe(201);

    // a signed-in non-admin user cannot add a panel to someone else's dashboard
    const u = await createUser('kl-user3', 'kl-user3@example.invalid', 'kl-user3-test-pass-1', 'user');
    const uj = { Authorization: `Bearer ${(await generateTokenPair(u)).accessToken}` };
    const theirs = (await request(realSrv).post('/dashboards').set(jwt()).send({ name: 'kl theirs 2' })).body;
    const uss = (await request(realSrv).post('/saved-searches').set(uj).send({ name: 'kl u', query: 'search *' })).body;
    expect(uss.id).toBeTruthy();
    const ux = await request(realSrv).post(`/saved-searches/${uss.id}/create-panel`).set(uj).send({ dashboard_id: theirs.id });
    expect(ux.status, ux.text).toBe(403);
    panels = (await request(realSrv).get(`/dashboards/${theirs.id}`).set(jwt())).body.panels as unknown[];
    expect(panels).toHaveLength(0);
  });

  it("'search' counts as read for the write permissions (Directors Palette / HYH style keys)", async () => {
    const a = await request(realSrv).post('/alerts').set('Authorization', `ApiKey ${K.searchAlerts}`).send({ name: 'kl search alerts', search_query: 'search *' });
    expect(a.status, a.text).toBe(201);
    const d = await request(realSrv).post('/dashboards').set('Authorization', `ApiKey ${K.searchDashboards}`).send({ name: 'kl search dashboards' });
    expect(d.status, d.text).toBe(201);
    expect(keyHasNeed(['search', 'alerts:write'], 'alerts:write')).toBe(true);
    expect(keyHasNeed(['search', 'dashboards:write'], 'dashboards:write')).toBe(true);
    expect(keyHasNeed(['write', 'alerts:write'], 'alerts:write')).toBe(false);
  });

  it('sibling-branch reads that filter to the key indexes stay open to a scoped read key', () => {
    for (const p of ['/stats/home', '/status/lights', '/reports/weekly']) {
      expect(decideApiKey('GET', p, ['read'], ['uptime']).allowed, p).toBe(true);
    }
    expect(decideApiKey('GET', '/reports/kl-none', ['read'], ['uptime']).allowed).toBe(false);
  });
});

describe("a key never does more than its owner: 'admin' and '*' only count on an administrator's key", () => {
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });
  const c = {} as { uj: Record<string, string>; star: string; adm: string };
  beforeAll(async () => {
    const u = await createUser('kl-user5', 'kl-user5@example.invalid', 'kl-user5-test-pass-1', 'user');
    c.uj = { Authorization: `Bearer ${(await generateTokenPair(u)).accessToken}` };
    // Keys like these may already exist (made before this rule); made here straight in the database.
    c.star = (await createApiKey(u.id, 'kl user5 star', ['*'])).apiKey;
    c.adm = (await createApiKey(u.id, 'kl user5 admin', ['admin', 'read'])).apiKey;
  });

  it("a non-admin user cannot make an 'admin' or '*' key; a plain key and an administrator's '*' key still work", async () => {
    for (const permissions of [['*'], ['admin'], ['read', 'admin']]) {
      const res = await request(realSrv).post('/auth/api-keys').set(c.uj).send({ name: 'kl nope', permissions });
      // never put the response text in the message: on failure it would carry the new key
      expect(res.status, `${JSON.stringify(permissions)}: ${res.status} ${String(res.body?.error ?? '')}`).toBe(403);
      expect(res.text).not.toContain('lnog_');
    }
    const ok = await request(realSrv).post('/auth/api-keys').set(c.uj).send({ name: 'kl user5 read', permissions: ['read'] });
    expect(ok.status, String(ok.body?.error ?? '')).toBe(201);
    const adminStar = await request(realSrv).post('/auth/api-keys').set(jwt()).send({ name: 'kl admin star 2', permissions: ['*'] });
    expect(adminStar.status, String(adminStar.body?.error ?? '')).toBe(201);
  });

  it("a non-admin user's existing '*' or 'admin' key cannot open admin-only routes (AI search, MCP stream, sharing)", async () => {
    for (const key of [c.star, c.adm]) {
      const h = { Authorization: `ApiKey ${key}` };
      const ai = await request(realSrv).post('/search/ai').set(h).send({ prompt: 'errors' });
      expect(ai.status, ai.text).toBe(403);
      expect(ai.body.needed).toBe('admin');
      const info = await validateApiKey(key);
      expect(info?.permissions).not.toContain('*');
      expect(info?.permissions).not.toContain('admin');
      // routes/mcp.ts decides the MCP stream from exactly this result
      expect(decideApiKey('GET', '/mcp/sse', info?.permissions, info?.allowedIndexes).allowed).toBe(false);
      const d = await request(realSrv).post('/dashboards').set(c.uj).send({ name: 'kl user5 dash' });
      expect(d.status, d.text).toBe(201);
      const share = await request(realSrv).post(`/dashboards/${d.body.id}/share`).set(h).send({ is_public: true });
      expect(share.status, share.text).toBe(403);
    }
  });

  it("a non-admin user's '*' key still does what that user may: read, send logs, alerts and dashboards", async () => {
    const h = { Authorization: `ApiKey ${c.star}` };
    expect((await request(realSrv).get('/alerts').set(h)).status).toBe(200);
    expect((await request(realSrv).post('/ingest/http').set(h).send([{ message: 'kl user5' }])).status).toBe(200);
    expect((await request(realSrv).post('/alerts').set(h).send({ name: 'kl user5 rule', search_query: 'search *' })).status).toBe(201);
    expect(effectiveKeyPermissions(['*'], 'user').sort()).toEqual(['alerts:write', 'dashboards:write', 'read', 'write']);
    expect(effectiveKeyPermissions(['*'], 'admin')).toEqual(['*']);
    expect(effectiveKeyPermissions(['admin', 'read'], 'readonly')).toEqual(['read']);
  });

  it("the administrator's own '*' and 'admin' keys keep everything", async () => {
    const res = await request(realSrv).get('/auth/api-keys').set('Authorization', `ApiKey ${K.admin}`);
    expect(res.status).toBe(200);
    expect((await validateApiKey(K.admin))?.permissions).toContain('admin');
  });
});

describe('round 3, last gaps: run-all, read-only accounts, switched-off owners, owned copies', () => {
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });
  const c = {} as {
    userA: string; uaJ: Record<string, string>; ubJ: Record<string, string>;
    roJ: Record<string, string>; roStar: string; roWrite: string;
  };
  beforeAll(async () => {
    const a = await createUser('kl-user6', 'kl-user6@example.invalid', 'kl-user6-test-pass-1', 'user');
    const b = await createUser('kl-user7', 'kl-user7@example.invalid', 'kl-user7-test-pass-1', 'user');
    const ro = await createUser('kl-viewer', 'kl-viewer@example.invalid', 'kl-viewer-test-pass-1', 'readonly');
    c.userA = a.id;
    c.uaJ = { Authorization: `Bearer ${(await generateTokenPair(a)).accessToken}` };
    c.ubJ = { Authorization: `Bearer ${(await generateTokenPair(b)).accessToken}` };
    c.roJ = { Authorization: `Bearer ${(await generateTokenPair(ro)).accessToken}` };
    // Keys like these may already exist (made before this rule); made here straight in the database.
    c.roStar = (await createApiKey(ro.id, 'kl viewer star', ['*'])).apiKey;
    c.roWrite = (await createApiKey(ro.id, 'kl viewer write', ['write', 'read', 'alerts:write', 'dashboards:write'])).apiKey;
  });

  it('only an administrator signed in (or an admin key) may run every alert at once', async () => {
    for (const h of [c.uaJ, c.roJ]) {
      const res = await request(realSrv).post('/alerts/evaluate-all').set(h).send({});
      expect(res.status, res.text).toBe(403);
    }
    // the admin side of the same check (not run here: it would evaluate every alert in the file)
    const fake = (role: string, authMethod: string, apiKeyPermissions?: string[]) =>
      ({ user: { id: 'x', username: 'x', role }, authMethod, apiKeyPermissions }) as unknown as Parameters<typeof mayUseScripts>[0];
    expect(mayUseScripts(fake('admin', 'jwt'))).toBe(true);
    expect(mayUseScripts(fake('admin', 'apikey', ['admin']))).toBe(true);
    expect(mayUseScripts(fake('admin', 'apikey', ['read', 'alerts:write']))).toBe(false);
    expect(mayUseScripts(fake('user', 'jwt'))).toBe(false);
  });

  it('a read-only account can only make read or search keys', async () => {
    for (const permissions of [['write'], ['read', 'alerts:write'], ['read', 'dashboards:write'], ['*'], ['admin']]) {
      const res = await request(realSrv).post('/auth/api-keys').set(c.roJ).send({ name: 'kl viewer nope', permissions });
      // never put the response text in the message: on failure it would carry the new key
      expect(res.status, `${JSON.stringify(permissions)}: ${res.status} ${String(res.body?.error ?? '')}`).toBe(403);
      expect(res.text).not.toContain('lnog_');
      expect(res.body.refused.length).toBeGreaterThan(0);
    }
    const ok = await request(realSrv).post('/auth/api-keys').set(c.roJ).send({ name: 'kl viewer read', permissions: ['read'] });
    expect(ok.status, String(ok.body?.error ?? '')).toBe(201);
  });

  it("a read-only account's existing write or '*' key reads but cannot send logs or change anything", async () => {
    for (const key of [c.roStar, c.roWrite]) {
      const h = { Authorization: `ApiKey ${key}` };
      expect((await request(realSrv).get('/alerts').set(h)).status).toBe(200);
      const tries = [
        await request(realSrv).post('/ingest/http').set(h).send([{ message: 'kl viewer' }]),
        await request(realSrv).post('/alerts').set(h).send({ name: 'kl viewer rule', search_query: 'search *' }),
        await request(realSrv).post('/dashboards').set(h).send({ name: 'kl viewer dash' }),
        await request(realSrv).post('/auth/api-keys').set(h).send({ name: 'kl viewer mint', permissions: ['read'] }),
      ];
      for (const t of tries) {
        expect(t.status, `${t.status} ${String(t.body?.error ?? '')}`).toBe(403);
        expect(t.text).not.toContain('lnog_');
      }
    }
    expect(effectiveKeyPermissions(['*'], 'readonly')).toEqual(['read']);
    expect(effectiveKeyPermissions(['write', 'search'], 'readonly')).toEqual(['search']);
    expect(effectiveKeyPermissions(['write', 'alerts:write', 'dashboards:write'], 'viewer')).toEqual([]);
    expect(permissionsAboveOwner(['read', 'write'], 'readonly')).toEqual(['write']);
    expect(permissionsAboveOwner(['read', 'write', 'alerts:write'], 'user')).toEqual([]);
  });

  it('a key whose owner is switched off or demoted loses what the owner lost', async () => {
    const gone = await createUser('kl-gone', 'kl-gone@example.invalid', 'kl-gone-test-pass-1', 'admin');
    const goneKey = (await createApiKey(gone.id, 'kl gone admin', ['admin'])).apiKey;
    const demoted = await createUser('kl-demoted', 'kl-demoted@example.invalid', 'kl-demoted-test-pass-1', 'admin');
    const demotedKey = (await createApiKey(demoted.id, 'kl demoted admin', ['*'])).apiKey;
    deactivateUser(gone.id);
    updateUserRole(demoted.id, 'readonly');
    // routes/mcp.ts reads the key itself with validateApiKey, so this is what the MCP stream sees
    expect(await validateApiKey(goneKey)).toBeNull();
    const mcp = await request(realSrv).get('/mcp/sse').set('X-API-Key', goneKey).timeout({ response: 5_000 });
    expect(mcp.status).toBe(401);
    expect((await request(realSrv).get('/alerts').set('Authorization', `ApiKey ${goneKey}`)).status).toBe(401);
    expect((await validateApiKey(demotedKey))?.permissions).toEqual(['read']);
    const ai = await request(realSrv).post('/search/ai').set('Authorization', `ApiKey ${demotedKey}`).send({ prompt: 'errors' });
    expect(ai.status, `${ai.status} ${String(ai.body?.error ?? '')}`).toBe(403);
  });

  it("a copy of a private dashboard stays private and belongs to whoever copied it", async () => {
    const d = await request(realSrv).post('/dashboards').set(c.uaJ).send({ name: 'kl a private' });
    expect(d.status, d.text).toBe(201);
    expect((await request(realSrv).put(`/dashboards/${d.body.id}`).set(c.uaJ).send({ visibility: 'private' })).status).toBe(200);

    const mine = await request(realSrv).post(`/dashboards/${d.body.id}/duplicate`).set(c.uaJ).send({});
    expect(mine.status, mine.text).toBe(201);
    expect(mine.body.visibility).toBe('private');
    expect(mine.body.owner_id).toBe(c.userA);
    expect(getDashboard(mine.body.id)?.owner_id).toBe(c.userA);
    // another user can neither open nor change the copy
    expect((await request(realSrv).get(`/dashboards/${mine.body.id}`).set(c.ubJ)).status).toBe(404);
    expect([403, 404]).toContain((await request(realSrv).put(`/dashboards/${mine.body.id}`).set(c.ubJ).send({ name: 'kl taken' })).status);
    expect([403, 404]).toContain((await request(realSrv).delete(`/dashboards/${mine.body.id}`).set(c.ubJ)).status);
    expect(getDashboard(mine.body.id)?.name).toBe('kl a private - Copy');

    // an administrator's copy belongs to the administrator and is still private
    const admins = await request(realSrv).post(`/dashboards/${d.body.id}/duplicate`).set(jwt()).send({});
    expect(admins.status, admins.text).toBe(201);
    expect(admins.body.visibility).toBe('private');
    expect(admins.body.owner_id).toBeTruthy();
    expect(admins.body.owner_id).not.toBe(c.userA);
    expect((await request(realSrv).get(`/dashboards/${admins.body.id}`).set(c.uaJ)).status).toBe(404);
  });

  it('dashboards made from the wizard, an import or a template belong to their maker (no more owner-less rows anyone can edit)', async () => {
    const tpl = createDashboardTemplate('kl template', JSON.stringify({ name: 'kl from template', panels: [] }));
    const made = [
      await request(realSrv).post('/dashboards/from-wizard').set(c.uaJ).send({ name: 'kl wizard', index: 'kl-idx' }),
      await request(realSrv).post('/dashboards/import').set(c.uaJ).send({ name: 'kl imported', template: { panels: [] } }),
      await request(realSrv).post(`/dashboards/templates/${tpl.id}/create`).set(c.uaJ).send({ name: 'kl templated' }),
    ];
    for (const m of made) {
      expect(m.status, m.text).toBe(201);
      const id = m.body.id ?? m.body.dashboard_id ?? m.body.dashboard?.id;
      expect(id, m.text).toBeTruthy();
      expect(getDashboard(id)?.owner_id).toBe(c.userA);
      const taken = await request(realSrv).put(`/dashboards/${id}`).set(c.ubJ).send({ name: 'kl taken' });
      expect(taken.status, taken.text).toBe(403);
      expect(getDashboard(id)?.name).not.toBe('kl taken');
    }
  });

  it('alerts and dashboards made through the MCP tools belong to the user whose key opened the stream', async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createMCPServer(c.userA);
    await server.connect(serverSide);
    const client = new Client({ name: 'kl-test', version: '1.0.0' });
    await client.connect(clientSide);
    try {
      const text = (r: unknown) => JSON.parse(((r as { content: Array<{ text: string }> }).content[0]).text);
      const d = text(await client.callTool({ name: 'create_dashboard', arguments: { name: 'kl mcp dash' } }));
      const a = text(await client.callTool({ name: 'create_alert', arguments: { name: 'kl mcp alert', query: 'search kl-none', threshold: 1000000 } }));
      expect(getDashboard(d.dashboard_id)?.owner_id).toBe(c.userA);
      expect(getAlert(a.alert_id)?.owner_id).toBe(c.userA);
      expect((await request(realSrv).put(`/dashboards/${d.dashboard_id}`).set(c.ubJ).send({ name: 'kl taken' })).status).toBe(403);
      expect((await request(realSrv).put(`/alerts/${a.alert_id}`).set(c.ubJ).send({ name: 'kl taken' })).status).toBe(403);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('alerts and reports made from a template, a saved search or the agent API belong to their maker', async () => {
    const ss = await request(realSrv).post('/saved-searches').set(c.uaJ).send({ name: 'kl a saved', query: 'search kl-none' });
    expect(ss.status, ss.text).toBe(201);
    const made = [
      await request(realSrv).post('/agent/alerts').set(c.uaJ).send({ name: 'kl agent alert', search_query: 'search kl-none', enabled: false }),
      await request(realSrv).post(`/alerts/from-template/${ALERT_TEMPLATES[0].id}`).set(c.uaJ).send({}),
      await request(realSrv).post(`/saved-searches/${ss.body.id}/create-alert`).set(c.uaJ).send({}),
    ];
    for (const m of made) {
      expect(m.status, m.text).toBe(201);
      const id = m.body.id ?? m.body.alert_id ?? m.body.alert?.id;
      expect(id, m.text).toBeTruthy();
      expect(getAlert(id)?.owner_id).toBe(c.userA);
      const taken = await request(realSrv).put(`/alerts/${id}`).set(c.ubJ).send({ name: 'kl taken' });
      expect(taken.status, taken.text).toBe(403);
    }
    const rep = await request(realSrv).post(`/saved-searches/${ss.body.id}/create-report`).set(c.uaJ)
      .send({ schedule: '0 8 * * *', recipients: 'kl@example.invalid' });
    expect(rep.status, rep.text).toBe(201);
    const row = getSQLiteDB().prepare('SELECT owner_id FROM scheduled_reports WHERE id = ?').get(rep.body.report_id) as { owner_id: string | null };
    expect(row.owner_id).toBe(c.userA);
    const repTaken = await request(realSrv).delete(`/reports/${rep.body.report_id}`).set(c.ubJ);
    expect(repTaken.status, repTaken.text).toBe(403);
  });

  it("the old /search/saved routes follow the saved-search owner rule (no reading, changing or deleting someone else's)", async () => {
    const mine = await request(realSrv).post('/search/saved').set(c.uaJ).send({ name: 'kl legacy', query: 'search kl-none', description: 'kl d' });
    expect(mine.status, mine.text).toBe(201);
    expect(mine.body.owner_id).toBe(c.userA);
    expect(mine.body.description).toBe('kl d');
    const id = mine.body.id;
    expect((await request(realSrv).get(`/search/saved/${id}`).set(c.ubJ)).status).toBe(404);
    const list = await request(realSrv).get('/search/saved').set(c.ubJ);
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: string }>).some((x) => x.id === id)).toBe(false);
    expect((await request(realSrv).put(`/search/saved/${id}`).set(c.ubJ).send({ name: 'kl taken', query: 'search *' })).status).toBe(404);
    expect((await request(realSrv).delete(`/search/saved/${id}`).set(c.ubJ)).status).toBe(404);
    const still = await request(realSrv).get(`/search/saved/${id}`).set(c.uaJ);
    expect(still.status).toBe(200);
    expect(still.body.name).toBe('kl legacy');
    // the owner and an administrator still can
    expect((await request(realSrv).get(`/search/saved/${id}`).set(jwt())).status).toBe(200);
    expect((await request(realSrv).put(`/search/saved/${id}`).set(c.uaJ).send({ name: 'kl legacy 2', query: 'search *' })).status).toBe(200);
    expect((await request(realSrv).delete(`/search/saved/${id}`).set(jwt())).status).toBe(204);
  });
});

describe('round 4: saved-search lists, private dashboards, strict key permissions, provisioned sources, the MCP stream', () => {
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });
  const c = {} as { userA: string; uaJ: Record<string, string>; ubJ: Record<string, string> };
  beforeAll(async () => {
    const a = await createUser('kl-user8', 'kl-user8@example.invalid', 'kl-user8-test-pass-1', 'user');
    const b = await createUser('kl-user9', 'kl-user9@example.invalid', 'kl-user9-test-pass-1', 'user');
    c.userA = a.id;
    c.uaJ = { Authorization: `Bearer ${(await generateTokenPair(a)).accessToken}` };
    c.ubJ = { Authorization: `Bearer ${(await generateTokenPair(b)).accessToken}` };
  });

  it("the saved-search list, tags and folders show only the caller's own and shared searches, and need sign-in", async () => {
    for (const path of ['/saved-searches', '/saved-searches/tags', '/saved-searches/folders']) {
      expect((await request(realSrv).get(path)).status, `${path} without credentials`).toBe(401);
    }
    const priv = await request(realSrv).post('/saved-searches').set(c.uaJ)
      .send({ name: 'kl-r4-private-name', query: 'search kl-none', tags: ['kl-r4-secret-tag'], folder: 'kl-r4-secret-folder' });
    expect(priv.status, priv.text).toBe(201);
    const shared = await request(realSrv).post('/saved-searches').set(c.uaJ)
      .send({ name: 'kl-r4-shared-name', query: 'search kl-none', is_shared: true, tags: ['kl-r4-shared-tag'], folder: 'kl-r4-shared-folder' });
    expect(shared.status, shared.text).toBe(201);

    const view = async (h: Record<string, string>) => {
      const list = await request(realSrv).get('/saved-searches').set(h);
      const tags = await request(realSrv).get('/saved-searches/tags').set(h);
      const folders = await request(realSrv).get('/saved-searches/folders').set(h);
      for (const r of [list, tags, folders]) expect(r.status, r.text).toBe(200);
      return {
        ids: (list.body.searches as Array<{ id: string }>).map((x) => x.id),
        text: JSON.stringify(list.body),
        tags: tags.body.tags as string[],
        folders: folders.body.folders as string[],
      };
    };
    const b = await view(c.ubJ);
    expect(b.ids).not.toContain(priv.body.id);
    expect(b.text).not.toContain('kl-r4-private-name');
    expect(b.tags).not.toContain('kl-r4-secret-tag');
    expect(b.folders).not.toContain('kl-r4-secret-folder');
    expect(b.ids).toContain(shared.body.id);
    expect(b.tags).toContain('kl-r4-shared-tag');
    expect(b.folders).toContain('kl-r4-shared-folder');
    // asking for someone else's searches by owner id does not get around it
    const byOwner = await request(realSrv).get(`/saved-searches?owner_id=${c.userA}`).set(c.ubJ);
    expect((byOwner.body.searches as Array<{ id: string }>).map((x) => x.id)).not.toContain(priv.body.id);

    for (const h of [c.uaJ, jwt()]) {
      const v = await view(h);
      expect(v.ids).toContain(priv.body.id);
      expect(v.ids).toContain(shared.body.id);
      expect(v.tags).toContain('kl-r4-secret-tag');
      expect(v.folders).toContain('kl-r4-secret-folder');
    }
  });

  it("export, duplicate and every change of someone else's private dashboard answer 404, as its GET does", async () => {
    const d = await request(realSrv).post('/dashboards').set(c.uaJ).send({ name: 'kl-r4 private board' });
    expect(d.status, d.text).toBe(201);
    expect((await request(realSrv).put(`/dashboards/${d.body.id}`).set(c.uaJ).send({ visibility: 'private' })).status).toBe(200);
    const id = d.body.id as string;
    const tries: Array<[string, Awaited<ReturnType<ReturnType<typeof request>['get']>>]> = [
      ['GET', await request(realSrv).get(`/dashboards/${id}`).set(c.ubJ)],
      ['export', await request(realSrv).post(`/dashboards/${id}/export`).set(c.ubJ).send({})],
      ['duplicate', await request(realSrv).post(`/dashboards/${id}/duplicate`).set(c.ubJ).send({})],
      ['PUT', await request(realSrv).put(`/dashboards/${id}`).set(c.ubJ).send({ name: 'kl taken' })],
      ['DELETE', await request(realSrv).delete(`/dashboards/${id}`).set(c.ubJ)],
      ['add panel', await request(realSrv).post(`/dashboards/${id}/panels`).set(c.ubJ).send({ title: 'kl p', query: 'search *' })],
    ];
    for (const [label, t] of tries) {
      expect(t.status, `${label}: ${t.status} ${t.text}`).toBe(404);
      expect(t.text).not.toContain('kl-r4 private board');
    }
    expect(getDashboard(id)?.name).toBe('kl-r4 private board');
    // a shared (non-private) dashboard of someone else still says 403 to a change
    const pub = await request(realSrv).post('/dashboards').set(c.uaJ).send({ name: 'kl-r4 team board' });
    expect((await request(realSrv).put(`/dashboards/${pub.body.id}`).set(c.ubJ).send({ name: 'kl taken' })).status).toBe(403);
    // the owner and an administrator still can export it
    expect((await request(realSrv).post(`/dashboards/${id}/export`).set(c.uaJ).send({})).status).toBe(200);
    expect((await request(realSrv).post(`/dashboards/${id}/export`).set(jwt()).send({})).status).toBe(200);
  });

  it('a new key only takes permissions LogNog knows (no typos, no empty list)', async () => {
    for (const permissions of [['read '], [], ['ingest'], ['READ'], ['read', 'alerts'], ['admin:*']]) {
      const res = await request(realSrv).post('/auth/api-keys').set(jwt()).send({ name: 'kl-r4 junk', permissions });
      expect(res.status, `${JSON.stringify(permissions)}: ${res.status} ${String(res.body?.error ?? '')}`).toBe(400);
      expect(res.text).not.toContain('lnog_');
    }
    expect((await getApiKeys((await validateApiKey(K.admin))!.userId)).some((k) => k.name === 'kl-r4 junk')).toBe(false);
    // the known ones still work (and leaving it out still makes a read key)
    for (const permissions of [['write'], ['read', 'alerts:write'], undefined]) {
      const res = await request(realSrv).post('/auth/api-keys').set(jwt()).send({ name: 'kl-r4 good', permissions });
      expect(res.status, `${JSON.stringify(permissions)}: ${res.status} ${String(res.body?.error ?? '')}`).toBe(201);
    }
    // a permission named twice is stored once
    const twice = await request(realSrv).post('/auth/api-keys').set(jwt()).send({ name: 'kl-r4 twice', permissions: ['read', 'read', 'alerts:write', 'read'] });
    expect(twice.status, String(twice.body?.error ?? '')).toBe(201);
    const stored = (await getApiKeys((await validateApiKey(K.admin))!.userId)).find((k) => k.name === 'kl-r4 twice');
    const perms = typeof stored?.permissions === 'string' ? JSON.parse(stored.permissions) : stored?.permissions;
    expect(perms).toEqual(['read', 'alerts:write']);
  });

  it('a source set up by the wizard gives its heartbeat alert and dashboard to the admin who set it up', async () => {
    const adminId = (await validateApiKey(K.admin))!.userId;
    const res = await request(realSrv).post('/sources/provision').set(jwt()).send({ name: 'kl-r4 source', index: 'kl-r4-idx' });
    // never put the response text in the message: it carries the new key
    expect(res.status, String(res.body?.error ?? '')).toBe(200);
    expect(getAlert(res.body.alertId)?.owner_id).toBe(adminId);
    expect(getDashboard(res.body.dashboardId)?.owner_id).toBe(adminId);
    // so another (non-admin) user cannot change them
    expect((await request(realSrv).put(`/alerts/${res.body.alertId}`).set(c.ubJ).send({ name: 'kl taken' })).status).toBe(403);
    expect((await request(realSrv).put(`/dashboards/${res.body.dashboardId}`).set(c.ubJ).send({ name: 'kl taken' })).status).toBe(403);
    // and a non-admin cannot set up a source at all
    expect((await request(realSrv).post('/sources/provision').set(c.uaJ).send({ name: 'kl-r4 nope', index: 'kl-r4-nope' })).status).toBe(403);
  });

  /** Opens GET /mcp/sse and resolves once the response headers arrive. */
  const openSse = (apiKey: string) =>
    new Promise<{ status: number; body: () => string; ended: Promise<void>; close: () => void }>((resolve, reject) => {
      const port = Number(new URL(realSrv).port);
      const req = http.request({ host: '::1', port, path: '/mcp/sse', method: 'GET', headers: { 'X-API-Key': apiKey } }, (res) => {
        let text = '';
        let done!: () => void;
        const ended = new Promise<void>((r) => { done = r; });
        res.on('data', (chunk) => { text += String(chunk); });
        res.on('end', () => done());
        res.on('close', () => done());
        res.on('error', () => done());
        resolve({ status: res.statusCode ?? 0, body: () => text, ended, close: () => req.destroy() });
      });
      req.on('error', reject);
      req.end();
    });

  it("the MCP stream route hands the key's own user to the MCP server", async () => {
    const owner = await createUser('kl-mcp-owner', 'kl-mcp-owner@example.invalid', 'kl-mcp-owner-test-pass-1', 'admin');
    const ownerKey = (await createApiKey(owner.id, 'kl mcp owner admin', ['admin'])).apiKey;
    const made = vi.mocked(createMCPServer);
    made.mockClear();
    const sse = await openSse(ownerKey);
    try {
      expect(sse.status).toBe(200);
      await vi.waitFor(() => expect(made).toHaveBeenCalled(), { timeout: 5_000 });
      expect(made.mock.calls.map((call) => call[0])).toEqual([owner.id]);
    } finally {
      sse.close();
    }
    // a read key never gets that far
    made.mockClear();
    const refused = await openSse(K.read);
    refused.close();
    expect(refused.status).toBe(403);
    expect(made).not.toHaveBeenCalled();
  });

  it('an open MCP stream is cut on the next message once its key is revoked or its owner demoted', async () => {
    // loaded here so that, run against code without the re-check, only this test fails
    const { mcpKeyStillAllowed } = (await import('./mcp.js')) as unknown as { mcpKeyStillAllowed: (k: string) => Promise<boolean> };
    expect(typeof mcpKeyStillAllowed).toBe('function');
    expect(await mcpKeyStillAllowed(K.admin)).toBe(true);
    expect(await mcpKeyStillAllowed(K.star)).toBe(true);
    for (const k of [K.read, K.alerts, K.dashboards, K.ingest, 'lnog_kl_not_a_key_00000000000000000000000000000']) {
      expect(await mcpKeyStillAllowed(k)).toBe(false);
    }
    const scopedAdmin = (await createApiKey((await validateApiKey(K.admin))!.userId, 'kl mcp scoped admin', ['admin'], undefined, ['money'])).apiKey;
    expect(await mcpKeyStillAllowed(scopedAdmin)).toBe(false);

    const logs = vi.spyOn(console, 'log');
    // the transport's own methods, watched (they still run): a good message must reach it, a cut stream must close it
    const handled = vi.spyOn(SSEServerTransport.prototype, 'handlePostMessage');
    const closed = vi.spyOn(SSEServerTransport.prototype, 'close');
    try {
      for (const how of ['revoke', 'demote', 'switch off'] as const) {
        const u = await createUser(`kl-mcp-${how.replace(' ', '-')}`, `kl-mcp-${how.replace(' ', '-')}@example.invalid`, 'kl-mcp-test-pass-1', 'admin');
        const made = await createApiKey(u.id, `kl mcp ${how}`, ['admin']);
        expect(await mcpKeyStillAllowed(made.apiKey)).toBe(true);
        const sse = await openSse(made.apiKey);
        try {
          expect(sse.status).toBe(200);
          let connectionId = '';
          await vi.waitFor(() => {
            const line = logs.mock.calls.map((call) => String(call[0]))
              .find((l) => l.startsWith('[MCP] SSE client connected:') && l.includes(`(userId: ${u.id})`));
            expect(line).toBeTruthy();
            connectionId = /connected: (\S+)/.exec(line!)![1];
          }, { timeout: 5_000 });

          // while the key is still good, a message goes through to the MCP transport and the stream stays open
          const msg = { jsonrpc: '2.0', id: 1, method: 'ping' };
          handled.mockClear();
          closed.mockClear();
          const ok = await request(realSrv).post(`/mcp/messages?connectionId=${encodeURIComponent(connectionId)}`)
            .set('Content-Type', 'application/json').send(msg);
          expect(ok.status, `${how} (key still good): ${ok.status} ${ok.text}`).not.toBe(403);
          expect(ok.status).not.toBe(404);
          expect(handled).toHaveBeenCalledTimes(1);
          expect(closed).not.toHaveBeenCalled();

          if (how === 'revoke') expect(revokeApiKey(made.keyData.id, u.id)).toBe(true);
          if (how === 'demote') updateUserRole(u.id, 'user');
          if (how === 'switch off') deactivateUser(u.id);
          expect(await mcpKeyStillAllowed(made.apiKey)).toBe(false);

          handled.mockClear();
          const cut = await request(realSrv).post(`/mcp/messages?connectionId=${encodeURIComponent(connectionId)}`)
            .set('Content-Type', 'application/json').send(msg);
          expect(cut.status, `${how}: ${cut.status} ${cut.text}`).toBe(403);
          // refused before the transport saw it, and the transport was closed
          expect(handled).not.toHaveBeenCalled();
          expect(closed).toHaveBeenCalledTimes(1);
          // the connection is gone and the stream is closed
          const again = await request(realSrv).post(`/mcp/messages?connectionId=${encodeURIComponent(connectionId)}`)
            .set('Content-Type', 'application/json').send(msg);
          expect(again.status, `${how}: ${again.status}`).toBe(404);
          await Promise.race([
            sse.ended,
            new Promise((_, rej) => setTimeout(() => rej(new Error(`${how}: the SSE stream stayed open`)), 5_000)),
          ]);
        } finally {
          sse.close();
        }
      }
    } finally {
      logs.mockRestore();
      handled.mockRestore();
      closed.mockRestore();
    }
  });
});

describe('round 5: scheduled report recipients', () => {
  const jwt = () => ({ Authorization: `Bearer ${jwtAdmin}` });

  it("report e-mail addresses are hidden from keys without 'admin', in the list and in run history", async () => {
    const made = await request(realSrv).post('/reports').set(jwt()).send({
      name: 'kl-r5 report', query: 'search kl-none', schedule: '0 8 * * 1', recipients: 'kl-r5-boss@example.invalid',
    });
    expect(made.status, made.text).toBe(201);
    const id = made.body.id as string;
    recordReportRun({
      report_id: id, started_at: new Date().toISOString(), status: 'error', manual: true, row_count: 0,
      recipients: ['kl-r5-boss@example.invalid'], reason: 'SMTP 550 kl-r5-boss@example.invalid unknown', duration_ms: 1,
    });

    const seen = async (h: Record<string, string>) => {
      const list = await request(realSrv).get('/reports').set(h);
      const runs = await request(realSrv).get(`/reports/${id}/runs`).set(h);
      expect(list.status, list.text).toBe(200);
      expect(runs.status, runs.text).toBe(200);
      const report = (list.body as Array<{ id: string; recipients: string; name: string }>).find((r) => r.id === id);
      expect(report?.name).toBe('kl-r5 report');
      return { report, runs: runs.body as Array<{ recipients: string; reason: string; status: string }>, text: list.text + runs.text };
    };
    for (const [label, key] of [['read', K.read], ['search', K.search], ['alerts', K.alerts], ['dashboards', K.dashboards]] as const) {
      const v = await seen({ Authorization: `ApiKey ${key}` });
      expect(v.text, `${label} key`).not.toContain('kl-r5-boss@');
      expect(v.report?.recipients, `${label} key`).toBe('[hidden]');
      expect(v.runs[0]?.recipients, `${label} key`).toBe('[hidden]');
      expect(v.runs[0]?.reason, `${label} key`).toBe('[hidden]');
      expect(v.runs[0]?.status).toBe('error');
    }
    // an admin key and a browser session still see them
    for (const [label, h] of [['admin key', { Authorization: `ApiKey ${K.admin}` }], ['star key', { Authorization: `ApiKey ${K.star}` }], ['admin session', jwt()]] as const) {
      const v = await seen(h);
      expect(v.report?.recipients, label).toBe('kl-r5-boss@example.invalid');
      expect(v.runs[0]?.recipients, label).toBe('kl-r5-boss@example.invalid');
      expect(v.runs[0]?.reason, label).toContain('550');
    }
    // a read key still cannot change a report
    expect((await request(realSrv).put(`/reports/${id}`).set('Authorization', `ApiKey ${K.read}`).send({ recipients: 'kl-r5-thief@example.invalid' })).status).toBe(403);
  });
});

describe('round 7: repeated refusals, the permission names, and pop-ups per reader', () => {
  const newKey = async (name: string, perms: string[]) => (await createApiKey(klAdminId, name, perms)).apiKey;
  const denialRows = (ua: string) =>
    getSQLiteDB()
      .prepare("SELECT id, details FROM auth_audit_log WHERE event_type = 'apikey_permission_denied' AND user_agent = ? ORDER BY created_at")
      .all(ua) as Array<{ id: string; details: string }>;

  it('an agent polling pop-ups with a send-logs-only key writes one audit row, counting the repeats', async () => {
    // optional call: on code without the dedupe the test then fails on the row count itself
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const keyA = await newKey('kl-r7 poller A', ['write']);
    const keyB = await newKey('kl-r7 poller B', ['write']);
    const ua = 'kl-r7-poller';
    for (let i = 0; i < 20; i++) {
      const res = await request(realSrv).get('/ingest/notifications?hostname=kl-r7-host').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua });
      expect(res.status).toBe(403);
    }
    let rows = denialRows(ua);
    expect(rows).toHaveLength(1);
    const d = JSON.parse(rows[0].details);
    expect(d.repeats).toBe(19);
    expect(typeof d.last_seen).toBe('string');
    expect(d.path).toBe('/ingest/notifications');
    expect(d.needed).toBe('write');
    expect(d.missing).toEqual(['read']);

    // a different path, a different method on the same path, another
    // path again, and a different key each get their own row
    expect((await request(realSrv).get('/alerts').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua })).status).toBe(403);
    expect(denialRows(ua)).toHaveLength(2);
    expect((await request(realSrv).post('/alerts').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua }).send({})).status).toBe(403);
    expect(denialRows(ua)).toHaveLength(3);
    expect((await request(realSrv).post('/ingest/notifications/kl-none/ack').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua }).send({})).status).toBe(403);
    expect((await request(realSrv).get('/ingest/notifications').set({ Authorization: `ApiKey ${keyB}`, 'User-Agent': ua })).status).toBe(403);
    rows = denialRows(ua);
    expect(rows).toHaveLength(5);

    // path spellings count as the same route
    expect((await request(realSrv).get('/INGEST//notifications/').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua })).status).toBe(403);
    expect(denialRows(ua)).toHaveLength(5);
    expect(JSON.parse(denialRows(ua)[0].details).repeats).toBe(20);

    // an admin who clears the row gets a fresh one on the next refusal
    getSQLiteDB().prepare('DELETE FROM auth_audit_log WHERE id = ?').run(rows[0].id);
    expect((await request(realSrv).get('/ingest/notifications').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua })).status).toBe(403);
    expect(denialRows(ua)).toHaveLength(5);

    // after the window the next refusal writes a fresh row again
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + DENIAL_ROW_WINDOW_MS + 60_000);
    try {
      expect((await request(realSrv).get('/alerts').set({ Authorization: `ApiKey ${keyA}`, 'User-Agent': ua })).status).toBe(403);
    } finally {
      spy.mockRestore();
    }
    expect(denialRows(ua)).toHaveLength(6);
  });

  it('the same key, method and path from another address gets its own row', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const key = await newKey('kl-r7 poller C', ['write']);
    const ua = 'kl-r7-poller-ip';
    // production sits behind one proxy (index.ts: trust proxy 1), so the
    // caller's address is the last X-Forwarded-For hop
    const proxied = express();
    proxied.set('trust proxy', 1);
    proxied.use(apiKeyGate);
    proxied.all('*', (_req, res) => {
      res.status(299).json({ reached: true });
    });
    const from = async (ip: string) =>
      (await request(proxied).get('/ingest/notifications').set({ Authorization: `ApiKey ${key}`, 'User-Agent': ua, 'X-Forwarded-For': ip })).status;
    expect(await from('203.0.113.7')).toBe(403);
    expect(await from('203.0.113.7')).toBe(403);
    expect(denialRows(ua)).toHaveLength(1);
    expect(await from('198.51.100.9')).toBe(403);
    const rows = getSQLiteDB()
      .prepare("SELECT ip_address, details FROM auth_audit_log WHERE event_type = 'apikey_permission_denied' AND user_agent = ? ORDER BY rowid")
      .all(ua) as Array<{ ip_address: string; details: string }>;
    expect(rows.map((r) => r.ip_address)).toEqual(['203.0.113.7', '198.51.100.9']);
    expect(JSON.parse(rows[0].details).repeats).toBe(1);
  });

  it("a refusal names the permission a person can tick: 'write' (send logs), never 'ingest'", async () => {
    const ua = 'kl-r7-names';
    const res = await request(realSrv).post('/ingest/http').set({ Authorization: `ApiKey ${K.read}`, 'User-Agent': ua }).send([{ message: 'kl-r7' }]);
    expect(res.status).toBe(403);
    expect(res.body.needed).toBe('write');
    expect(res.body.missing).toEqual(['write']);
    expect(res.body.message).toMatch(/'write'/);
    expect(res.body.message).toMatch(/send logs/);
    expect(res.text).not.toMatch(/'ingest'/);
    const row = JSON.parse(denialRows(ua)[0].details);
    expect(row.needed).toBe('write');
    // 'missing' names exactly what each key lacks
    const refusal = async (key: string, m: 'get' | 'post', p: string) => {
      const r = await request(realSrv)[m](p).set({ Authorization: `ApiKey ${key}`, 'User-Agent': ua }).send(m === 'post' ? {} : undefined);
      expect(r.status, `${m} ${p}`).toBe(403);
      return { needed: r.body.needed, missing: r.body.missing };
    };
    expect(await refusal(K.ingest, 'get', '/ingest/notifications')).toEqual({ needed: 'write', missing: ['read'] });
    expect(await refusal(K.read, 'post', '/ingest/notifications/kl-none/ack')).toEqual({ needed: 'write', missing: ['write'] });
    expect(await refusal(K.read, 'post', '/alerts')).toEqual({ needed: 'alerts:write', missing: ['alerts:write'] });
    expect(await refusal(K.alertsOnly, 'post', '/alerts')).toEqual({ needed: 'alerts:write', missing: ['read'] });
    expect(await refusal(K.ingest, 'post', '/dashboards')).toEqual({ needed: 'dashboards:write', missing: ['dashboards:write', 'read'] });
    expect(await refusal(K.read, 'get', '/auth/api-keys')).toEqual({ needed: 'admin', missing: ['admin'] });
    expect(await refusal(K.ingestScoped, 'get', '/ingest/notifications')).toEqual({ needed: 'write', missing: ['read'] });
    expect(await refusal(K.readScoped, 'get', '/alerts')).toEqual({ needed: 'read', missing: [] });
    for (const need of ['read', 'search', 'admin', 'alerts:write', 'dashboards:write']) {
      expect(permissionNameForNeed(need as Parameters<typeof permissionNameForNeed>[0])).toBe(need);
    }
    expect(permissionNameForNeed('ingest')).toBe('write');
  });

  it('clearing a pop-up clears it for that key on that host only', async () => {
    const { createAgentNotification, getAgentNotification } = await import('../db/sqlite-notifications.js');
    const A = { Authorization: `ApiKey ${await newKey('kl-r7 agent A', ['write', 'read'])}` };
    const B = { Authorization: `ApiKey ${await newKey('kl-r7 agent B', ['write', 'read'])}` };
    const all = createAgentNotification('kl-r7 alert', 'kl-r7 for every host', 'm', {});
    const mine = createAgentNotification('kl-r7 alert', 'kl-r7 for host one', 'm', { hostname: 'kl-r7-one' });
    const ids = async (h: Record<string, string>, host: string) => {
      const res = await request(realSrv).get(`/ingest/notifications?hostname=${host}`).set(h);
      expect(res.status, res.text).toBe(200);
      return (res.body.notifications as Array<{ id: string }>).map((x) => x.id);
    };
    expect(await ids(A, 'kl-r7-one')).toEqual(expect.arrayContaining([all.id, mine.id]));
    expect(await ids(A, 'kl-r7-two')).toContain(all.id);
    expect(await ids(A, 'kl-r7-two')).not.toContain(mine.id);

    // A on host one clears both
    expect((await request(realSrv).post(`/ingest/notifications/${all.id}/ack`).set(A).send({ hostname: 'kl-r7-one' })).status).toBe(200);
    expect((await request(realSrv).post(`/ingest/notifications/${mine.id}/ack`).set(A).send({ hostname: 'kl-r7-one' })).status).toBe(200);
    expect(await ids(A, 'kl-r7-one')).not.toContain(all.id);
    expect(await ids(A, 'kl-r7-one')).not.toContain(mine.id);
    // ...but A's other host and key B still have them
    expect(await ids(A, 'kl-r7-two')).toContain(all.id);
    expect(await ids(B, 'kl-r7-one')).toEqual(expect.arrayContaining([all.id, mine.id]));
    expect(await ids(B, 'kl-r7-two')).toContain(all.id);
    // clearing twice is harmless
    expect((await request(realSrv).post(`/ingest/notifications/${all.id}/ack`).set(A).send({ hostname: 'kl-r7-one' })).status).toBe(200);

    // a pop-up meant for another host can't be cleared from here
    expect((await request(realSrv).post(`/ingest/notifications/${mine.id}/ack`).set(B).send({ hostname: 'kl-r7-two' })).status).toBe(404);
    expect((await request(realSrv).post(`/ingest/notifications/${mine.id}/ack`).set(B).send({})).status).toBe(404);
    expect(await ids(B, 'kl-r7-one')).toContain(mine.id);
    // nor can one that doesn't exist or has expired
    expect((await request(realSrv).post('/ingest/notifications/kl-r7-none/ack').set(B).send({ hostname: 'kl-r7-one' })).status).toBe(404);
    const old = createAgentNotification('kl-r7 alert', 'kl-r7 expired', 'm', { expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect(await ids(B, 'kl-r7-one')).not.toContain(old.id);
    expect((await request(realSrv).post(`/ingest/notifications/${old.id}/ack`).set(B).send({ hostname: 'kl-r7-one' })).status).toBe(404);
    // an ISO expiry later today still counts as not expired (text vs time comparison)
    const soon = createAgentNotification('kl-r7 alert', 'kl-r7 soon', 'm', { expires_at: new Date(Date.now() + 60_000).toISOString() });
    expect(await ids(B, 'kl-r7-one')).toContain(soon.id);

    // a pop-up shown before this upgrade (delivered=1, no per-reader rows) stays shown for everyone
    const legacy = createAgentNotification('kl-r7 alert', 'kl-r7 legacy', 'm', {});
    getSQLiteDB().prepare("UPDATE agent_notifications SET delivered = 1, delivered_at = datetime('now') WHERE id = ?").run(legacy.id);
    expect(await ids(A, 'kl-r7-one')).not.toContain(legacy.id);
    expect(await ids(B, 'kl-r7-two')).not.toContain(legacy.id);
    expect(getAgentNotification(all.id)?.delivered).toBe(1);
  });
});

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
import { apiKeyGate, resetDenialRowsForTest, DENIAL_ROW_WINDOW_MS, refuseAdminOnly, refuseApiKey } from '../auth/api-key-gate.js';
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
  // from the release's sibling branches (Home, Weekly paper, Lab Lights); each filters to the key's indexes
  'GET /stats/home', 'GET /reports/weekly', 'GET /status/lights',
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
    let body: unknown;
    const res = { status(c: number) { status = c; return this; }, json(b: unknown) { body = b; return this; } };
    requireAdmin(
      { user: { id: 'u', username: 'admin', role: 'admin' }, authMethod: 'apikey', apiKeyPermissions: perms,
        ip: '127.0.0.1', method: 'GET', path: '/x', get: () => undefined } as never,
      res as never,
      () => { nexted = true; },
    );
    return { status, nexted, body };
  }
  it('refuses a read key owned by the admin', () => expect(run(['read'])).toMatchObject({ status: 403, nexted: false }));
  it("its refusal names what the key lacks, like the gate's (round 7)", () => {
    expect(run(['read', 'write']).body).toEqual({
      error: 'API key lacks required permissions', needed: 'admin', missing: ['admin'],
      message: expect.stringMatching(/'admin'/),
    });
  });
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

  it('on the merged server those three reads answer a scoped read key and refuse a send-logs key', async () => {
    for (const p of ['/stats/home', '/status/lights', '/reports/weekly']) {
      const ok = await request(realSrv).get(p).set('Authorization', `ApiKey ${K.readScoped}`);
      expect(ok.status, `${p}: ${ok.status}`).toBe(200);
      const no = await request(realSrv).get(p).set('Authorization', `ApiKey ${K.ingest}`);
      expect(no.status, `${p}: ${no.status}`).toBe(403);
    }
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
          const ua = `kl-mcp-cut-${how.replace(' ', '-')}`;
          const cut = await request(realSrv).post(`/mcp/messages?connectionId=${encodeURIComponent(connectionId)}`)
            .set('Content-Type', 'application/json').set('User-Agent', ua).send(msg);
          expect(cut.status, `${how}: ${cut.status} ${cut.text}`).toBe(403);
          // the refusal names what the key lacks, like every other key refusal
          expect(cut.body, how).toMatchObject({ needed: 'admin', missing: ['admin'] });
          expect(typeof cut.body.message, how).toBe('string');
          // and the audit row names the key that opened the stream and its owner,
          // even when the key was revoked and can't be looked up any more
          const row = getSQLiteDB()
            .prepare('SELECT user_id, details FROM auth_audit_log WHERE event_type = ? AND user_agent = ?')
            .get('apikey_permission_denied', ua) as { user_id: string | null; details: string } | undefined;
          expect(row, how).toBeTruthy();
          expect(row!.user_id, how).toBe(u.id);
          expect(JSON.parse(row!.details), how).toMatchObject({ apiKeyId: made.keyData.id, path: '/mcp/messages', needed: 'admin', missing: ['admin'] });
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
    // One server on ::1 for the whole test, like the shared ones above
    // (supertest given a bare app opens a new server per request, which timed
    // out once in six full runs on a busy machine).
    const proxiedServer = proxied.listen(0, '::1');
    await new Promise<void>((r) => proxiedServer.once('listening', () => r()));
    proxiedServer.keepAliveTimeout = 10 * 60_000;
    proxiedServer.headersTimeout = 10 * 60_000 + 1_000;
    const proxiedSrv = `http://[::1]:${(proxiedServer.address() as AddressInfo).port}`;
    const from = async (ip: string) =>
      (await request(proxiedSrv).get('/ingest/notifications').set({ Authorization: `ApiKey ${key}`, 'User-Agent': ua, 'X-Forwarded-For': ip })).status;
    try {
      expect(await from('203.0.113.7')).toBe(403);
      expect(await from('203.0.113.7')).toBe(403);
      expect(denialRows(ua)).toHaveLength(1);
      expect(await from('198.51.100.9')).toBe(403);
    } finally {
      proxiedServer.closeAllConnections();
      await new Promise((r) => proxiedServer.close(r));
    }
    const rows = getSQLiteDB()
      .prepare("SELECT ip_address, details FROM auth_audit_log WHERE event_type = 'apikey_permission_denied' AND user_agent = ? ORDER BY rowid")
      .all(ua) as Array<{ ip_address: string; details: string }>;
    expect(rows.map((r) => r.ip_address)).toEqual(['203.0.113.7', '198.51.100.9']);
    expect(JSON.parse(rows[0].details).repeats).toBe(1);
  });

  it('the refusals it remembers are capped at 5000: the oldest is forgotten, the rest still count as repeats', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const key = await newKey('kl-r7 path walker', ['write']);
    const ua = 'kl-r7-cap';
    const hdr = { Authorization: `ApiKey ${key}`, 'User-Agent': ua };
    const rowsFor = (path: string) =>
      (getSQLiteDB()
        .prepare("SELECT COUNT(*) AS n FROM auth_audit_log WHERE event_type = 'apikey_permission_denied' AND user_agent = ? AND json_extract(details, '$.path') = ?")
        .get(ua, path) as { n: number }).n;
    // 5001 different routes, oldest first: one past the cap
    for (let i = 0; i <= 5000; i++) {
      expect((await request(gateSrv).get(`/alerts/kl-cap-${i}`).set(hdr)).status).toBe(403);
    }
    // the second-oldest is still remembered: its repeat updates its row
    expect((await request(gateSrv).get('/alerts/kl-cap-1').set(hdr)).status).toBe(403);
    expect(rowsFor('/alerts/kl-cap-1')).toBe(1);
    // the oldest was forgotten: its next refusal writes a fresh row
    expect((await request(gateSrv).get('/alerts/kl-cap-0').set(hdr)).status).toBe(403);
    expect(rowsFor('/alerts/kl-cap-0')).toBe(2);
  }, 120_000);

  it("the MCP stream's own check (a key in X-API-Key next to a non-ApiKey Authorization header) names what the key lacks", async () => {
    // The gate reads the Authorization header first, so this key reaches the
    // MCP route, which checks it itself.
    const asked = async (key: string) => {
      const r = await request(realSrv).get('/mcp/sse').set({ Authorization: 'Bearer kl-not-a-token', 'X-API-Key': key }).timeout({ response: 5_000 });
      expect(r.status).toBe(403);
      return { error: r.body.error, needed: r.body.needed, missing: r.body.missing };
    };
    expect(await asked(K.read)).toEqual({ error: REFUSED, needed: 'admin', missing: ['admin'] });
    expect(await asked(K.search)).toEqual({ error: REFUSED, needed: 'admin', missing: ['admin'] });
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

  it('expired pop-ups and their per-reader rows are deleted when agents ask, at most once an hour', async () => {
    const { createAgentNotification, getAgentNotification } = await import('../db/sqlite-notifications.js');
    const A = { Authorization: `ApiKey ${await newKey('kl-r7 sweeper', ['write', 'read'])}` };
    const db = getSQLiteDB();
    const real = Date.now();
    const pastIso = new Date(real - 60_000).toISOString();
    const T0 = real + 10 * 60 * 60 * 1000; // well past any earlier sweep in this file
    const ask = async (at: number) => {
      const spy = vi.spyOn(Date, 'now').mockReturnValue(at);
      try {
        expect((await request(realSrv).get('/ingest/notifications?hostname=kl-r7-sweep').set(A)).status).toBe(200);
      } finally {
        spy.mockRestore();
      }
    };
    // Code before round 7 has no per-reader table; count -1 there so the test
    // goes on to fail on the sweep itself, not on a missing table.
    const hasDeliveries = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_notification_deliveries'").get();
    const deliveries = (id: string) => hasDeliveries
      ? (db.prepare('SELECT COUNT(*) AS n FROM agent_notification_deliveries WHERE notification_id = ?').get(id) as { n: number }).n
      : -1;

    const shown = createAgentNotification('kl-r7 alert', 'kl-r7 still valid', 'm', {});
    const gone = createAgentNotification('kl-r7 alert', 'kl-r7 cleared then expired', 'm', { expires_at: new Date(real + 60_000).toISOString() });
    const before: number[] = [];
    for (const n of [shown, gone]) {
      expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(A).send({ hostname: 'kl-r7-sweep' })).status).toBe(200);
      before.push(deliveries(n.id));
    }
    db.prepare('UPDATE agent_notifications SET expires_at = ? WHERE id = ?').run(pastIso, gone.id);
    const stale = createAgentNotification('kl-r7 alert', 'kl-r7 expired', 'm', { expires_at: pastIso });
    const future = createAgentNotification('kl-r7 alert', 'kl-r7 expires in an hour', 'm', { expires_at: new Date(real + 60 * 60 * 1000).toISOString() });

    // The sweep deletes the per-reader rows itself, not only through the
    // table's ON DELETE CASCADE, so check it with foreign keys off.
    db.pragma('foreign_keys = OFF');
    try {
      await ask(T0);
    } finally {
      db.pragma('foreign_keys = ON');
    }
    expect(getAgentNotification(stale.id)).toBeUndefined();
    expect(getAgentNotification(gone.id)).toBeUndefined();
    expect(before).toEqual([1, 1]); // each ack wrote one per-reader row before the sweep
    expect(deliveries(gone.id)).toBe(0);
    expect(getAgentNotification(shown.id)).toBeDefined();
    expect(getAgentNotification(future.id)).toBeDefined();
    expect(deliveries(shown.id)).toBe(1);

    // within the hour no second sweep runs; after it, one does
    const later = createAgentNotification('kl-r7 alert', 'kl-r7 expired later', 'm', { expires_at: pastIso });
    await ask(T0 + 30 * 60 * 1000);
    expect(getAgentNotification(later.id)).toBeDefined();
    await ask(T0 + 61 * 60 * 1000);
    expect(getAgentNotification(later.id)).toBeUndefined();
  });

  it('signed-in users are readers of their own, and a host name that is not one string counts as no host', async () => {
    const { createAgentNotification } = await import('../db/sqlite-notifications.js');
    const u1 = await createUser('kl-r7-reader-1', 'kl-r7-reader-1@example.invalid', 'kl-r7-reader-pass-1', 'user');
    const u2 = await createUser('kl-r7-reader-2', 'kl-r7-reader-2@example.invalid', 'kl-r7-reader-pass-2', 'user');
    const J1 = { Authorization: `Bearer ${(await generateTokenPair(u1)).accessToken}` };
    const J2 = { Authorization: `Bearer ${(await generateTokenPair(u2)).accessToken}` };
    const K1 = { Authorization: `ApiKey ${await newKey('kl-r7 reader key', ['write', 'read'])}` };
    const all = createAgentNotification('kl-r7 alert', 'kl-r7 users', 'm', {});
    const hostOnly = createAgentNotification('kl-r7 alert', 'kl-r7 host only', 'm', { hostname: 'kl-r7-u' });
    const ids = async (h: Record<string, string>, query: string) => {
      const res = await request(realSrv).get(`/ingest/notifications${query}`).set(h);
      expect(res.status, res.text).toBe(200);
      return (res.body.notifications as Array<{ id: string }>).map((x) => x.id);
    };
    expect(await ids(J1, '?hostname=kl-r7-u')).toEqual(expect.arrayContaining([all.id, hostOnly.id]));
    expect((await request(realSrv).post(`/ingest/notifications/${all.id}/ack`).set(J1).send({ hostname: 'kl-r7-u' })).status).toBe(200);
    expect(await ids(J1, '?hostname=kl-r7-u')).not.toContain(all.id);
    // another signed-in user, and a key, still have it
    expect(await ids(J2, '?hostname=kl-r7-u')).toContain(all.id);
    expect(await ids(K1, '?hostname=kl-r7-u')).toContain(all.id);

    // ?hostname=a&hostname=b (an array) is no host: pop-ups for every host only, no error
    const two = await ids(J2, '?hostname=kl-r7-u&hostname=kl-r7-v');
    expect(two).toContain(all.id);
    expect(two).not.toContain(hostOnly.id);
    // a host name sent as a list in the ack body is no host either: a pop-up for one host can't be cleared with it
    expect((await request(realSrv).post(`/ingest/notifications/${hostOnly.id}/ack`).set(J2).send({ hostname: ['kl-r7-u'] })).status).toBe(404);
    expect(await ids(J2, '?hostname=kl-r7-u')).toContain(hostOnly.id);
    // ...and clearing a pop-up for every host with it clears it for "no host" only
    const all2 = createAgentNotification('kl-r7 alert', 'kl-r7 users two', 'm', {});
    expect((await request(realSrv).post(`/ingest/notifications/${all2.id}/ack`).set(J2).send({ hostname: ['kl-r7-u'] })).status).toBe(200);
    expect(await ids(J2, '')).not.toContain(all2.id);
    expect(await ids(J2, '?hostname=kl-r7-u')).toContain(all2.id);
  });
});

describe('round 8: every key refusal answers and is audited the same way, wherever it happens', () => {
  const newKey = async (name: string, perms: string[], indexes?: string[], owner = klAdminId) =>
    (await createApiKey(owner, name, perms, undefined, indexes)).apiKey;
  const rowsFor = (ua: string) =>
    getSQLiteDB()
      .prepare('SELECT event_type, details FROM auth_audit_log WHERE user_agent = ? ORDER BY rowid')
      .all(ua) as Array<{ event_type: string; details: string }>;
  /** A key refusal: 403 with error, message, needed and missing. */
  const refusal = (r: { status: number; body: Record<string, unknown>; text: string }, what: string) => {
    expect(r.status, `${what}: ${r.text}`).toBe(403);
    expect(typeof r.body.error, `${what}: error`).toBe('string');
    expect(typeof r.body.message, `${what}: message`).toBe('string');
    return { needed: r.body.needed, missing: r.body.missing };
  };

  it('refusals made inside the routes (not the gate) name needed and missing, and are audited with the full path', async () => {
    const ua = 'kl-r8-inside';
    const h = (k: string) => ({ Authorization: `ApiKey ${k}`, 'User-Agent': ua });

    // C1: requirePermission('write') on /demo/import, for an admin key (the gate lets admin through)
    expect(refusal(await request(realSrv).post('/demo/import').set(h(K.admin)).send({ logs: [] }), 'demo import'))
      .toEqual({ needed: 'write', missing: ['write'] });

    // C2: the index limit on ingest: the key has 'write', so nothing is missing
    const c2 = await request(realSrv).post('/ingest/http').set({ ...h(K.ingestScoped), 'X-Index': 'kl-other' }).send([{ message: 'kl-r8' }]);
    expect(refusal(c2, 'scoped ingest')).toEqual({ needed: 'write', missing: [] });
    expect(c2.body.error).toBe('API key not authorized for this index');
    expect(c2.body.attempted_index).toBe('kl-other');

    // script lock (alerts.ts), the agent API's script lock (agent.ts), saved-search create-alert (saved-searches.ts)
    const script = [{ type: 'script', config: { command: 'echo kl-r8' } }];
    expect(refusal(await request(realSrv).post('/alerts').set(h(K.alerts)).send({ name: 'kl r8', search_query: 'search *', actions: script }), 'alerts script'))
      .toEqual({ needed: 'admin', missing: ['admin'] });
    expect(refusal(await request(realSrv).post('/agent/alerts').set(h(K.alerts)).send({ name: 'kl r8', search_query: 'search *', actions: script }), 'agent script'))
      .toEqual({ needed: 'admin', missing: ['admin'] });
    const ss = (await request(realSrv).post('/saved-searches').set('Authorization', `Bearer ${jwtAdmin}`).send({ name: 'kl r8 saved', query: 'search *' })).body;
    expect(refusal(await request(realSrv).post(`/saved-searches/${ss.id}/create-alert`).set(h(K.alerts)).send({ actions: script }), 'saved-search script'))
      .toEqual({ needed: 'admin', missing: ['admin'] });
    // an alert that already runs a script (alerts.ts scriptLock)
    const sa = (await request(realSrv).post('/alerts').set('Authorization', `ApiKey ${K.admin}`)
      .send({ name: 'kl r8 script alert', search_query: 'search *', actions: script, enabled: false })).body;
    expect(sa.id).toBeTruthy();
    expect(refusal(await request(realSrv).put(`/alerts/${sa.id}`).set(h(K.alerts)).send({ name: 'kl r8 renamed' }), 'script alert change'))
      .toEqual({ needed: 'admin', missing: ['admin'] });
    // a shared dashboard (dashboards.ts sharedLock)
    const d = (await request(realSrv).post('/dashboards').set('Authorization', `Bearer ${jwtAdmin}`).send({ name: 'kl r8 shared' })).body;
    expect((await request(realSrv).post(`/dashboards/${d.id}/share`).set('Authorization', `Bearer ${jwtAdmin}`).send({})).status).toBe(200);
    expect(refusal(await request(realSrv).put(`/dashboards/${d.id}`).set(h(K.dashboards)).send({ name: 'kl r8 changed' }), 'shared dashboard'))
      .toEqual({ needed: 'admin', missing: ['admin'] });
    // someone else's alert (ownership.ts)
    const other = await createUser('kl-r8-owner', 'kl-r8-owner@example.invalid', 'kl-r8-owner-pass-1', 'user');
    const otherKey = await newKey('kl r8 other user alerts', ['read', 'alerts:write'], undefined, other.id);
    const mine = (await request(realSrv).post('/alerts').set('Authorization', `Bearer ${jwtAdmin}`).send({ name: 'kl r8 admin alert', search_query: 'search *' })).body;
    expect(mine.id).toBeTruthy();
    expect(refusal(await request(realSrv).put(`/alerts/${mine.id}`).set(h(otherKey)).send({ name: 'kl r8 taken' }), 'owner lock'))
      .toEqual({ needed: 'admin', missing: ['admin'] });

    // every one of them wrote an audit row with the path from the app's root
    const paths = rowsFor(ua).map((r) => `${r.event_type} ${JSON.parse(r.details).path}`);
    expect(paths).toEqual(expect.arrayContaining([
      'permission_denied /demo/import',
      'ingest_index_denied /ingest/http',
      'otlp_ingest_auth /ingest/http',
      'apikey_permission_denied /alerts',
      'apikey_permission_denied /agent/alerts',
      `apikey_permission_denied /saved-searches/${ss.id}/create-alert`,
      `apikey_permission_denied /alerts/${sa.id}`,
      `apikey_permission_denied /dashboards/${d.id}`,
      `apikey_permission_denied /alerts/${mine.id}`,
    ]));
    // (the ingest key's successful sign-in row, otlp_ingest_auth, is not a refusal)
    for (const r of rowsFor(ua).filter((x) => x.event_type !== 'otlp_ingest_auth')) {
      const det = JSON.parse(r.details);
      expect(typeof det.needed, r.details).toBe('string');
      expect(Array.isArray(det.missing), r.details).toBe(true);
    }
  });

  it("'missing' names every permission a key lacks for alert pop-ups, and nothing for an index-limited key that has both (B1, B2, MX2)", async () => {
    const ask = async (k: string) => refusal(await request(realSrv).get('/ingest/notifications').set('Authorization', `ApiKey ${k}`), 'pop-ups');
    expect(await ask(K.alertsOnly)).toEqual({ needed: 'write', missing: ['write', 'read'] });
    const demoted = await createUser('kl-r8-demoted', 'kl-r8-demoted@example.invalid', 'kl-r8-demoted-pass-1', 'admin');
    const demotedKey = await newKey('kl r8 demoted admin key', ['admin'], undefined, demoted.id);
    updateUserRole(demoted.id, 'user');
    expect(await ask(demotedKey)).toEqual({ needed: 'write', missing: ['write', 'read'] });
    const scopedBoth = await newKey('kl r8 scoped write+read', ['write', 'read'], ['money']);
    expect(await ask(scopedBoth)).toEqual({ needed: 'write', missing: [] });
  });

  it('the MCP stream route audits its own refusals like the gate does', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const ua = 'kl-r8-mcp';
    const r = await request(realSrv).get('/mcp/sse')
      .set({ Authorization: 'Bearer kl-not-a-token', 'X-API-Key': K.read, 'User-Agent': ua }).timeout({ response: 5_000 });
    expect(refusal(r, 'mcp sse')).toEqual({ needed: 'admin', missing: ['admin'] });
    const rows = rowsFor(ua);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('apikey_permission_denied');
    expect(JSON.parse(rows[0].details)).toMatchObject({ path: '/mcp/sse', needed: 'admin', missing: ['admin'] });
  });

  it('with no gate in front, the guards inside the routers answer like the gate, and a browser session gets the same bodies as before', async () => {
    const { requirePermission, denyReadonly, requireRole, authenticate, authenticateIngestion } = await import('../auth/middleware.js');
    const ok = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => res.status(299).json({ reached: true });
    const a = Router();
    a.post('/same', authenticate, requirePermission('write'), ok as never);
    a.post('/ro', authenticate, denyReadonly, ok as never);
    a.get('/admin', authenticate, requireAdmin, ok as never);
    a.get('/role', authenticate, requireRole('admin'), ok as never);
    // an admin-only lock inside a route (script alerts, shared objects, someone else's object)
    a.put('/lock', authenticate, (req, res) => refuseAdminOnly(req as never, res as never, 'kl r8 only an admin may change this'));
    // requirePermission for a permission that also needs 'read' (alerts:write)
    a.post('/alerts-write', authenticate, requirePermission('alerts:write'), ok as never);
    // two kinds of refusal on one route (the kind is chosen by a test header)
    a.post('/two-kinds', authenticate, (req, res) => refuseApiKey(req as never, res as never, {
      event: String(req.headers['x-kl-event']), needed: 'admin', missing: ['admin'], message: 'kl r8 two kinds',
    }));
    const b = Router();
    b.post('/same', authenticate, requirePermission('write'), ok as never);
    const bare = express();
    bare.use(express.json());
    bare.use('/kl-bare-a', a);
    bare.use('/kl-bare-b', b);
    bare.post('/kl-bare-ingest', authenticateIngestion, ok as never);
    const srv = bare.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    const base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
    try {
      (resetDenialRowsForTest as (() => void) | undefined)?.();
      const ua = 'kl-r8-bare';
      const h = (k: string) => ({ Authorization: `ApiKey ${k}`, 'User-Agent': ua });
      const ro = await createUser('kl-r8-readonly', 'kl-r8-readonly@example.invalid', 'kl-r8-readonly-pass-1', 'readonly');
      const roKey = await newKey('kl r8 readonly owner write key', ['read', 'write'], undefined, ro.id);
      const plain = await createUser('kl-r8-plain', 'kl-r8-plain@example.invalid', 'kl-r8-plain-pass-1', 'user');
      const plainKey = await newKey('kl r8 plain user key', ['read', 'write'], undefined, plain.id);

      // requirePermission
      expect(refusal(await request(base).post('/kl-bare-a/same').set(h(K.read)).send({}), 'requirePermission'))
        .toEqual({ needed: 'write', missing: ['write'] });
      // denyReadonly: a read-only owner's key
      const roRes = await request(base).post('/kl-bare-a/ro').set(h(roKey)).send({});
      const roRef = refusal(roRes, 'denyReadonly');
      expect(roRes.body.error).toBe('Read-only account cannot perform write operations');
      expect(typeof roRef.needed).toBe('string');
      expect(roRef.missing).toEqual([roRef.needed]);
      // requirePermission names everything the key lacks, not just the permission it asked for
      const dashOnly = await newKey('kl r8 dashboards only', ['dashboards:write']);
      expect(refusal(await request(base).post('/kl-bare-a/alerts-write').set(h(dashOnly)).send({}), 'requirePermission alerts:write'))
        .toEqual({ needed: 'alerts:write', missing: ['alerts:write', 'read'] });
      // requireAdmin: a key whose owner is not an admin
      const adm = await request(base).get('/kl-bare-a/admin').set(h(plainKey));
      expect(refusal(adm, 'requireAdmin role')).toEqual({ needed: 'admin', missing: ['admin'] });
      expect(adm.body.error).toBe('Admin access required');
      // requireRole: refused for its owner's role, not its own permissions
      const role = await request(base).get('/kl-bare-a/role').set(h(plainKey));
      expect(refusal(role, 'requireRole')).toEqual({ needed: 'admin', missing: [] });
      // refuseAdminOnly: 'missing' is what the key lacks, so an admin key refused by a route's
      // own lock is told nothing is missing, and a read key is told 'admin'
      const lockRead = await request(base).put('/kl-bare-a/lock').set(h(K.read)).send({});
      expect(refusal(lockRead, 'refuseAdminOnly read key')).toEqual({ needed: 'admin', missing: ['admin'] });
      expect(lockRead.body.error).toBe('kl r8 only an admin may change this');
      expect(lockRead.body.message).toBe('kl r8 only an admin may change this');
      expect(refusal(await request(base).put('/kl-bare-a/lock').set(h(K.admin)).send({}), 'refuseAdminOnly admin key'))
        .toEqual({ needed: 'admin', missing: [] });
      // authenticateIngestion (OTLP style): a key without 'write'
      expect(refusal(await request(base).post('/kl-bare-ingest').set(h(K.read)).send({}), 'authenticateIngestion'))
        .toEqual({ needed: 'write', missing: ['write'] });

      // the same inner path under two routers is two routes: two rows, each with its full path
      expect((await request(base).post('/kl-bare-b/same').set(h(K.read)).send({})).status).toBe(403);
      const rows = rowsFor(ua).map((r) => ({ event: r.event_type, ...JSON.parse(r.details) }));
      expect(rows.map((r) => `${r.event} ${r.path}`)).toEqual([
        'permission_denied /kl-bare-a/same',
        'permission_denied /kl-bare-a/ro',
        'permission_denied /kl-bare-a/alerts-write',
        'admin_access_denied /kl-bare-a/admin',
        'access_denied /kl-bare-a/role',
        'apikey_permission_denied /kl-bare-a/lock',
        'apikey_permission_denied /kl-bare-a/lock',
        'ingestion_permission_denied /kl-bare-ingest',
        'permission_denied /kl-bare-b/same',
      ]);

      // the event type is part of the dedupe: same key, address, method and path, two kinds -> two rows;
      // a repeat of either kind adds none
      const ua2 = 'kl-r8-two-kinds';
      const two = (ev: string) => request(base).post('/kl-bare-a/two-kinds')
        .set({ Authorization: `ApiKey ${K.read}`, 'User-Agent': ua2, 'X-KL-Event': ev }).send({});
      for (const ev of ['kl_r8_kind_one', 'kl_r8_kind_two', 'kl_r8_kind_one', 'kl_r8_kind_two']) expect((await two(ev)).status).toBe(403);
      expect(rowsFor(ua2).map((r) => r.event_type)).toEqual(['kl_r8_kind_one', 'kl_r8_kind_two']);

      // browser sessions: the same bodies as before the lock
      const roJwt = { Authorization: `Bearer ${(await generateTokenPair(ro)).accessToken}` };
      expect((await request(base).post('/kl-bare-a/same').set(roJwt).send({})).body).toEqual({ error: 'Insufficient permissions for this operation' });
      expect((await request(base).post('/kl-bare-a/ro').set(roJwt).send({})).body).toEqual({ error: 'Read-only account cannot perform write operations' });
      expect((await request(base).get('/kl-bare-a/admin').set(roJwt)).body).toEqual({ error: 'Admin access required' });
      expect((await request(base).get('/kl-bare-a/role').set(roJwt)).body).toEqual({ error: 'Insufficient permissions' });
      const lockJwt = await request(base).put('/kl-bare-a/lock').set(roJwt).send({});
      expect(lockJwt.status).toBe(403);
      expect(lockJwt.body).toEqual({ error: 'kl r8 only an admin may change this' });
      expect((await request(base).get('/kl-bare-a/admin').set('Authorization', `Bearer ${jwtAdmin}`)).status).toBe(299);
    } finally {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    }
  });

  it('a clock set back neither holds one audit row open nor stops the pop-up sweep (D1)', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const ua = 'kl-r8-clock';
    const k = await newKey('kl r8 clock poller', ['write']);
    const real = Date.now();
    const at = async (t: number) => {
      const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
      try {
        expect((await request(realSrv).get('/ingest/notifications').set({ Authorization: `ApiKey ${k}`, 'User-Agent': ua })).status).toBe(403);
      } finally {
        spy.mockRestore();
      }
    };
    const DAY = 24 * 60 * 60 * 1000;
    await at(real);
    expect(rowsFor(ua)).toHaveLength(1);
    await at(real - 2 * DAY); // the clock jumped back two days: a fresh row
    expect(rowsFor(ua)).toHaveLength(2);
    await at(real - 2 * DAY + 60 * 60 * 1000); // an hour later: a repeat of that row
    expect(rowsFor(ua)).toHaveLength(2);
    await at(real - 2 * DAY + 25 * 60 * 60 * 1000); // past the day: a fresh row
    expect(rowsFor(ua)).toHaveLength(3);

    const { createAgentNotification, getAgentNotification } = await import('../db/sqlite-notifications.js');
    const A = { Authorization: `ApiKey ${await newKey('kl r8 clock sweeper', ['write', 'read'])}` };
    const ask = async (t: number) => {
      const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
      try {
        expect((await request(realSrv).get('/ingest/notifications').set(A)).status).toBe(200);
      } finally {
        spy.mockRestore();
      }
    };
    const far = real + 100 * 60 * 60 * 1000; // later than any sweep earlier in this file
    await ask(far);
    const stale = createAgentNotification('kl-r8 alert', 'kl-r8 expired', 'm', { expires_at: new Date(real - 60_000).toISOString() });
    await ask(far - 2 * DAY); // clock back two days: sweeps again at once
    expect(getAgentNotification(stale.id)).toBeUndefined();
  });

  it('a refusal whose audit row cannot be written still refuses, and one console line says so (no key, no path)', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const db = getSQLiteDB();
    const k = await newKey('kl r8 audit down', ['write']);
    db.exec("CREATE TEMP TRIGGER kl_r8_audit_down BEFORE INSERT ON auth_audit_log WHEN NEW.user_agent = 'kl-r8-audit-down' BEGIN SELECT RAISE(ABORT, 'kl-r8 audit table down'); END;");
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await request(realSrv).get('/alerts/kl-r8-secret-path').set({ Authorization: `ApiKey ${k}`, 'User-Agent': 'kl-r8-audit-down' });
      expect(refusal(r, 'audit down')).toEqual({ needed: 'read', missing: ['read'] });
      const lines = errors.mock.calls.map((c) => c.map(String).join(' '));
      const said = lines.filter((l) => /could not write the audit row/.test(l));
      expect(said).toHaveLength(1);
      expect(said[0]).not.toMatch(/lnog_|kl-r8-secret-path|kl-r8 audit table down/);
    } finally {
      errors.mockRestore();
      db.exec('DROP TRIGGER IF EXISTS kl_r8_audit_down');
    }
    expect(rowsFor('kl-r8-audit-down')).toHaveLength(0);
  });

  it('a failed pop-up sweep says so on the console and the pop-ups are still served', async () => {
    const { createAgentNotification } = await import('../db/sqlite-notifications.js');
    const db = getSQLiteDB();
    const A = { Authorization: `ApiKey ${await newKey('kl r8 sweep down', ['write', 'read'])}` };
    createAgentNotification('kl-r8 alert', 'kl-r8 expired for sweep', 'm', { expires_at: new Date(Date.now() - 60_000).toISOString() });
    db.exec("CREATE TEMP TRIGGER kl_r8_sweep_down BEFORE DELETE ON agent_notifications BEGIN SELECT RAISE(ABORT, 'kl-r8 sweep down'); END;");
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300 * 60 * 60 * 1000);
    try {
      const r = await request(realSrv).get('/ingest/notifications').set(A);
      expect(r.status, r.text).toBe(200);
      const said = errors.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => /could not remove expired pop-ups/.test(l));
      expect(said).toHaveLength(1);
      expect(said[0]).not.toMatch(/kl-r8 sweep down/);
    } finally {
      spy.mockRestore();
      errors.mockRestore();
      db.exec('DROP TRIGGER IF EXISTS kl_r8_sweep_down');
    }
  });

  it('a host name longer than 255 characters is refused with 400, and clears nothing', async () => {
    const { createAgentNotification } = await import('../db/sqlite-notifications.js');
    const A = { Authorization: `ApiKey ${await newKey('kl r8 long host', ['write', 'read'])}` };
    const n = createAgentNotification('kl-r8 alert', 'kl-r8 long host', 'm', {});
    const long = 'h'.repeat(256);
    const g = await request(realSrv).get(`/ingest/notifications?hostname=${long}`).set(A);
    expect(g.status).toBe(400);
    expect(g.body.error).toMatch(/255/);
    const p = await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(A).send({ hostname: long });
    expect(p.status).toBe(400);
    const ok = 'h'.repeat(255);
    expect((await request(realSrv).get(`/ingest/notifications?hostname=${ok}`).set(A)).status).toBe(200);
    expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(A).send({ hostname: ok })).status).toBe(200);
    const hasDeliveries = !!getSQLiteDB().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_notification_deliveries'").get();
    if (hasDeliveries) {
      const hosts = getSQLiteDB().prepare('SELECT LENGTH(hostname) AS n FROM agent_notification_deliveries WHERE notification_id = ?').all(n.id) as Array<{ n: number }>;
      expect(hosts.map((x) => x.n)).toEqual([255]);
    }
  });

  it('every 403 in the API source is either a key refusal through refuseApiKey or on this hand-checked list', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walkDir = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walkDir(p);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts')) files.push(p);
      }
    };
    walkDir(root);
    const found: Record<string, number> = {};
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      const n = (text.match(/status\(\s*403\s*\)|sendStatus\(\s*403\s*\)|statusCode\s*=\s*403|writeHead\(\s*403/g) ?? []).length;
      if (n) found[path.relative(root, f)] = n;
    }
    // Each is NOT a refusal of an API key for what it may do, or is the one
    // place that answers one (api-key-gate.ts refuseApiKey):
    expect(found).toEqual({
      'middleware/csrf.ts': 3, // CSRF token checks (browser sessions)
      'auth/middleware.ts': 4, // the browser-session branches of requireRole, requireAdmin, requirePermission, denyReadonly
      'auth/api-key-gate.ts': 2, // refuseApiKey itself, and refuseAdminOnly's browser-session branch
      'routes/cim.ts': 2, // built-in data models can't be changed by anyone
      'routes/templates.ts': 2, // built-in templates can't be changed by anyone
      'routes/ingest.ts': 1, // denyIndex's browser-session branch
      'routes/auth.ts': 2, // setup token; a key asked for above its owner's role (refused for everyone)
    });
  });
});

describe('round 9: routes that ask for a permission by name use the gate grants; audit, host and delivery limits', () => {
  const newKey = async (name: string, perms: string[], owner = klAdminId) => createApiKey(owner, name, perms);
  const rowsFor = (ua: string) =>
    getSQLiteDB()
      .prepare('SELECT event_type, user_id, details FROM auth_audit_log WHERE user_agent = ? ORDER BY rowid')
      .all(ua) as Array<{ event_type: string; user_id: string; details: string }>;
  const refusal = (r: { status: number; body: Record<string, unknown>; text: string }, what: string) => {
    expect(r.status, `${what}: ${r.text}`).toBe(403);
    expect(typeof r.body.error, `${what}: error`).toBe('string');
    expect(typeof r.body.message, `${what}: message`).toBe('string');
    return { needed: r.body.needed, missing: r.body.missing };
  };

  it("an 'admin' key (and a '*' key) can read /demo/stats and /demo/export, as the gate already allowed", async () => {
    for (const k of [K.admin, K.star]) {
      const s = await request(realSrv).get('/demo/stats').set('Authorization', `ApiKey ${k}`);
      expect(s.status, s.text).toBe(200);
      const e = await request(realSrv).get('/demo/export').set('Authorization', `ApiKey ${k}`);
      expect(e.status, e.text).not.toBe(403);
      expect(e.status, e.text).not.toBe(401);
    }
    // the gate keeps /demo for admin keys: read and send-logs keys are still refused there
    for (const k of [K.read, K.ingest]) {
      expect(refusal(await request(realSrv).get('/demo/stats').set('Authorization', `ApiKey ${k}`), 'demo stats non-admin'))
        .toEqual({ needed: 'admin', missing: ['admin'] });
    }
  });

  it('with no gate in front, requirePermission and requireRole grant and refuse like the gate', async () => {
    const { requirePermission, requireRole, authenticate } = await import('../auth/middleware.js');
    const ok = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => res.status(299).json({ reached: true });
    const a = Router();
    a.get('/read', authenticate, requirePermission('read'), ok as never);
    a.post('/alerts-write', authenticate, requirePermission('alerts:write'), ok as never);
    a.post('/dashboards-write', authenticate, requirePermission('dashboards:write'), ok as never);
    a.post('/write', authenticate, requirePermission('write'), ok as never);
    a.get('/writer-role', authenticate, requireRole('user', 'admin'), ok as never);
    a.get('/reader-role', authenticate, requireRole('readonly'), ok as never);
    const bare = express();
    bare.use(express.json());
    bare.use('/kl-r9', a);
    // the pop-up path: 'write' there also needs read
    bare.get('/ingest/notifications', authenticate, requirePermission('write'), ok as never);
    const srv = bare.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    const base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
    const h = (k: string) => ({ Authorization: `ApiKey ${k}`, 'User-Agent': 'kl-r9-bare' });
    try {
      // read by name: read, search, admin and '*' keys pass; send-logs-only and X-only keys don't
      for (const k of [K.read, K.admin, K.star, K.search]) {
        expect((await request(base).get('/kl-r9/read').set(h(k))).status).toBe(299);
      }
      expect(refusal(await request(base).get('/kl-r9/read').set(h(K.ingest)), 'read by name, ingest key'))
        .toEqual({ needed: 'read', missing: ['read'] });
      expect(refusal(await request(base).get('/kl-r9/read').set(h(K.alertsOnly)), 'read by name, alerts:write only'))
        .toEqual({ needed: 'read', missing: ['read'] });
      // alerts:write / dashboards:write by name: need read too, unless the key is admin
      for (const k of [K.alerts, K.searchAlerts, K.admin, K.star]) {
        expect((await request(base).post('/kl-r9/alerts-write').set(h(k)).send({})).status).toBe(299);
      }
      expect(refusal(await request(base).post('/kl-r9/alerts-write').set(h(K.alertsOnly)).send({}), 'alerts:write without read'))
        .toEqual({ needed: 'alerts:write', missing: ['read'] });
      expect(refusal(await request(base).post('/kl-r9/dashboards-write').set(h(K.dashboardsOnly)).send({}), 'dashboards:write without read'))
        .toEqual({ needed: 'dashboards:write', missing: ['read'] });
      expect((await request(base).post('/kl-r9/dashboards-write').set(h(K.dashboards)).send({})).status).toBe(299);
      // write by name (send logs): only 'write' or '*'
      expect((await request(base).post('/kl-r9/write').set(h(K.ingest)).send({})).status).toBe(299);
      expect(refusal(await request(base).post('/kl-r9/write').set(h(K.admin)).send({}), 'write by name, admin key'))
        .toEqual({ needed: 'write', missing: ['write'] });
      // on the pop-up path, a key with neither is told it lacks both
      expect(refusal(await request(base).get('/ingest/notifications').set(h(K.alertsOnly)), 'pop-up write by name'))
        .toEqual({ needed: 'write', missing: ['write', 'read'] });
      expect(refusal(await request(base).get('/ingest/notifications').set(h(K.read)), 'pop-up write by name, read key'))
        .toEqual({ needed: 'write', missing: ['write'] });

      // requireRole names the permission that matches the roles it allows
      const ro = await createUser('kl-r9-readonly', 'kl-r9-readonly@example.invalid', 'kl-r9-readonly-pass-1', 'readonly');
      const roKey = (await newKey('kl r9 readonly owner key', ['read'], ro.id)).apiKey;
      const plain = await createUser('kl-r9-plain', 'kl-r9-plain@example.invalid', 'kl-r9-plain-pass-1', 'user');
      const plainKey = (await newKey('kl r9 plain user key', ['read', 'write'], plain.id)).apiKey;
      expect(refusal(await request(base).get('/kl-r9/writer-role').set(h(roKey)), 'requireRole user/admin'))
        .toEqual({ needed: 'write', missing: [] });
      expect(refusal(await request(base).get('/kl-r9/reader-role').set(h(plainKey)), 'requireRole readonly'))
        .toEqual({ needed: 'read', missing: [] });
      expect((await request(base).get('/kl-r9/writer-role').set(h(plainKey))).status).toBe(299);
    } finally {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    }
  });

  it('a permission name the key lock does not know fails closed: only a * key meets it', async () => {
    const { requirePermission, authenticate } = await import('../auth/middleware.js');
    const { keyHasPermission, missingForPermission } = await import('../auth/key-policy.js');
    // the rule itself, with no route in front
    for (const name of ['kl-unknown', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      for (const perms of [['read'], ['admin'], ['write'], ['search'], ['alerts:write', 'read'], [name], [name, 'admin'], [], null]) {
        expect(keyHasPermission(perms, name), `${name} with ${JSON.stringify(perms)}`).toBe(false);
        expect(missingForPermission(perms, name, '/kl-r9'), `${name} missing with ${JSON.stringify(perms)}`).toEqual([name]);
      }
      expect(keyHasPermission(['*'], name), `${name} with *`).toBe(true);
      expect(missingForPermission(['*'], name, '/kl-r9')).toEqual([]);
    }
    // the names the key lock knows go through its grants
    expect(keyHasPermission(['write'], 'write')).toBe(true);
    expect(keyHasPermission(['admin'], 'write')).toBe(false);
    expect(keyHasPermission(['read'], 'search')).toBe(true);
    expect(keyHasPermission(['admin'], 'search')).toBe(true);
    expect(keyHasPermission(['write'], 'search')).toBe(false);
    expect(missingForPermission(['write'], 'search', '/kl-r9')).toEqual(['read']);
    expect(keyHasPermission(['search'], 'read')).toBe(true);
    expect(keyHasPermission(['alerts:write'], 'alerts:write')).toBe(false);

    // and through a route
    const ok = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => res.status(299).json({ reached: true });
    const bare = express();
    bare.use(express.json());
    bare.get('/kl-r9u/unknown', authenticate, requirePermission('kl-unknown'), ok as never);
    bare.get('/kl-r9u/inherited', authenticate, requirePermission('toString'), ok as never);
    bare.get('/kl-r9u/search', authenticate, requirePermission('search'), ok as never);
    const srv = bare.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    const base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
    const h = (k: string) => ({ Authorization: `ApiKey ${k}`, 'User-Agent': 'kl-r9-unknown-name' });
    // a key stored with the same odd string (only possible by writing the row past the key form)
    const oddKey = (await newKey('kl r9 odd-name key', ['kl-unknown', 'toString'])).apiKey;
    try {
      for (const [path, name] of [['/kl-r9u/unknown', 'kl-unknown'], ['/kl-r9u/inherited', 'toString']] as const) {
        for (const k of [K.read, K.admin, K.search, K.ingest, oddKey]) {
          expect(refusal(await request(base).get(path).set(h(k)), `${name} by name`)).toEqual({ needed: name, missing: [name] });
        }
        expect((await request(base).get(path).set(h(K.star))).status).toBe(299);
      }
      for (const k of [K.read, K.search, K.admin, K.star]) {
        expect((await request(base).get('/kl-r9u/search').set(h(k))).status).toBe(299);
      }
      expect(refusal(await request(base).get('/kl-r9u/search').set(h(K.ingest)), 'search by name, ingest key'))
        .toEqual({ needed: 'search', missing: ['read'] });
    } finally {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    }
  });

  it('the audit row of a refused key names the key by its id (never the key)', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const made = await newKey('kl r9 audited key', ['write']);
    const ua = 'kl-r9-audit-id';
    const r = await request(realSrv).get('/alerts').set({ Authorization: `ApiKey ${made.apiKey}`, 'User-Agent': ua });
    expect(refusal(r, 'gate refusal')).toEqual({ needed: 'read', missing: ['read'] });
    const rows = rowsFor(ua);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(klAdminId);
    expect(JSON.parse(rows[0].details)).toMatchObject({ apiKeyId: made.keyData.id, path: '/alerts', needed: 'read', missing: ['read'] });
    expect(rows[0].details).not.toContain(made.apiKey);
  });

  it('a pop-up host name is counted in Unicode code points: 255 plain emoji are fine, 256 are not; a flag counts as two', async () => {
    const { createAgentNotification } = await import('../db/sqlite-notifications.js');
    const A = { Authorization: `ApiKey ${(await newKey('kl r9 emoji host', ['write', 'read'])).apiKey}` };
    const n = createAgentNotification('kl-r9 alert', 'kl-r9 emoji host', 'm', {});
    const ok = '\u{1F600}'.repeat(255); // 510 UTF-16 units
    const long = '\u{1F600}'.repeat(256);
    expect((await request(realSrv).get(`/ingest/notifications?hostname=${encodeURIComponent(ok)}`).set(A)).status).toBe(200);
    expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(A).send({ hostname: ok })).status).toBe(200);
    const g = await request(realSrv).get(`/ingest/notifications?hostname=${encodeURIComponent(long)}`).set(A);
    expect(g.status).toBe(400);
    expect(g.body.error).toMatch(/255 characters/);
    expect((await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(A).send({ hostname: long })).status).toBe(400);
    const hosts = getSQLiteDB().prepare('SELECT hostname FROM agent_notification_deliveries WHERE notification_id = ?').all(n.id) as Array<{ hostname: string }>;
    expect(hosts.map((x) => [...x.hostname].length)).toEqual([255]);
    // counted in Unicode code points: a flag is two (two regional letters), so 127 flags fit and 128 do not
    const flag = '\u{1F1FA}\u{1F1F8}';
    expect((await request(realSrv).get(`/ingest/notifications?hostname=${encodeURIComponent(flag.repeat(127) + 'a')}`).set(A)).status).toBe(200);
    expect((await request(realSrv).get(`/ingest/notifications?hostname=${encodeURIComponent(flag.repeat(128))}`).set(A)).status).toBe(400);
  });

  it('one reader has clears kept on at most 1000 hosts per pop-up; past that a clear is not kept and the pop-up stays pending (never hidden)', async () => {
    const { createAgentNotification, markNotificationDelivered, getPendingNotifications, MAX_POPUP_HOSTS_PER_READER } =
      await import('../db/sqlite-notifications.js');
    expect(MAX_POPUP_HOSTS_PER_READER).toBe(1000);
    const made = await newKey('kl r9 many hosts', ['write', 'read']);
    const A = { Authorization: `ApiKey ${made.apiKey}` };
    const B = { Authorization: `ApiKey ${(await newKey('kl r9 other reader', ['write', 'read'])).apiKey}` };
    const n = createAgentNotification('kl-r9 alert', 'kl-r9 many hosts', 'm', {});
    const who = (hostname: string) => ({ reader: `key:${made.keyData.id}`, hostname });
    const count = () => (getSQLiteDB()
      .prepare('SELECT COUNT(*) AS c FROM agent_notification_deliveries WHERE notification_id = ? AND reader = ?')
      .get(n.id, `key:${made.keyData.id}`) as { c: number }).c;
    const pendingFor = async (hdr: Record<string, string>, host: string) => {
      const r = await request(realSrv).get(`/ingest/notifications?hostname=${host}`).set(hdr);
      expect(r.status, r.text).toBe(200);
      return (r.body.notifications as Array<{ id: string }>).some((x) => x.id === n.id);
    };
    const ack = async (host: string) => {
      const r = await request(realSrv).post(`/ingest/notifications/${n.id}/ack`).set(A).send({ hostname: host });
      expect(r.status, r.text).toBe(200);
      return r.body;
    };
    for (let i = 0; i < MAX_POPUP_HOSTS_PER_READER - 1; i++) {
      expect(markNotificationDelivered(n.id, who(`kl-r9-host-${i}`))).toEqual({ found: true, recorded: true });
    }
    expect(count()).toBe(MAX_POPUP_HOSTS_PER_READER - 1);
    expect(await pendingFor(A, 'kl-r9-fresh-host')).toBe(true);
    // the 1000th clear, through the route: kept
    expect(await ack('kl-r9-host-last')).toEqual({ success: true, recorded: true });
    expect(count()).toBe(MAX_POPUP_HOSTS_PER_READER);
    expect(await pendingFor(A, 'kl-r9-host-last')).toBe(false);
    // a host with no clear still gets it: the limit hides nothing
    expect(await pendingFor(A, 'kl-r9-fresh-host')).toBe(true);
    expect(getPendingNotifications(who('kl-r9-fresh-host')).some((x) => x.id === n.id)).toBe(true);
    // a clear past the limit is answered, not kept, and the pop-up stays pending for that host
    expect(await ack('kl-r9-one-more')).toEqual({ success: true, recorded: false });
    expect(markNotificationDelivered(n.id, who('kl-r9-and-another'))).toEqual({ found: true, recorded: false });
    expect(count()).toBe(MAX_POPUP_HOSTS_PER_READER);
    expect(await pendingFor(A, 'kl-r9-one-more')).toBe(true);
    // hosts whose clear was kept stay cleared, and clearing one again says so
    expect(await pendingFor(A, 'kl-r9-host-0')).toBe(false);
    expect(await ack('kl-r9-host-0')).toEqual({ success: true, recorded: true });
    expect(count()).toBe(MAX_POPUP_HOSTS_PER_READER);
    // another key still sees it, also on a host this key cleared
    expect(await pendingFor(B, 'kl-r9-host-0')).toBe(true);
    // a pop-up that is not there is still 404
    expect(markNotificationDelivered('kl-r9-no-such-popup', who('kl-r9-host-0'))).toEqual({ found: false, recorded: false });
    expect((await request(realSrv).post('/ingest/notifications/kl-r9-no-such-popup/ack').set(A).send({ hostname: 'x' })).status).toBe(404);
  });

  it("round 10: a read-only account's read, search or '*' key reads through /agent, and still changes nothing there", async () => {
    const ro = await createUser('kl-r10-readonly', 'kl-r10-readonly@example.invalid', 'kl-r10-readonly-pass-1', 'readonly');
    const keys = {
      read: (await newKey('kl r10 readonly read', ['read'], ro.id)).apiKey,
      search: (await newKey('kl r10 readonly search', ['search'], ro.id)).apiKey,
      // made straight in the database, as an older key could be
      star: (await newKey('kl r10 readonly star', ['*'], ro.id)).apiKey,
    };
    const ua = 'kl-r10-readonly-agent';
    for (const [name, k] of Object.entries(keys)) {
      const h = { Authorization: `ApiKey ${k}`, 'User-Agent': ua };
      for (const p of ['/agent', '/agent/summary', '/agent/indexes', '/agent/fields', '/agent/alerts']) {
        const r = await request(realSrv).get(p).set(h);
        expect(r.status, `${name} GET ${p}: ${r.text}`).toBe(200);
      }
      const s1 = await request(realSrv).post('/agent/search').set(h).send({ query: 'search * | head 1' });
      expect(s1.status, `${name} POST /agent/search: ${s1.text}`).not.toBe(403);
      expect(s1.status, `${name} POST /agent/search: ${s1.text}`).toBeLessThan(500);
      // changes are still refused, naming what the key lacks
      const w = await request(realSrv).post('/agent/alerts').set(h).send({ name: 'kl r10 ro', search_query: 'search *' });
      expect(refusal(w, `${name} POST /agent/alerts`)).toEqual({ needed: 'alerts:write', missing: ['alerts:write'] });
      const d = await request(realSrv).delete('/agent/alerts/kl-none').set(h);
      expect(d.status, `${name} DELETE /agent/alerts/:id`).toBe(403);
    }
    // the reads above left no refusal rows; the changes did
    const refusedPaths = new Set(rowsFor(ua).map((r) => JSON.parse(r.details).path as string));
    expect([...refusedPaths].sort()).toEqual(['/agent/alerts', '/agent/alerts/kl-none']);
  });

  it('round 10: the second read-only lock refuses only when every permission the key meets on the route is a write-type one', async () => {
    const { requirePermission, authenticate } = await import('../auth/middleware.js');
    const ro = await createUser('kl-r10-ro-bare', 'kl-r10-ro-bare@example.invalid', 'kl-r10-ro-bare-pass-1', 'readonly');
    const roRead = (await newKey('kl r10 ro bare read', ['read'], ro.id)).apiKey;
    const roStar = (await newKey('kl r10 ro bare star', ['*'], ro.id)).apiKey;
    const a = express();
    a.use(express.json());
    const ok = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => res.status(299).json({ ok: true });
    a.get('/kl-r10/read-or-admin', authenticate, requirePermission('read', 'admin'), ok as never);
    a.get('/kl-r10/admin-or-read', authenticate, requirePermission('admin', 'read'), ok as never);
    a.get('/kl-r10/star-list', authenticate, requirePermission('read', 'search', 'admin', '*'), ok as never);
    a.get('/kl-r10/admin', authenticate, requirePermission('admin'), ok as never);
    a.get('/kl-r10/write', authenticate, requirePermission('write'), ok as never);
    a.get('/kl-r10/alerts', authenticate, requirePermission('alerts:write'), ok as never);
    const srv = a.listen(0, '::1');
    await new Promise((r) => srv.once('listening', r));
    const base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
    const h = (k: string) => ({ Authorization: `ApiKey ${k}` });
    try {
      for (const k of [roRead, roStar]) {
        for (const p of ['/kl-r10/read-or-admin', '/kl-r10/admin-or-read', '/kl-r10/star-list']) {
          expect((await request(base).get(p).set(h(k))).status, p).toBe(299);
        }
        expect(refusal(await request(base).get('/kl-r10/admin').set(h(k)), 'admin')).toEqual({ needed: 'admin', missing: ['admin'] });
        expect(refusal(await request(base).get('/kl-r10/write').set(h(k)), 'write')).toEqual({ needed: 'write', missing: ['write'] });
        expect(refusal(await request(base).get('/kl-r10/alerts').set(h(k)), 'alerts:write'))
          .toEqual({ needed: 'alerts:write', missing: ['alerts:write'] });
      }
      // the same routes for an admin's keys
      expect((await request(base).get('/kl-r10/admin').set(h(K.admin))).status).toBe(299);
      expect((await request(base).get('/kl-r10/read-or-admin').set(h(K.read))).status).toBe(299);
    } finally {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    }
  });

  it('the kinds of refusal whose audit-down line was said are capped at 5000: the oldest is said again, the rest stay quiet', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const db = getSQLiteDB();
    const k = (await newKey('kl r9 audit down cap', ['write'])).apiKey;
    const ua = 'kl-r9-audit-down-cap';
    const hdr = { Authorization: `ApiKey ${k}`, 'User-Agent': ua };
    db.exec("CREATE TEMP TRIGGER kl_r9_audit_down_cap BEFORE INSERT ON auth_audit_log WHEN NEW.user_agent = 'kl-r9-audit-down-cap' BEGIN SELECT RAISE(ABORT, 'kl-r9 audit table down'); END;");
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const said = () => errors.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => /could not write the audit row/.test(l)).length;
    try {
      // 5001 different kinds, oldest first: one past the cap
      for (let i = 0; i <= 5000; i++) {
        expect((await request(gateSrv).get(`/alerts/kl-r9-cap-${i}`).set(hdr)).status).toBe(403);
      }
      expect(said()).toBe(5001);
      // the second-oldest is still remembered: quiet
      expect((await request(gateSrv).get('/alerts/kl-r9-cap-1').set(hdr)).status).toBe(403);
      expect(said()).toBe(5001);
      // the oldest was forgotten: said again
      expect((await request(gateSrv).get('/alerts/kl-r9-cap-0').set(hdr)).status).toBe(403);
      expect(said()).toBe(5002);
    } finally {
      errors.mockRestore();
      db.exec('DROP TRIGGER IF EXISTS kl_r9_audit_down_cap');
    }
  }, 180_000);

  it('when the audit row cannot be written, the console says so once per kind of refusal a day, not once per request', async () => {
    (resetDenialRowsForTest as (() => void) | undefined)?.();
    const db = getSQLiteDB();
    const k = (await newKey('kl r9 audit down', ['write'])).apiKey;
    const ua = 'kl-r9-audit-down';
    db.exec("CREATE TEMP TRIGGER kl_r9_audit_down BEFORE INSERT ON auth_audit_log WHEN NEW.user_agent = 'kl-r9-audit-down' BEGIN SELECT RAISE(ABORT, 'kl-r9 audit table down'); END;");
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const said = () => errors.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => /could not write the audit row/.test(l));
    const at = async (p: string, t?: number) => {
      const spy = t === undefined ? null : vi.spyOn(Date, 'now').mockReturnValue(t);
      try {
        expect((await request(realSrv).get(p).set({ Authorization: `ApiKey ${k}`, 'User-Agent': ua })).status).toBe(403);
      } finally {
        spy?.mockRestore();
      }
    };
    try {
      const now = Date.now();
      for (let i = 0; i < 3; i++) await at('/alerts', now + i * 1000);
      expect(said()).toHaveLength(1);
      await at('/dashboards', now + 4000); // another kind: its own line
      expect(said()).toHaveLength(2);
      await at('/alerts', now + 25 * 60 * 60 * 1000); // a day later: said again
      expect(said()).toHaveLength(3);
      await at('/alerts', now - 2 * 24 * 60 * 60 * 1000); // clock set back: said again
      expect(said()).toHaveLength(4);
      await at('/alerts', now - 2 * 24 * 60 * 60 * 1000 + 1000); // the same kind a second later: quiet
      expect(said()).toHaveLength(4);
      resetDenialRowsForTest(); // the test hook forgets what was said too
      await at('/alerts', now - 2 * 24 * 60 * 60 * 1000 + 2000);
      expect(said()).toHaveLength(5);
      for (const l of said()) expect(l).not.toMatch(/lnog_|\/alerts|\/dashboards|kl-r9 audit table down/);
    } finally {
      errors.mockRestore();
      db.exec('DROP TRIGGER IF EXISTS kl_r9_audit_down');
    }
    expect(rowsFor(ua)).toHaveLength(0);
  });
});

describe('round 10: a damaged stored permission list grants nothing', () => {
  it('only a JSON list of strings counts; anything else is no permissions at all', async () => {
    const { parseStoredKeyPermissions, keyHasPermission } = await import('../auth/key-policy.js');
    expect(parseStoredKeyPermissions('["read","alerts:write"]')).toEqual(['read', 'alerts:write']);
    expect(parseStoredKeyPermissions('[]')).toEqual([]);
    expect(parseStoredKeyPermissions(['admin'])).toEqual(['admin']);
    for (const raw of ['"*"', '"readonly"', '"read"', 'not json', '', '{"0":"*","length":1}', '["*",1]', '[null]', '["read",["*"]]', 'null', '5', 'true']) {
      expect(parseStoredKeyPermissions(raw), JSON.stringify(raw)).toEqual([]);
    }
    // a bare string handed to the checks is not a list: 'readonly' never meets 'read' by substring
    const bad = 'readonly' as unknown as string[];
    expect(keyHasNeed(bad, 'read')).toBe(false);
    expect(keyHasPermission(bad, 'read')).toBe(false);
    expect(keyHasPermission('*' as unknown as string[], 'kl-unknown')).toBe(false);
    const { missingForPermission } = await import('../auth/key-policy.js');
    expect(missingForPermission(bad, 'read', '/alerts')).toEqual(['read']);
    expect(missingForPermission('*' as unknown as string[], 'kl-unknown', '/alerts')).toEqual(['kl-unknown']);
    expect(missingForPermission('write' as unknown as string[], 'alerts:write', '/alerts')).toEqual(['alerts:write', 'read']);
    expect(effectiveKeyPermissions('*' as unknown as string[], 'admin')).toEqual([]);
    expect(effectiveKeyPermissions('readonly' as unknown as string[], 'readonly')).toEqual([]);
    expect(effectiveKeyPermissions(['read', 7] as unknown as string[], 'user')).toEqual([]);
  });

  it("an admin's key whose stored list is damaged is refused everywhere, an intact one is not", async () => {
    const owner = await createUser('kl-r10-damaged', 'kl-r10-damaged@example.invalid', 'kl-r10-damaged-pass-1', 'admin');
    const db = getSQLiteDB();
    const intact = await createApiKey(owner.id, 'kl r10 intact star', ['*']);
    expect((await request(realSrv).get('/alerts').set('Authorization', `ApiKey ${intact.apiKey}`)).status).toBe(200);
    for (const stored of ['"*"', '"readonly"', 'not json', '{"0":"*","length":1}', '["*",1]', '"admin"']) {
      const k = await createApiKey(owner.id, `kl r10 damaged ${stored}`, ['*']);
      db.prepare('UPDATE api_keys SET permissions = ? WHERE id = ?').run(stored, k.keyData.id);
      const v = await validateApiKey(k.apiKey);
      expect(v?.permissions, stored).toEqual([]);
      const h = { Authorization: `ApiKey ${k.apiKey}` };
      const read = await request(realSrv).get('/alerts').set(h);
      expect(read.status, `${stored} GET /alerts`).toBe(403);
      expect(read.body.needed).toBe('read');
      expect((await request(realSrv).post('/ingest/http').set(h).send([{ message: 'kl r10' }])).status, `${stored} ingest`).toBe(403);
      expect((await request(realSrv).get('/agent').set(h)).status, `${stored} GET /agent`).toBe(403);
      expect((await request(realSrv).get('/auth/api-keys').set(h)).status, `${stored} GET /auth/api-keys`).toBe(403);
    }
  });
});

describe("round 10: requirePermission's second read-only lock and the agent's write routes", () => {
  // The key's permissions are normally cut to what a read-only owner may do
  // (effectiveKeyPermissions), so the second lock in requirePermission only
  // matters if that cut is ever missed. Here the request arrives with the
  // permissions NOT cut, to check the second lock on its own.
  const serve = async (role: string, perms: string[]) => {
    const { requirePermission } = await import('../auth/middleware.js');
    const ok = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => res.status(299).json({ reached: true });
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      (req as unknown as Record<string, unknown>).user = { id: 'kl-r10-uncut', username: 'kl-r10-uncut', email: 'kl-r10-uncut@example.invalid', role };
      (req as unknown as Record<string, unknown>).authMethod = 'apikey';
      (req as unknown as Record<string, unknown>).apiKeyId = 'kl-r10-uncut-key';
      (req as unknown as Record<string, unknown>).apiKeyPermissions = perms;
      next();
    });
    a.get('/read', requirePermission('read'), ok as never);
    a.get('/search', requirePermission('search'), ok as never);
    a.get('/read-or-admin', requirePermission('read', 'admin'), ok as never);
    a.get('/admin', requirePermission('admin'), ok as never);
    a.post('/alerts-write', requirePermission('alerts:write'), ok as never);
    a.post('/write', requirePermission('write'), ok as never);
    const srv = a.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    return { srv, base: `http://[::1]:${(srv.address() as AddressInfo).port}` };
  };
  const roRefusal = (r: { status: number; body: Record<string, unknown>; text: string }, what: string) => {
    expect(r.status, `${what}: ${r.text}`).toBe(403);
    expect(r.body.error, what).toBe('Read-only account cannot perform write operations');
    return { needed: r.body.needed, missing: r.body.missing };
  };

  for (const role of ['readonly', 'viewer', 'read-only']) {
    it(`a ${role} owner's uncut key still can't use a write-type permission, and still reads`, async () => {
      const { srv, base } = await serve(role, ['read', 'search', 'write', 'alerts:write', 'admin']);
      try {
        expect(roRefusal(await request(base).post('/alerts-write').send({}), 'alerts:write')).toEqual({ needed: 'alerts:write', missing: ['alerts:write'] });
        expect(roRefusal(await request(base).post('/write').send({}), 'write')).toEqual({ needed: 'write', missing: ['write'] });
        expect(roRefusal(await request(base).get('/admin'), 'admin')).toEqual({ needed: 'admin', missing: ['admin'] });
        // read and search are not write-type; a route that takes read OR admin
        // is a read route, so a key meeting both still reads
        expect((await request(base).get('/read')).status).toBe(299);
        expect((await request(base).get('/search')).status).toBe(299);
        expect((await request(base).get('/read-or-admin')).status).toBe(299);
      } finally {
        srv.closeAllConnections();
        await new Promise((r) => srv.close(r));
      }
    });
  }

  it("a read-only owner's uncut admin-only key: refused on admin, reads on read OR admin; search-only key searches", async () => {
    const one = await serve('readonly', ['admin']);
    try {
      expect(roRefusal(await request(one.base).get('/admin'), 'admin only')).toEqual({ needed: 'admin', missing: ['admin'] });
      expect((await request(one.base).get('/read-or-admin')).status).toBe(299);
    } finally {
      one.srv.closeAllConnections();
      await new Promise((r) => one.srv.close(r));
    }
    const two = await serve('readonly', ['search']);
    try {
      expect((await request(two.base).get('/search')).status).toBe(299);
      expect((await request(two.base).get('/read')).status).toBe(299);
    } finally {
      two.srv.closeAllConnections();
      await new Promise((r) => two.srv.close(r));
    }
  });

  it('a user-role or admin-role uncut key is not touched by the read-only lock', async () => {
    for (const role of ['user', 'admin']) {
      const { srv, base } = await serve(role, ['read', 'write', 'alerts:write', 'admin']);
      try {
        expect((await request(base).post('/alerts-write').send({})).status, role).toBe(299);
        expect((await request(base).post('/write').send({})).status, role).toBe(299);
        expect((await request(base).get('/admin')).status, role).toBe(299);
      } finally {
        srv.closeAllConnections();
        await new Promise((r) => srv.close(r));
      }
    }
  });

  it("the agent's write routes need alerts:write even with no gate in front; its read routes need read", async () => {
    // the agent router itself (its default export), with no API-key gate in front
    const agentRouter = (await import('./agent.js')).default as unknown as Router;
    const bare = express();
    bare.use(express.json());
    bare.use('/agent', agentRouter);
    const srv = bare.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    const base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
    try {
      const owner = await createUser('kl-r10-agent', 'kl-r10-agent@example.invalid', 'kl-r10-agent-pass-1', 'user');
      const readKey = (await createApiKey(owner.id, 'kl r10 agent read', ['read'])).apiKey;
      const writeKey = (await createApiKey(owner.id, 'kl r10 agent alerts', ['read', 'alerts:write'])).apiKey;
      const ingestKey = (await createApiKey(owner.id, 'kl r10 agent ingest', ['write'])).apiKey;
      const h = (k: string) => ({ Authorization: `ApiKey ${k}` });
      const body = { name: 'kl r10 agent alert', search_query: 'search *', trigger_type: 'number_of_results', trigger_condition: 'greater_than', trigger_threshold: 0 };
      for (const [m, p] of [['post', '/agent/alerts'], ['patch', '/agent/alerts/kl-r10-none'], ['post', '/agent/alerts/kl-r10-none/evaluate'], ['delete', '/agent/alerts/kl-r10-none']] as const) {
        const r = await request(base)[m](p).set(h(readKey)).send(body);
        expect(r.status, `${m} ${p} read key: ${r.text}`).toBe(403);
        expect(r.body.needed, `${m} ${p}`).toBe('alerts:write');
        expect(r.body.missing, `${m} ${p}`).toEqual(['alerts:write']);
        // a key with alerts:write gets past the lock (the route then answers for itself)
        const w = await request(base)[m](p).set(h(writeKey)).send(body);
        expect(w.status, `${m} ${p} alerts key: ${w.text}`).not.toBe(403);
      }
      expect((await request(base).get('/agent').set(h(readKey))).status).toBe(200);
      const refused = await request(base).get('/agent').set(h(ingestKey));
      expect(refused.status).toBe(403);
      expect(refused.body.needed).toBe('read');
    } finally {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    }
  });
});

describe('round 11: read-class POSTs for a read-only owner, damaged index limits, and the agent audit rows', () => {
  const rowsFor = (ua: string) =>
    getSQLiteDB()
      .prepare('SELECT event_type, details FROM auth_audit_log WHERE user_agent = ? ORDER BY rowid')
      .all(ua) as Array<{ event_type: string; details: string }>;
  // The 8 POSTs that only read but sit behind denyReadonly (before round 11 a
  // read-only owner's read key got the read-only 403 there).
  const GUARDED_READ_POSTS = [
    '/alerts/test', '/reports/generate', '/dashboards/kl-none/export', '/cim/normalize',
    '/routing-rules/evaluate', '/field-extractions/test', '/templates/kl-none/test',
    '/knowledge/field-extractions/kl-none/test',
  ];
  const RO_ERROR = 'Read-only account cannot perform write operations';

  it("a read-only owner's read, search or '*' key gets the same answer as an admin's read key on every read-class POST", async () => {
    const ro = await createUser('kl-r11-readonly', 'kl-r11-readonly@example.invalid', 'kl-r11-readonly-pass-1', 'readonly');
    const keys = {
      read: (await createApiKey(ro.id, 'kl r11 ro read', ['read'])).apiKey,
      search: (await createApiKey(ro.id, 'kl r11 ro search', ['search'])).apiKey,
      star: (await createApiKey(ro.id, 'kl r11 ro star', ['*'])).apiKey,
    };
    const routes = [...READ_POSTS].map((r) => r.replace(/^POST /, ''));
    for (const p of GUARDED_READ_POSTS) expect(routes, p).toContain(p);
    for (const p of routes) {
      const ref = await request(realSrv).post(p).set({ Authorization: `ApiKey ${K.read}` }).send({});
      expect(ref.status, `admin read key POST ${p}: ${ref.text}`).not.toBe(403);
      for (const [name, k] of Object.entries(keys)) {
        const r = await request(realSrv).post(p).set({ Authorization: `ApiKey ${k}` }).send({});
        expect(r.body?.error, `${name} POST ${p}: ${r.text}`).not.toBe(RO_ERROR);
        expect(r.status, `${name} POST ${p}: ${r.text}`).not.toBe(403);
        expect(r.status, `${name} POST ${p}: ${r.text}`).toBeLessThan(500);
        expect(r.status, `${name} POST ${p} (admin read key got ${ref.status})`).toBe(ref.status);
      }
    }
  });

  it("a read-only owner's key still changes nothing, and a read-only browser session is still refused on the read-class POSTs", async () => {
    const ro = await createUser('kl-r11-ro-writes', 'kl-r11-ro-writes@example.invalid', 'kl-r11-ro-writes-pass-1', 'readonly');
    // made straight in the database with write-type permissions, as an older key could be
    const k = (await createApiKey(ro.id, 'kl r11 ro writes', ['read', 'alerts:write', 'dashboards:write', 'admin'])).apiKey;
    const h = { Authorization: `ApiKey ${k}` };
    for (const [m, p] of [
      ['post', '/alerts'], ['post', '/silences'], ['post', '/dashboards'], ['post', '/saved-searches'],
      ['delete', '/alerts/kl-none'], ['post', '/routing-rules'], ['post', '/templates'],
    ] as const) {
      const r = await request(realSrv)[m](p).set(h).send({ name: 'kl r11', search_query: 'search *' });
      expect(r.status, `${m} ${p}: ${r.text}`).toBe(403);
    }
    const jwt = { Authorization: `Bearer ${(await generateTokenPair(ro)).accessToken}` };
    for (const p of GUARDED_READ_POSTS) {
      const r = await request(realSrv).post(p).set(jwt).send({});
      expect(r.status, `JWT POST ${p}: ${r.text}`).toBe(403);
      expect(r.body.error, `JWT POST ${p}`).toBe(RO_ERROR);
    }
  });

  it('a stored index limit counts only as SQL NULL (every index) or a non-empty JSON list of names; anything else is damaged', async () => {
    const { parseStoredAllowedIndexes, isDamagedIndexLimit } = await import('../auth/key-policy.js');
    expect(parseStoredAllowedIndexes(null)).toBeNull();
    expect(parseStoredAllowedIndexes(undefined)).toBeNull();
    expect(parseStoredAllowedIndexes('["money"]')).toEqual(['money']);
    expect(parseStoredAllowedIndexes('["money","uptime"]')).toEqual(['money', 'uptime']);
    const damaged = ['money', '"money"', '{"0":"money"}', '[]', '[1]', '["money",1]', 'null', '[""]', 'not json', '', '5', 'true', '[null]', '[["money"]]'];
    for (const raw of damaged) {
      const parsed = parseStoredAllowedIndexes(raw);
      expect(Array.isArray(parsed), raw).toBe(true);
      expect(isDamagedIndexLimit(parsed), raw).toBe(true);
    }
    expect(isDamagedIndexLimit(null)).toBe(false);
    expect(isDamagedIndexLimit(['money'])).toBe(false);
    expect(isDamagedIndexLimit('money')).toBe(true);
    expect(isDamagedIndexLimit(['money', 1])).toBe(true);
  });

  it('a key whose stored index limit is damaged is refused with 403 on reads, search, the agent and ingest; SQL NULL reads every index; an intact list stays scoped', async () => {
    const damaged = ['money', '"money"', '{"0":"money"}', '[]', '[1]', '["money",1]', 'null', '[""]', 'not json', '', '5', 'true', '[null]', '[["money"]]'];
    const db = getSQLiteDB();
    const probe = async (stored: string | null) => {
      const k = await createApiKey(klAdminId, `kl r11 index limit ${String(stored)}`, ['read', 'write'], undefined, ['money']);
      db.prepare('UPDATE api_keys SET allowed_indexes = ? WHERE id = ?').run(stored, k.keyData.id);
      const h = { Authorization: `ApiKey ${k.apiKey}` };
      return {
        alerts: await request(realSrv).get('/alerts').set(h),
        agent: await request(realSrv).get('/agent').set(h),
        search: await request(realSrv).post('/search/query').set(h).send({ query: 'search * | head 1' }),
        ingest: await request(realSrv).post('/ingest/http').set(h).send([{ message: 'kl r11', index: 'other' }]),
      };
    };
    for (const stored of damaged) {
      const r = await probe(stored);
      for (const [what, res] of Object.entries(r)) {
        expect(res.status, `${JSON.stringify(stored)} ${what}: ${res.text}`).toBe(403);
        expect(String(res.body.message), `${JSON.stringify(stored)} ${what}`).toMatch(/index limit is damaged/);
      }
    }
    // SQL NULL: every index
    const open = await probe(null);
    expect(open.alerts.status).toBe(200);
    expect(open.agent.status).toBe(200);
    expect(open.ingest.status, open.ingest.text).toBeLessThan(300);
    // an intact list stays scoped: other indexes and unscoped reads are refused
    const scoped = await probe('["money"]');
    expect(scoped.ingest.status, scoped.ingest.text).toBe(403);
    expect(String(scoped.ingest.body.error ?? scoped.ingest.body.message)).not.toMatch(/damaged/);
    expect(scoped.alerts.status).toBe(403);
    expect(scoped.agent.status).toBe(200);
  });

  it("the agent's routes ask for exactly 'read' and 'alerts:write' (the audit row names the list)", async () => {
    const agentRouter = (await import('./agent.js')).default as unknown as Router;
    const bare = express();
    bare.use(express.json());
    bare.use('/agent', agentRouter);
    const srv = bare.listen(0, '::1');
    await new Promise<void>((r) => srv.once('listening', () => r()));
    const base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
    try {
      const owner = await createUser('kl-r11-agent', 'kl-r11-agent@example.invalid', 'kl-r11-agent-pass-1', 'user');
      const readKey = (await createApiKey(owner.id, 'kl r11 agent read', ['read'])).apiKey;
      const ingestKey = (await createApiKey(owner.id, 'kl r11 agent ingest', ['write'])).apiKey;
      const ua = 'kl-r11-agent-audit';
      expect((await request(base).get('/agent').set({ Authorization: `ApiKey ${ingestKey}`, 'User-Agent': ua })).status).toBe(403);
      expect((await request(base).post('/agent/alerts').set({ Authorization: `ApiKey ${readKey}`, 'User-Agent': ua }).send({})).status).toBe(403);
      const rows = rowsFor(ua).map((r) => ({ event: r.event_type, ...JSON.parse(r.details) }));
      expect(rows.map((r) => [r.path, r.requiredPermissions])).toEqual([
        ['/agent', ['read']],
        ['/agent/alerts', ['alerts:write']],
      ]);
    } finally {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    }
  });
});

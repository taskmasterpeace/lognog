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

import express, { Express, Router } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';
import http from 'node:http';
import { createUser, createApiKey, generateTokenPair, getApiKeys, validateApiKey } from '../auth/auth.js';
import { apiKeyGate } from '../auth/api-key-gate.js';
import { requireAdmin } from '../auth/middleware.js';
import { apiKeyNeed, decideApiKey, keyHasNeed, effectiveKeyPermissions } from '../auth/key-policy.js';
import { API_ROUTERS, mountApiRoutes } from './mount.js';
import { closeDatabase, getSQLiteDB } from '../db/sqlite.js';
import { createAlertHistoryEntry } from '../db/sqlite-alerts.js';

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

/** Ingest routes an index-scoped key may not use (alert pop-ups carry any index). */
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
  it('an ingest-only key can only ingest', async () => {
    const m = await refusedMap(K.ingest);
    expect(mismatches(m, (r) => !isPublic(r) && !isIngest(r))).toEqual([]);
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
    const b = await request(realSrv).get('/ingest/notifications?hostname=kl-host').set('Authorization', `ApiKey ${K.ingest}`);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
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

/**
 * Studio relay action: text building, Glance Tag rules, reply parsing and the
 * key-handling promises (env only, header only, never in the body).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  buildRelayText,
  buildRelayPayload,
  relayTag,
  getRelayConfig,
  isRelayConfigured,
  postToRelay,
  describeRelayFailure,
  relayConfigProblem,
  invalidRelayActions,
  executeRelayAction,
  normalizeRelayProject,
  RELAY_NOT_CONFIGURED,
  RELAY_LAB_NEEDS_TELEGRAM,
  RELAY_TEXT_MAX,
} from './relay.js';
import type { Alert, AlertAction } from '../db/sqlite-alerts.js';

const KEY = 'test-bus-key-not-real-0123456789';

interface Seen { path: string; headers: http.IncomingHttpHeaders; body: string }
let seen: Seen[] = [];
let reply: { status: number; body: string; delayMs?: number; headers?: Record<string, string> } = { status: 200, body: '{"ok":true,"sent":true}' };
let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ path: req.url || '', headers: req.headers, body });
      const send = () => {
        res.writeHead(reply.status, { 'Content-Type': 'application/json', ...(reply.headers || {}) });
        res.end(reply.body);
      };
      if (reply.delayMs) setTimeout(send, reply.delayMs); else send();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  seen = [];
  reply = { status: 200, body: '{"ok":true,"sent":true}' };
  delete process.env.RELAY_URL;
  delete process.env.RELAY_BUS_KEY;
});

const alert = {
  id: 'a1',
  name: 'Disk full',
  severity: 'high',
  search_query: 'search disk_pct>90',
} as unknown as Alert;

function relayAction(config: Record<string, unknown>): AlertAction {
  return { type: 'relay', config } as AlertAction;
}

describe('relay text', () => {
  it('builds "<tag> <PROJECT> · <message>"', () => {
    expect(buildRelayText('studio', 'Disk full on web-01', false)).toBe('🚧 STUDIO · Disk full on web-01');
  });

  it('picks the Glance Tag: 🚨 urgent, 💰 MONEY, 🎮 GAME, 🚧 otherwise', () => {
    expect(relayTag('MONEY', false)).toBe('💰');
    expect(relayTag('GAME', false)).toBe('🎮');
    expect(relayTag('PRESIDIUM', false)).toBe('🚧');
    expect(relayTag('DIRECTORS PALETTE', false)).toBe('🚧');
    expect(relayTag('MONEY', true)).toBe('🚨');
    expect(relayTag('GAME', true)).toBe('🚨');
    expect(buildRelayText('GAME', 'x', true).startsWith('🚨 GAME · ')).toBe(true);
  });

  it('keeps the PROJECT label in the first 160 characters and cuts to the caption limit', () => {
    const text = buildRelayText('HOMEWORK TREE', 'a'.repeat(5000), false);
    expect(Array.from(text).length).toBe(RELAY_TEXT_MAX);
    expect(text.endsWith('…')).toBe(true);
    expect(text.slice(0, 160)).toMatch(/HOMEWORK TREE\s*·/);
  });

  it('payload: seat octavia, brand lognog, announce = lab, no key', () => {
    const p = buildRelayPayload('STUDIO', 'hi', { lab: true, urgent: false });
    expect(p).toEqual({ seat: 'octavia', text: '🚧 STUDIO · hi', brand: 'lognog', announce: true, urgent: false });
    expect(JSON.stringify(p)).not.toMatch(/key/i);
  });

  it('normalizes projects and rejects unknown ones', () => {
    expect(normalizeRelayProject(' money ')).toBe('MONEY');
    expect(normalizeRelayProject('NOPE')).toBeNull();
    expect(normalizeRelayProject(undefined)).toBeNull();
  });
});

describe('relay config', () => {
  it('needs both RELAY_URL and RELAY_BUS_KEY, and an http(s) URL', () => {
    expect(getRelayConfig({})).toBeNull();
    expect(getRelayConfig({ RELAY_URL: 'https://relay.example' })).toBeNull();
    expect(getRelayConfig({ RELAY_BUS_KEY: KEY })).toBeNull();
    expect(getRelayConfig({ RELAY_URL: 'ftp://relay.example', RELAY_BUS_KEY: KEY })).toBeNull();
    expect(getRelayConfig({ RELAY_URL: ' https://relay.example/ ', RELAY_BUS_KEY: KEY })).toEqual({
      url: 'https://relay.example/',
      key: KEY,
    });
    expect(isRelayConfigured({ RELAY_URL: 'http://127.0.0.1:8787', RELAY_BUS_KEY: KEY })).toBe(true);
  });

  it('rejects lab-only, missing project, empty message and telegram off', () => {
    expect(relayConfigProblem({ project: 'STUDIO', message: 'x', telegram: false, lab: true })).toBe(RELAY_LAB_NEEDS_TELEGRAM);
    expect(relayConfigProblem({ project: 'NOPE', message: 'x', telegram: true })).toMatch(/Pick a project/);
    expect(relayConfigProblem({ project: 'STUDIO', message: '  ', telegram: true })).toMatch(/empty/);
    expect(relayConfigProblem({ project: 'STUDIO', message: 'x', telegram: false })).toMatch(/nothing to send/);
    expect(relayConfigProblem({ project: 'STUDIO', message: 'x', telegram: true, lab: true })).toBeNull();
    expect(invalidRelayActions([{ type: 'log', config: {} }])).toBeNull();
    expect(invalidRelayActions([{ type: 'relay', config: { project: 'GAME', message: 'x', lab: true } }])).toBe(RELAY_LAB_NEEDS_TELEGRAM);
  });
});

describe('postToRelay', () => {
  const payload = buildRelayPayload('STUDIO', 'hi', { lab: false });

  it('POSTs to <base>/send with the key in X-Bus-Key only', async () => {
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(r).toEqual({ ok: true, status: 200, why: [] });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('/send');
    expect(seen[0].headers['x-bus-key']).toBe(KEY);
    expect(seen[0].body).not.toContain(KEY);
    expect(JSON.parse(seen[0].body)).toEqual(payload);
  });

  it('joins a base URL that has a path', async () => {
    await postToRelay('check', payload, { url: `${base}/relay`, key: KEY });
    expect(seen[0].path).toBe('/relay/check');
  });

  it('reads a 422 refusal with the relay\'s plain reasons and lab note', async () => {
    reply = {
      status: 422,
      body: JSON.stringify({
        ok: false,
        sent: false,
        why: ['overnight (11 PM-8 AM his time) only pictures and videos go out; text waits for the morning brief'],
        announce: 'queued #7',
      }),
    };
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(describeRelayFailure(r)).toBe(
      'Relay refused: overnight (11 PM-8 AM his time) only pictures and videos go out; text waits for the morning brief (lab: queued #7)'
    );
  });

  it('treats 2xx with ok:false as a failure', async () => {
    reply = { status: 200, body: '{"ok":false,"why":["no Glance Tag at the start"]}' };
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(r.ok).toBe(false);
    expect(describeRelayFailure(r)).toBe('Relay refused: no Glance Tag at the start');
  });

  it('treats 2xx JSON without ok: true as a failure (wrong service behind RELAY_URL)', async () => {
    for (const body of ['{}', '[]', '{"sent":false}', '{"ok":"yes"}']) {
      reply = { status: 200, body };
      const r = await postToRelay('send', payload, { url: base, key: KEY });
      expect(r.ok, body).toBe(false);
      expect(r.why.length, body).toBeGreaterThan(0);
    }
    reply = { status: 200, body: '{}' };
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(describeRelayFailure(r)).toBe('Relay refused: the relay answered 200 without ok: true (is RELAY_URL the studio relay?)');
  });

  it('does not follow a redirect (the bus key never goes to another host)', async () => {
    reply = { status: 302, body: '', headers: { Location: `${base}/elsewhere` } };
    const before = seen.length;
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(seen.slice(before).map((x) => x.path)).toEqual(['/send']);
  });

  it('treats 2xx without JSON as a failure', async () => {
    reply = { status: 200, body: '<html>proxy</html>' };
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(r.ok).toBe(false);
    expect(r.why[0]).toMatch(/without JSON/);
  });

  it('explains a 403 bad key without echoing the key', async () => {
    reply = { status: 403, body: '{"ok":false,"error":"bad key"}' };
    const r = await postToRelay('send', payload, { url: base, key: KEY });
    expect(r.ok).toBe(false);
    expect(describeRelayFailure(r)).toMatch(/did not accept the bus key/);
    expect(describeRelayFailure(r)).not.toContain(KEY);
  });

  it('gives up after the timeout', async () => {
    reply = { status: 200, body: '{"ok":true}', delayMs: 500 };
    const r = await postToRelay('send', payload, { url: base, key: KEY }, 50);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(describeRelayFailure(r)).toMatch(/^Relay failed: no answer within/);
  });

  it('reports an unreachable relay', async () => {
    const r = await postToRelay('send', payload, { url: 'http://127.0.0.1:1', key: KEY });
    expect(r.ok).toBe(false);
    expect(describeRelayFailure(r)).toMatch(/^Relay failed: could not reach the relay/);
  });

  it('does nothing without config', async () => {
    const r = await postToRelay('send', payload, null);
    expect(r).toEqual({ ok: false, status: 0, why: [RELAY_NOT_CONFIGURED] });
    expect(seen).toHaveLength(0);
  });
});

describe('executeRelayAction', () => {
  it('renders {{variables}}, sends via /send and reports success with the lab note', async () => {
    process.env.RELAY_URL = base;
    process.env.RELAY_BUS_KEY = KEY;
    reply = { status: 200, body: '{"ok":true,"sent":true,"announce":"queued #3"}' };
    const res = await executeRelayAction(
      alert,
      relayAction({ project: 'game', message: '{{alert_name}}: {{result_count}} on {{hostname}}', telegram: true, lab: true }),
      2,
      [{ hostname: 'web-01' }, { hostname: 'web-02' }]
    );
    expect(res).toEqual({ success: true, message: 'Relay sent to Telegram + lab (queued #3)' });
    const body = JSON.parse(seen[0].body);
    expect(seen[0].path).toBe('/send');
    expect(body).toEqual({
      seat: 'octavia',
      text: '🎮 GAME · Disk full: 2 on web-01',
      brand: 'lognog',
      announce: true,
      urgent: false,
    });
  });

  it('fails plainly when the relay is not set up, without calling anything', async () => {
    const res = await executeRelayAction(alert, relayAction({ project: 'STUDIO', message: 'x', telegram: true }), 1, []);
    expect(res).toEqual({ success: false, message: RELAY_NOT_CONFIGURED });
    expect(seen).toHaveLength(0);
  });

  it('never sends a lab-only action', async () => {
    process.env.RELAY_URL = base;
    process.env.RELAY_BUS_KEY = KEY;
    const res = await executeRelayAction(alert, relayAction({ project: 'STUDIO', message: 'x', telegram: false, lab: true }), 1, []);
    expect(res).toEqual({ success: false, message: RELAY_LAB_NEEDS_TELEGRAM });
    expect(seen).toHaveLength(0);
  });

  it('passes the relay refusal reasons through', async () => {
    process.env.RELAY_URL = base;
    process.env.RELAY_BUS_KEY = KEY;
    reply = { status: 422, body: '{"ok":false,"sent":false,"why":["the same news already went out in the last 30 minutes"]}' };
    const res = await executeRelayAction(alert, relayAction({ project: 'MONEY', message: 'x', telegram: true, urgent: true }), 1, []);
    expect(res.success).toBe(false);
    expect(res.message).toBe('Relay refused: the same news already went out in the last 30 minutes');
    expect(JSON.parse(seen[0].body)).toMatchObject({ text: '🚨 MONEY · x', urgent: true, announce: false });
  });
});

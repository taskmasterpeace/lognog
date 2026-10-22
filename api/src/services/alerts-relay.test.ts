/**
 * executeActions dispatches the `relay` action type: a firing alert sends
 * through the studio relay and the outcome lands in the alert history.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const mockExecuteDSLQuery = vi.fn();
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: vi.fn().mockResolvedValue(undefined),
}));

import { evaluateAlert } from './alerts.js';
import { createAlert, getAlertHistory } from '../db/sqlite-alerts.js';

const KEY = 'test-bus-key-not-real-abcdef0123';
const bodies: { path: string; key: unknown; body: Record<string, unknown> }[] = [];
let status = 200;
let replyBody = '{"ok":true,"sent":true}';
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      bodies.push({ path: req.url || '', key: req.headers['x-bus-key'], body: JSON.parse(b) });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(replyBody);
    });
  });
  // ::1 only, see relay.test.ts: a 127.0.0.1-only stub can take another file's requests.
  await new Promise<void>((r) => server.listen(0, '::1', () => r()));
  process.env.RELAY_URL = `http://[::1]:${(server.address() as AddressInfo).port}/`;
  process.env.RELAY_BUS_KEY = KEY;
});

afterAll(async () => {
  delete process.env.RELAY_URL;
  delete process.env.RELAY_BUS_KEY;
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  bodies.length = 0;
  status = 200;
  replyBody = '{"ok":true,"sent":true}';
  mockExecuteDSLQuery.mockReset();
});

function makeAlert(name: string, config: Record<string, unknown>) {
  return createAlert(name, 'search severity<=3', {
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 0,
    actions: [{ type: 'relay', config } as never],
  });
}

describe('relay action dispatch', () => {
  it('a firing alert sends through /send and records success', async () => {
    const alert = makeAlert('api errors', {
      project: 'STUDIO', message: '{{result_count}} errors on {{hostname}}', telegram: true, lab: false,
    });
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ hostname: 'web-01' }, { hostname: 'web-02' }] });

    const result = await evaluateAlert(alert.id);
    expect(result.triggered).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].path).toBe('/send');
    expect(bodies[0].key).toBe(KEY);
    expect(bodies[0].body).toEqual({
      seat: 'octavia', text: '🚧 STUDIO · 2 errors on web-01', brand: 'lognog', announce: false, urgent: false,
    });

    const executed = JSON.parse(getAlertHistory(alert.id)[0].actions_executed || '[]');
    expect(executed).toEqual([{ type: 'relay', success: true, message: 'Relay sent to Telegram' }]);
    expect(JSON.stringify(getAlertHistory(alert.id))).not.toContain(KEY);
  });

  it('records the relay refusal reasons as a failed action', async () => {
    status = 422;
    replyBody = JSON.stringify({ ok: false, sent: false, why: ['the urgent overnight allowance is used up; post it to octavia on the bus instead'] });
    const alert = makeAlert('money down', { project: 'MONEY', message: 'Payments failing', telegram: true, urgent: true });
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ hostname: 'pay-01' }] });

    await evaluateAlert(alert.id);
    expect(bodies[0].body.text).toBe('🚨 MONEY · Payments failing');
    const executed = JSON.parse(getAlertHistory(alert.id)[0].actions_executed || '[]');
    expect(executed[0]).toEqual({
      type: 'relay',
      success: false,
      message: 'Relay refused: the urgent overnight allowance is used up; post it to octavia on the bus instead',
    });
  });
});

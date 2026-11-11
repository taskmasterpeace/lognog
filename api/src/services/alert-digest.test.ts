/**
 * Daily alert digest: the summary text, when it is due, and the once-a-day
 * send through the studio relay (faked with a local HTTP server).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach, type MockInstance } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  buildAlertDigest,
  isDigestDue,
  runAlertDigestIfDue,
  resetAlertDigestStateForTest,
  effectiveDigestSettings,
  DIGEST_TEXT_MAX,
  type DigestHistoryRow,
} from './alert-digest.js';
import { RELAY_TEXT_MAX } from './relay.js';
import { createAlert } from '../db/sqlite-alerts.js';
import { getSQLiteDB, getSystemSetting, setSystemSetting, closeDatabase } from '../db/sqlite.js';

const NOW = new Date('2026-06-10T12:30:00Z'); // 08:30 in New York (summer time)

const sent = (type: string, success = true) => JSON.stringify([{ type, success, message: 'x' }]);
function row(alert_id: string, actions: string | null = null, extra: Partial<DigestHistoryRow> = {}): DigestHistoryRow {
  return { alert_id, triggered_at: '2026-06-10 03:00:00', severity: 'medium', result_count: 1, actions_executed: actions, ...extra };
}
function times<T>(n: number, make: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

describe('buildAlertDigest', () => {
  const alerts = {
    a: { name: 'App down', severity: 'critical' },
    b: { name: 'Disk nearly full', severity: 'high' },
    c: { name: 'Sign-in watch', severity: 'low' },
  };

  it('counts texted and recorded-only fires and says so in plain words', () => {
    const rows = [
      row('a', sent('relay'), { severity: 'critical' }),
      row('a', sent('email')),
      ...times(3, () => row('a')),
      ...times(3, () => row('b', sent('relay', false))), // a failed text is not a text
      ...times(2, () => row('c', sent('log'))), // a log line reaches nobody
      ...times(4, () => row('b', '[{"type":"script","success":true}]')),
    ];
    const d = buildAlertDigest(rows, alerts, NOW);
    expect(d.total).toBe(14);
    expect(d.texted).toBe(2);
    expect(d.recordedOnly).toBe(12);
    expect(d.critical).toBe(1);
    expect(d.byRule).toEqual([
      { name: 'Disk nearly full', severity: 'high', count: 7, texted: 0 },
      { name: 'App down', severity: 'critical', count: 5, texted: 2 },
      { name: 'Sign-in watch', severity: 'low', count: 2, texted: 0 },
    ]);
    expect(d.text).toBe(
      'LogNog daily digest: 14 alerts in the last 24 hours. 2 were texted to you when they happened, 12 were only recorded. ' +
        '1 was critical. Most often: Disk nearly full ×7, App down ×5, Sign-in watch ×2. Open LogNog → Alerts → History for details.'
    );
  });

  it('counts webhook and apprise as texted, and survives broken action JSON', () => {
    const d = buildAlertDigest(
      [row('a', sent('webhook')), row('a', sent('apprise')), row('a', '{not json'), row('a', '"text"'), row('a', '[null, 5]')],
      new Map(Object.entries(alerts)),
      NOW
    );
    expect(d.texted).toBe(2);
    expect(d.recordedOnly).toBe(3);
  });

  it('reads well for one alert, all texted, none texted, and none at all', () => {
    expect(buildAlertDigest([row('a')], alerts, NOW).text).toBe(
      'LogNog daily digest: 1 alert in the last 24 hours. It was only recorded, not texted. Most often: App down ×1. Open LogNog → Alerts → History for details.'
    );
    expect(buildAlertDigest([row('a', sent('relay')), row('b', sent('relay'))], alerts, NOW).text).toContain(
      'All 2 were texted to you when they happened.'
    );
    expect(buildAlertDigest([row('a'), row('b')], alerts, NOW).text).toContain('None were texted to you, all 2 were only recorded.');
    const quiet = buildAlertDigest([], alerts, NOW);
    expect(quiet.total).toBe(0);
    expect(quiet.byRule).toEqual([]);
    expect(quiet.text).toBe('LogNog daily digest: no alerts in the last 24 hours. All quiet.');
  });

  it('orders rules by count then name and says "and N more" past eight', () => {
    const many: Record<string, { name: string; severity: string }> = {};
    const rows: DigestHistoryRow[] = [];
    for (let i = 0; i < 11; i++) {
      many[`r${i}`] = { name: `Rule ${String.fromCharCode(75 - i)}`, severity: 'low' }; // K, J, ... A
      rows.push(...times(i < 3 ? 5 : 2, () => row(`r${i}`)));
    }
    const d = buildAlertDigest(rows, many, NOW);
    expect(d.byRule.map((r) => `${r.name}:${r.count}`).slice(0, 5)).toEqual(['Rule I:5', 'Rule J:5', 'Rule K:5', 'Rule A:2', 'Rule B:2']);
    expect(d.byRule).toHaveLength(11);
    expect(d.text).toContain('Most often: Rule I ×5, Rule J ×5, Rule K ×5, Rule A ×2, Rule B ×2, Rule C ×2, Rule D ×2, Rule E ×2, and 3 more.');
  });

  it('never goes over the length cap: it drops whole rules, not half a word or half an emoji', () => {
    const family = '👨‍👩‍👧‍👦'; // one emoji made of seven code points
    const long: Record<string, { name: string; severity: string }> = {};
    const rows: DigestHistoryRow[] = [];
    for (let i = 0; i < 30; i++) {
      long[`r${i}`] = { name: family.repeat(200), severity: 'low' };
      rows.push(...times(30 - i, () => row(`r${i}`)));
    }
    const d = buildAlertDigest(rows, long, NOW);
    expect(Array.from(d.text).length).toBeLessThanOrEqual(DIGEST_TEXT_MAX);
    expect(d.text).toMatch(/and \d+ more\. Open LogNog → Alerts → History for details\.$/);
    for (const r of d.byRule) {
      // 59 whole family emoji then the ellipsis: no emoji was split
      expect(r.name).toBe(`${family.repeat(59)}…`);
    }
    // the relay adds "🚧 STUDIO · " in front: still inside its caption limit, so nothing is cut
    expect(Array.from(`🚧 STUDIO · ${d.text}`).length).toBeLessThanOrEqual(RELAY_TEXT_MAX);

    const wordy = buildAlertDigest([row('w')], { w: { name: 'payments are failing for every customer in the checkout flow right now today', severity: 'high' } }, NOW);
    expect(wordy.byRule[0].name).toBe('payments are failing for every customer in the checkout…');
  });

  it('shows rules deleted since they fired as "a deleted rule", in one line', () => {
    const d = buildAlertDigest([row('gone-1'), row('gone-2'), row('gone-2'), row('a')], alerts, NOW);
    expect(d.byRule).toEqual([
      { name: 'a deleted rule', severity: 'medium', count: 3, texted: 0 },
      { name: 'App down', severity: 'critical', count: 1, texted: 0 },
    ]);
    expect(d.text).toContain('Most often: a deleted rule ×3, App down ×1.');
    // a name like "constructor" must not be found on a plain object
    expect(buildAlertDigest([row('constructor')], alerts, NOW).byRule[0].name).toBe('a deleted rule');
  });

  it('only counts the 24 hours before now', () => {
    const d = buildAlertDigest(
      [
        row('a', null, { triggered_at: '2026-06-09 12:30:00' }), // exactly 24h ago: in
        row('a', null, { triggered_at: '2026-06-09 12:29:59' }), // older: out
        row('a', null, { triggered_at: '2026-06-10 12:30:01' }), // after now: out
        row('a', null, { triggered_at: '2026-06-10T12:00:00.000Z' }), // ISO: in
      ],
      alerts,
      NOW
    );
    expect(d.total).toBe(2);
  });
});

describe('isDigestDue', () => {
  const on = { alert_digest_enabled: 'true' };

  it('is off by default and when turned off', () => {
    expect(isDigestDue({}, NOW)).toBe(false);
    expect(isDigestDue({ alert_digest_enabled: 'false' }, NOW)).toBe(false);
    expect(isDigestDue({ alert_digest_enabled: null }, NOW)).toBe(false);
  });

  it('defaults to 08:30 New York time', () => {
    expect(isDigestDue(on, new Date('2026-06-10T12:29:59Z'))).toBe(false);
    expect(isDigestDue(on, new Date('2026-06-10T12:30:00Z'))).toBe(true);
    expect(isDigestDue(on, new Date('2026-06-11T03:59:00Z'))).toBe(true); // 23:59 the same local day
    expect(isDigestDue(on, new Date('2026-06-11T04:00:00Z'))).toBe(false); // local midnight: tomorrow, too early
  });

  it('follows the clocks across both daylight-saving changes', () => {
    // 7 March 2026 is winter time (UTC-5), 8 March is summer time (UTC-4)
    expect(isDigestDue(on, new Date('2026-03-07T13:29:00Z'))).toBe(false);
    expect(isDigestDue(on, new Date('2026-03-07T13:30:00Z'))).toBe(true);
    expect(isDigestDue(on, new Date('2026-03-08T12:29:00Z'))).toBe(false);
    expect(isDigestDue(on, new Date('2026-03-08T12:30:00Z'))).toBe(true);
    // a time that does not exist that night (02:30) is due once the clock passes it
    const skipped = { ...on, alert_digest_time: '02:30' };
    expect(isDigestDue(skipped, new Date('2026-03-08T06:59:00Z'))).toBe(false); // 01:59
    expect(isDigestDue(skipped, new Date('2026-03-08T07:00:00Z'))).toBe(true); // 03:00
    // 1 November 2026: 01:30 happens twice; the second one is not due again once marked
    const twice = { ...on, alert_digest_time: '01:30' };
    expect(isDigestDue(twice, new Date('2026-11-01T05:30:00Z'))).toBe(true); // first 01:30
    expect(isDigestDue({ ...twice, alert_digest_last_sent: '2026-11-01' }, new Date('2026-11-01T06:30:00Z'))).toBe(false); // second 01:30
    // back on winter time
    expect(isDigestDue(on, new Date('2026-11-02T13:29:00Z'))).toBe(false);
    expect(isDigestDue(on, new Date('2026-11-02T13:30:00Z'))).toBe(true);
  });

  it('uses the chosen time and zone', () => {
    const tokyo = { ...on, alert_digest_time: '07:00', alert_digest_tz: 'Asia/Tokyo' };
    expect(isDigestDue(tokyo, new Date('2026-06-09T21:59:00Z'))).toBe(false);
    expect(isDigestDue(tokyo, new Date('2026-06-09T22:00:00Z'))).toBe(true); // 07:00 on the 10th in Tokyo
    expect(isDigestDue({ ...tokyo, alert_digest_last_sent: '2026-06-10' }, new Date('2026-06-09T22:00:00Z'))).toBe(false);
    expect(isDigestDue({ ...on, alert_digest_time: '00:00' }, new Date('2026-06-10T04:00:00Z'))).toBe(true);
  });

  it('is not due twice on the same local day, and is due again the next', () => {
    const marked = { ...on, alert_digest_last_sent: '2026-06-10' };
    expect(isDigestDue(marked, new Date('2026-06-10T12:30:00Z'))).toBe(false);
    expect(isDigestDue(marked, new Date('2026-06-11T03:00:00Z'))).toBe(false); // still the 10th in New York
    expect(isDigestDue(marked, new Date('2026-06-11T12:29:00Z'))).toBe(false);
    expect(isDigestDue(marked, new Date('2026-06-11T12:30:00Z'))).toBe(true);
  });

  it('falls back to the defaults for a bad zone or time, and never throws', () => {
    for (const bad of [
      { ...on, alert_digest_tz: 'Mars/Olympus' },
      { ...on, alert_digest_tz: '' },
      { ...on, alert_digest_time: '25:00' },
      { ...on, alert_digest_time: '8:30' },
      { ...on, alert_digest_time: 'soon' },
      { ...on, alert_digest_time: '24:00', alert_digest_tz: 'not a zone' },
    ]) {
      expect(isDigestDue(bad, new Date('2026-06-10T12:29:00Z'))).toBe(false);
      expect(isDigestDue(bad, new Date('2026-06-10T12:30:00Z'))).toBe(true);
    }
    expect(effectiveDigestSettings({ alert_digest_tz: 'Mars/Olympus', alert_digest_time: '99:99' })).toMatchObject({
      time: '08:30',
      tz: 'America/New_York',
    });
    expect(isDigestDue(on, new Date('not a date'))).toBe(false);
  });
});

describe('runAlertDigestIfDue', () => {
  const KEY = 'test-bus-key-not-real-digest-0001';
  const bodies: { path: string; key: unknown; body: Record<string, unknown> }[] = [];
  let status = 200;
  let replyBody = '{"ok":true,"sent":true}';
  let server: http.Server;
  let relayUrl = '';
  let alertId = '';
  let errorSpy: MockInstance<Parameters<Console['error']>, ReturnType<Console['error']>>;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => { b += c; });
      req.on('end', () => {
        bodies.push({ path: req.url || '', key: req.headers['x-bus-key'], body: JSON.parse(b) });
        if (status === 0) return; // took the message, never answers (the client times out)
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(replyBody);
      });
    });
    // ::1 only, see relay.test.ts: a 127.0.0.1-only stub can take another file's requests.
    await new Promise<void>((r) => server.listen(0, '::1', () => r()));
    relayUrl = `http://[::1]:${(server.address() as AddressInfo).port}/`;
    alertId = createAlert('App down', 'search severity<=3', {}).id;
  });

  afterAll(async () => {
    delete process.env.RELAY_URL;
    delete process.env.RELAY_BUS_KEY;
    await new Promise<void>((r) => server.close(() => r()));
    closeDatabase();
  });

  beforeEach(() => {
    bodies.length = 0;
    status = 200;
    replyBody = '{"ok":true,"sent":true}';
    process.env.RELAY_URL = relayUrl;
    process.env.RELAY_BUS_KEY = KEY;
    resetAlertDigestStateForTest();
    getSQLiteDB().prepare('DELETE FROM alert_history').run();
    getSQLiteDB().prepare("DELETE FROM system_settings WHERE key LIKE 'alert_digest_%'").run();
    setSystemSetting('alert_digest_enabled', 'true');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function fire(triggeredAt: string, actions: string | null = null) {
    getSQLiteDB()
      .prepare("INSERT INTO alert_history (id, alert_id, triggered_at, result_count, severity, actions_executed) VALUES (?, ?, ?, 1, 'high', ?)")
      .run(`h-${Math.random().toString(36).slice(2)}`, alertId, triggeredAt, actions);
  }
  const lastSent = () => getSystemSetting('alert_digest_last_sent');
  const at = (iso: string) => new Date(iso);

  it('sends one STUDIO message for the last 24 hours and marks the local day', async () => {
    fire('2026-06-10 03:00:00', sent('relay'));
    fire('2026-06-09 20:00:00');
    fire('2026-06-09 12:00:00'); // older than 24 hours: left out

    expect(await runAlertDigestIfDue(at('2026-06-10T12:29:00Z'))).toEqual({ status: 'not_due' });
    expect(bodies).toHaveLength(0);

    expect(await runAlertDigestIfDue(NOW)).toEqual({ status: 'sent' });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].path).toBe('/send');
    expect(bodies[0].key).toBe(KEY);
    expect(bodies[0].body).toEqual({
      seat: 'octavia',
      text:
        '🚧 STUDIO · LogNog daily digest: 2 alerts in the last 24 hours. 1 was texted to you when it happened, 1 was only recorded. ' +
        'Most often: App down ×2. Open LogNog → Alerts → History for details.',
      brand: 'lognog',
      announce: false,
      urgent: false,
    });
    expect(lastSent()).toBe('2026-06-10');
  });

  it('does not send twice on the same local day, and sends again the next morning', async () => {
    fire('2026-06-10 03:00:00');
    expect((await runAlertDigestIfDue(NOW)).status).toBe('sent');
    for (const later of ['2026-06-10T12:31:00Z', '2026-06-10T15:00:00Z', '2026-06-11T03:59:00Z', '2026-06-11T12:29:00Z']) {
      expect((await runAlertDigestIfDue(at(later))).status).toBe('not_due');
    }
    expect(bodies).toHaveLength(1);

    fire('2026-06-11 05:00:00');
    expect((await runAlertDigestIfDue(at('2026-06-11T12:30:00Z'))).status).toBe('sent');
    expect(bodies).toHaveLength(2);
    expect(lastSent()).toBe('2026-06-11');
  });

  it('does not send twice even if the day could not be written down', async () => {
    fire('2026-06-10 03:00:00');
    expect((await runAlertDigestIfDue(NOW)).status).toBe('sent');
    getSQLiteDB().prepare("DELETE FROM system_settings WHERE key = 'alert_digest_last_sent'").run();
    expect((await runAlertDigestIfDue(at('2026-06-10T12:31:00Z'))).status).toBe('not_due');
    expect(bodies).toHaveLength(1);
  });

  it('on a quiet day sends nothing and still marks the day', async () => {
    expect(await runAlertDigestIfDue(NOW)).toEqual({ status: 'quiet' });
    expect(bodies).toHaveLength(0);
    expect(lastSent()).toBe('2026-06-10');
    fire('2026-06-10 12:30:30');
    expect((await runAlertDigestIfDue(at('2026-06-10T12:31:00Z'))).status).toBe('not_due');
    expect(bodies).toHaveLength(0);
  });

  it('on a quiet day sends the all-quiet line when asked to', async () => {
    setSystemSetting('alert_digest_send_when_quiet', 'true');
    expect((await runAlertDigestIfDue(NOW)).status).toBe('sent');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].body.text).toBe('🚧 STUDIO · LogNog daily digest: no alerts in the last 24 hours. All quiet.');
    expect(lastSent()).toBe('2026-06-10');
  });

  it('a refused send does not mark the day and is tried again later', async () => {
    fire('2026-06-10 03:00:00');
    status = 422;
    replyBody = JSON.stringify({ ok: false, sent: false, why: ['quiet hours'] });

    expect(await runAlertDigestIfDue(NOW)).toEqual({ status: 'failed', detail: 'Relay refused: quiet hours' });
    expect(lastSent()).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).not.toContain(KEY);

    // the next ticks wait, then it tries again
    expect((await runAlertDigestIfDue(at('2026-06-10T12:31:00Z'))).status).toBe('waiting');
    expect((await runAlertDigestIfDue(at('2026-06-10T12:39:00Z'))).status).toBe('waiting');
    expect(bodies).toHaveLength(1);
    expect((await runAlertDigestIfDue(at('2026-06-10T12:40:00Z'))).status).toBe('failed');
    expect(bodies).toHaveLength(2);
    expect(lastSent()).toBeNull();

    status = 200;
    replyBody = '{"ok":true,"sent":true}';
    expect((await runAlertDigestIfDue(at('2026-06-10T12:50:00Z'))).status).toBe('sent');
    expect(bodies).toHaveLength(3);
    expect(lastSent()).toBe('2026-06-10');
    expect((await runAlertDigestIfDue(at('2026-06-10T12:51:00Z'))).status).toBe('not_due');
  });

  it('stops for the day after three refusals', async () => {
    fire('2026-06-10 03:00:00');
    status = 422;
    replyBody = JSON.stringify({ ok: false, sent: false, why: ['not allowed'] });
    expect((await runAlertDigestIfDue(NOW)).status).toBe('failed');
    expect((await runAlertDigestIfDue(at('2026-06-10T12:40:00Z'))).status).toBe('failed');
    expect(lastSent()).toBeNull();
    expect((await runAlertDigestIfDue(at('2026-06-10T12:50:00Z'))).status).toBe('failed');
    expect(lastSent()).toBe('2026-06-10');
    status = 200;
    replyBody = '{"ok":true,"sent":true}';
    expect((await runAlertDigestIfDue(at('2026-06-10T13:00:00Z'))).status).toBe('not_due');
    expect(bodies).toHaveLength(3);
  });

  it('a send the relay took but never answered is not sent again that day', async () => {
    fire('2026-06-10 03:00:00');
    status = 0;
    const result = await runAlertDigestIfDue(NOW);
    expect(result.status).toBe('failed');
    expect(result.detail).toMatch(/no answer within/);
    expect(lastSent()).toBe('2026-06-10');
    status = 200;
    expect((await runAlertDigestIfDue(at('2026-06-10T12:45:00Z'))).status).toBe('not_due');
    expect(bodies).toHaveLength(1);
  }, 20000);

  it('a relay that cannot be reached is a failed send too', async () => {
    fire('2026-06-10 03:00:00');
    process.env.RELAY_URL = 'http://[::1]:1/';
    const result = await runAlertDigestIfDue(NOW);
    expect(result.status).toBe('failed');
    expect(result.detail).toMatch(/^Relay failed: could not reach the relay/);
    expect(lastSent()).toBeNull();
  });

  it('stops trying at local noon and starts again tomorrow', async () => {
    fire('2026-06-10 03:00:00');
    fire('2026-06-11 03:00:00');
    status = 500;
    replyBody = '{"error":"down"}';

    expect((await runAlertDigestIfDue(at('2026-06-10T15:59:00Z'))).status).toBe('failed'); // 11:59
    expect(bodies).toHaveLength(1);
    for (const later of ['2026-06-10T16:00:00Z', '2026-06-10T16:30:00Z', '2026-06-10T20:00:00Z', '2026-06-11T03:59:00Z']) {
      expect((await runAlertDigestIfDue(at(later))).status).toBe('gave_up');
    }
    expect(bodies).toHaveLength(1);
    expect(lastSent()).toBeNull(); // nothing recorded: it just stopped

    status = 200;
    replyBody = '{"ok":true,"sent":true}';
    expect((await runAlertDigestIfDue(at('2026-06-11T12:29:00Z'))).status).toBe('not_due');
    expect((await runAlertDigestIfDue(at('2026-06-11T12:30:00Z'))).status).toBe('sent');
    expect(lastSent()).toBe('2026-06-11');
  });

  it('a digest time in the afternoon still gets its hour of tries', async () => {
    setSystemSetting('alert_digest_time', '14:00');
    fire('2026-06-10 03:00:00');
    expect((await runAlertDigestIfDue(at('2026-06-10T17:59:00Z'))).status).toBe('not_due'); // 13:59
    status = 500;
    expect((await runAlertDigestIfDue(at('2026-06-10T18:00:00Z'))).status).toBe('failed'); // 14:00
    expect((await runAlertDigestIfDue(at('2026-06-10T19:00:00Z'))).status).toBe('gave_up'); // 15:00
    expect(bodies).toHaveLength(1);
  });

  it('does nothing when the relay is not set up, and sends once it is', async () => {
    fire('2026-06-10 03:00:00');
    delete process.env.RELAY_BUS_KEY;
    expect(await runAlertDigestIfDue(NOW)).toEqual({ status: 'not_configured' });
    expect(lastSent()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();

    process.env.RELAY_BUS_KEY = KEY;
    expect((await runAlertDigestIfDue(at('2026-06-10T12:31:00Z'))).status).toBe('sent');
    expect(bodies).toHaveLength(1);
  });

  it('does nothing while turned off', async () => {
    setSystemSetting('alert_digest_enabled', 'false');
    fire('2026-06-10 03:00:00');
    expect(await runAlertDigestIfDue(NOW)).toEqual({ status: 'not_due' });
    expect(bodies).toHaveLength(0);
  });

  it('never throws: a database error is one console line', async () => {
    fire('2026-06-10 03:00:00');
    getSQLiteDB().exec('ALTER TABLE alert_history RENAME TO alert_history_away');
    try {
      const result = await runAlertDigestIfDue(NOW);
      expect(result.status).toBe('error');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(bodies).toHaveLength(0);
      expect(lastSent()).toBeNull();
    } finally {
      getSQLiteDB().exec('ALTER TABLE alert_history_away RENAME TO alert_history');
    }
  });
});

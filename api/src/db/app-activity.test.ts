/**
 * Per-app activity behind the lab lights: the ClickHouse SQL text (checked
 * without a server) and the real Lite query + light rule over real rows,
 * including firing alerts read from the real alerts tables.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
const tag = `${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}`;
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-lights-logs-${tag}.db`);
process.env.SQLITE_PATH = join(tmpdir(), `lognog-lights-main-${tag}.db`);

import { APP_ACTIVITY_WINDOW, appActivitySql, executeDSLQuery, getAppActivity, getActiveSources, insertLogs } from './backend';
import { getSQLiteDB } from './sqlite';
import { getSQLiteLogsDB } from './sqlite-logs';
import { getLabLights, WHY_HEADLINES, _labLightsTesting } from '../services/lab-lights';

// UI modules, loaded by path so the API's tsc program never includes UI files.
interface LabLightsUi {
  lightSearchUrl(app: string, kind: 'logs' | 'errors' | 'usual' | 'week'): string | null;
  screenLink(app: string, headline: string, detail?: string): { url: string; title: string } | null;
  numberSearchUrl(app: string, kind: 'logs' | 'errors' | 'usual' | 'week', count: number): string | null;
  plateLink(app: string, headline: string, since: string | null, nowMs?: number, detail?: string): { url: string; title: string } | null;
  NO_LOGS_DETAIL: string;
  onlyState<T extends { state: 'green' | 'yellow' | 'red' }>(lights: T[], only: 'green' | 'yellow' | 'red' | null): T[];
  shelfGridClass(wall: boolean): string;
  splitWhy(why: string, state: 'green' | 'yellow' | 'red'): { headline: string; detail: string };
  shelfOrder<T extends { state: 'green' | 'yellow' | 'red'; label: string }>(lights: T[], asked: boolean): T[];
}
interface SourceStatusUi {
  sourceStatusInfo(status: string | null | undefined): { label: string; dotClass: string };
  ageAgo(ageSeconds: number | null | undefined): string;
}
const ui = (file: string) => resolve(__dirname, '../../../ui/src/utils', file);

const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('appActivitySql (ClickHouse)', () => {
  const sql = appActivitySql('clickhouse', null).replace(/\s+/g, ' ');

  it('groups by app over the 7-day Data Sources window', () => {
    expect(sql).toContain("if(app_name = '', 'unknown', app_name) AS app");
    expect(sql).toContain('FROM lognog.logs WHERE timestamp >= now64(3) - INTERVAL 7 DAY AND timestamp <= now64(3) + INTERVAL 5 MINUTE GROUP BY app ORDER BY max(timestamp) DESC, app LIMIT 1000');
  });

  it('measures every window and the age on ClickHouse\'s own clock, never from Node\'s', () => {
    // The 15-min counts stop at now, as the Search they open does; the list itself allows 5 min ahead.
    expect(sql).toContain('countIf(timestamp >= now64(3) - INTERVAL 15 MINUTE AND timestamp <= now64(3)) AS logs_15m');
    expect(sql).toContain('countIf(severity <= 3 AND timestamp >= now64(3) - INTERVAL 15 MINUTE AND timestamp <= now64(3)) AS errors_15m');
    expect(sql).toContain(
      'countIf(severity <= 3 AND timestamp >= now64(3) - INTERVAL 24 HOUR AND timestamp < now64(3) - INTERVAL 15 MINUTE) AS errors_prev_24h',
    );
    expect(sql).toContain("dateDiff('second', max(timestamp), now64(3)) AS age_seconds");
    expect(sql).toContain('toUnixTimestamp64Milli(max(timestamp)) AS last_seen_ms');
    expect(sql).toContain("arraySort(groupUniqArray(if(index_name = '', 'main', index_name))) AS indexes");
    expect(sql).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no Node-made time strings
  });

  it('ANDs a scoped key\'s indexes into the WHERE', () => {
    const scoped = appActivitySql('clickhouse', "index_name IN ('hyh','money')").replace(/\s+/g, ' ');
    expect(scoped).toContain("WHERE timestamp >= now64(3) - INTERVAL 7 DAY AND timestamp <= now64(3) + INTERVAL 5 MINUTE AND index_name IN ('hyh','money') GROUP BY app");
  });

  it('Lite compares against ISO bounds built from the given clock', () => {
    const now = Date.parse('2026-10-21T12:00:00.000Z');
    const lite = appActivitySql('sqlite', null, now).replace(/\s+/g, ' ');
    expect(lite).toContain("SUM(CASE WHEN timestamp >= '2026-10-21T11:45:00.000Z' AND timestamp <= '2026-10-21T12:00:00.000Z' THEN 1 ELSE 0 END) AS logs_15m");
    expect(lite).toContain("severity <= 3 AND timestamp >= '2026-10-21T11:45:00.000Z' AND timestamp <= '2026-10-21T12:00:00.000Z' THEN 1 ELSE 0 END) AS errors_15m");
    expect(lite).toContain("timestamp >= '2026-10-20T12:00:00.000Z' AND timestamp < '2026-10-21T11:45:00.000Z'");
    expect(lite).toContain("WHERE timestamp >= '2026-10-14T12:00:00.000Z' AND timestamp <= '2026-10-21T12:05:00.000Z'");
    expect(lite).toContain('ORDER BY MAX(timestamp) DESC, app LIMIT 1000');
    expect(lite).not.toContain("datetime('now')");
  });
});

describe('lab lights over real Lite rows and real alerts', () => {
  beforeAll(async () => {
    const rows: Record<string, unknown>[] = [];
    const add = (app: string, index: string, severity: number, ts: string, n = 1) => {
      for (let i = 0; i < n; i++) rows.push({ timestamp: ts, app_name: app, index_name: index, hostname: 'h', severity, message: `${app} ${severity}` });
    };
    // directors-palette: busy and fine
    add('directors-palette', 'directors-palette', 6, ago(2 * MIN), 30);
    // knuckle-up: 47 errors in the last 15 min against ~10.5 per 15 min the day before (1000 / 95 slices), 4.5x
    add('knuckle-up', 'knuckle-up', 6, ago(1 * MIN), 5);
    add('knuckle-up', 'knuckle-up', 3, ago(3 * MIN), 47);
    add('knuckle-up', 'knuckle-up', 3, ago(6 * HOUR), 1000);
    // homework-tree: last log 3 hours ago (gone quiet)
    add('homework-tree', 'homework-tree', 6, ago(3 * HOUR), 4);
    // uptime: last log 40 minutes ago (quiet, Data Sources "Recent")
    add('uptime', 'uptime', 6, ago(40 * MIN), 2);
    // hyh: fresh, but a high alert on its index is firing
    add('hyh', 'hyh', 6, ago(1 * MIN), 10);
    // money-watch: fresh, its high alert fired but was acknowledged
    add('money-watch', 'money', 6, ago(1 * MIN), 3);
    // a row with no app name and one 8 days old
    add('', 'main', 6, ago(1 * MIN), 2);
    add('ancient', 'ancient', 6, ago(8 * 24 * HOUR), 1);
    // clock-ahead: its only logs are stamped 2 hours in the future (a sender's bad clock)
    add('clock-ahead', 'clock-ahead', 6, ago(-2 * HOUR), 3);
    await insertLogs(rows);

    const db = getSQLiteDB();
    const insertAlert = db.prepare(
      `INSERT INTO alerts (id, name, search_query, severity, enabled, last_run, last_triggered, last_status)
       VALUES (?, ?, ?, ?, 1, ?, ?, 'triggered')`,
    );
    insertAlert.run('al-hyh', 'HYH checkout errors', 'search index=hyh severity<=3', 'high', ago(1 * MIN), ago(4 * MIN));
    insertAlert.run('al-money', 'Money drop', 'search index="money"', 'critical', ago(1 * MIN), ago(4 * MIN));
    db.prepare(
      `INSERT INTO alert_history (id, alert_id, triggered_at, result_count, severity, acknowledged) VALUES (?, ?, ?, 1, 'critical', 1)`,
    ).run('h1', 'al-money', ago(4 * MIN));
  });

  beforeEach(() => _labLightsTesting.reset());

  it('getAppActivity counts the 15-minute logs and errors and the 24 h baseline per app', async () => {
    const acts = await getAppActivity();
    const ku = acts.find((a) => a.app === 'knuckle-up')!;
    expect(ku).toMatchObject({ indexes: ['knuckle-up'], logs_15m: 52, errors_15m: 47, errors_prev_24h: 1000 });
    expect(ku.age_seconds).toBeGreaterThanOrEqual(55);
    expect(ku.age_seconds).toBeLessThan(120);
    expect(acts.find((a) => a.app === 'money-watch')!.indexes).toEqual(['money']);
    expect(acts.find((a) => a.app === 'unknown')).toBeDefined();
    expect(acts.find((a) => a.app === 'ancient')).toBeUndefined();
  });

  it('gives each app the light the dream shows', async () => {
    const { apps, refresh_seconds } = await getLabLights();
    const by = Object.fromEntries(apps.map((a) => [a.app, a]));
    expect(refresh_seconds).toBe(30);
    expect(Object.keys(by)).toEqual(['directors-palette', 'homework-tree', 'hyh', 'knuckle-up', 'money-watch', 'uptime']);
    expect(by['directors-palette']).toMatchObject({ label: 'Directors Palette', state: 'green', why: 'Fine: 30 logs in 15 min, no errors', logs_last_15m: 30, errors_last_15m: 0 });
    expect(by['knuckle-up']).toMatchObject({ state: 'red', why: 'Error spike: 47 in 15 min, 4x normal', errors_last_15m: 47 });
    expect(by['homework-tree']).toMatchObject({ state: 'red', why: 'Gone quiet: no logs for 3 h', logs_last_15m: 0 });
    expect(by.uptime).toMatchObject({ state: 'yellow', why: 'Quiet: no logs for 40 min' });
    expect(by.hyh).toMatchObject({ label: 'HYH', state: 'red', why: 'Alert: HYH checkout errors' });
    // Acknowledged: back to what the logs say.
    expect(by['money-watch']).toMatchObject({ state: 'green' });
  });

  it('since: alert red starts when it fired, quiet red when the hour ran out, others unknown until they change', async () => {
    const t0 = Date.now();
    _labLightsTesting.setClock(() => t0);
    const first = Object.fromEntries((await getLabLights()).apps.map((a) => [a.app, a]));
    const hyhFired = getSQLiteDB().prepare(`SELECT last_triggered FROM alerts WHERE id = 'al-hyh'`).get() as { last_triggered: string };
    expect(first.hyh.since).toBe(new Date(hyhFired.last_triggered).toISOString());
    const lastSeen = Date.parse(first['homework-tree'].last_seen!);
    expect(first['homework-tree'].since).toBe(new Date(lastSeen + HOUR).toISOString());
    expect(first['knuckle-up'].since).toBeNull();

    // 20 s later (past the 15 s cache), same states: the start time holds.
    _labLightsTesting.setClock(() => t0 + 20_000);
    const again = Object.fromEntries((await getLabLights()).apps.map((a) => [a.app, a]));
    expect(_labLightsTesting.queries()).toBe(2);
    expect(again['knuckle-up'].since).toBeNull();
    expect(again.hyh.since).toBe(first.hyh.since);
  });

  it('runs one log query per key scope at most every 15 s, however many screens ask', async () => {
    const t0 = Date.now();
    _labLightsTesting.setClock(() => t0);
    await Promise.all([getLabLights(), getLabLights(), getLabLights(null, ['hyh']), getLabLights(null, ['knuckle-up'])]);
    expect(_labLightsTesting.queries()).toBe(1);
    _labLightsTesting.setClock(() => t0 + 14_000);
    await getLabLights(null, ['uptime']);
    expect(_labLightsTesting.queries()).toBe(1);
    _labLightsTesting.setClock(() => t0 + 15_001);
    await getLabLights();
    expect(_labLightsTesting.queries()).toBe(2);
    // A scoped key gets its own cached answer (never another scope's).
    await getLabLights(['hyh']);
    expect(_labLightsTesting.queries()).toBe(3);
  });

  it('?apps keeps the asked order, matches an index name too, and says plainly when an app has no logs', async () => {
    const { apps } = await getLabLights(null, ['Knuckle-Up', 'money', 'nope']);
    expect(apps.map((a) => a.app)).toEqual(['knuckle-up', 'money-watch', 'nope']);
    expect(apps[2]).toMatchObject({ state: 'red', why: 'Gone quiet: no logs in 7 days', logs_last_15m: 0, last_seen: null });
  });

  it('logs stamped in the future do not count: an app whose only logs are ahead of the clock is not "fine"', async () => {
    expect((await getAppActivity()).find((a) => a.app === 'clock-ahead')).toBeUndefined();
    const { apps } = await getLabLights(null, ['clock-ahead']);
    expect(apps[0]).toMatchObject({ app: 'clock-ahead', state: 'red', why: 'Gone quiet: no logs in 7 days' });
  });

  it('an app asked for twice (by name and by its index) gets one light', async () => {
    const { apps } = await getLabLights(null, ['money-watch', 'money', 'MONEY-WATCH', 'hyh']);
    expect(apps.map((a) => a.app)).toEqual(['money-watch', 'hyh']);
  });

  it('when the app list is full, an app left off says "no recent logs", not "no logs in 7 days"', async () => {
    const win = APP_ACTIVITY_WINDOW as { maxApps: number };
    const keep = win.maxApps;
    win.maxApps = 2;
    try {
      const { apps } = await getLabLights();
      expect(apps).toHaveLength(2);
      expect(apps.map((a) => a.app)).not.toContain('homework-tree'); // the list keeps the apps that logged last
      _labLightsTesting.reset();
      const asked = await getLabLights(null, ['homework-tree']);
      expect(asked.apps[0]).toMatchObject({ state: 'red', why: 'Gone quiet: no recent logs' });
    } finally {
      win.maxApps = keep;
    }
  });

  it('a key scoped to one index sees only that app; others read as having no logs', async () => {
    const all = await getLabLights(['hyh']);
    expect(all.apps.map((a) => a.app)).toEqual(['hyh']);
    const asked = await getLabLights(['hyh'], ['knuckle-up']);
    expect(asked.apps[0]).toMatchObject({ app: 'knuckle-up', state: 'red', why: 'Gone quiet: no logs in 7 days', errors_last_15m: 0 });
  });

  it('Data Sources rows now carry the status word from the same rule', async () => {
    const { sources } = await getActiveSources();
    const by = Object.fromEntries(sources.map((s) => [s.app_name, s]));
    expect(by['directors-palette'].status).toBe('active');
    expect(by.uptime.status).toBe('recent');
    expect(by['homework-tree'].status).toBe('inactive');
    expect(by.uptime.age_seconds).toBeGreaterThanOrEqual(40 * 60 - 5);
  });

  it('every number on a light opens a Search that finds exactly that many logs', async () => {
    const { lightSearchUrl } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const { apps } = await getLabLights();
    const countOf = async (url: string) => {
      const p = new URLSearchParams(url.split('?')[1]);
      const { results } = await executeDSLQuery<{ count: number }>(`${p.get('q')} | stats count`, {
        earliest: p.get('earliest')!,
        latest: p.get('latest') ?? undefined,
      });
      return Number(results[0]?.count ?? 0);
    };
    for (const l of apps) {
      expect(await countOf(lightSearchUrl(l.app, 'logs')!)).toBe(l.logs_last_15m);
      expect(await countOf(lightSearchUrl(l.app, 'errors')!)).toBe(l.errors_last_15m);
      // "usually N a day" / "4x normal": the 24 h before the last 15 min.
      expect(await countOf(lightSearchUrl(l.app, 'usual')!)).toBe(l.errors_usual_24h);
    }
    const ku = apps.find((a) => a.app === 'knuckle-up')!;
    expect(ku.errors_usual_24h).toBe(1000);
    expect(lightSearchUrl('unknown', 'logs')).toBeNull();
  });

  it('a 0 opens nothing (it would be an empty Search); every other number opens its own logs', async () => {
    const { numberSearchUrl, lightSearchUrl } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const { apps } = await getLabLights();
    const quiet = apps.find((a) => a.app === 'homework-tree')!;
    expect(quiet.logs_last_15m).toBe(0);
    expect(numberSearchUrl(quiet.app, 'logs', quiet.logs_last_15m)).toBeNull();
    for (const l of apps) {
      for (const [kind, n] of [['logs', l.logs_last_15m], ['errors', l.errors_last_15m], ['usual', l.errors_usual_24h]] as const) {
        expect(numberSearchUrl(l.app, kind, n)).toBe(n > 0 ? lightSearchUrl(l.app, kind) : null);
      }
    }
  });

  it('the stand plate: "since T" opens the logs from 15 min before T; quiet or unknown opens the week', async () => {
    const { plateLink } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const now = Date.now();
    const since = new Date(now - 60 * MIN).toISOString();
    const red = new URLSearchParams(plateLink('knuckle-up', 'Error spike', since, now)!.url.split('?')[1]);
    expect(red.get('earliest')).toBe('-75m');
    expect(red.get('q')).toBe('search app_name="knuckle-up"');
    // The window holds every log from the change on: at least the last 15 minutes' logs.
    const { results } = await executeDSLQuery<{ count: number }>(`${red.get('q')} | stats count`, { earliest: '-75m' });
    const ku = (await getLabLights()).apps.find((a) => a.app === 'knuckle-up')!;
    expect(Number(results[0]?.count)).toBeGreaterThanOrEqual(ku.logs_last_15m);
    expect(new URLSearchParams(plateLink('uptime', 'Quiet', since, now)!.url.split('?')[1]).get('earliest')).toBe('-7d');
    expect(new URLSearchParams(plateLink('hyh', 'Alert', null, now)!.url.split('?')[1]).get('earliest')).toBe('-7d');
    expect(plateLink('unknown', 'Alert', since, now)).toBeNull();
  });

  it('the colour filter shows only that colour; the wall view is one screen per row on a phone', async () => {
    const { onlyState, shelfGridClass } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const { apps } = await getLabLights();
    const reds = onlyState(apps, 'red');
    expect(reds.length).toBe(apps.filter((a) => a.state === 'red').length);
    expect(reds.length).toBeGreaterThan(0);
    expect(reds.every((a) => a.state === 'red')).toBe(true);
    expect(onlyState(apps, null)).toHaveLength(apps.length);
    // Tailwind: the unprefixed grid-cols-N is the phone layout (sm: starts at 640 px).
    expect(shelfGridClass(true).split(' ')[0]).toBe('grid-cols-1');
    expect(shelfGridClass(false).split(' ')[0]).toBe('grid-cols-2');
  });

  it('the round screen opens what its word is about; quiet opens the last 7 days, where the newest log is', async () => {
    const { screenLink } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const { apps } = await getLabLights();
    const by = Object.fromEntries(apps.map((a) => [a.app, a]));
    expect(screenLink('hyh', 'Alert')!.url).toBe('/alerts');
    expect(screenLink('hyh', 'Alert', 'HYH checkout errors')!.title).toContain('"HYH checkout errors"');
    expect(screenLink('knuckle-up', 'Error spike')!.url).toContain('severity%3C%3D3');
    const quiet = new URLSearchParams(screenLink('homework-tree', 'Gone quiet')!.url.split('?')[1]);
    expect(quiet.get('earliest')).toBe('-7d');
    const { results } = await executeDSLQuery<{ newest: string }>(`${quiet.get('q')} | stats max(timestamp) as newest`, { earliest: '-7d' });
    expect(Date.parse(String(results[0]?.newest).replace(' ', 'T') + (String(results[0]?.newest).includes('Z') ? '' : 'Z'))).toBe(Date.parse(by['homework-tree'].last_seen!));
    expect(screenLink('unknown', 'Fine')).toBeNull();
  });

  it('the screen splits every why into its big headline and small detail', async () => {
    const { splitWhy } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    for (const l of (await getLabLights()).apps) {
      const { headline, detail } = splitWhy(l.why, l.state);
      expect(WHY_HEADLINES as readonly string[]).toContain(headline);
      expect(detail.length).toBeGreaterThan(0);
    }
    expect(splitWhy('something odd', 'red')).toEqual({ headline: 'Trouble', detail: 'something odd' });
  });

  it('the shelf puts red first, then yellow, then green; asked-for apps keep their order', async () => {
    const { shelfOrder } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const all = (await getLabLights()).apps;
    expect(shelfOrder(all, false).map((l) => l.state)).toEqual(['red', 'red', 'red', 'yellow', 'green', 'green']);
    expect(shelfOrder(all, false).map((l) => l.app)).toEqual(['homework-tree', 'hyh', 'knuckle-up', 'uptime', 'directors-palette', 'money-watch']);
    const asked = (await getLabLights(null, ['uptime', 'hyh'])).apps;
    expect(shelfOrder(asked, true).map((l) => l.app)).toEqual(['uptime', 'hyh']);
  });

  it('the Data Sources page shows the API\'s status word instead of working it out itself', async () => {
    const { sourceStatusInfo, ageAgo } = (await import(/* @vite-ignore */ ui('sourceStatus.ts'))) as SourceStatusUi;
    const { sources } = await getActiveSources();
    const uptime = sources.find((s) => s.app_name === 'uptime')!;
    expect(sourceStatusInfo(uptime.status).label).toBe('Recent');
    expect(ageAgo(uptime.age_seconds)).toBe('40m ago');
    expect(sourceStatusInfo('active').label).toBe('Active');
    expect(sourceStatusInfo('inactive').label).toBe('Inactive');
    expect(sourceStatusInfo(undefined).label).toBe('Stale');
    expect(ageAgo(3 * 86400)).toBe('3d ago');
  });

  it('a silenced alert, or one whose latest run no longer met its rule, stops lighting the app', async () => {
    const db = getSQLiteDB();
    db.prepare(`INSERT INTO alert_silences (id, level, target_id, ends_at) VALUES ('sil-hyh', 'alert', 'al-hyh', datetime('now', '+1 hour'))`).run();
    try {
      _labLightsTesting.reset();
      const hyh = (await getLabLights(null, ['hyh'])).apps[0];
      expect(hyh.why).not.toBe('Alert: HYH checkout errors');
    } finally {
      db.prepare(`DELETE FROM alert_silences WHERE id = 'sil-hyh'`).run();
    }
    // Throttled inside its window, but the latest run counted 0 of "more than 5": cleared.
    db.prepare(
      `UPDATE alerts SET last_status = 'ok', throttle_enabled = 1, throttle_window_seconds = 3600,
              trigger_type = 'number_of_results', trigger_condition = 'greater_than', trigger_threshold = 5, last_value = 0
        WHERE id = 'al-hyh'`,
    ).run();
    try {
      _labLightsTesting.reset();
      expect((await getLabLights(null, ['hyh'])).apps[0].why).not.toBe('Alert: HYH checkout errors');
      db.prepare(`UPDATE alerts SET last_value = 9 WHERE id = 'al-hyh'`).run();
      _labLightsTesting.reset();
      expect((await getLabLights(null, ['hyh'])).apps[0]).toMatchObject({ state: 'red', why: 'Alert: HYH checkout errors' });
    } finally {
      db.prepare(`UPDATE alerts SET last_status = 'triggered', throttle_enabled = 0, last_value = NULL WHERE id = 'al-hyh'`).run();
    }
  });

  it('silences: global darkens every alert, another alert\'s silence does not, an ended or not-yet-started one does not (ISO times as the silence service writes them)', async () => {
    const db = getSQLiteDB();
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    const hyhWhy = async () => {
      _labLightsTesting.reset();
      return (await getLabLights(null, ['hyh'])).apps[0].why;
    };
    const FIRING = 'Alert: HYH checkout errors';
    const add = db.prepare(`INSERT INTO alert_silences (id, level, target_id, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)`);
    const clear = () => db.prepare(`DELETE FROM alert_silences WHERE id LIKE 'sil-t-%'`).run();
    try {
      expect(await hyhWhy()).toBe(FIRING);
      add.run('sil-t-global', 'global', null, iso(-60_000), iso(3_600_000));
      expect(await hyhWhy()).not.toBe(FIRING);
      clear();
      add.run('sil-t-other', 'alert', 'al-money', iso(-60_000), iso(3_600_000));
      expect(await hyhWhy()).toBe(FIRING);
      clear();
      // Ended a minute ago, written as ISO text: no longer silences anything.
      add.run('sil-t-ended', 'alert', 'al-hyh', iso(-3_600_000), iso(-60_000));
      expect(await hyhWhy()).toBe(FIRING);
      clear();
      // Starts in an hour: not yet.
      add.run('sil-t-later', 'alert', 'al-hyh', iso(3_600_000), null);
      expect(await hyhWhy()).toBe(FIRING);
      clear();
      // A host-level silence is about a host, not an app: the light stays (documented in alertsForApp).
      add.run('sil-t-host', 'host', 'hyh-box', iso(-60_000), null);
      expect(await hyhWhy()).toBe(FIRING);
    } finally {
      clear();
      _labLightsTesting.reset();
    }
  });
  it('logs stamped a few minutes ahead are not in the 15-min numbers, so each number still equals its Search', async () => {
    const { lightSearchUrl } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const logsDb = getSQLiteLogsDB();
    const row = (ts: string, severity: number) => ({ timestamp: ts, app_name: 'clock-near', index_name: 'clock-near', hostname: 'h', severity, message: 'near' });
    try {
      // 2 logs now (one an error) and 3 errors stamped 3 min ahead (inside the 5-min tolerance).
      await insertLogs([row(ago(30_000), 6), row(ago(30_000), 3), ...Array.from({ length: 3 }, () => row(ago(-3 * MIN), 3))]);
      _labLightsTesting.reset();
      const light = (await getLabLights(null, ['clock-near'])).apps[0];
      expect(light).toMatchObject({ app: 'clock-near', logs_last_15m: 2, errors_last_15m: 1 });
      expect(light.last_seen).not.toBeNull();
      const countOf = async (url: string) => {
        const p = new URLSearchParams(url.split('?')[1]);
        const { results } = await executeDSLQuery<{ count: number }>(`${p.get('q')} | stats count`, { earliest: p.get('earliest')! });
        return Number(results[0]?.count ?? 0);
      };
      expect(await countOf(lightSearchUrl('clock-near', 'logs')!)).toBe(2);
      expect(await countOf(lightSearchUrl('clock-near', 'errors')!)).toBe(1);
    } finally {
      logsDb.prepare(`DELETE FROM logs WHERE app_name = 'clock-near'`).run();
      _labLightsTesting.reset();
    }
  });

  it('an app with no logs in 7 days links nowhere (screen and plate); a capped "no recent logs" app still opens its week', async () => {
    const { screenLink, plateLink, splitWhy, NO_LOGS_DETAIL } = (await import(/* @vite-ignore */ ui('labLights.ts'))) as LabLightsUi;
    const none = (await getLabLights(null, ['nobody-here'])).apps[0];
    expect(none).toMatchObject({ state: 'red', why: 'Gone quiet: no logs in 7 days', last_seen: null });
    const { headline, detail } = splitWhy(none.why, none.state);
    expect(detail).toBe(NO_LOGS_DETAIL);
    expect(screenLink(none.app, headline, detail)).toBeNull();
    expect(plateLink(none.app, headline, null, Date.now(), detail)).toBeNull();
    expect(plateLink(none.app, headline, new Date(Date.now() - 10 * MIN).toISOString(), Date.now(), detail)).toBeNull();
    // The Search the link would have opened really is empty.
    const { results } = await executeDSLQuery<{ count: number }>('search app_name="nobody-here" | stats count', { earliest: '-7d' });
    expect(Number(results[0]?.count ?? 0)).toBe(0);
    // Left off a full list: it may still have logs this week, so the week stays linked.
    const capped = splitWhy('Gone quiet: no recent logs', 'red');
    expect(screenLink('homework-tree', capped.headline, capped.detail)!.url).toContain('earliest=-7d');
    expect(plateLink('homework-tree', capped.headline, null, Date.now(), capped.detail)!.url).toContain('earliest=-7d');
  });

  it('real rule text over real rows: an app= rule lights only its app, not a neighbour in the same index (and DSL aliases count)', async () => {
    const db = getSQLiteDB();
    const logsDb = getSQLiteLogsDB();
    const row = (app: string, severity: number) => ({ timestamp: ago(MIN), app_name: app, index_name: 'shop', hostname: 'h', severity, message: app });
    const addAlert = db.prepare(
      `INSERT INTO alerts (id, name, search_query, severity, enabled, last_run, last_triggered, last_status)
       VALUES (?, ?, ?, 'high', 1, ?, ?, 'triggered')`,
    );
    const lights = async (key: string[] | null) => {
      _labLightsTesting.reset();
      return Object.fromEntries((await getLabLights(key, ['shop-worker', 'shop-web'])).apps.map((a) => [a.app, a]));
    };
    try {
      await insertLogs([row('shop-worker', 3), row('shop-worker', 6), row('shop-web', 6)]);
      addAlert.run('al-shop-k2', 'Shop worker errors', 'search index=shop app=shop-worker severity<=3', ago(MIN), ago(2 * MIN));
      for (const key of [null, ['shop']]) {
        const by = await lights(key);
        expect(by['shop-worker']).toMatchObject({ state: 'red', why: 'Alert: Shop worker errors' });
        expect(by['shop-web'].why).not.toMatch(/^Alert/);
      }
      // "program=" is the same field to the DSL (app_name): still only shop-worker.
      db.prepare(`UPDATE alerts SET search_query = 'search index=shop program="shop-worker" severity<=3' WHERE id = 'al-shop-k2'`).run();
      const by = await lights(null);
      expect(by['shop-worker'].why).toBe('Alert: Shop worker errors');
      expect(by['shop-web'].why).not.toMatch(/^Alert/);
      // An "index=*" branch may read any index, so a key limited to shop does not see the rule; an unscoped key does.
      db.prepare(`UPDATE alerts SET search_query = 'search index=shop OR index=* severity<=3' WHERE id = 'al-shop-k2'`).run();
      expect((await lights(['shop']))['shop-web'].why).not.toMatch(/^Alert/);
      expect((await lights(null))['shop-web'].why).toBe('Alert: Shop worker errors');
    } finally {
      db.prepare(`DELETE FROM alerts WHERE id = 'al-shop-k2'`).run();
      logsDb.prepare(`DELETE FROM logs WHERE app_name IN ('shop-worker', 'shop-web')`).run();
      _labLightsTesting.reset();
    }
  });
});

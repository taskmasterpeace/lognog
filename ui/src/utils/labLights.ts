/**
 * Words, colours and drill-down links for the Lab lights page (/lights).
 *
 * The light itself comes from GET /status/lights (api/src/services/lab-lights.ts).
 * Its `why` is always "<Headline>: <detail>"; the round screen shows the
 * headline big and the detail small, the same way the ESP32 firmware does
 * (hardware/lab-lights/src/main.cpp).
 *
 * Kept free of React/browser imports so the API test suite can import it and
 * check the links against the real counts (api/src/db/app-activity.test.ts).
 */
import { canDrillDown } from './sourceDrilldown';

export type LightState = 'green' | 'yellow' | 'red';

/** The 15-minute window the light's numbers count. */
export const LIGHTS_EARLIEST = '-15m';

/** Errors are severity 0-3, as everywhere else in LogNog. */
export const LIGHTS_ERROR_CONDITION = 'severity<=3';

/** Ring and word colours, matching the firmware's (RGB565 there). */
export const LIGHT_COLORS: Record<LightState | 'offline', { ring: string; glow: string; word: string }> = {
  green: { ring: '#16A34A', glow: 'rgba(22,163,74,0.45)', word: '#22C55E' },
  yellow: { ring: '#E08A00', glow: 'rgba(224,138,0,0.45)', word: '#F59E0B' },
  red: { ring: '#DC2626', glow: 'rgba(220,38,38,0.5)', word: '#EF4444' },
  offline: { ring: '#6B6259', glow: 'rgba(0,0,0,0)', word: '#A8A29E' },
};

export const STATE_WORD: Record<LightState, string> = { green: 'Fine', yellow: 'Warning', red: 'Trouble' };

/** "Error spike: 47 in 15 min, 4x normal" -> { headline: 'Error spike', detail: '47 in 15 min, 4x normal' }. */
export function splitWhy(why: string, state: LightState): { headline: string; detail: string } {
  const at = why.indexOf(': ');
  if (at > 0 && at <= 20) return { headline: why.slice(0, at), detail: why.slice(at + 2) };
  return { headline: STATE_WORD[state], detail: why };
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function lightLogsQuery(app: string): string {
  return `search app_name=${quote(app)}`;
}

export function lightErrorsQuery(app: string): string {
  return `${lightLogsQuery(app)} ${LIGHTS_ERROR_CONDITION}`;
}

/**
 * What a link on a light opens:
 *   logs    the app's logs in the last 15 min (the "N logs" number)
 *   errors  its errors in the last 15 min (the "N errors" number, "47 in 15 min")
 *   usual   its errors in the 24 h before that ("usually N a day", the "4x normal" base)
 *   week    its logs in the last 7 days (newest first: when it last sent, how long it's been quiet)
 */
export type LightLinkKind = 'logs' | 'errors' | 'usual' | 'week';

/** Search link for one number on a light, or null when there is nothing to search by. */
export function lightSearchUrl(app: string, kind: LightLinkKind): string | null {
  if (!canDrillDown(app)) return null;
  const q = kind === 'errors' || kind === 'usual' ? lightErrorsQuery(app) : lightLogsQuery(app);
  const params = new URLSearchParams({ q, earliest: kind === 'week' ? '-7d' : kind === 'usual' ? '-24h' : LIGHTS_EARLIEST });
  if (kind === 'usual') params.set('latest', LIGHTS_EARLIEST);
  return `/search?${params.toString()}`;
}

/**
 * A number's link: null when it is 0 (it would open an empty Search) or the
 * app can't be searched. Every number above 0 opens exactly the logs it counts.
 */
export function numberSearchUrl(app: string, kind: LightLinkKind, count: number): string | null {
  if (!(count > 0)) return null;
  return lightSearchUrl(app, kind);
}

const QUIET_HEADLINES = new Set(['Gone quiet', 'Quiet']);

/**
 * The small line of an app with no logs at all in the last 7 days (the API's
 * "Gone quiet: no logs in 7 days"). Every Search for it is empty, so neither
 * the screen nor its plate links anywhere.
 */
export const NO_LOGS_DETAIL = 'no logs in 7 days';

/**
 * Where the round screen itself leads: the logs behind its big word and the
 * numbers in its small line. An alert opens the Alerts page (named in the
 * title: Alerts has no link to one rule); quiet opens the last 7 days (newest
 * first, so the last log it sent is on top); a spike or errors up opens the
 * 15-min errors; fine opens the 15-min logs.
 */
export function screenLink(app: string, headline: string, detail = ''): { url: string; title: string } | null {
  if (detail === NO_LOGS_DETAIL) return null;
  if (headline === 'Alert') {
    return { url: '/alerts', title: detail ? `Open Alerts; the rule firing is "${detail}"` : 'Open Alerts to see the rule that is firing' };
  }
  const kind: LightLinkKind =
    QUIET_HEADLINES.has(headline) ? 'week' : headline === 'Error spike' || headline === 'Errors up' ? 'errors' : 'logs';
  const url = lightSearchUrl(app, kind);
  if (!url) return null;
  const what = {
    week: `Open ${app}'s logs from the last 7 days (the newest is the last one it sent)`,
    errors: `Open ${app}'s errors from the last 15 minutes`,
    logs: `Open ${app}'s logs from the last 15 minutes`,
    usual: '',
  }[kind];
  return { url, title: what };
}

/**
 * The stand plate's link. "since 6:38 PM" opens the app's logs from 15
 * minutes before 6:38 PM until now, so the change is in view. A quiet light,
 * or a plate that shows "last log N ago", opens the last 7 days instead: the
 * newest log there is the last one the app sent. An app with no logs in 7
 * days (detail NO_LOGS_DETAIL) has nothing to open: no link.
 */
export function plateLink(
  app: string,
  headline: string,
  since: string | null,
  nowMs: number = Date.now(),
  detail = '',
): { url: string; title: string } | null {
  if (detail === NO_LOGS_DETAIL) return null;
  const sinceMs = since ? Date.parse(since) : NaN;
  if (QUIET_HEADLINES.has(headline) || !Number.isFinite(sinceMs)) {
    const url = lightSearchUrl(app, 'week');
    return url ? { url, title: `Open ${app}'s logs from the last 7 days (the newest is the last one it sent)` } : null;
  }
  if (!canDrillDown(app)) return null;
  const minutes = Math.max(0, Math.ceil((nowMs - sinceMs) / 60_000)) + 15;
  const params = new URLSearchParams({ q: lightLogsQuery(app), earliest: `-${minutes}m` });
  return { url: `/search?${params.toString()}`, title: `Open ${app}'s logs from 15 minutes before the light took this colour until now` };
}

/** The ?state= filter on the page: only the lights of that colour, or all of them. */
export function onlyState<T extends { state: LightState }>(lights: T[], only: LightState | null): T[] {
  return only ? lights.filter((l) => l.state === only) : lights;
}

/**
 * The grid of screens. The wall view's screens are big (200 px on a phone),
 * so a phone shows one per row; the page's smaller ones fit two per row.
 */
export function shelfGridClass(wall: boolean): string {
  return wall
    ? 'grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]'
    : 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]';
}

const STATE_RANK: Record<LightState, number> = { red: 0, yellow: 1, green: 2 };

/**
 * Order of the screens on the shelf. Asked-for apps (?apps=) keep the order
 * they were asked in, like a shelf someone arranged; the full list puts red
 * first, then yellow, then green, each by name, so trouble comes first.
 */
export function shelfOrder<T extends { state: LightState; label: string }>(lights: T[], asked: boolean): T[] {
  if (asked) return lights;
  return [...lights].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.label.localeCompare(b.label));
}

/** Parse a ?apps= value from the page URL the same way the API does (trim, drop blanks). */
export function appsFromParam(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

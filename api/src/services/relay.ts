/**
 * Studio relay alert action.
 *
 * Sends an alert to Robert through the studio relay (one HTTP service that owns
 * the Telegram bot and the lab speaker queue). LogNog never holds the bot token;
 * it signs in with the studio bus key from the environment.
 *
 * Relay contract (studio-relay/relay.py):
 *   POST <RELAY_URL>/send   sends (LogNog only uses /send; /check is the relay's dry run)
 *   header X-Bus-Key: <bus key>
 *   JSON {seat, text, brand?, announce?, urgent?}
 *   200 {ok:true,...} | 422 {ok:false, sent:false, why:[...], announce?} | 403 bad key
 *   text must start with a Glance Tag and carry "<PROJECT> ·" in its first 160 chars.
 *   brand "lognog" = sent as the LogNog logo photo with the text as caption (max 1000 chars).
 *   announce true = also queued for the lab speaker.
 *
 * Lab-only is NOT supported: the relay has no "speaker only" path. /send always
 * texts Robert when its checks pass, and `announce` only rides along with that
 * text. So "Say it in the lab" requires "Text Robert on Telegram".
 *
 * Config comes from the environment only (RELAY_URL, RELAY_BUS_KEY). The key is
 * sent in the X-Bus-Key header and never logged, stored in rules or returned.
 */

import type { Alert, AlertAction } from '../db/sqlite-alerts.js';
import { processTemplate, generateAISummary, TemplateContext } from './template-engine.js';

export const RELAY_PROJECTS = [
  'GAME',
  'DIRECTORS PALETTE',
  'STUDIO',
  'PARTNERS',
  'MONEY',
  'PRESIDIUM',
  'FIRST HUDDLE',
  'HOMEWORK TREE',
] as const;
export type RelayProject = typeof RELAY_PROJECTS[number];

/** Seat LogNog speaks as on the relay. */
export const RELAY_SEAT = 'octavia';
/** Brand logo the relay sends with the caption. */
export const RELAY_BRAND = 'lognog';
export const RELAY_TIMEOUT_MS = 10_000;
/** Branded messages go out as a photo caption, which the relay caps at 1000 characters. */
export const RELAY_TEXT_MAX = 1000;

export const RELAY_NOT_CONFIGURED = "Relay isn't set up on this server (RELAY_URL and RELAY_BUS_KEY).";
export const RELAY_LAB_NEEDS_TELEGRAM = 'Lab announcements ride along with the Telegram text: turn on "Text Robert on Telegram" too.';

export interface RelayServerConfig {
  url: string;
  key: string;
}

export interface RelayActionConfig {
  project?: string;
  message?: string;
  telegram?: boolean;
  lab?: boolean;
  urgent?: boolean;
}

export interface RelayPayload {
  seat: string;
  text: string;
  brand: string;
  announce: boolean;
  urgent: boolean;
}

export interface RelayReply {
  /** True only for HTTP 2xx with a JSON body that says ok: true (the relay's success reply). */
  ok: boolean;
  /** HTTP status, or 0 when the relay could not be reached. */
  status: number;
  /** The relay's plain reasons (or ours, for timeouts and network errors). */
  why: string[];
  /** The relay's note about the lab speaker queue, when announce was asked. */
  announce?: string;
}

/** Reads RELAY_URL + RELAY_BUS_KEY. Returns null unless both are set and the URL is http(s). */
export function getRelayConfig(env: NodeJS.ProcessEnv = process.env): RelayServerConfig | null {
  const url = (env.RELAY_URL || '').trim();
  const key = (env.RELAY_BUS_KEY || '').trim();
  if (!url || !key) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return { url, key };
}

export function isRelayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getRelayConfig(env) !== null;
}

export function normalizeRelayProject(project: unknown): RelayProject | null {
  if (typeof project !== 'string') return null;
  const p = project.trim().toUpperCase();
  return (RELAY_PROJECTS as readonly string[]).includes(p) ? (p as RelayProject) : null;
}

/** Glance Tag: 🚨 when urgent, 💰 for MONEY, 🎮 for GAME, 🚧 for everything else. */
export function relayTag(project: string, urgent: boolean): string {
  if (urgent) return '🚨';
  const p = (project || '').trim().toUpperCase();
  if (p === 'MONEY') return '💰';
  if (p === 'GAME') return '🎮';
  return '🚧';
}

/** `${tag} ${PROJECT} · ${message}`, cut to the relay's caption limit. */
export function buildRelayText(project: string, message: string, urgent: boolean): string {
  const p = (project || '').trim().toUpperCase();
  const text = `${relayTag(p, urgent)} ${p} · ${(message || '').trim()}`;
  const chars = Array.from(text); // count emoji as one character, never split one
  if (chars.length <= RELAY_TEXT_MAX) return text;
  return chars.slice(0, RELAY_TEXT_MAX - 1).join('') + '…';
}

export function buildRelayPayload(
  project: string,
  renderedMessage: string,
  opts: { lab?: boolean; urgent?: boolean }
): RelayPayload {
  const urgent = Boolean(opts.urgent);
  return {
    seat: RELAY_SEAT,
    text: buildRelayText(project, renderedMessage, urgent),
    brand: RELAY_BRAND,
    announce: Boolean(opts.lab),
    urgent,
  };
}

function relayEndpoint(base: string, path: 'send' | 'check'): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

/** POST a payload to the relay's /send or /check. Never throws. */
export async function postToRelay(
  path: 'send' | 'check',
  payload: RelayPayload,
  config: RelayServerConfig | null = getRelayConfig(),
  timeoutMs: number = RELAY_TIMEOUT_MS
): Promise<RelayReply> {
  if (!config) return { ok: false, status: 0, why: [RELAY_NOT_CONFIGURED] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(relayEndpoint(config.url, path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bus-Key': config.key },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Never carry X-Bus-Key on to another host.
      redirect: 'error',
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, why: [`no answer within ${Math.round(timeoutMs / 1000)} seconds`] };
    }
    return { ok: false, status: 0, why: [`could not reach the relay (${err instanceof Error ? err.message : 'network error'})`] };
  }

  let body: Record<string, unknown> | null = null;
  try {
    const raw = await response.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    body = null;
  } finally {
    clearTimeout(timer);
  }

  const why = Array.isArray(body?.why) ? (body!.why as unknown[]).map(String).filter(Boolean) : [];
  const announce = typeof body?.announce === 'string' ? body.announce : undefined;
  const ok = response.ok && body !== null && body.ok === true;

  if (!ok && why.length === 0) {
    if (response.status === 403) why.push('the relay did not accept the bus key (check RELAY_BUS_KEY)');
    else if (response.status === 429) why.push('too many wrong keys; the relay is waiting 10 minutes');
    else if (typeof body?.error === 'string') why.push(body.error);
    else if (body === null) why.push(`the relay answered ${response.status} without JSON`);
    else if (response.ok) why.push(`the relay answered ${response.status} without ok: true (is RELAY_URL the studio relay?)`);
    else why.push(`the relay answered ${response.status}`);
  }
  return { ok, status: response.status, why, ...(announce ? { announce } : {}) };
}

/** "Relay refused: a; b" plus the lab-queue note when there is one. */
export function describeRelayFailure(reply: RelayReply): string {
  const lead = reply.status === 0 ? 'Relay failed' : 'Relay refused';
  const lab = reply.announce ? ` (lab: ${reply.announce})` : '';
  return `${lead}: ${reply.why.join('; ')}${lab}`;
}

/** Plain-words reason the config can't be used, or null when it is fine. */
export function relayConfigProblem(config: RelayActionConfig | undefined): string | null {
  if (!config) return 'Relay action missing config';
  if (!normalizeRelayProject(config.project)) {
    return `Pick a project for the relay (one of: ${RELAY_PROJECTS.join(', ')})`;
  }
  if (typeof config.message !== 'string' || !config.message.trim()) {
    return 'The relay message is empty';
  }
  if (!config.telegram && config.lab) return RELAY_LAB_NEEDS_TELEGRAM;
  if (!config.telegram) return 'Relay action has Telegram turned off: nothing to send';
  return null;
}

/** For the create/update routes: reason the first relay action is invalid, or null. */
export function invalidRelayActions(actions: unknown): string | null {
  if (!Array.isArray(actions)) return null;
  for (const a of actions) {
    if (a && typeof a === 'object' && (a as AlertAction).type === 'relay') {
      const problem = relayConfigProblem((a as AlertAction).config as RelayActionConfig);
      if (problem) return problem;
    }
  }
  return null;
}

/** The alert action: render the message, send through the relay, report plainly. */
export async function executeRelayAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ success: boolean; message: string }> {
  const config = action.config as RelayActionConfig;
  const problem = relayConfigProblem(config);
  if (problem) return { success: false, message: problem };

  const server = getRelayConfig();
  if (!server) return { success: false, message: RELAY_NOT_CONFIGURED };

  const context: TemplateContext = {
    alert_name: alert.name,
    alert_severity: alert.severity.toUpperCase(),
    result_count: resultCount,
    timestamp: new Date().toISOString(),
    search_query: alert.search_query,
    results: sampleResults,
    result: sampleResults[0],
  };
  if (config.message!.includes('{{ai_summary}}')) {
    context.ai_summary = await generateAISummary(context);
  }

  const project = normalizeRelayProject(config.project)!;
  const payload = buildRelayPayload(project, processTemplate(config.message!, context), {
    lab: config.lab,
    urgent: config.urgent,
  });
  const reply = await postToRelay('send', payload, server);
  if (!reply.ok) return { success: false, message: describeRelayFailure(reply) };

  const lab = payload.announce ? ` + lab (${reply.announce || 'asked'})` : '';
  return { success: true, message: `Relay sent to Telegram${lab}` };
}

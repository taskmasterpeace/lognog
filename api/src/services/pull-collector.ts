import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from '../db/sqlite.js';
import { insertLogs } from '../db/backend.js';

/**
 * Phase 4 (Reach): scheduled pull collectors.
 *
 * A pull collector periodically fetches an HTTP endpoint and ingests the
 * response as logs. This is for SaaS / sources that only expose pull APIs
 * (vs. pushing logs to us). Collectors are admin-configured server-side, so
 * the records they write flow through the normal insertLogs path with no
 * per-key index scoping — each collector writes to its own configured index.
 */

export interface PullCollector {
  id: string;
  name: string;
  enabled: number;
  url: string;
  http_method: string;
  headers: string | null;
  request_body: string | null;
  index_name: string;
  items_path: string | null;
  message_field: string | null;
  time_field: string | null;
  default_severity: number;
  cron_expression: string;
  last_run: string | null;
  last_status: string | null;
  last_error: string | null;
  last_event_count: number | null;
  created_at: string;
}

export interface CreatePullCollectorInput {
  name: string;
  url: string;
  index_name: string;
  enabled?: boolean;
  http_method?: string;
  headers?: Record<string, string> | string | null;
  request_body?: string | null;
  items_path?: string | null;
  message_field?: string | null;
  time_field?: string | null;
  default_severity?: number;
  cron_expression?: string;
}

export type UpdatePullCollectorInput = Partial<CreatePullCollectorInput>;

// Fetch timeout (matches the alerts webhook convention).
const FETCH_TIMEOUT_MS = 30000;

// Initialize schema on import, mirroring the pattern other modules rely on.
getSQLiteDB().exec(`
  CREATE TABLE IF NOT EXISTS pull_collectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    url TEXT NOT NULL,
    http_method TEXT NOT NULL DEFAULT 'GET',
    headers TEXT,
    request_body TEXT,
    index_name TEXT NOT NULL,
    items_path TEXT,
    message_field TEXT,
    time_field TEXT,
    default_severity INTEGER NOT NULL DEFAULT 6,
    cron_expression TEXT NOT NULL DEFAULT '*/15 * * * *',
    last_run TEXT,
    last_status TEXT,
    last_error TEXT,
    last_event_count INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pull_collectors_enabled ON pull_collectors(enabled);
`);

function serializeHeaders(headers: CreatePullCollectorInput['headers']): string | null {
  if (headers === undefined || headers === null) return null;
  if (typeof headers === 'string') return headers;
  return JSON.stringify(headers);
}

export function createPullCollector(data: CreatePullCollectorInput): PullCollector {
  const db = getSQLiteDB();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO pull_collectors (
      id, name, enabled, url, http_method, headers, request_body,
      index_name, items_path, message_field, time_field,
      default_severity, cron_expression
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.enabled === false ? 0 : 1,
    data.url,
    data.http_method || 'GET',
    serializeHeaders(data.headers),
    data.request_body ?? null,
    data.index_name,
    data.items_path ?? null,
    data.message_field ?? null,
    data.time_field ?? null,
    data.default_severity ?? 6,
    data.cron_expression || '*/15 * * * *',
  );

  return getPullCollector(id)!;
}

export function getPullCollectors(enabledOnly = false): PullCollector[] {
  const db = getSQLiteDB();
  const sql = enabledOnly
    ? 'SELECT * FROM pull_collectors WHERE enabled = 1 ORDER BY name ASC'
    : 'SELECT * FROM pull_collectors ORDER BY name ASC';
  return db.prepare(sql).all() as PullCollector[];
}

export function getPullCollector(id: string): PullCollector | null {
  const db = getSQLiteDB();
  return (db.prepare('SELECT * FROM pull_collectors WHERE id = ?').get(id) as PullCollector | undefined) ?? null;
}

export function updatePullCollector(id: string, data: UpdatePullCollectorInput): PullCollector | null {
  const db = getSQLiteDB();
  const existing = getPullCollector(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }
  if (data.url !== undefined) {
    updates.push('url = ?');
    params.push(data.url);
  }
  if (data.http_method !== undefined) {
    updates.push('http_method = ?');
    params.push(data.http_method);
  }
  if (data.headers !== undefined) {
    updates.push('headers = ?');
    params.push(serializeHeaders(data.headers));
  }
  if (data.request_body !== undefined) {
    updates.push('request_body = ?');
    params.push(data.request_body ?? null);
  }
  if (data.index_name !== undefined) {
    updates.push('index_name = ?');
    params.push(data.index_name);
  }
  if (data.items_path !== undefined) {
    updates.push('items_path = ?');
    params.push(data.items_path ?? null);
  }
  if (data.message_field !== undefined) {
    updates.push('message_field = ?');
    params.push(data.message_field ?? null);
  }
  if (data.time_field !== undefined) {
    updates.push('time_field = ?');
    params.push(data.time_field ?? null);
  }
  if (data.default_severity !== undefined) {
    updates.push('default_severity = ?');
    params.push(data.default_severity);
  }
  if (data.cron_expression !== undefined) {
    updates.push('cron_expression = ?');
    params.push(data.cron_expression);
  }

  if (updates.length === 0) return existing;

  params.push(id);
  db.prepare(`UPDATE pull_collectors SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getPullCollector(id);
}

export function deletePullCollector(id: string): boolean {
  const db = getSQLiteDB();
  const result = db.prepare('DELETE FROM pull_collectors WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Walk a dot-path (e.g. 'data.events') to a value inside a parsed JSON body.
 * Returns undefined if any segment is missing.
 */
function resolvePath(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Resolve the array of items from a parsed response body:
 *  - if items_path set, walk to it (must yield an array, else error);
 *  - else if the body is itself an array, use it;
 *  - else wrap the whole body as a single-item array.
 */
function resolveItems(body: unknown, itemsPath: string | null): Record<string, unknown>[] {
  if (itemsPath) {
    const resolved = resolvePath(body, itemsPath);
    if (!Array.isArray(resolved)) {
      throw new Error(`items_path '${itemsPath}' did not resolve to an array`);
    }
    return resolved as Record<string, unknown>[];
  }
  if (Array.isArray(body)) {
    return body as Record<string, unknown>[];
  }
  return [body as Record<string, unknown>];
}

function mapItemToRecord(
  item: Record<string, unknown>,
  collector: PullCollector,
): Record<string, unknown> {
  const timeValue = collector.time_field ? item[collector.time_field] : undefined;
  const messageValue = collector.message_field ? item[collector.message_field] : undefined;

  return {
    timestamp: timeValue != null ? String(timeValue) : new Date().toISOString(),
    hostname: collector.name,
    app_name: collector.name,
    message: messageValue != null ? String(messageValue) : JSON.stringify(item),
    severity: collector.default_severity,
    index_name: collector.index_name,
    structured_data: JSON.stringify(item),
  };
}

function persistRunResult(
  id: string,
  status: 'ok' | 'error',
  eventCount: number,
  error: string | null,
): void {
  const db = getSQLiteDB();
  db.prepare(`
    UPDATE pull_collectors
    SET last_run = datetime('now'),
        last_status = ?,
        last_error = ?,
        last_event_count = ?
    WHERE id = ?
  `).run(status, error, eventCount, id);
}

/**
 * Run a single pull collector: fetch its endpoint, map the response to log
 * records, and ingest them. Never throws — fetch/parse/ingest failures are
 * caught, recorded on the collector row, and returned as { ok:false }.
 */
export async function runPullCollector(
  id: string,
): Promise<{ ok: boolean; eventCount: number; error?: string }> {
  const collector = getPullCollector(id);
  if (!collector) {
    return { ok: false, eventCount: 0, error: `Pull collector not found: ${id}` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let headers: Record<string, string> = {};
    if (collector.headers) {
      headers = JSON.parse(collector.headers) as Record<string, string>;
    }

    const method = collector.http_method || 'GET';
    const response = await fetch(collector.url, {
      method,
      headers,
      body: collector.request_body || undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as unknown;
    const items = resolveItems(body, collector.items_path);
    const records = items.map((item) => mapItemToRecord(item, collector));

    if (records.length > 0) {
      await insertLogs(records);
    }

    persistRunResult(id, 'ok', records.length, null);
    return { ok: true, eventCount: records.length };
  } catch (error) {
    clearTimeout(timeoutId);
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : String(error);
    persistRunResult(id, 'error', 0, message);
    return { ok: false, eventCount: 0, error: message };
  }
}

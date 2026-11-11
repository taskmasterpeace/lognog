/**
 * Reads funnel events out of the log store (ClickHouse or SQLite) and turns
 * each row into a FunnelEvent. The only backend-specific part is the one
 * "has a funnel_stage" filter; everything else is done in compute.ts.
 */
import { executeRawQuery, isLiteMode } from '../../db/backend.js';
import { getSQLiteLogsDB } from '../../db/sqlite-logs.js';
import { indexScopeSqlClause } from '../../auth/index-scope.js';
import { FunnelEvent } from './compute.js';
import { FunnelProduct, isSentStage } from './model.js';

/** Hard stop so one huge product can never eat the API's memory. */
export const MAX_FUNNEL_ROWS = 300_000;

const INDEX_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

function str(v: unknown, max = 128): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

/** Turn one stored row into a FunnelEvent, or null when it is not a usable funnel event. */
export function rowToFunnelEvent(row: { timestamp: unknown; structured_data: unknown }): FunnelEvent | null {
  let data: Record<string, unknown>;
  try {
    data = typeof row.structured_data === 'string' ? JSON.parse(row.structured_data) : (row.structured_data as Record<string, unknown>);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const stage = String(data.funnel_stage ?? '').toLowerCase();
  if (!isSentStage(stage)) return null;
  // Stored timestamps are UTC without the trailing Z.
  const raw = String(row.timestamp ?? '');
  const ts = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
  if (!Number.isFinite(ts)) return null;
  const cents = Number(data.amount_cents);
  return {
    ts,
    stage,
    event: str(data.funnel_event, 48) ?? stage,
    anonId: str(data.anon_id),
    userId: str(data.user_id),
    eventId: str(data.event_id),
    source: str(data.utm_source, 64) ?? str(data.referrer_host, 64),
    campaign: str(data.utm_campaign, 64),
    surface: str(data.surface, 32),
    cohort: str(data.cohort, 32),
    plan: str(data.plan, 64),
    interval: str(data.interval, 16),
    amountCents: Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : undefined,
  };
}

/**
 * Fetch one product's funnel events since `sinceMs`.
 * `allowedIndexes` is the caller's read scope (null = everything); a product
 * whose indexes the caller may not read comes back empty.
 */
export async function fetchFunnelEvents(
  product: FunnelProduct,
  sinceMs: number,
  allowedIndexes: string[] | null | undefined,
): Promise<{ events: FunnelEvent[]; truncated: boolean }> {
  const indexes = product.indexes.filter((i) => INDEX_NAME.test(i));
  const readable = allowedIndexes && allowedIndexes.length > 0 ? indexes.filter((i) => allowedIndexes.includes(i)) : indexes;
  if (readable.length === 0) return { events: [], truncated: false };

  // Index names are validated against INDEX_NAME above; the timestamp is built from a number.
  const scope = indexScopeSqlClause(readable) as string;
  const since = new Date(sinceMs).toISOString().replace('T', ' ').replace('Z', '');

  let rows: Array<{ timestamp: unknown; structured_data: unknown }>;
  if (isLiteMode()) {
    const sinceLite = new Date(sinceMs).toISOString().replace('Z', '');
    rows = getSQLiteLogsDB()
      .prepare(
        `SELECT timestamp, structured_data FROM logs
         WHERE ${scope} AND timestamp >= ? AND json_extract(structured_data, '$.funnel_stage') IS NOT NULL
         ORDER BY timestamp ASC LIMIT ?`,
      )
      .all(sinceLite, MAX_FUNNEL_ROWS + 1) as typeof rows;
  } else {
    rows = await executeRawQuery<{ timestamp: unknown; structured_data: unknown }>(
      `SELECT timestamp, structured_data FROM lognog.logs
       WHERE ${scope} AND timestamp >= {since:String} AND JSONHas(structured_data, 'funnel_stage')
       ORDER BY timestamp ASC LIMIT {limit:UInt32}`,
      { since, limit: MAX_FUNNEL_ROWS + 1 },
    );
  }
  const truncated = rows.length > MAX_FUNNEL_ROWS;
  const events: FunnelEvent[] = [];
  for (const row of truncated ? rows.slice(0, MAX_FUNNEL_ROWS) : rows) {
    const e = rowToFunnelEvent(row);
    if (e) events.push(e);
  }
  return { events, truncated };
}

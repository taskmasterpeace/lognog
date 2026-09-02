/**
 * Ingest durability: when the log store is unreachable, insertLogs() spools
 * the batch instead of failing the client's request, and replayIngestSpool()
 * drains it once the store is back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.LOGNOG_BACKEND = 'clickhouse';

// A plain swappable implementation rather than vi.fn(): the spy wrapper keeps
// its own reference to each returned (rejected) promise, which vitest then
// reports as an unhandled rejection even though our code awaited it.
const store = {
  calls: [] as Record<string, unknown>[][],
  impl: async (_logs: Record<string, unknown>[]): Promise<void> => undefined,
};
vi.mock('./clickhouse.js', () => ({
  insertLogs: (logs: Record<string, unknown>[]) => { store.calls.push(logs); return store.impl(logs); },
  executeQuery: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  getLogById: vi.fn(),
  closeConnection: vi.fn(),
  getClickHouseClient: vi.fn(),
}));
vi.mock('../services/heartbeat.js', () => ({ recordHeartbeats: vi.fn() }));
vi.mock('../services/internal-logger.js', () => ({ logQueryExecution: vi.fn() }));

import { insertLogs, replayIngestSpool, ingestSpoolStats } from './backend.js';

const batch = (n: number) => [{ message: `event ${n}`, hostname: 'web-01', index_name: 'main' }];
const refused = async () => { throw new Error('connect ECONNREFUSED 192.168.48.7:8123'); };

describe('ingest spool', () => {
  beforeEach(() => { store.calls = []; });

  it('spools on a connection failure and acknowledges the batch', async () => {
    store.impl = refused;
    const first = await insertLogs(batch(1));
    const second = await insertLogs(batch(2));
    expect(first.spooled).toBe(true);
    expect(second.spooled).toBe(true);
    expect(ingestSpoolStats()).toMatchObject({ batches: 2, events: 2 });
  });

  it('keeps spooling while the store is down, then replays in order', async () => {
    store.impl = refused;
    const stillDown = await replayIngestSpool();
    expect(stillDown.batches).toBe(0);
    expect(stillDown.remaining).toBe(2);

    store.impl = async () => undefined;
    const replayed = await replayIngestSpool();
    expect(replayed).toMatchObject({ batches: 2, events: 2, remaining: 0 });
    expect(store.calls).toHaveLength(3); // 1 failed probe + 2 successful replays
    expect((store.calls[1][0] as { message: string }).message).toBe('event 1');
    expect((store.calls[2][0] as { message: string }).message).toBe('event 2');
  });

  it('does not spool data the store rejects as malformed', async () => {
    store.impl = async () => { throw new Error('Code: 62. DB::Exception: Cannot parse input'); };
    await expect(insertLogs(batch(3))).rejects.toThrow(/Cannot parse/);
    expect(ingestSpoolStats().batches).toBe(0);
  });
});

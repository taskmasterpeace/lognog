import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the DB backend so insertLogs is observable and never touches
// ClickHouse / network. The CRUD/service code uses the real SQLite singleton
// (isolated per test file via vitest.setup.ts).
const mockInsertLogs = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/backend.js', () => ({
  insertLogs: (...args: unknown[]) => mockInsertLogs(...args),
  isLiteMode: () => true,
}));

import {
  createPullCollector,
  getPullCollector,
  getPullCollectors,
  updatePullCollector,
  deletePullCollector,
  runPullCollector,
  type PullCollector,
} from './pull-collector.js';

beforeEach(() => {
  mockInsertLogs.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('pull-collector CRUD', () => {
  it('round-trips create/get/update/delete', () => {
    const created = createPullCollector({
      name: 'GitHub Events',
      url: 'https://api.example.com/events',
      index_name: 'github',
    });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe('GitHub Events');
    expect(created.enabled).toBe(1);
    expect(created.http_method).toBe('GET');
    expect(created.cron_expression).toBe('*/15 * * * *');
    expect(created.default_severity).toBe(6);

    const fetched = getPullCollector(created.id);
    expect(fetched?.url).toBe('https://api.example.com/events');

    const updated = updatePullCollector(created.id, {
      name: 'Renamed',
      enabled: false,
      cron_expression: '*/5 * * * *',
    });
    expect(updated?.name).toBe('Renamed');
    expect(updated?.enabled).toBe(0);
    expect(updated?.cron_expression).toBe('*/5 * * * *');

    const all = getPullCollectors();
    expect(all.some((c) => c.id === created.id)).toBe(true);

    // enabledOnly should exclude the now-disabled collector
    const enabled = getPullCollectors(true);
    expect(enabled.some((c) => c.id === created.id)).toBe(false);

    expect(deletePullCollector(created.id)).toBe(true);
    expect(getPullCollector(created.id)).toBeNull();
  });
});

describe('runPullCollector', () => {
  it('fetches a JSON array and inserts one record per item', async () => {
    const collector = createPullCollector({
      name: 'event-source',
      url: 'https://api.example.com/events',
      index_name: 'events',
      message_field: 'msg',
      time_field: 'ts',
      default_severity: 4,
    });

    const items = [
      { msg: 'first event', ts: '2026-01-01T00:00:00.000Z', extra: 1 },
      { msg: 'second event', ts: '2026-01-02T00:00:00.000Z', extra: 2 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(items));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runPullCollector(collector.id);

    expect(result.ok).toBe(true);
    expect(result.eventCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/events');

    expect(mockInsertLogs).toHaveBeenCalledTimes(1);
    const records = mockInsertLogs.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);

    expect(records[0].index_name).toBe('events');
    expect(records[0].message).toBe('first event');
    expect(records[0].severity).toBe(4);
    expect(records[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(records[0].hostname).toBe('event-source');
    expect(JSON.parse(records[0].structured_data as string)).toEqual(items[0]);
    expect(records[1].message).toBe('second event');

    const persisted = getPullCollector(collector.id)!;
    expect(persisted.last_status).toBe('ok');
    expect(persisted.last_event_count).toBe(2);
    expect(persisted.last_error).toBeNull();
    expect(persisted.last_run).toBeTruthy();
  });

  it('extracts a nested array via items_path', async () => {
    const collector = createPullCollector({
      name: 'nested-source',
      url: 'https://api.example.com/data',
      index_name: 'nested',
      items_path: 'data.events',
    });

    const body = { data: { events: [{ a: 1 }, { a: 2 }, { a: 3 }] }, meta: 'x' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(body)));

    const result = await runPullCollector(collector.id);

    expect(result.ok).toBe(true);
    expect(result.eventCount).toBe(3);
    const records = mockInsertLogs.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(records).toHaveLength(3);
    expect(records[0].index_name).toBe('nested');
    // No message_field set -> message is the JSON-stringified item
    expect(records[0].message).toBe(JSON.stringify({ a: 1 }));
  });

  it('wraps a non-array body as a single event when no items_path', async () => {
    const collector = createPullCollector({
      name: 'single-source',
      url: 'https://api.example.com/status',
      index_name: 'status',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ status: 'up' })));

    const result = await runPullCollector(collector.id);
    expect(result.ok).toBe(true);
    expect(result.eventCount).toBe(1);
  });

  it('returns ok:false and records error on fetch failure without throwing', async () => {
    const collector = createPullCollector({
      name: 'flaky-source',
      url: 'https://api.example.com/down',
      index_name: 'flaky',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    let result: { ok: boolean; eventCount: number; error?: string };
    await expect(
      (async () => {
        result = await runPullCollector(collector.id);
      })(),
    ).resolves.not.toThrow();

    expect(result!.ok).toBe(false);
    expect(result!.eventCount).toBe(0);
    expect(result!.error).toContain('network down');
    expect(mockInsertLogs).not.toHaveBeenCalled();

    const persisted = getPullCollector(collector.id)!;
    expect(persisted.last_status).toBe('error');
    expect(persisted.last_error).toContain('network down');
    expect(persisted.last_event_count).toBe(0);
  });

  it('returns ok:false for a non-2xx HTTP response', async () => {
    const collector = createPullCollector({
      name: 'http-error',
      url: 'https://api.example.com/403',
      index_name: 'httperr',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({}, false, 403)));

    const result = await runPullCollector(collector.id);
    expect(result.ok).toBe(false);
    expect(mockInsertLogs).not.toHaveBeenCalled();
    const persisted = getPullCollector(collector.id)!;
    expect(persisted.last_status).toBe('error');
  });

  it('returns ok:false for a missing collector', async () => {
    const result = await runPullCollector('does-not-exist');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

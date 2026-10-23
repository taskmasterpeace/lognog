/**
 * Machines view: the ClickHouse SQL text (checked without a server), the
 * grouping rule over plain rows, and the real Lite query over real rows.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
const tag = `${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}`;
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-machines-logs-${tag}.db`);
process.env.SQLITE_PATH = join(tmpdir(), `lognog-machines-main-${tag}.db`);

import { getMachines, insertLogs } from '../db/backend';
import { groupMachines, machineFor, machineSourcesSql, MACHINE_INDEXES, type MachineSourceRow } from './machines';

const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const row = (index_name: string, app_name: string, age_seconds: number, errors_24h = 0, events_24h = 10, hostname = 'h'): MachineSourceRow => ({
  index_name, app_name, hostname, events_24h, errors_24h, age_seconds, last_seen: 'x',
});

describe('machineSourcesSql (ClickHouse)', () => {
  const sql = machineSourcesSql('clickhouse', " AND index_name IN ('mac')").replace(/\s+/g, ' ');

  it('groups by index and app over 7 days with 24-hour counts on ClickHouse\'s clock', () => {
    expect(sql).toContain('countIf(severity <= 3 AND timestamp >= now64(3) - INTERVAL 24 HOUR) AS errors_24h');
    expect(sql).toContain("dateDiff('second', max(timestamp), now64(3)) AS age_seconds");
    expect(sql).toContain("WHERE timestamp >= now64(3) - INTERVAL 7 DAY AND timestamp <= now64(3) + INTERVAL 5 MINUTE AND index_name IN ('mac')");
    expect(sql).toContain('GROUP BY index_name, app_name');
  });
});

describe('groupMachines', () => {
  it('always lists every expected machine, "never" when nothing arrived', () => {
    const { machines } = groupMachines([]);
    expect(machines.map(m => m.machine)).toEqual(MACHINE_INDEXES);
    expect(machines.every(m => m.status === 'never' && m.age_seconds === null && m.sources === 0)).toBe(true);
  });

  it('sums a machine from its sources and takes the freshest age', () => {
    const { machines } = groupMachines([
      row('mac', 'octavia', 30, 2, 100, 'mac-mini'),
      row('mac', 'ollama', 7200, 0, 5, 'mac-mini'),
      row('hetzner', 'lognog-api', 2000, 1),
    ]);
    const mac = machines.find(m => m.machine === 'mac')!;
    expect(mac).toMatchObject({ sources: 2, events_24h: 105, errors_24h: 2, sources_with_errors: 1, age_seconds: 30, status: 'active', hostname: 'mac-mini' });
    expect(machines.find(m => m.machine === 'hetzner')!.status).toBe('recent');
  });

  it('puts product indexes under "Web apps", shown only when it has sources', () => {
    expect(machineFor('directors-palette')).toBe('apps');
    expect(machineFor('cupcake')).toBe('cupcake');
    const { machines, sources } = groupMachines([row('directors-palette', 'directors-palette', 60)]);
    expect(machines.at(-1)).toMatchObject({ machine: 'apps', label: 'Web apps', sources: 1, hostname: null });
    expect(sources[0].machine).toBe('apps');
    expect(groupMachines([row('mac', 'a', 1)]).machines.some(m => m.machine === 'apps')).toBe(false);
  });

  it('orders sources worst first inside a machine: errors, then stale, then name', () => {
    const { sources } = groupMachines([
      row('mac', 'b-fine', 10),
      row('mac', 'a-fine', 10),
      row('mac', 'z-stale', 3 * 86400),
      row('mac', 'y-errors', 10, 4),
    ]);
    expect(sources.map(s => s.app_name)).toEqual(['y-errors', 'z-stale', 'a-fine', 'b-fine']);
  });

  it('a scoped key sees only its own machines', () => {
    const { machines } = groupMachines([row('mac', 'a', 1)], ['mac']);
    expect(machines.map(m => m.machine)).toEqual(['mac']);
  });
});

describe('getMachines (Lite, real rows)', () => {
  beforeAll(async () => {
    const at = (index_name: string, app_name: string, timestamp: string, severity: number, n = 1, hostname = 'h') =>
      Array.from({ length: n }, () => ({ timestamp, index_name, app_name, hostname, severity, message: `${app_name} ${severity}` }));
    await insertLogs([
      ...at('mac', 'octavia', ago(1 * MIN), 6, 5, 'mac-mini'),
      ...at('mac', 'octavia', ago(2 * HOUR), 3, 2, 'mac-mini'),
      ...at('mac', 'old-job', ago(2 * 24 * HOUR), 3, 3, 'mac-mini'),
      ...at('cupcake', 'night-swarm', ago(3 * HOUR), 6, 4, 'cupcake'),
      ...at('directors-palette', 'directors-palette', ago(5 * MIN), 6, 2),
      ...at('mac', 'too-old', ago(8 * 24 * HOUR), 6, 1, 'mac-mini'),
    ]);
  });

  it('counts the last 24 hours, keeps 7 days of last-seen, drops older', async () => {
    const { machines, sources } = await getMachines();
    const mac = machines.find(m => m.machine === 'mac')!;
    expect(mac).toMatchObject({ sources: 2, events_24h: 7, errors_24h: 2, sources_with_errors: 1, status: 'active', hostname: 'mac-mini' });
    const oldJob = sources.find(s => s.app_name === 'old-job')!;
    expect(oldJob).toMatchObject({ events_24h: 0, errors_24h: 0, status: 'stale' });
    expect(sources.some(s => s.app_name === 'too-old')).toBe(false);
    expect(machines.find(m => m.machine === 'cupcake')).toMatchObject({ status: 'inactive', events_24h: 4 });
    expect(machines.find(m => m.machine === 'windows')!.status).toBe('never');
    expect(machines.find(m => m.machine === 'apps')).toMatchObject({ sources: 1, events_24h: 2 });
  });

  it('a scoped key gets only its indexes', async () => {
    const { machines, sources } = await getMachines(['cupcake']);
    expect(machines.map(m => m.machine)).toEqual(['cupcake']);
    expect(sources.map(s => s.app_name)).toEqual(['night-swarm']);
  });
});

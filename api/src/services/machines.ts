/**
 * Machines: every studio machine and every log source on it, on one page.
 *
 * Unified logging (vector/vector.toml + ~/octavia/tools/lognog-ship.py) files
 * each machine's logs under its own index: hetzner = every Docker container on
 * mkl-dev, mac = the Mac mini's launchd jobs and logs, cupcake = Cupcake's
 * services and jobs. app_name is the service. Product indexes (directors-palette,
 * hey-youre-hired, money...) come from the apps themselves and are grouped as
 * "Web apps".
 *
 * GET /stats/machines returns one summary per machine (always the expected
 * ones, even when nothing has arrived yet) plus every source with its last-seen
 * age and 24-hour error count. Ages come from the log store's own clock.
 */
import { sourceStatusFromAge, type SourceStatus } from './source-status.js';

export interface MachineDef {
  index: string;
  label: string;
  /** What ships from it, in plain words. */
  what: string;
}

/** The machines that ship their own logs, in the order the page shows them. */
export const MACHINES: MachineDef[] = [
  { index: 'hetzner', label: 'Hetzner server', what: 'Every Docker container on mkl-dev (Coolify apps, LogNog, the game, chat)' },
  { index: 'mac', label: 'Mac mini', what: 'Octavia, Hermes and every launchd job, plus Ollama' },
  { index: 'cupcake', label: 'Cupcake', what: 'Night swarm, legs, voice, ComfyUI, the AI services and system errors' },
  { index: 'windows', label: 'Windows seats', what: 'Alpine Swift, OMEN, Supremacy: no shipper yet' },
  { index: 'dominion', label: 'Dominion', what: 'Smart-board seat: no shipper yet' },
];

export const MACHINE_INDEXES = MACHINES.map(m => m.index);

/** Pseudo-machine for indexes the apps send themselves. */
export const WEB_APPS = 'apps';

export interface MachineSourceRow {
  index_name: string;
  hostname: string;
  app_name: string;
  events_24h: number;
  errors_24h: number;
  last_seen: string;
  age_seconds: number;
}

export interface MachineSource extends MachineSourceRow {
  machine: string;
  status: SourceStatus;
}

export interface MachineSummary {
  machine: string;
  label: string;
  what: string;
  hostname: string | null;
  sources: number;
  events_24h: number;
  errors_24h: number;
  /** Sources with at least one error in 24 hours. */
  sources_with_errors: number;
  /** Age of the newest log from this machine; null when nothing ever arrived. */
  age_seconds: number | null;
  status: SourceStatus | 'never';
}

export interface MachinesResult {
  machines: MachineSummary[];
  sources: MachineSource[];
}

export function machineFor(indexName: string): string {
  return MACHINE_INDEXES.includes(indexName) ? indexName : WEB_APPS;
}

/**
 * One row per (index, app) over 7 days: 24-hour counts plus the newest time.
 * Same 7-day window and "error = severity 0-3" rule as Data Sources.
 */
export function machineSourcesSql(backend: 'clickhouse' | 'sqlite', scopeAnd: string): string {
  if (backend === 'clickhouse') {
    return `
      SELECT
        if(index_name = '', 'main', index_name) AS index_name,
        any(hostname) AS hostname,
        if(app_name = '', 'unknown', app_name) AS app_name,
        countIf(timestamp >= now64(3) - INTERVAL 24 HOUR) AS events_24h,
        countIf(severity <= 3 AND timestamp >= now64(3) - INTERVAL 24 HOUR) AS errors_24h,
        max(timestamp) AS last_seen,
        dateDiff('second', max(timestamp), now64(3)) AS age_seconds
      FROM lognog.logs
      WHERE timestamp >= now64(3) - INTERVAL 7 DAY AND timestamp <= now64(3) + INTERVAL 5 MINUTE${scopeAnd}
      GROUP BY index_name, app_name
      ORDER BY index_name, app_name
      LIMIT 5000
    `;
  }
  return `
    SELECT
      COALESCE(NULLIF(index_name, ''), 'main') AS index_name,
      MAX(COALESCE(hostname, '')) AS hostname,
      COALESCE(NULLIF(app_name, ''), 'unknown') AS app_name,
      SUM(CASE WHEN timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') THEN 1 ELSE 0 END) AS events_24h,
      SUM(CASE WHEN severity <= 3 AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') THEN 1 ELSE 0 END) AS errors_24h,
      MAX(timestamp) AS last_seen
    FROM logs
    WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')${scopeAnd}
    GROUP BY 1, 3
    ORDER BY 1, 3
    LIMIT 5000
  `;
}

/** Turn source rows into the page: machines first (expected ones always), then web apps. */
export function groupMachines(rows: MachineSourceRow[], allowedIndexes?: string[] | null): MachinesResult {
  const sources: MachineSource[] = rows.map(r => {
    const age = Number(r.age_seconds);
    return {
      ...r,
      events_24h: Number(r.events_24h),
      errors_24h: Number(r.errors_24h),
      age_seconds: age,
      machine: machineFor(r.index_name),
      status: sourceStatusFromAge(age),
    };
  });

  // Worst first inside a machine: errors, then the stalest, then by name.
  sources.sort((a, b) =>
    a.machine.localeCompare(b.machine)
    || b.errors_24h - a.errors_24h
    || Number(b.status === 'stale') - Number(a.status === 'stale')
    || a.app_name.localeCompare(b.app_name));

  const scoped = !!(allowedIndexes && allowedIndexes.length > 0);
  const defs: MachineDef[] = [
    ...MACHINES.filter(m => !scoped || allowedIndexes!.includes(m.index)),
    { index: WEB_APPS, label: 'Web apps', what: 'Apps that send their own logs (Directors Palette, HeyYoureHired, money, uptime...)' },
  ];

  const machines: MachineSummary[] = defs.map((def): MachineSummary => {
    const mine = sources.filter(s => s.machine === def.index);
    const ages = mine.map(s => s.age_seconds).filter(a => Number.isFinite(a));
    const age = ages.length ? Math.min(...ages) : null;
    const hosts = [...new Set(mine.map(s => s.hostname).filter(Boolean))];
    return {
      machine: def.index,
      label: def.label,
      what: def.what,
      hostname: def.index === WEB_APPS ? null : (hosts[0] ?? null),
      sources: mine.length,
      events_24h: mine.reduce((n, s) => n + s.events_24h, 0),
      errors_24h: mine.reduce((n, s) => n + s.errors_24h, 0),
      sources_with_errors: mine.filter(s => s.errors_24h > 0).length,
      age_seconds: age,
      status: age === null ? 'never' : sourceStatusFromAge(age),
    };
  }).filter(m => m.machine !== WEB_APPS || m.sources > 0);

  return { machines, sources };
}

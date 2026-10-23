/**
 * Machines: every studio machine and every log source on it, on one page.
 *
 * Data: GET /stats/machines (api/src/services/machines.ts). Each machine ships
 * into its own index (hetzner, mac, cupcake...), app_name is the service.
 * Counts cover the last 24 hours, "last seen" the last 7 days, an error is
 * severity 0-3 like Data Sources. Every number opens the logs behind it.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Server, Monitor, Cpu, Laptop, Globe, RefreshCw, Search, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { ElementType } from 'react';
import { getMachines, type MachineSource, type MachineSummary } from '../api/client';
import { ageAgo, sourceStatusInfo } from '../utils/sourceStatus';
import { canDrillDown, searchUrl, sourceLogsQuery, sourceErrorsQuery } from '../utils/sourceDrilldown';

const DAY = '-24h';
const SHOW_FIRST = 12;

const ICONS: Record<string, ElementType> = {
  hetzner: Server,
  mac: Laptop,
  cupcake: Cpu,
  windows: Monitor,
  dominion: Monitor,
  apps: Globe,
};

function machineWord(m: MachineSummary): { label: string; dot: string; tone: string } {
  switch (m.status) {
    case 'active': return { label: 'Live', dot: 'bg-green-500', tone: 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-900/30' };
    case 'recent': return { label: 'Quiet', dot: 'bg-yellow-500', tone: 'text-yellow-800 bg-yellow-50 dark:text-yellow-200 dark:bg-yellow-900/30' };
    case 'inactive': return { label: 'Silent for hours', dot: 'bg-honey-500', tone: 'text-honey-800 bg-honey-50 dark:text-honey-200 dark:bg-honey-900/30' };
    case 'stale': return { label: 'Silent', dot: 'bg-red-500', tone: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30' };
    default: return { label: 'Not shipping', dot: 'bg-nog-400', tone: 'text-nog-600 bg-nog-100 dark:text-nog-300 dark:bg-nog-700' };
  }
}

function machineQuery(machine: string, errorsOnly: boolean): string | null {
  if (machine === 'apps') return null;
  return `search index="${machine}"${errorsOnly ? ' severity<=3' : ''}`;
}

function NumLink({ to, children, bad }: { to: string | null; children: React.ReactNode; bad?: boolean }) {
  const cls = `font-semibold tabular-nums ${bad ? 'text-red-600 dark:text-red-400' : 'text-nog-900 dark:text-nog-50'}`;
  return to
    ? <Link to={to} className={`${cls} hover:underline underline-offset-2`}>{children}</Link>
    : <span className={cls}>{children}</span>;
}

function MachineCard({ m, selected, onSelect }: { m: MachineSummary; selected: boolean; onSelect: () => void }) {
  const Icon = ICONS[m.machine] ?? Server;
  const word = machineWord(m);
  const logsQ = machineQuery(m.machine, false);
  const errQ = machineQuery(m.machine, true);
  return (
    <li
      className={`rounded-[0.625rem] border bg-white dark:bg-nog-800 p-4 transition-shadow hover:shadow-md ${
        selected ? 'border-honey-500 ring-1 ring-honey-500' : 'border-nog-200 dark:border-nog-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onSelect} className="flex min-w-0 items-start gap-3 text-left" title="Show only this machine's sources">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem] bg-honey-50 dark:bg-honey-900/30">
            <Icon className="h-5 w-5 text-honey-600 dark:text-honey-400" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold tracking-tight text-nog-900 dark:text-nog-50">{m.label}</span>
            <span className="block truncate text-xs text-nog-500 dark:text-nog-400">
              {m.machine === 'apps' ? 'own indexes' : `index ${m.machine}${m.hostname ? ` · ${m.hostname}` : ''}`}
            </span>
          </span>
        </button>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${word.tone}`}>
          <span className={`h-2 w-2 rounded-full ${word.dot}`} />
          {word.label}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-nog-600 dark:text-nog-300">{m.what}</p>
      {m.status === 'never' ? (
        <p className="mt-3 text-sm text-nog-500 dark:text-nog-400">Nothing has arrived from this machine yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-nog-500 dark:text-nog-400">Sources</div>
            <NumLink to={null}>{m.sources.toLocaleString()}</NumLink>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-nog-500 dark:text-nog-400">Logs 24h</div>
            <NumLink to={logsQ ? searchUrl(logsQ, DAY) : null}>{m.events_24h.toLocaleString()}</NumLink>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-nog-500 dark:text-nog-400">Errors 24h</div>
            <NumLink to={errQ ? searchUrl(errQ, DAY) : null} bad={m.errors_24h > 0}>{m.errors_24h.toLocaleString()}</NumLink>
          </div>
          <div className="col-span-3 text-xs text-nog-500 dark:text-nog-400">
            Last log {ageAgo(m.age_seconds)}
            {m.sources_with_errors > 0 && <> · {m.sources_with_errors} source{m.sources_with_errors === 1 ? '' : 's'} with errors</>}
          </div>
        </div>
      )}
    </li>
  );
}

function SourceRow({ s }: { s: MachineSource }) {
  const info = sourceStatusInfo(s.status);
  const drill = canDrillDown(s.app_name);
  return (
    <tr className="border-t border-nog-100 dark:border-nog-700/60 hover:bg-nog-50 dark:hover:bg-nog-700/40 transition-colors">
      <td className="py-2 pl-4 pr-2">
        <div className="truncate font-medium text-nog-900 dark:text-nog-50" title={s.app_name}>{s.app_name}</div>
        {s.machine === 'apps' && <div className="truncate text-xs text-nog-500 dark:text-nog-400">index {s.index_name}</div>}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-sm text-nog-600 dark:text-nog-300">
        <span className="inline-flex items-center gap-1.5" title={`${info.label}: newest log ${s.last_seen}`}>
          <span className={`h-2 w-2 rounded-full ${info.dotClass}`} />
          {ageAgo(s.age_seconds)}
        </span>
      </td>
      <td className="px-2 py-2 text-right text-sm">
        <NumLink to={drill ? searchUrl(sourceLogsQuery(s.index_name, s.app_name), DAY) : null}>{s.events_24h.toLocaleString()}</NumLink>
      </td>
      <td className="py-2 pl-2 pr-4 text-right text-sm">
        <NumLink to={drill ? searchUrl(sourceErrorsQuery(s.index_name, s.app_name), DAY) : null} bad={s.errors_24h > 0}>
          {s.errors_24h.toLocaleString()}
        </NumLink>
      </td>
    </tr>
  );
}

function MachineSources({ m, sources }: { m: MachineSummary; sources: MachineSource[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? sources : sources.slice(0, SHOW_FIRST);
  return (
    <section className="overflow-hidden rounded-[0.625rem] border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800">
      <header className="flex items-center justify-between gap-2 border-b border-nog-200 dark:border-nog-700 px-4 py-2.5">
        <h3 className="font-semibold tracking-tight text-nog-900 dark:text-nog-50">{m.label}</h3>
        <span className="text-xs text-nog-500 dark:text-nog-400">{sources.length} source{sources.length === 1 ? '' : 's'}, worst first</span>
      </header>
      <table className="w-full table-fixed">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-nog-500 dark:text-nog-400">
            <th className="py-2 pl-4 pr-2 font-medium">Source</th>
            <th className="w-28 px-2 py-2 font-medium">Last seen</th>
            <th className="w-24 px-2 py-2 text-right font-medium">Logs 24h</th>
            <th className="w-24 py-2 pl-2 pr-4 text-right font-medium">Errors 24h</th>
          </tr>
        </thead>
        <tbody>{shown.map(s => <SourceRow key={`${s.index_name}/${s.app_name}`} s={s} />)}</tbody>
      </table>
      {sources.length > SHOW_FIRST && (
        <button
          type="button"
          onClick={() => setAll(v => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-nog-200 dark:border-nog-700 py-2 text-xs font-medium text-honey-700 hover:bg-honey-50 dark:text-honey-300 dark:hover:bg-honey-900/20 transition-colors"
        >
          {all ? <><ChevronUp className="h-4 w-4" /> Show fewer</> : <><ChevronDown className="h-4 w-4" /> Show all {sources.length}</>}
        </button>
      )}
    </section>
  );
}

export default function MachinesPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['machines'],
    queryFn: getMachines,
    refetchInterval: 60_000,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    if (!data) return [];
    const f = filter.trim().toLowerCase();
    return data.machines
      .filter(m => m.sources > 0 && (!picked || m.machine === picked))
      .map(m => ({
        m,
        sources: data.sources.filter(s =>
          s.machine === m.machine
          && (!problemsOnly || s.errors_24h > 0 || s.status === 'stale' || s.status === 'inactive')
          && (!f || s.app_name.toLowerCase().includes(f) || s.index_name.toLowerCase().includes(f))),
      }))
      .filter(g => g.sources.length > 0);
  }, [data, picked, problemsOnly, filter]);

  const totalErrors = data?.machines.reduce((n, m) => n + m.errors_24h, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-nog-900 dark:text-nog-50 sm:text-3xl">Machines</h1>
          <p className="mt-1 text-sm text-nog-600 dark:text-nog-300">
            Every machine and every log source on it. Logs and errors cover the last 24 hours; every number opens the logs behind it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[0.625rem] px-2.5 py-1.5 text-xs text-nog-500 hover:bg-nog-100 dark:text-nog-400 dark:hover:bg-nog-800 transition-colors"
          title="Check again now"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-honey-500 border-t-transparent" />
        </div>
      ) : error || !data ? (
        <div className="rounded-[0.625rem] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Couldn't load the machines just now. This tries again every minute.
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.machines.map(m => (
              <MachineCard
                key={m.machine}
                m={m}
                selected={picked === m.machine}
                onSelect={() => setPicked(p => (p === m.machine ? null : m.machine))}
              />
            ))}
          </ul>

          <div className="mt-6 mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-bold tracking-tight text-nog-900 dark:text-nog-50">
              Sources{picked ? ` on ${data.machines.find(m => m.machine === picked)?.label ?? picked}` : ''}
            </h2>
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-nog-400" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Find a source"
                className="w-44 rounded-[0.625rem] border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 py-1.5 pl-8 pr-2 text-sm text-nog-900 dark:text-nog-50 placeholder:text-nog-400 focus:border-honey-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setProblemsOnly(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                problemsOnly
                  ? 'bg-honey-500 text-white hover:bg-honey-600'
                  : 'bg-nog-100 text-nog-700 hover:bg-nog-200 dark:bg-nog-700 dark:text-nog-200 dark:hover:bg-nog-600'
              }`}
              title="Only sources with errors in 24 hours or no logs for an hour or more"
            >
              <AlertTriangle className="h-4 w-4" />
              Problems only{totalErrors > 0 ? ` (${totalErrors.toLocaleString()} errors)` : ''}
            </button>
            {picked && (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-honey-700 hover:bg-honey-50 dark:text-honey-300 dark:hover:bg-honey-900/20 transition-colors"
              >
                All machines
              </button>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[0.625rem] border border-dashed border-nog-300 dark:border-nog-600 bg-white dark:bg-nog-800 px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-honey-50 dark:bg-honey-900/30">
                <Server className="h-8 w-8 text-honey-500" />
              </span>
              <p className="font-semibold text-nog-900 dark:text-nog-50">
                {problemsOnly ? 'No source has errors or has gone quiet.' : 'No source matches.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {groups.map(g => <MachineSources key={g.m.machine} m={g.m} sources={g.sources} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

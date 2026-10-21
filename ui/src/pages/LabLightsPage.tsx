import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Maximize2, Minimize2, Lightbulb, Loader2, RefreshCw, Cpu, Volume2 } from 'lucide-react';
import { getLabLights, LabLight } from '../api/client';
import { toDate } from '../utils/formatDate';
import {
  LIGHT_COLORS,
  appsFromParam,
  numberSearchUrl,
  onlyState,
  plateLink,
  screenLink,
  shelfGridClass,
  shelfOrder,
  splitWhy,
  type LightLinkKind,
} from '../utils/labLights';
import { ageAgo } from '../utils/sourceStatus';
import { useMute } from '../contexts/MuteContext';

/**
 * Lab lights (/lights): one round screen per app, drawn the way the ESP32
 * screens on the lab shelf draw it (hardware/lab-lights/). Doubles as the
 * simulator for those screens and as a wall view (?wall=1). ?apps=a,b shows
 * just those apps, in that order, like a shelf with those screens on it.
 */

function sinceText(since: string | null): string {
  if (!since) return '';
  const d = toDate(since);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `since ${time}` : `since ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

/**
 * The stand plate: when the light took its colour, if the server knows; else
 * when the app last sent a log (a light already this colour when the server
 * started watching has no known start).
 */
function plateText(light: LabLight): string {
  const since = sinceText(light.since);
  if (since) return since;
  if (!light.last_seen) return light.why.endsWith('no recent logs') ? 'no recent logs' : 'no logs in 7 days';
  const seen = toDate(light.last_seen).getTime();
  if (isNaN(seen)) return '';
  return `last log ${ageAgo((Date.now() - seen) / 1000)}`;
}

/** Search hides muted apps and indexes, so a muted app's numbers would open an empty Search. */
function useAppMuted(light: LabLight): boolean {
  const { isMuted } = useMute();
  return isMuted('app_name', light.app) || light.indexes.some((i) => isMuted('index_name', i || 'main'));
}

const MUTED_NOTE = '. Muted: Search hides these until you unmute.';

const LINK_WHAT: Record<LightLinkKind, (app: string) => string> = {
  logs: (app) => `Open ${app}'s logs from the last 15 minutes in Search`,
  errors: (app) => `Open ${app}'s errors from the last 15 minutes in Search`,
  usual: (app) => `Open ${app}'s errors from the 24 hours before the last 15 minutes in Search`,
  week: (app) => `Open ${app}'s logs from the last 7 days in Search (the newest is the last one it sent)`,
};

const LINK_NONE: Record<LightLinkKind, string> = {
  logs: 'No logs in the last 15 minutes, so there is nothing to open',
  errors: 'No errors in the last 15 minutes, so there is nothing to open',
  usual: 'No errors in the 24 hours before, so there is nothing to open',
  week: 'No logs in the last 7 days, so there is nothing to open',
};

function NumberLink({
  app,
  kind,
  count,
  muted,
  children,
}: {
  app: string;
  kind: LightLinkKind;
  count: number;
  muted: boolean;
  children: React.ReactNode;
}) {
  const url = numberSearchUrl(app, kind, count);
  if (!url) return <span title={count > 0 ? undefined : LINK_NONE[kind]}>{children}</span>;
  const what = LINK_WHAT[kind](app);
  return (
    <Link
      to={url}
      className="underline decoration-honey-500/50 underline-offset-2 hover:text-honey-300 hover:decoration-honey-300 transition-colors"
      title={muted ? what + MUTED_NOTE : what}
    >
      {children}
    </Link>
  );
}

function Screen({ light, offline, big }: { light: LabLight; offline: boolean; big: boolean }) {
  const colors = offline ? LIGHT_COLORS.offline : LIGHT_COLORS[light.state];
  const { headline, detail } = offline
    ? { headline: 'Offline', detail: "can't reach LogNog" }
    : splitWhy(light.why, light.state);
  const size = big
    ? 'w-[200px] h-[200px] sm:w-[280px] sm:h-[280px]'
    : 'w-[150px] h-[150px] sm:w-[240px] sm:h-[240px]';
  const errors = light.errors_last_15m;
  const usual = light.errors_usual_24h ?? 0;
  const muted = useAppMuted(light);
  // The screen itself opens the logs behind its word and small line.
  const lead = offline ? null : screenLink(light.app, headline, detail);
  const showUsual = !offline && (headline === 'Error spike' || headline === 'Errors up');
  const plate = offline ? 'last answer kept' : plateText(light);
  const plateTo = offline || !plate ? null : plateLink(light.app, headline, light.since, Date.now(), detail);
  const bezel = (
      <div
        className="rounded-full p-[6px] sm:p-[9px]"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #3a2a1b, #1b130c 70%)',
          boxShadow: `0 0 34px 6px ${colors.glow}, 0 10px 24px rgba(0,0,0,0.55)`,
        }}
      >
        {/* the 240 x 240 round screen */}
        <div
          className={`${size} rounded-full flex flex-col items-center justify-center text-center px-4 sm:px-6`}
          style={{ background: '#0E0A07', border: `${big ? 6 : 5}px solid ${colors.ring}` }}
          role="img"
          aria-label={`${light.label}: ${headline}. ${detail}`}
        >
          <img src="/logo.png" alt="" className="w-5 h-5 sm:w-7 sm:h-7 rounded opacity-90 mb-1 sm:mb-2" />
          <div
            className={`font-bold text-white leading-tight tracking-tight line-clamp-2 ${big ? 'text-lg sm:text-2xl' : 'text-sm sm:text-xl'}`}
            title={light.app}
          >
            {light.label}
          </div>
          <div
            className={`font-bold leading-tight mt-0.5 sm:mt-1 ${big ? 'text-xl sm:text-3xl' : 'text-base sm:text-2xl'}`}
            style={{ color: colors.word }}
          >
            {headline}
          </div>
          <div className={`text-nog-200 leading-snug mt-1 line-clamp-3 ${big ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'}`}>
            {detail}
          </div>
        </div>
      </div>
  );
  return (
    <div className="flex flex-col items-center min-w-0" data-testid="lab-light" data-state={offline ? 'offline' : light.state}>
      {lead ? (
        <Link
          to={lead.url}
          title={muted ? lead.title + MUTED_NOTE : lead.title}
          aria-label={`${light.label}: ${headline}. ${detail}. ${lead.title}`}
          className="block rounded-full transition-transform duration-200 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-honey-400"
        >
          {bezel}
        </Link>
      ) : (
        bezel
      )}
      {/* stand: when the light took its colour, or when the app last sent; opens the logs around it (plateLink) */}
      <div className="mt-3 h-6 px-3 min-w-[64px] rounded-md bg-[#3a2a1b] text-[10px] sm:text-xs text-nog-300 flex items-center justify-center whitespace-nowrap">
        {plateTo ? (
          <Link
            to={plateTo.url}
            title={muted ? plateTo.title + MUTED_NOTE : plateTo.title}
            className="underline decoration-honey-500/50 underline-offset-2 hover:text-honey-300 hover:decoration-honey-300 transition-colors"
          >
            {plate}
          </Link>
        ) : (
          plate || ' '
        )}
      </div>
      {/* the numbers behind the light, each opens its logs */}
      <div className="mt-2 text-[11px] sm:text-xs text-nog-300 text-center leading-relaxed">
        <NumberLink app={light.app} kind="logs" count={light.logs_last_15m} muted={muted}>
          {light.logs_last_15m.toLocaleString()} log{light.logs_last_15m === 1 ? '' : 's'}
        </NumberLink>
        {' · '}
        <NumberLink app={light.app} kind="errors" count={errors} muted={muted}>
          <span className={errors > 0 ? 'text-red-300' : undefined}>
            {errors.toLocaleString()} error{errors === 1 ? '' : 's'}
          </span>
        </NumberLink>
        <div className="text-nog-400">in the last 15 min</div>
        {showUsual && (
          <div className="text-nog-400">
            usual:{' '}
            <NumberLink app={light.app} kind="usual" count={usual} muted={muted}>
              {usual.toLocaleString()} error{usual === 1 ? '' : 's'}
            </NumberLink>{' '}
            in the 24 h before
          </div>
        )}
        {muted && (
          <div className="text-honey-300" title="You muted this app or its index. Search hides its logs until you unmute it on the Data Sources page.">
            muted in Search
          </div>
        )}
      </div>
    </div>
  );
}

function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl px-3 sm:px-8 pt-8 pb-6 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #2A1D12 0%, #1E150E 55%, #170F09 100%)' }}
    >
      {children}
      <div
        className="mt-6 h-3 sm:h-4 rounded-md"
        style={{
          background: 'linear-gradient(180deg, #8a6237 0%, #5A3F24 60%, #3d2a18 100%)',
          boxShadow: '0 10px 18px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
}

export default function LabLightsPage() {
  const [params, setParams] = useSearchParams();
  const wall = params.get('wall') === '1';
  const apps = appsFromParam(params.get('apps'));
  const stateParam = params.get('state');
  const only = stateParam === 'red' || stateParam === 'yellow' || stateParam === 'green' ? stateParam : null;
  const [, setTick] = useState(0);

  const { data, error, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['lab-lights', apps.join(',')],
    queryFn: () => getLabLights(apps),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: 1,
  });

  // Keep "updated N s ago" moving.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const offline = !!error && !!data;
  const ageS = dataUpdatedAt ? Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000)) : null;
  const updated =
    ageS === null ? '' : ageS < 10 ? 'Updated just now' : ageS < 120 ? `Updated ${ageS} s ago` : `Updated ${Math.round(ageS / 60)} min ago`;

  const toggleWall = () => {
    const next = new URLSearchParams(params);
    if (wall) next.delete('wall');
    else next.set('wall', '1');
    setParams(next, { replace: true });
  };

  const counts = { red: 0, yellow: 0, green: 0 };
  for (const l of data?.apps ?? []) counts[l.state] += 1;
  const shown = data ? onlyState(shelfOrder(data.apps, apps.length > 0), only) : [];

  const showOnly = (state: 'red' | 'yellow' | 'green') => {
    const next = new URLSearchParams(params);
    if (only === state) next.delete('state');
    else next.set('state', state);
    setParams(next, { replace: true });
  };

  const body = (
    <>
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-24 text-nog-300">
          <Loader2 className="w-5 h-5 animate-spin" /> Reading the lights…
        </div>
      )}

      {!isLoading && error && !data && (
        <div className="flex flex-col items-center text-center py-16 px-4">
          <div className="w-16 h-16 rounded-full bg-nog-700/60 flex items-center justify-center mb-4">
            <Lightbulb className="w-8 h-8 text-nog-300" />
          </div>
          <p className="text-lg font-semibold text-nog-100">Can't read the lights right now</p>
          <p className="text-sm text-nog-300 mt-1 max-w-md">
            {error instanceof Error ? error.message : 'The status service did not answer.'} Trying again every 30 seconds.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-honey-500 hover:bg-honey-400 text-nog-900 text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {data && data.apps.length === 0 && (
        <div className="flex flex-col items-center text-center py-16 px-4">
          <div className="w-16 h-16 rounded-full bg-honey-500/15 flex items-center justify-center mb-4">
            <Lightbulb className="w-8 h-8 text-honey-400" />
          </div>
          <p className="text-lg font-semibold text-nog-100">No apps have sent logs in the last 7 days</p>
          <p className="text-sm text-nog-300 mt-1 max-w-md">
            A light appears here for each app name that sends logs. Once an app sends a log with its app name, its light shows up within 30 seconds.
          </p>
          <Link to="/data-sources" className="mt-4 text-sm font-medium text-honey-400 hover:text-honey-300 underline underline-offset-2">
            Open Data Sources to add one
          </Link>
        </div>
      )}

      {data && data.apps.length > 0 && shown.length === 0 && only && (
        <div className="text-center py-16 px-4 text-nog-200">
          <p className="text-lg font-semibold">No {only} lights right now</p>
          <button
            onClick={() => showOnly(only)}
            className="mt-3 text-sm font-medium text-honey-400 hover:text-honey-300 underline underline-offset-2 transition-colors"
          >
            Show all {data.apps.length} lights
          </button>
        </div>
      )}

      {data && shown.length > 0 && (
        <div
          className={`grid gap-x-2 gap-y-8 sm:gap-x-6 justify-items-center ${shelfGridClass(wall)}`}
        >
          {shown.map((l) => (
            <Screen key={l.app} light={l} offline={offline} big={wall} />
          ))}
        </div>
      )}
    </>
  );

  if (wall) {
    return (
      <div className="fixed inset-0 z-[60] overflow-auto" style={{ background: '#140E09' }}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-8 pt-4">
          <div className="text-nog-300 text-sm min-w-0 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display font-semibold text-nog-100 text-lg">Lab lights</span>
            <span>{offline ? "Can't reach LogNog; showing the last answer" : updated}</span>
          </div>
          <button
            onClick={toggleWall}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-nog-200 hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <Minimize2 className="w-4 h-4" /> Leave wall view
          </button>
        </div>
        <div className="p-4 sm:p-8">
          <Shelf>{body}</Shelf>
        </div>
      </div>
    );
  }

  return (
    // pb-24: room under the last screen so the floating help button never covers it
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-nog-900 dark:text-nog-100">Lab lights</h1>
          <p className="text-sm text-nog-600 dark:text-nog-400 mt-1 max-w-2xl">
            One round screen per app, the way the round screens for the lab shelf will show it. This page reads LogNog every 30 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-nog-500 dark:text-nog-400 inline-flex items-center gap-1.5">
            {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
            {offline ? "Can't reach LogNog; showing the last answer" : updated}
          </span>
          <button
            onClick={toggleWall}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nog-200 dark:border-nog-700 text-sm font-medium text-nog-700 dark:text-nog-200 hover:bg-nog-50 dark:hover:bg-nog-800 hover:shadow-sm transition-all"
          >
            <Maximize2 className="w-4 h-4" /> Wall view
          </button>
        </div>
      </div>

      {data && data.apps.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs font-medium">
          {(
            [
              ['red', 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100 ring-red-400'],
              ['yellow', 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 ring-amber-400'],
              ['green', 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 ring-green-400'],
            ] as const
          ).map(([state, cls]) => (
            <button
              key={state}
              onClick={() => showOnly(state)}
              aria-pressed={only === state}
              title={only === state ? 'Show every light again' : `Show only the ${state} lights`}
              className={`px-2.5 py-1 rounded-full transition-colors ${cls} ${only === state ? 'ring-2' : ''}`}
            >
              {counts[state]} {state}
              {only === state ? ' · show all' : ''}
            </button>
          ))}
          {apps.length > 0 && (
            <button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('apps');
                setParams(next, { replace: true });
              }}
              className="px-2.5 py-1 rounded-full bg-honey-50 text-honey-800 dark:bg-honey-900/30 dark:text-honey-200 hover:bg-honey-100 transition-colors"
            >
              Showing {apps.join(', ')} · show all
            </button>
          )}
        </div>
      )}

      <Shelf>{body}</Shelf>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 p-4">
          <div className="flex items-center gap-2 font-semibold text-nog-900 dark:text-nog-100 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: LIGHT_COLORS.red.ring }} /> Red
          </div>
          <p className="text-nog-600 dark:text-nog-400">
            A high or critical alert about the app is firing, the app has sent nothing for an hour, or its errors spiked: 10 or more in 15 minutes and three times its usual rate.
          </p>
        </div>
        <div className="rounded-xl border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 p-4">
          <div className="flex items-center gap-2 font-semibold text-nog-900 dark:text-nog-100 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: LIGHT_COLORS.yellow.ring }} /> Yellow
          </div>
          <p className="text-nog-600 dark:text-nog-400">
            A medium or low alert is firing, the app has been quiet 15 to 60 minutes (Data Sources says Recent), or errors are up: 3 or more and twice the usual.
          </p>
        </div>
        <div className="rounded-xl border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 p-4">
          <div className="flex items-center gap-2 font-semibold text-nog-900 dark:text-nog-100 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: LIGHT_COLORS.green.ring }} /> Green
          </div>
          <p className="text-nog-600 dark:text-nog-400">
            Logs arrived in the last 15 minutes (Data Sources says Active) and errors are at their usual rate. Acknowledged alerts stop counting.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-6 text-xs text-nog-500 dark:text-nog-400">
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5" /> Firmware for the shelf screens is ready in hardware/lab-lights (not on a screen yet). They read /api/status/lights with a read-only key.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5" /> A spoken alert is ready to switch on: the lab board says an app once when it turns red, not in quiet hours (11 pm to 8 am).
        </span>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Maximize2, Minimize2, Lightbulb, Loader2, RefreshCw, Cpu, Volume2 } from 'lucide-react';
import { getLabLights, LabLight } from '../api/client';
import { toDate } from '../utils/formatDate';
import { LIGHT_COLORS, appsFromParam, lightSearchUrl, splitWhy } from '../utils/labLights';

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

function NumberLink({ app, kind, children }: { app: string; kind: 'logs' | 'errors'; children: React.ReactNode }) {
  const url = lightSearchUrl(app, kind);
  if (!url) return <span>{children}</span>;
  return (
    <Link
      to={url}
      className="underline decoration-honey-500/50 underline-offset-2 hover:text-honey-300 hover:decoration-honey-300 transition-colors"
      title={kind === 'errors' ? `Open ${app}'s errors from the last 15 minutes in Search` : `Open ${app}'s logs from the last 15 minutes in Search`}
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
  return (
    <div className="flex flex-col items-center min-w-0" data-testid="lab-light" data-state={offline ? 'offline' : light.state}>
      {/* bezel */}
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
          <img src="/logo.png" alt="" className="w-4 h-4 sm:w-5 sm:h-5 rounded opacity-80 mb-1 sm:mb-2" />
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
      {/* stand */}
      <div className="mt-3 h-6 px-3 min-w-[64px] rounded-md bg-[#3a2a1b] text-[10px] sm:text-xs text-nog-300 flex items-center justify-center whitespace-nowrap">
        {offline ? 'last answer kept' : sinceText(light.since) || ' '}
      </div>
      {/* the numbers behind the light, each opens its logs */}
      <div className="mt-2 text-[11px] sm:text-xs text-nog-300 text-center leading-relaxed">
        <NumberLink app={light.app} kind="logs">
          {light.logs_last_15m.toLocaleString()} log{light.logs_last_15m === 1 ? '' : 's'}
        </NumberLink>
        {' · '}
        <NumberLink app={light.app} kind="errors">
          <span className={errors > 0 ? 'text-red-300' : undefined}>
            {errors.toLocaleString()} error{errors === 1 ? '' : 's'}
          </span>
        </NumberLink>
        <div className="text-nog-400">in the last 15 min</div>
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

      {data && data.apps.length > 0 && (
        <div
          className={`grid gap-x-2 gap-y-8 sm:gap-x-6 justify-items-center ${
            wall ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]' : 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]'
          }`}
        >
          {data.apps.map((l) => (
            <Screen key={l.app} light={l} offline={offline} big={wall} />
          ))}
        </div>
      )}
    </>
  );

  if (wall) {
    return (
      <div className="fixed inset-0 z-[60] overflow-auto" style={{ background: '#140E09' }}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-8 pt-4">
          <div className="text-nog-300 text-sm min-w-0 truncate">
            <span className="font-display font-semibold text-nog-100 text-lg mr-3">Lab lights</span>
            {offline ? "Can't reach LogNog; showing the last answer" : updated}
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-nog-900 dark:text-nog-100">Lab lights</h1>
          <p className="text-sm text-nog-600 dark:text-nog-400 mt-1 max-w-2xl">
            One round screen per app, as the screens on the lab shelf show it. Each reads LogNog every 30 seconds; when one turns red the lab says it out loud.
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
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{counts.red} red</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{counts.yellow} yellow</span>
          <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{counts.green} green</span>
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
          <Cpu className="w-3.5 h-3.5" /> The shelf screens run the firmware in hardware/lab-lights and read /api/status/lights with a read-only key.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5" /> Red is spoken once, when it turns red, outside quiet hours (11 pm to 8 am).
        </span>
      </div>
    </div>
  );
}

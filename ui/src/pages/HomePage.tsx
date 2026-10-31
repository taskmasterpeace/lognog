/**
 * Home: the first page after login.
 *
 * Money on top, then "Needs you" (alerts that can't reach you, apps with an
 * error spike, apps gone quiet), then every app in words and colour. Every
 * number is a link to the logs it was counted from. All of it comes from
 * GET /stats/home (api/src/services/home-summary.ts); nothing here is made up.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  Loader2,
  MoonStar,
  RefreshCw,
  Wallet,
  Database,
} from 'lucide-react';
import { getHomeSummary, HomeApp, HomeBankSpend, HomeAiSpend, HomeNeedsYouItem, HomeSummary } from '../api/client';
import {
  aiSpendQuery,
  alertFixUrl,
  appErrorsUrl,
  appLogsUrl,
  moneyEventsQuery,
  moneySnapshotQuery,
  searchUrl,
  MONEY_INDEX,
  AI_COST_FIELD,
  TODAY_EARLIEST,
  WEEK_EARLIEST,
  WINDOW_EARLIEST,
} from '../utils/homeDrilldown';
import { getStatusInfo, formatRelativeTime } from '../utils/sourceStatus';
import { canDrillDown } from '../utils/sourceDrilldown';
import { toDate } from '../utils/formatDate';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function clock(iso: string): string {
  return toDate(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** A number that opens the logs behind it. */
/** Same rule as Data Sources: logs with no app name can't be opened one app at a time. */
const NO_APP_TITLE = "These logs have no app name, so they can't be opened as one app";

function appTitle(name: string): string {
  return name.trim() === '' ? '(no app name)' : name;
}

function NumLink({ to, children, tone = 'plain', title }: {
  /** null = show the number without a link (see NO_APP_TITLE). */
  to: string | null;
  children: React.ReactNode;
  tone?: 'plain' | 'bad';
  title?: string;
}) {
  const color = tone === 'bad'
    ? 'text-red-600 dark:text-red-400 decoration-red-300 dark:decoration-red-700'
    : 'text-nog-900 dark:text-nog-50 decoration-nog-300 dark:decoration-nog-600';
  if (to === null) {
    return <strong title={title ?? NO_APP_TITLE} className={`font-semibold tabular-nums ${color}`}>{children}</strong>;
  }
  return (
    <Link
      to={to}
      title={title}
      className={`font-semibold tabular-nums underline decoration-dotted underline-offset-4 hover:decoration-solid hover:text-honey-600 dark:hover:text-honey-400 transition-colors ${color}`}
    >
      {children}
    </Link>
  );
}

function Pill({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'grey'; children: React.ReactNode }) {
  const styles = {
    green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    grey: 'bg-nog-100 text-nog-600 dark:bg-nog-700 dark:text-nog-300',
  }[tone];
  const dot = { green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500', grey: 'bg-nog-400' }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${styles}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function stateTone(state: HomeApp['state']): 'green' | 'red' | 'amber' | 'grey' {
  if (state === 'errors') return 'red';
  if (state === 'quiet') return 'amber';
  if (state === 'new' || state === 'sparse') return 'grey';
  return 'green';
}

// ---------------------------------------------------------------- money strip

function BankPart({ bank, now }: { bank: HomeBankSpend; now: Date }) {
  if (bank.status === 'failed') {
    return (
      <span className="text-nog-600 dark:text-nog-300">
        Bank: <strong className="text-red-600 dark:text-red-400">couldn't check just now</strong> · the money query failed; the rest of Home is current.{' '}
        <NumLink to={searchUrl(moneySnapshotQuery(), WINDOW_EARLIEST)} title="Opens the money-watch snapshots">Open the snapshots</NumLink>
      </span>
    );
  }
  if (bank.status === 'not_visible') {
    return (
      <span className="text-nog-600 dark:text-nog-300">
        Bank: <strong className="text-nog-900 dark:text-nog-100">not visible to you</strong> · your login can't read index{' '}
        <code className="font-mono text-xs">{MONEY_INDEX}</code>
      </span>
    );
  }
  if (bank.status === 'no_events') {
    return (
      <span className="text-nog-600 dark:text-nog-300">
        Bank: <strong className="text-nog-900 dark:text-nog-100">no money events yet</strong> · nothing has arrived in index{' '}
        <code className="font-mono text-xs">{MONEY_INDEX}</code> in the last 14 days (money-watch sends there)
      </span>
    );
  }
  if (bank.status === 'no_snapshot') {
    return (
      <span className="text-nog-600 dark:text-nog-300">
        Bank: <strong className="text-nog-900 dark:text-nog-100">no totals yet</strong> ·{' '}
        <NumLink to={searchUrl(moneyEventsQuery(), WINDOW_EARLIEST)}>{bank.events.toLocaleString()}</NumLink>{' '}
        money events in index <code className="font-mono text-xs">{MONEY_INDEX}</code>, but none is a{' '}
        <code className="font-mono text-xs">kind="snapshot"</code> with spend totals
      </span>
    );
  }
  const asOf = bank.as_of ? toDate(bank.as_of) : null;
  const staleHours = asOf ? (now.getTime() - asOf.getTime()) / 3_600_000 : null;
  const stale = staleHours !== null && staleHours > 26;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {stale
        ? <Pill tone="amber">Bank not read for {formatRelativeTime(bank.as_of!, now).replace(' ago', '')}</Pill>
        : <Pill tone="green">Reading the bank fine</Pill>}
      {bank.as_of && <span className="text-nog-500 dark:text-nog-400">last read {clock(bank.as_of)}</span>}
      <span className="text-nog-600 dark:text-nog-300">
        Spent{' '}
        {bank.out_24h !== null
          ? <NumLink to={searchUrl(moneySnapshotQuery(), WINDOW_EARLIEST)} title="Opens the money-watch snapshots">{usd.format(bank.out_24h)}</NumLink>
          : <strong className="text-nog-900 dark:text-nog-100">not reported</strong>}{' '}
        today ·{' '}
        {bank.out_7d !== null
          ? <NumLink to={searchUrl(moneySnapshotQuery(), WINDOW_EARLIEST)} title="Opens the money-watch snapshots">{usd.format(bank.out_7d)}</NumLink>
          : <strong className="text-nog-900 dark:text-nog-100">not reported</strong>}{' '}
        this week
      </span>
    </span>
  );
}

function AiPart({ ai }: { ai: HomeAiSpend }) {
  if (ai.status === 'failed') {
    return (
      <span className="text-nog-600 dark:text-nog-300">
        AI spend: <strong className="text-red-600 dark:text-red-400">couldn't check just now</strong> · the AI spend query failed.{' '}
        <NumLink to={searchUrl(aiSpendQuery(), WEEK_EARLIEST)}>Open this week's AI spend logs</NumLink>
      </span>
    );
  }
  if (ai.status === 'none') {
    return (
      <span className="text-nog-600 dark:text-nog-300">
        AI spend: <strong className="text-nog-900 dark:text-nog-100">not logged yet</strong> · apps can send{' '}
        <code className="font-mono text-xs">{AI_COST_FIELD}</code> and it shows here
      </span>
    );
  }
  return (
    <span className="text-nog-600 dark:text-nog-300">
      AI spend:{' '}
      <NumLink to={searchUrl(aiSpendQuery(), TODAY_EARLIEST)}>{usd.format(ai.today)}</NumLink> today ·{' '}
      <NumLink to={searchUrl(aiSpendQuery(), WEEK_EARLIEST)}>{usd.format(ai.week)}</NumLink> this week
      {ai.by_app.length > 0 && (
        <span className="text-nog-500 dark:text-nog-400">
          {' '}· most from{' '}
          <Link
            to={searchUrl(aiSpendQuery(ai.by_app[0].index_name, ai.by_app[0].app_name), WEEK_EARLIEST)}
            className="underline decoration-dotted underline-offset-4 hover:text-honey-600"
          >
            {ai.by_app[0].app_name}
          </Link>
        </span>
      )}
    </span>
  );
}

function MoneyStrip({ summary, now }: { summary: HomeSummary; now: Date }) {
  return (
    <section
      aria-label="Money"
      className="rounded-[0.625rem] border border-nog-200 dark:border-nog-700 bg-nog-50 dark:bg-nog-800/60 px-4 py-3"
    >
      <div className="flex flex-col gap-2 text-sm lg:flex-row lg:items-center lg:gap-6">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-nog-500 dark:text-nog-400">
          <Wallet className="h-4 w-4 text-honey-500" /> Money
        </span>
        <BankPart bank={summary.money.bank} now={now} />
        <AiPart ai={summary.money.ai} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- needs you

function NeedsYouRow({ item }: { item: HomeNeedsYouItem }) {
  let icon: React.ReactNode;
  let title: string;
  let detail: string;
  let action: React.ReactNode;
  const primary = 'bg-honey-500 hover:bg-honey-600 text-white';
  const outline = 'border border-nog-300 dark:border-nog-600 text-nog-800 dark:text-nog-100 hover:bg-nog-50 dark:hover:bg-nog-700';
  const btn = 'inline-flex shrink-0 items-center justify-center rounded-[0.625rem] px-3.5 py-2 text-sm font-semibold transition-colors';

  if (item.kind === 'alert_unreachable') {
    icon = <BellOff className="h-5 w-5 text-red-500" />;
    title = `${item.alert_name} can't reach you`;
    detail = item.problems.join(' ');
    action = <Link to={alertFixUrl(item.alert_id)} className={`${btn} ${primary}`}>Fix the alert</Link>;
  } else if (item.kind === 'error_spike') {
    const a = item.app;
    icon = <AlertTriangle className="h-5 w-5 text-red-500" />;
    const ratio = a.error_ratio !== null ? `, about ${Math.round(a.error_ratio)}× a normal day` : ', and a normal day has none';
    title = `${appTitle(a.app_name)}: ${a.errors_today.toLocaleString()} errors today${ratio}`;
    // A quiet app's detail is about the silence; this row is about the errors.
    detail = a.spike_detail ?? a.detail;
    action = canDrillDown(a.app_name) ? (
      <Link to={appErrorsUrl(a.index_name, a.app_name)} className={`${btn} ${outline}`}>
        Open the {a.errors_today.toLocaleString()} errors
      </Link>
    ) : null;
  } else {
    const a = item.app;
    icon = <MoonStar className="h-5 w-5 text-amber-500" />;
    title = `${appTitle(a.app_name)} has gone quiet`;
    detail = a.detail;
    action = canDrillDown(a.app_name) ? (
      <Link to={appLogsUrl(a.index_name, a.app_name, WINDOW_EARLIEST)} className={`${btn} ${outline}`}>
        Open its last logs
      </Link>
    ) : null;
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="font-semibold text-nog-900 dark:text-nog-50 break-words">{title}</p>
          <p className="text-sm text-nog-600 dark:text-nog-300 break-words">{detail}</p>
        </div>
      </div>
      {/* left-aligned on phones so the floating help button never covers it */}
      <div className="self-start sm:self-auto sm:shrink-0">{action}</div>
    </li>
  );
}

function NeedsYou({ items, alertsHidden, appsFailed }: { items: HomeNeedsYouItem[]; alertsHidden: boolean; appsFailed: boolean }) {
  return (
    <section aria-labelledby="needs-you-heading">
      <h2 id="needs-you-heading" className="mb-2 flex items-center gap-2 text-lg font-bold tracking-tight text-nog-900 dark:text-nog-50">
        Needs you
        {items.length > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300">
            {items.length}
          </span>
        )}
      </h2>
      {appsFailed && (
        <p className="mb-2 text-sm text-red-700 dark:text-red-300">
          Couldn't check your apps just now, so this list only covers alerts. It tries again every minute.
        </p>
      )}
      {items.length === 0 && appsFailed ? null : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[0.625rem] border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/30">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </span>
          <p className="text-sm text-nog-600 dark:text-nog-300">
            <strong className="text-nog-900 dark:text-nog-50">Nothing needs you.</strong>{' '}
            {alertsHidden
              ? 'No app you can see has an error spike, and none has gone quiet. (This login is not shown alert rules.)'
              : 'Every turned-on alert can reach you, no app has an error spike, and none has gone quiet.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-nog-200 dark:divide-nog-700 rounded-[0.625rem] border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800">
          {items.map((item) => (
            <NeedsYouRow
              key={item.kind === 'alert_unreachable' ? `alert:${item.alert_id}` : `${item.kind}:${item.app.index_name}/${item.app.app_name}`}
              item={item}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- apps

function AppCard({ app, now }: { app: HomeApp; now: Date }) {
  const seen = app.last_seen ? getStatusInfo(app.last_seen, now) : null;
  return (
    <li className="rounded-[0.625rem] border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-bold tracking-tight text-nog-900 dark:text-nog-50" title={app.app_name || 'Logs with no app name'}>
            {app.app_name || <span className="italic text-nog-500 dark:text-nog-400">(no app name)</span>}
          </h3>
          <p className="truncate text-xs text-nog-500 dark:text-nog-400">index {app.index_name}</p>
        </div>
        <span title={app.detail}><Pill tone={stateTone(app.state)}>{app.label}</Pill></span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-nog-500 dark:text-nog-400">
        <span>
          <NumLink to={canDrillDown(app.app_name) ? appLogsUrl(app.index_name, app.app_name) : null}>{app.logs_today.toLocaleString()}</NumLink> logs today
        </span>
        <span>
          <NumLink
            to={canDrillDown(app.app_name) ? appErrorsUrl(app.index_name, app.app_name) : null}
            tone={app.error_spike ? 'bad' : 'plain'}
          >
            {app.errors_today.toLocaleString()}
          </NumLink>{' '}
          errors
        </span>
        {app.last_seen && seen && (
          <span className="inline-flex items-center gap-1.5" title={`${seen.label}: last log ${toDate(app.last_seen).toLocaleString()}`}>
            <span className={`h-2 w-2 rounded-full ${seen.dotClass}`} />
            last seen {formatRelativeTime(app.last_seen, now)}
          </span>
        )}
      </div>
      {app.state !== 'fine' && <p className="mt-2 text-xs text-nog-600 dark:text-nog-300">{app.detail}</p>}
    </li>
  );
}

function Apps({ apps, now, scopeIndexes, failed }: { apps: HomeApp[]; now: Date; scopeIndexes: string[] | null; failed: boolean }) {
  return (
    <section aria-labelledby="apps-heading">
      <h2 id="apps-heading" className="mb-2 text-lg font-bold tracking-tight text-nog-900 dark:text-nog-50">Apps</h2>
      {failed ? (
        <div className="rounded-[0.625rem] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Couldn't load your apps just now: the app query failed. Money above is current; this tries again every minute.{' '}
          <Link to="/data-sources" className="font-semibold underline">Open Data Sources</Link>
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[0.625rem] border border-dashed border-nog-300 dark:border-nog-600 bg-white dark:bg-nog-800 px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-honey-50 dark:bg-honey-900/30">
            <Database className="h-8 w-8 text-honey-500" />
          </span>
          <p className="font-semibold text-nog-900 dark:text-nog-50">
            {scopeIndexes && scopeIndexes.length > 0
              ? `No app in ${scopeIndexes.join(', ')} has sent logs in the last 14 days.`
              : 'No app has sent logs in the last 14 days.'}
          </p>
          <p className="text-sm text-nog-600 dark:text-nog-300">
            Apps show up here once they send logs. <Link to="/data-sources" className="font-semibold text-honey-600 hover:underline">Add a data source</Link>.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => <AppCard key={`${app.index_name}/${app.app_name}`} app={app} now={now} />)}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- page

export default function HomePage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['home-summary'],
    queryFn: getHomeSummary,
    refetchInterval: 60_000,
  });
  const now = data ? toDate(data.generated_at) : new Date();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-nog-900 dark:text-nog-50 sm:text-3xl">{greeting(new Date())}</h1>
          <p className="mt-1 text-sm text-nog-600 dark:text-nog-300">
            Your studio's apps, worst first. Every number opens the logs behind it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[0.625rem] px-2.5 py-1.5 text-xs text-nog-500 hover:bg-nog-100 dark:text-nog-400 dark:hover:bg-nog-800 transition-colors"
          title="Check again now"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {data ? (
            // A failed background check keeps the last good numbers on screen
            // (it used to replace the whole page with an error box).
            // The warning shows on phones too; the plain "Updated" time stays desktop-only.
            <span className={error ? 'inline text-amber-600 dark:text-amber-400' : 'hidden sm:inline'}>
              {error ? `Last check missed, showing ${clock(data.generated_at)}` : `Updated ${clock(data.generated_at)}`}
            </span>
          ) : <span className="hidden sm:inline">Refresh</span>}
        </button>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-honey-500" />
        </div>
      ) : !data ? (
        <div className="rounded-[0.625rem] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Couldn't load Home: {error instanceof Error ? error.message : 'no answer from the server'}.{' '}
          <button type="button" onClick={() => refetch()} className="font-semibold underline">Try again</button>
        </div>
      ) : (
        <div className="space-y-6">
          <MoneyStrip summary={data} now={now} />
          {data.scoped && (
            <p className="text-xs text-nog-500 dark:text-nog-400">
              Your login can only read {data.scope_indexes && data.scope_indexes.length > 0 ? data.scope_indexes.join(', ') : 'some indexes'}, so
              Home shows just those, and no alert rules.
            </p>
          )}
          <NeedsYou items={data.needs_you} alertsHidden={data.alerts_hidden} appsFailed={(data.failed ?? []).includes('apps')} />
          <Apps apps={data.apps} now={now} scopeIndexes={data.scope_indexes} failed={(data.failed ?? []).includes('apps')} />
        </div>
      )}
    </div>
  );
}

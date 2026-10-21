/**
 * The LogNog Weekly: a newspaper-look summary of one ISO week, at the top of
 * the Reports page.
 *
 * Money story, then the logs / errors / alerts-delivered tiles, apps this week
 * in words, what broke, what got fixed, and what needs you next week. Every
 * number opens the logs it was counted from. Everything comes from
 * GET /reports/weekly (api/src/services/weekly-report.ts); nothing here is
 * made up. "Read aloud" speaks the report's own `spoken` text through the
 * browser's speechSynthesis.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Play, Square } from 'lucide-react';
import {
  getWeeklyReport,
  WeeklyApp,
  WeeklyBrokeItem,
  WeeklyCount,
  WeeklyFixedItem,
  WeeklyReport,
  HomeNeedsYouItem,
} from '../../api/client';
import {
  allErrorsQuery,
  allLogsQuery,
  errorMessageQuery,
  moneyDaysQuery,
  spanUrl,
  sourceErrorsQuery,
  sourceLogsQuery,
  aiSpendQuery,
  ALERT_HISTORY_URL,
  Span,
} from '../../utils/weeklyDrilldown';
import { alertFixUrl, appErrorsUrl, appLogsUrl, searchUrlBetween, MONEY_INDEX, WINDOW_EARLIEST } from '../../utils/homeDrilldown';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const HOUR = 3_600_000;

function fmtDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/** "From last week" without the old span: the earliest of last week to the end of this one. */
function bothWeeks(r: WeeklyReport): Span {
  return { earliest: r.prev_range.earliest, latest: r.range.latest };
}

/** A number that opens the logs behind it. */
function NumLink({ to, children, title, className = '' }: { to: string; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <Link
      to={to}
      title={title}
      className={`tabular-nums underline decoration-dotted decoration-nog-300 underline-offset-4 hover:decoration-solid hover:text-honey-600 dark:decoration-nog-600 dark:hover:text-honey-400 transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="whitespace-nowrap font-medium text-honey-600 hover:text-honey-700 hover:underline dark:text-honey-400">
      {children} ›
    </Link>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-base font-bold tracking-tight text-nog-900 dark:text-nog-50">{children}</h3>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-nog-600 dark:text-nog-300">{children}</p>;
}

// ---------------------------------------------------------------- trend words

/** "▲ 8% vs last week"; for errors and lost alerts, up is bad. */
function Trend({ count, upIsBad = false }: { count: WeeklyCount; upIsBad?: boolean }) {
  if (count.change_pct === null) {
    return (
      <span className="text-xs text-nog-500 dark:text-nog-400">
        {count.last_week === 0 && count.this_week > 0 ? 'none the same days last week' : 'nothing to compare with'}
      </span>
    );
  }
  if (count.change_pct === 0) return <span className="text-xs text-nog-500 dark:text-nog-400">same as last week</span>;
  const up = count.change_pct > 0;
  const bad = upIsBad ? up : false;
  const good = upIsBad ? !up : false;
  const color = bad ? 'text-red-600 dark:text-red-400' : good ? 'text-green-700 dark:text-green-400' : 'text-nog-600 dark:text-nog-300';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {up ? '▲' : '▼'} {Math.abs(count.change_pct)}% vs last week
    </span>
  );
}

// ---------------------------------------------------------------- money

function MoneyStory({ r }: { r: WeeklyReport }) {
  const { bank, ai } = r.money;
  let bankPart: React.ReactNode;
  if (bank.status === 'not_visible') {
    bankPart = (
      <Empty>
        This login can't read the <code className="font-mono text-xs">{MONEY_INDEX}</code> index, so the bank story isn't shown.
      </Empty>
    );
  } else if (bank.status === 'no_days' || bank.this_week === null) {
    bankPart = (
      <Empty>
        No bank day totals arrived for this week. money-watch sends one <code className="font-mono text-xs">kind="day"</code> total a day
        to index <code className="font-mono text-xs">{MONEY_INDEX}</code>; none came in for these dates
        {bank.last_week !== null ? (
          <>
            {' '}(last week had{' '}
            <NumLink to={spanUrl(moneyDaysQuery(), r.prev_range)}>{usd.format(bank.last_week)}</NumLink>)
          </>
        ) : null}
        .
      </Empty>
    );
  } else {
    const pct = bank.change_pct;
    bankPart = (
      <p className="text-[0.95rem] leading-relaxed text-nog-800 dark:text-nog-100">
        <NumLink to={spanUrl(moneyDaysQuery(), r.range)} className="font-semibold text-nog-900 dark:text-nog-50" title="Opens the day totals money-watch sent">
          {usd.format(bank.this_week)}
        </NumLink>{' '}
        went out of the bank over {plural(bank.days_counted, 'day')}
        {bank.last_week !== null ? (
          <>
            , against{' '}
            <NumLink to={spanUrl(moneyDaysQuery(), r.prev_range)}>{usd.format(bank.last_week)}</NumLink> the same days last week
            {pct !== null && pct !== 0 ? (
              <span className={pct > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
                {' '}({pct > 0 ? 'up' : 'down'} {Math.abs(pct)}%)
              </span>
            ) : pct === 0 ? ' (the same)' : null}
          </>
        ) : (
          ' (no totals for the same days last week)'
        )}
        .
        {bank.biggest_day ? (
          <>
            {' '}The biggest day was {fmtDay(bank.biggest_day.day)}, at{' '}
            <NumLink to={spanUrl(moneyDaysQuery(), r.range)}>{usd.format(bank.biggest_day.out)}</NumLink>.
          </>
        ) : null}
      </p>
    );
  }

  return (
    <section>
      <SectionHead>Money</SectionHead>
      {bankPart}
      <div className="mt-3 rounded-[0.625rem] bg-nog-50 px-3 py-2.5 dark:bg-nog-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-nog-500 dark:text-nog-400">AI spend logged</p>
        {ai.status === 'ok' ? (
          <p className="mt-0.5 text-sm text-nog-800 dark:text-nog-100">
            <NumLink to={spanUrl(aiSpendQuery(), r.range)} className="text-lg font-bold text-nog-900 dark:text-nog-50">
              {usd.format(ai.this_week)}
            </NumLink>{' '}
            from {plural(ai.events, 'event')}{' '}
            <Trend count={{ this_week: ai.this_week, last_week: ai.last_week, change_pct: ai.change_pct }} upIsBad />
            {ai.by_app.length > 0 && (
              <span className="mt-1 block text-xs text-nog-600 dark:text-nog-300">
                {ai.by_app.slice(0, 3).map((a, i) => (
                  <span key={`${a.index_name}/${a.app_name}`}>
                    {i > 0 && ' · '}
                    {a.app_name}{' '}
                    <NumLink to={spanUrl(aiSpendQuery(a.index_name, a.app_name), r.range)}>{usd.format(a.spend_recent)}</NumLink>
                  </span>
                ))}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-nog-700 dark:text-nog-200">
            <strong className="text-nog-900 dark:text-nog-50">Not logged yet.</strong> When apps send{' '}
            <code className="font-mono text-xs">{ai.field}</code> with their logs, the week's spend per app shows here.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- tiles

function Tile({ label, children, foot }: { label: string; children: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[0.625rem] border border-nog-200 bg-white px-3 py-2.5 dark:border-nog-700 dark:bg-nog-800">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-nog-500 dark:text-nog-400">{label}</p>
      <div className="mt-0.5 text-2xl font-bold text-nog-900 dark:text-nog-50">{children}</div>
      <div className="mt-0.5">{foot}</div>
    </div>
  );
}

function Tiles({ r }: { r: WeeklyReport }) {
  const a = r.tiles.alerts;
  let alertTile: React.ReactNode;
  if (r.alerts_hidden) {
    alertTile = (
      <Tile label="Alerts that reached you" foot={<span className="text-xs text-nog-500 dark:text-nog-400">alerts aren't shown to this login</span>}>
        <span className="text-nog-400">—</span>
      </Tile>
    );
  } else if (a.fired === 0) {
    alertTile = (
      <Tile label="Alerts that reached you" foot={<span className="text-xs text-nog-500 dark:text-nog-400">no alert fired{a.fired_prev ? ` (${a.fired_prev} last week)` : ''}</span>}>
        <NumLink to={ALERT_HISTORY_URL}>0</NumLink>
      </Tile>
    );
  } else {
    const missed = [a.lost ? `${a.lost} lost` : '', a.no_route ? `${a.no_route} had nowhere to go` : ''].filter(Boolean).join(', ');
    alertTile = (
      <Tile
        label="Alerts that reached you"
        foot={
          <span className={`text-xs font-medium ${missed ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
            {missed || 'none lost'}
          </span>
        }
      >
        <NumLink to={ALERT_HISTORY_URL} title="Opens every firing and whether it was delivered">
          {a.reached.toLocaleString()} of {a.fired.toLocaleString()}
        </NumLink>
      </Tile>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile label="Logs this week" foot={<Trend count={r.tiles.logs} />}>
        <NumLink to={spanUrl(allLogsQuery(), r.range)} title="Opens every log of the week">
          {r.tiles.logs.this_week.toLocaleString()}
        </NumLink>
      </Tile>
      <Tile label="Errors" foot={<Trend count={r.tiles.errors} upIsBad />}>
        <NumLink to={spanUrl(allErrorsQuery(), r.range)} title="Opens every error of the week">
          {r.tiles.errors.this_week.toLocaleString()}
        </NumLink>
      </Tile>
      {alertTile}
    </div>
  );
}

// ---------------------------------------------------------------- apps

const STATE_PILL: Record<WeeklyApp['state'], { label: string; cls: string; dot: string }> = {
  fine: { label: 'Fine', cls: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300', dot: 'bg-green-500' },
  shaky: { label: 'Shaky', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
  quiet: { label: 'Went quiet', cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
  silent: { label: 'Silent', cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
  new: { label: 'New', cls: 'bg-nog-100 text-nog-700 dark:bg-nog-700 dark:text-nog-200', dot: 'bg-nog-400' },
};

function Apps({ r }: { r: WeeklyReport }) {
  return (
    <section>
      <SectionHead>Apps this week</SectionHead>
      {r.apps.length === 0 ? (
        <Empty>
          No app sent a log {r.complete ? 'this week' : 'yet this week'}
          {r.scoped && r.scope_indexes ? ` to ${r.scope_indexes.join(', ')}` : ''}.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {r.apps.map(a => {
            const pill = STATE_PILL[a.state];
            const detail = a.words.includes(' · ') ? a.words.split(' · ').slice(1).join(' · ') : a.words;
            return (
              <li key={`${a.index_name}/${a.app_name}`} className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>
                  <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                  {pill.label}
                </span>
                <span className="min-w-0 text-sm leading-snug">
                  <NumLink to={spanUrl(sourceLogsQuery(a.index_name, a.app_name), r.range)} className="font-medium text-nog-900 dark:text-nog-50">
                    {a.app_name}
                  </NumLink>
                  <span className="block break-words text-xs text-nog-600 dark:text-nog-300">{detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- broke / fixed

function brokeLink(item: WeeklyBrokeItem, r: WeeklyReport): React.ReactNode {
  switch (item.kind) {
    case 'app_errors':
      return <MoreLink to={spanUrl(sourceErrorsQuery(item.index_name, item.app_name), r.range)}>See the {item.errors_this.toLocaleString()} errors</MoreLink>;
    case 'new_error':
      return (
        <MoreLink to={spanUrl(errorMessageQuery(item.index_name, item.app_name, item.message), r.range)}>
          See the {item.errors_this.toLocaleString()} errors
        </MoreLink>
      );
    case 'app_quiet': {
      const from = new Date(new Date(item.quiet.from).getTime() - HOUR).toISOString();
      const to = item.quiet.to ? new Date(new Date(item.quiet.to).getTime() + HOUR).toISOString() : r.range.latest;
      return <MoreLink to={searchUrlBetween(sourceLogsQuery(item.index_name, item.app_name), from, to)}>See the logs around the gap</MoreLink>;
    }
    case 'app_silent':
      return <MoreLink to={spanUrl(sourceLogsQuery(item.index_name, item.app_name), bothWeeks(r))}>See its last logs</MoreLink>;
    case 'alert_fired':
      return item.lost > 0 ? (
        <MoreLink to={alertFixUrl(item.alert_id)}>Fix the alert</MoreLink>
      ) : (
        <MoreLink to={ALERT_HISTORY_URL}>See the firings</MoreLink>
      );
  }
}

function fixedLink(item: WeeklyFixedItem, r: WeeklyReport): React.ReactNode {
  switch (item.kind) {
    case 'app_errors_stopped':
      return <MoreLink to={spanUrl(sourceErrorsQuery(item.index_name, item.app_name), bothWeeks(r))}>See the {item.errors_before.toLocaleString()} errors</MoreLink>;
    case 'error_stopped':
      return (
        <MoreLink to={spanUrl(errorMessageQuery(item.index_name, item.app_name, item.message), bothWeeks(r))}>
          See the {item.errors_before.toLocaleString()} errors
        </MoreLink>
      );
    case 'alert_quiet':
      return <MoreLink to={ALERT_HISTORY_URL}>See the firings</MoreLink>;
  }
}

function Broke({ r }: { r: WeeklyReport }) {
  return (
    <section>
      <SectionHead>What broke</SectionHead>
      {r.broke.length === 0 ? (
        <Empty>Nothing broke{r.complete ? ' this week' : ' so far this week'}: no error rise, no app went quiet{r.alerts_hidden ? '' : ', no alert fired'}.</Empty>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-nog-800 marker:text-nog-400 dark:text-nog-100">
          {r.broke.map((item, i) => (
            <li key={i} className="break-words">
              {item.words}. {brokeLink(item, r)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Fixed({ r }: { r: WeeklyReport }) {
  return (
    <section>
      <SectionHead>What got fixed</SectionHead>
      {r.fixed.length === 0 ? (
        <Empty>Nothing to call fixed: nothing that was firing or erroring went quiet for the last two days of the week.</Empty>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-nog-800 marker:text-nog-400 dark:text-nog-100">
          {r.fixed.map((item, i) => (
            <li key={i} className="break-words">
              {item.words}. {fixedLink(item, r)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- needs you

function needsLine(item: HomeNeedsYouItem): { text: string; link: React.ReactNode } {
  if (item.kind === 'alert_unreachable') {
    return { text: `${item.alert_name} can't reach you. ${item.problems.join(' ')}`, link: <MoreLink to={alertFixUrl(item.alert_id)}>Fix the alert</MoreLink> };
  }
  const a = item.app;
  if (item.kind === 'error_spike') {
    return { text: `${a.app_name}: ${a.detail}`, link: <MoreLink to={appErrorsUrl(a.index_name, a.app_name)}>Open the errors</MoreLink> };
  }
  return { text: `${a.app_name} has gone quiet. ${a.detail}`, link: <MoreLink to={appLogsUrl(a.index_name, a.app_name, WINDOW_EARLIEST)}>Open its last logs</MoreLink> };
}

function NeedsYou({ r }: { r: WeeklyReport }) {
  const asOf = new Date(r.needs_you_as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: r.tz });
  return (
    <section>
      <SectionHead>Needs you next week</SectionHead>
      <p className="-mt-1 mb-2 text-xs text-nog-500 dark:text-nog-400">As of now ({asOf}), the same list as Home</p>
      {r.needs_you.length === 0 ? (
        <Empty>Nothing needs you right now{r.alerts_hidden ? ' (alerts aren\'t checked for this login)' : ''}.</Empty>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-nog-800 marker:text-nog-400 dark:text-nog-100">
          {r.needs_you.map((item, i) => {
            const { text, link } = needsLine(item);
            return (
              <li key={i} className="break-words">
                {text} {link}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- read aloud

function useReadAloud(text: string | undefined) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  useEffect(() => {
    // a new week's paper stops the old reading
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [text, supported]);
  const toggle = () => {
    if (!supported || !text) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return { supported, speaking, toggle };
}

function readMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 160));
}

// ---------------------------------------------------------------- the paper

function Lead({ r }: { r: WeeklyReport }) {
  const top = r.broke[0];
  return (
    <div>
      <h2 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-nog-900 dark:text-nog-50 sm:text-[2rem]">
        {r.headline}
      </h2>
      {top ? (
        <p className="mt-2 text-[0.95rem] leading-relaxed text-nog-700 dark:text-nog-200">
          {top.words}. {brokeLink(top, r)}
        </p>
      ) : r.apps.length === 0 ? (
        <p className="mt-2 text-[0.95rem] leading-relaxed text-nog-700 dark:text-nog-200">
          Nothing was sent to LogNog between {fmtDay(r.monday)} and{' '}
          {new Date(r.end).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: r.tz })}
          {r.scoped && r.scope_indexes ? ` in ${r.scope_indexes.join(', ')}` : ''}.
        </p>
      ) : (
        <p className="mt-2 text-[0.95rem] leading-relaxed text-nog-700 dark:text-nog-200">
          {plural(r.apps.length, 'app')} sent{' '}
          <NumLink to={spanUrl(allLogsQuery(), r.range)} className="font-semibold">{plural(r.tiles.logs.this_week, 'log')}</NumLink>
          {' '}with no error rise, no silence and {r.alerts_hidden ? 'nothing to flag' : 'no alert firing'}.
        </p>
      )}
    </div>
  );
}

function WeekNav({ r, onWeek }: { r: WeeklyReport; onWeek: (w: string | null) => void }) {
  const btn =
    'inline-flex items-center gap-1 rounded-[0.625rem] px-2.5 py-1.5 text-xs font-semibold text-nog-700 transition-colors hover:bg-nog-100 dark:text-nog-200 dark:hover:bg-nog-700';
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:justify-end">
      <button type="button" className={btn} onClick={() => onWeek(r.prev_week)}>
        <ChevronLeft className="h-4 w-4" /> Week before
      </button>
      {r.next_week && (
        <button type="button" className={btn} onClick={() => onWeek(r.next_week)}>
          Week after <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {r.complete && (
        <button type="button" className={btn} onClick={() => onWeek(null)}>
          This week
        </button>
      )}
    </div>
  );
}

export default function WeeklyPaper() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week');
  const { data: r, isLoading, error, refetch } = useQuery({
    queryKey: ['weekly-report', week ?? 'current'],
    queryFn: () => getWeeklyReport(week),
    retry: false,
    staleTime: 60_000,
  });
  const voice = useReadAloud(r?.spoken);

  const onWeek = (w: string | null) => {
    const next = new URLSearchParams(params);
    if (w) next.set('week', w);
    else next.delete('week');
    setParams(next);
  };

  const shell = 'rounded-[0.625rem] border border-nog-200 bg-white px-4 py-5 shadow-sm dark:border-nog-700 dark:bg-nog-800 sm:px-8 sm:py-7';

  if (isLoading) {
    return (
      <article className={`${shell} flex items-center justify-center gap-3 py-16`} aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-honey-500" />
        <span className="text-sm text-nog-600 dark:text-nog-300">Setting the type for this week's paper…</span>
      </article>
    );
  }
  if (error || !r) {
    return (
      <article className={shell}>
        <h2 className="font-display text-2xl font-bold text-nog-900 dark:text-nog-50">The LogNog Weekly</h2>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          The paper couldn't be made{week ? ` for ${week}` : ''}: {error instanceof Error ? error.message : 'no answer from the server'}.
        </p>
        <div className="mt-3 flex gap-2">
          {week && (
            <button type="button" className="btn-secondary" onClick={() => onWeek(null)}>
              Show this week
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </article>
    );
  }

  const printed = new Date(r.generated_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: r.tz });

  return (
    <article className={shell} aria-label="The LogNog Weekly">
      {/* top rule: date · week · read aloud */}
      <div className="grid grid-cols-1 items-center gap-1 border-b-2 border-nog-800 pb-2 text-xs text-nog-600 dark:border-nog-300 dark:text-nog-300 sm:grid-cols-3 sm:text-[0.8rem]">
        <span className="text-center sm:text-left">{printed}</span>
        <span className="text-center font-medium text-nog-800 dark:text-nog-100">
          {r.label}
          {r.complete ? '' : ', so far'}
        </span>
        <span className="text-center sm:text-right">
          {voice.supported ? (
            <button
              type="button"
              onClick={voice.toggle}
              className="inline-flex items-center gap-1 rounded-[0.625rem] px-2 py-1 font-medium text-nog-700 transition-colors hover:bg-honey-50 hover:text-honey-700 dark:text-nog-200 dark:hover:bg-nog-700"
              aria-pressed={voice.speaking}
            >
              {voice.speaking ? (
                <>
                  Stop reading <Square className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Read aloud: {readMinutes(r.spoken)} min <Play className="h-3.5 w-3.5 fill-current" />
                </>
              )}
            </button>
          ) : (
            <span title="This browser has no speech voice">Read aloud isn't available in this browser</span>
          )}
        </span>
      </div>

      {/* masthead */}
      <header className="border-b border-nog-200 pb-3 pt-3 text-center dark:border-nog-700">
        <h1 className="font-display text-[2.1rem] font-bold leading-none tracking-tight text-nog-800 dark:text-nog-50 sm:text-[3.4rem]">
          The LogNog Weekly
        </h1>
        <p className="mt-1.5 text-sm text-nog-600 dark:text-nog-300">Everything your apps said this week, in plain words</p>
        <div className="mt-2">
          <WeekNav r={r} onWeek={onWeek} />
        </div>
      </header>

      {/* phones: one column, in the paper's order */}
      <div className="mt-5 space-y-6 lg:hidden">
        <Lead r={r} />
        <MoneyStory r={r} />
        <Tiles r={r} />
        <Apps r={r} />
        <Broke r={r} />
        <Fixed r={r} />
        <NeedsYou r={r} />
      </div>

      {/* wide screens: the story on the left, apps and next week on the right */}
      <div className="mt-5 hidden gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          <Lead r={r} />
          <MoneyStory r={r} />
          <Tiles r={r} />
          <Broke r={r} />
          <Fixed r={r} />
        </div>
        <aside className="space-y-6 border-l border-nog-200 pl-6 dark:border-nog-700">
          <Apps r={r} />
          <NeedsYou r={r} />
        </aside>
      </div>

      <footer className="mt-6 border-t border-nog-200 pt-2 text-[0.7rem] text-nog-500 dark:border-nog-700 dark:text-nog-400">
        Counted from your logs at{' '}
        {new Date(r.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: r.tz })} · times in {r.tz} · last week
        is compared over the same days{r.complete ? '' : ' and hours'} · every number opens the logs behind it
      </footer>
    </article>
  );
}

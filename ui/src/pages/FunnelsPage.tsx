import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, CalendarDays, CircleDollarSign, DoorOpen, Filter, Loader2, MonitorPlay, MoonStar, Sparkles, AlertTriangle } from 'lucide-react';
import {
  FunnelOverviewRow,
  FunnelReport,
  FunnelRung,
  getFunnelOverview,
  getFunnelReport,
} from '../api/client';
import { ProjectLogo } from '../components/ProjectLogo';
import { dropBetween, eventLabel, moneyIn, pctText, rangeLabel, RANGES, stageLabel, widthPct } from '../utils/funnels';

/**
 * Funnels (/funnels): every product read against the same two ladders
 * (docs/FUNNELS.md). "All products" puts them side by side; picking one
 * answers the four questions for it.
 */

const HONEY = '#C8862B';
const CHOCOLATE = '#5A3F24';

function Pill({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
        active
          ? 'bg-nog-600 text-nog-50 shadow-sm dark:bg-honey-500 dark:text-nog-900'
          : 'text-nog-600 hover:bg-nog-100 dark:text-nog-300 dark:hover:bg-nog-700/60'
      }`}
    >
      {children}
    </button>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[0.625rem] border border-nog-200 bg-white p-4 dark:border-nog-700 dark:bg-nog-800 ${className}`}>
      {children}
    </section>
  );
}

function Question({ icon: Icon, title, hint }: { icon: typeof Filter; title: string; hint?: string }) {
  return (
    <header className="mb-3 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-honey-50 dark:bg-honey-900/30">
        <Icon className="h-5 w-5 text-honey-600 dark:text-honey-400" strokeWidth={2} />
      </span>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-nog-900 dark:text-nog-50">{title}</h2>
        {hint && <p className="text-xs text-nog-500 dark:text-nog-400">{hint}</p>}
      </div>
    </header>
  );
}

function Stat({ label, value, sub, tone = 'plain' }: { label: string; value: string; sub?: string; tone?: 'plain' | 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'warn' ? 'text-orange-700 dark:text-orange-400' : 'text-nog-900 dark:text-nog-50';
  return (
    <div className="rounded-[0.625rem] bg-nog-50 px-3 py-2.5 dark:bg-nog-900/40">
      <div className="text-[11px] font-medium uppercase tracking-wide text-nog-500 dark:text-nog-400">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-nog-500 dark:text-nog-400">{sub}</div>}
    </div>
  );
}

/** One ladder: a bar per rung, and between rungs how many people were lost. */
function Ladder({ rungs, color, testId }: { rungs: FunnelRung[]; color: string; testId: string }) {
  const top = rungs.find((r) => r.applies)?.people ?? 0;
  return (
    <ol className="space-y-1" data-testid={testId}>
      {rungs.map((r, i) => {
        const drop = dropBetween(rungs, i);
        return (
          <li key={r.stage} data-stage={r.stage}>
            {drop && (
              <div className="flex items-center gap-1.5 py-0.5 pl-[12.25rem] text-xs text-orange-700 dark:text-orange-400" data-testid={`drop-${r.stage}`}>
                <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="font-semibold tabular-nums">{drop.lost.toLocaleString()} left here</span>
                <span className="text-nog-500 dark:text-nog-400">({drop.pctLost} of the step above)</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-sm font-medium text-nog-700 dark:text-nog-200">{r.label}</div>
              <div className="w-14 shrink-0 text-right text-base font-bold tabular-nums text-nog-900 dark:text-nog-50" data-testid={`people-${r.stage}`}>
                {r.applies ? r.people.toLocaleString() : '—'}
              </div>
              <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-nog-100 dark:bg-nog-900/50">
                {r.applies ? (
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
                    style={{ width: `${widthPct(r.people, top)}%`, backgroundColor: color, opacity: r.reported ? 1 : 0.35 }}
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center px-2.5 text-xs italic text-nog-500 dark:text-nog-400">does not apply to this product</span>
                )}
              </div>
              <div className="w-36 shrink-0 text-xs tabular-nums text-nog-600 dark:text-nog-300">
                {!r.applies ? '' : !r.reported ? 'not reported yet' : r.pctOfPrevious === null ? 'everyone starts here' : `${pctText(r.pctOfPrevious)} of step above`}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SmallTable({ head, rows, empty }: { head: string[]; rows: Array<Array<string | number>>; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-nog-500 dark:text-nog-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-nog-500 dark:text-nog-400">
            {head.map((h, i) => (
              <th key={h} className={`whitespace-nowrap pb-1.5 font-medium ${i === 0 ? '' : 'pl-3 text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-nog-100 transition-colors hover:bg-nog-50 dark:border-nog-700/60 dark:hover:bg-nog-700/40">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-1.5 ${ci === 0 ? 'font-medium text-nog-900 dark:text-nog-50' : 'whitespace-nowrap pl-3 text-right tabular-nums text-nog-700 dark:text-nog-200'}`}>
                  {typeof cell === 'number' ? cell.toLocaleString() : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotReported({ stages }: { stages: string[] }) {
  if (stages.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-nog-600 dark:text-nog-300" data-testid="not-reported">
      <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" strokeWidth={2} />
      <span>Not reported by this product yet:</span>
      {stages.map((s) => (
        <span key={s} className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
          {stageLabel(s)}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <Card className="flex flex-col items-center py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-honey-50 dark:bg-honey-900/30">
        <Filter className="h-8 w-8 text-honey-600 dark:text-honey-400" strokeWidth={2} />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold tracking-tight text-nog-900 dark:text-nog-50">No funnel steps from {name} yet</h2>
      <p className="mt-1 max-w-md text-sm text-nog-500 dark:text-nog-400">
        Once {name} starts sending the shared funnel steps, they show up here. The steps and field names are in the{' '}
        <a className="font-medium text-honey-700 underline-offset-2 hover:underline dark:text-honey-400" href="https://github.com/taskmasterpeace/lognog/blob/main/docs/FUNNELS.md" target="_blank" rel="noreferrer">
          funnel guide
        </a>
        .
      </p>
    </Card>
  );
}

function OverviewCard({ row, onOpen }: { row: FunnelOverviewRow; onOpen: () => void }) {
  const groups: Array<{ title: string; rungs: FunnelRung[] }> = [
    { title: 'Getting in', rungs: row.getIn },
    { title: 'Paying, out of everyone who signed up', rungs: row.pay.filter((r) => r.stage !== 'signup') },
  ];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`overview-${row.product.slug}`}
      aria-label={`Open the ${row.product.name} funnel`}
      className="group w-full rounded-[0.625rem] border border-nog-200 bg-white p-4 text-left transition-all duration-200 hover:border-nog-300 hover:shadow-md dark:border-nog-700 dark:bg-nog-800 dark:hover:border-nog-600"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectLogo value={row.product.slug} size="md" />
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold tracking-tight text-nog-900 dark:text-nog-50">{row.product.name}</div>
            <div className="text-xs text-nog-500 dark:text-nog-400">
              {row.stopping.signedUp.toLocaleString()} accounts · {row.stopping.quiet.toLocaleString()} went quiet · {row.paid.payers.toLocaleString()} new payers · money in: {moneyIn(row.paid.revenueCents, row.paid.payments, row.paid.paymentsWithoutAmount).value}
            </div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-honey-700 opacity-70 transition-opacity group-hover:opacity-100 dark:text-honey-400">
          Open <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      {row.truncated && (
        <p className="mt-2 text-xs font-medium text-orange-700 dark:text-orange-400">Too many steps to read them all. The oldest were left out, so these numbers are low.</p>
      )}
      {row.totals.events === 0 ? (
        <p className="mt-3 text-sm text-nog-500 dark:text-nog-400">No funnel steps received yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 lg:flex-row">
          {groups.map((g, gi) => (
            <div key={g.title} className={gi === 0 ? 'lg:flex-[5]' : 'lg:flex-[3]'}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-nog-500 dark:text-nog-400">{g.title}</div>
              <div className="flex items-stretch gap-1">
                {g.rungs.map((r, i) => (
                  <div key={r.stage} className="flex min-w-0 flex-1 items-stretch gap-1">
                    {i > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 self-center text-nog-300 dark:text-nog-600" strokeWidth={2} />}
                    <div className="min-w-0 flex-1 rounded-md bg-nog-50 px-2 py-1.5 dark:bg-nog-900/40">
                      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-nog-500 dark:text-nog-400" title={r.label}>{r.label}</div>
                      {r.applies ? (
                        <>
                          <div className={`text-lg font-bold tabular-nums ${r.reported ? 'text-nog-900 dark:text-nog-50' : 'text-nog-400 dark:text-nog-500'}`}>{r.people.toLocaleString()}</div>
                          <div className="truncate text-[11px] tabular-nums text-nog-500 dark:text-nog-400">
                            {!r.reported ? 'not reported' : r.pctOfPrevious === null ? 'start' : `${pctText(r.pctOfPrevious)} made it`}
                          </div>
                        </>
                      ) : (
                        <div className="pt-1 text-[11px] italic text-nog-500 dark:text-nog-400">n/a</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function ProductView({ report }: { report: FunnelReport }) {
  const s = report.stopping;
  const m = report.movingToPaid;
  const b = report.beforePaying;
  if (report.totals.events === 0) return <EmptyState name={report.product.name} />;
  const leavers = report.getIn.find((r) => r.stage === 'visit');
  const signedUp = report.getIn.find((r) => r.stage === 'signup');
  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-3 flex items-center gap-3" data-testid="product-header">
          <ProjectLogo value={report.product.slug} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-semibold tracking-tight text-nog-900 dark:text-nog-50">{report.product.name}</h2>
            <p className="text-xs text-nog-500 dark:text-nog-400">
              {report.totals.people.toLocaleString()} people seen · last {report.window.days} days
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-nog-600 dark:text-nog-300">
          <span><span className="font-semibold text-nog-900 dark:text-nog-50">First real use:</span> {report.product.activationMeans}</span>
          <span><span className="font-semibold text-nog-900 dark:text-nog-50">Paid:</span> {report.product.paidMeans}</span>
          <span><span className="font-semibold text-nog-900 dark:text-nog-50">Went quiet:</span> no use for {report.product.quietDays} days</span>
        </div>
        <div className="mt-2"><NotReported stages={report.notReported} /></div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <Question icon={DoorOpen} title="Getting in" hint={`People first seen in the ${rangeLabel(report.window.days)}, and how far they have got`} />
          <Ladder rungs={report.getIn} color={HONEY} testId="ladder-get-in" />
        </Card>
        <Card>
          <Question icon={CircleDollarSign} title="Paying" hint="From an account to money in" />
          <Ladder rungs={report.pay} color={CHOCOLATE} testId="ladder-pay" />
        </Card>
      </div>

      <Card>
        <Question
          icon={DoorOpen}
          title="Why don't they sign up?"
          hint={leavers && signedUp ? `${Math.max(0, leavers.people - signedUp.people).toLocaleString()} of ${leavers.people.toLocaleString()} visitors left without an account` : undefined}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">Where visitors came from</h3>
            <SmallTable
              head={['Source', 'Visitors', 'Started sign-up', 'Signed up', 'Sign-up rate']}
              rows={report.bySource.map((r) => [r.source, r.visitors, r.startedSignup, r.signedUp, pctText(r.signupRate)])}
              empty="No visits reported yet."
            />
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">Last thing they did before leaving</h3>
            <SmallTable
              head={['Last step', 'People']}
              rows={report.lastStepBeforeLeaving.map((r) => [eventLabel(r.event), r.people])}
              empty="Nobody left without an account in this range."
            />
          </div>
        </div>
      </Card>

      <Card>
        <Question icon={MoonStar} title="When do they stop using it?" hint={`Everyone with an account. Quiet = no use for ${report.product.quietDays} days`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Have an account" value={s.signedUp.toLocaleString()} />
          <Stat
            label="Still using it"
            value={(s.active - s.newNotUsedYet).toLocaleString()}
            sub={s.newNotUsedYet > 0 ? `plus ${s.newNotUsedYet.toLocaleString()} new, not used yet` : pctText(s.signedUp ? (s.active / s.signedUp) * 100 : null)}
            tone="good"
          />
          <Stat label="Went quiet" value={s.quiet.toLocaleString()} sub={pctText(s.signedUp ? (s.quiet / s.signedUp) * 100 : null)} tone="warn" />
          <Stat label="Never used it" value={s.neverUsed.toLocaleString()} sub={pctText(s.signedUp ? (s.neverUsed / s.signedUp) * 100 : null)} tone="warn" />
          <Stat
            label="Cancelled"
            value={report.product.notApplicable.includes('churn') ? 'n/a' : report.notReported.includes('churn') ? '—' : s.cancelled.toLocaleString()}
            sub={report.product.notApplicable.includes('churn') ? 'nothing to cancel' : report.notReported.includes('churn') ? 'not reported yet' : undefined}
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">How long quiet people lasted</h3>
            <SmallTable head={['Sign-up to last use', 'People']} rows={s.lastedBuckets.filter((x) => x.people > 0).map((x) => [x.label, x.people])} empty="Nobody has gone quiet." />
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">Last thing they did</h3>
            <SmallTable head={['Last use', 'People']} rows={s.lastThingBeforeQuiet.map((x) => [eventLabel(x.event), x.people])} empty="Nobody has gone quiet." />
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">Who came back, by sign-up week</h3>
            <SmallTable
              head={['Week of', 'Signed up', 'Wk 1', 'Wk 2', 'Wk 4', 'Wk 8']}
              rows={s.retention.map((r) => [r.week, r.signedUp, ...r.weeks.map((w) => (w === null ? '·' : pctText(w)))])}
              empty="No sign-ups in this range."
            />
            {s.retention.length > 0 && <p className="mt-1 text-[11px] text-nog-500 dark:text-nog-400">A dot means that week is not over yet.</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <Question
            icon={Sparkles}
            title="What comes before paying?"
            hint={`What ${b.payers.toLocaleString()} payers did in the ${b.lookbackDays} days before their first payment, next to ${b.nonPayers.toLocaleString()} people who have not paid`}
          />
          <SmallTable
            head={['They did this', 'Payers', 'Non-payers', 'How much likelier']}
            rows={b.actions.map((a) => [eventLabel(a.event), pctText(a.payersPct), pctText(a.nonPayersPct), a.lift === null ? 'payers only' : `${a.lift}×`])}
            empty="Nobody has paid yet."
          />
          {b.medianUseDaysBeforePaying !== null && (
            <p className="mt-2 text-sm text-nog-600 dark:text-nog-300">
              A typical payer used it on <span className="font-semibold text-nog-900 dark:text-nog-50">{b.medianUseDaysBeforePaying}</span> different day{b.medianUseDaysBeforePaying === 1 ? '' : 's'} before paying.
            </p>
          )}
        </Card>
        <Card>
          <Question icon={CircleDollarSign} title="What does the move to paying look like?" hint={`First payments in the ${rangeLabel(report.window.days)}`} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="New payers" value={m.payers.toLocaleString()} sub={`paid for the first time · ${m.repeatPayers.toLocaleString()} have paid again`} tone="good" />
            <Stat
              label="Money in"
              value={moneyIn(m.revenueCents, m.payments, m.paymentsWithoutAmount).value}
              sub={moneyIn(m.revenueCents, m.payments, m.paymentsWithoutAmount).note ?? `${m.payments.toLocaleString()} payments, renewals included`}
            />
            <Stat label="Days to pay" value={m.medianDaysSignupToPaid === null ? '—' : String(m.medianDaysSignupToPaid)} sub="typical, from sign-up" />
            <Stat label="Left at checkout" value={m.checkoutAbandoned.toLocaleString()} sub="started, never paid" tone={m.checkoutAbandoned > 0 ? 'warn' : 'plain'} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">Which plan</h3>
              <SmallTable head={['Plan', 'People who paid', 'Money in']} rows={m.plans.map((p) => [eventLabel(p.plan), p.payers, moneyIn(p.revenueCents, p.payments, p.paymentsWithoutAmount).value])} empty="No payments in this range." />
            </div>
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-nog-800 dark:text-nog-100">How long it took</h3>
              <SmallTable head={['Sign-up to first payment', 'People']} rows={m.daysToPayBuckets.filter((x) => x.people > 0).map((x) => [x.label, x.people])} empty="No payments in this range." />
            </div>
          </div>
        </Card>
      </div>

      <p className="px-1 text-xs text-nog-500 dark:text-nog-400">
        {report.totals.events.toLocaleString()} funnel steps from {report.totals.people.toLocaleString()} people
        {report.totals.eventsWithoutId > 0 ? ` · ${report.totals.eventsWithoutId.toLocaleString()} steps had no id and are not counted` : ''}
        {report.totals.olderAccounts > 0 ? ` · ${report.totals.olderAccounts.toLocaleString()} older accounts came back (not counted as new visitors)` : ''}
        {report.totals.lastEventAt ? ` · newest ${new Date(report.totals.lastEventAt).toLocaleString()}` : ''}
        {report.truncated ? ' · too many steps to read them all; the oldest were left out, so numbers are low' : ''} ·{' '}
        <Link className="font-medium text-honey-700 underline-offset-2 hover:underline dark:text-honey-400" to={`/search?q=${encodeURIComponent(`search index=${report.product.slug} funnel_stage=* | stats count by funnel_stage, funnel_event`)}&earliest=-${report.window.days}d`}>
          See the raw steps in Search
        </Link>
      </p>
    </div>
  );
}

export default function FunnelsPage() {
  const [params, setParams] = useSearchParams();
  const product = params.get('product') ?? '';
  const days = RANGES.includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;

  const overview = useQuery({ queryKey: ['funnels', 'overview', days], queryFn: () => getFunnelOverview(days) });
  const report = useQuery({ queryKey: ['funnels', 'report', product, days], queryFn: () => getFunnelReport(product, days), enabled: !!product });

  const set = (next: { product?: string; days?: number }) => {
    const p = new URLSearchParams(params);
    if (next.product !== undefined) next.product ? p.set('product', next.product) : p.delete('product');
    if (next.days !== undefined) p.set('days', String(next.days));
    setParams(p);
  };

  const products = overview.data?.products ?? [];
  const loading = product ? report.isLoading : overview.isLoading;
  const error = product ? report.error : overview.error;

  return (
    <div className="mx-auto max-w-[72rem] space-y-4 p-4 sm:p-6" data-testid="funnels-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-nog-900 dark:text-nog-50">Funnels</h1>
          <p className="text-sm text-nog-500 dark:text-nog-400">Where people come in, where they fall off, and what turns them into customers. Same steps for every product.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/funnels/weekly"
            className="inline-flex items-center gap-1.5 rounded-full border border-nog-200 bg-white px-3 py-1.5 text-sm font-medium text-nog-700 transition-colors duration-200 hover:border-nog-300 hover:bg-nog-50 dark:border-nog-700 dark:bg-nog-800 dark:text-nog-200 dark:hover:bg-nog-700/60"
          >
            <CalendarDays className="h-4 w-4" strokeWidth={2} /> Weekly report
          </Link>
          <Link
            to={`/funnels/board?days=${days}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-nog-200 bg-white px-3 py-1.5 text-sm font-medium text-nog-700 transition-colors duration-200 hover:border-nog-300 hover:bg-nog-50 dark:border-nog-700 dark:bg-nog-800 dark:text-nog-200 dark:hover:bg-nog-700/60"
          >
            <MonitorPlay className="h-4 w-4" strokeWidth={2} /> Board view
          </Link>
        <div className="flex items-center gap-1 rounded-full border border-nog-200 bg-white p-1 dark:border-nog-700 dark:bg-nog-800" role="group" aria-label="Date range">
          {RANGES.map((d) => (
            <Pill key={d} active={days === d} onClick={() => set({ days: d })}>{d} days</Pill>
          ))}
        </div>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-1 rounded-[0.625rem] border border-nog-200 bg-white p-1 dark:border-nog-700 dark:bg-nog-800" aria-label="Product">
        <Pill active={!product} onClick={() => set({ product: '' })}>All products</Pill>
        {products.map((p) => (
          <Pill key={p.product.slug} active={product === p.product.slug} onClick={() => set({ product: p.product.slug })}>
            <ProjectLogo value={p.product.slug} size="xs" />
            {p.product.name}
          </Pill>
        ))}
      </nav>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-nog-500 dark:text-nog-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Counting…
        </div>
      )}
      {!loading && error && (
        <Card className="text-sm text-red-700 dark:text-red-400">Could not load the funnel numbers. Try again in a moment.</Card>
      )}
      {!loading && !error && !product && (
        <div className="space-y-3">
          {products.map((row) => (
            <OverviewCard key={row.product.slug} row={row} onOpen={() => set({ product: row.product.slug })} />
          ))}
          {products.length === 0 && <EmptyState name="any product" />}
          <p className="px-1 text-xs text-nog-500 dark:text-nog-400">
            Each number is people, not clicks. The percentage under it is how many of the step before got that far. Products are never added together: each has its own meaning of "first real use" and "paid".
          </p>
        </div>
      )}
      {!loading && !error && product && report.data && <ProductView report={report.data} />}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getWeeklyFunnelReport, WeeklyFunnelSection, WeeklyFunnelStep } from '../api/client';
import { ProjectLogo } from '../components/ProjectLogo';
import { money, weekChange } from '../utils/funnels';

/**
 * Weekly funnel report (/funnels/weekly): the same report that is emailed
 * every Monday 9:00 AM Eastern, built from live numbers when you open it.
 */

function Steps({ title, steps, color }: { title: string; steps: WeeklyFunnelStep[]; color: string }) {
  const top = steps.find((s) => s.applies)?.people ?? 0;
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-nog-500 dark:text-nog-400">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {steps.map((s) => (
            <tr key={s.stage} className="border-t border-nog-100 dark:border-nog-700/60">
              <td className="w-36 py-1.5 font-medium text-nog-800 dark:text-nog-100">{s.label}</td>
              {s.applies ? (
                <>
                  <td className="w-14 py-1.5 text-right text-base font-bold tabular-nums text-nog-900 dark:text-nog-50">{s.people.toLocaleString()}</td>
                  <td className="py-1.5 pl-3">
                    <div className="h-2.5 overflow-hidden rounded bg-nog-100 dark:bg-nog-900/50">
                      <div className="h-full rounded" style={{ width: `${top > 0 && s.people > 0 ? Math.max(2, (s.people / top) * 100) : 0}%`, backgroundColor: color, opacity: s.reported ? 1 : 0.35 }} />
                    </div>
                    <div className="pt-0.5 text-xs tabular-nums text-nog-500 dark:text-nog-400">
                      {!s.reported
                        ? 'not reported yet'
                        : `${s.pctOfPrevious === null ? 'start' : `${s.pctOfPrevious}% of the step above${s.lost > 0 ? `, ${s.lost.toLocaleString()} lost` : ''}`}${
                            s.peopleBefore === null ? '' : ` · week before: ${s.peopleBefore.toLocaleString()}`
                          }`}
                    </div>
                  </td>
                </>
              ) : (
                <td colSpan={2} className="py-1.5 text-xs italic text-nog-500 dark:text-nog-400">does not apply to this product</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ s }: { s: WeeklyFunnelSection }) {
  return (
    <section className="rounded-[0.625rem] border border-nog-200 bg-white p-4 dark:border-nog-700 dark:bg-nog-800" data-testid={`weekly-${s.product.slug}`}>
      <header className="flex items-center gap-3">
        <ProjectLogo value={s.product.slug} size="md" />
        <h2 className="font-display text-xl font-semibold tracking-tight text-nog-900 dark:text-nog-50">{s.product.name}</h2>
      </header>
      {!s.hasData ? (
        <p className="mt-3 text-sm text-nog-600 dark:text-nog-300">
          <span className="font-semibold text-orange-700 dark:text-orange-400">No real data yet.</span> {s.headline}
        </p>
      ) : (
        <>
          <p className="mt-3 rounded border-l-4 border-honey-500 bg-nog-50 px-3 py-2 text-[15px] text-nog-900 dark:bg-nog-900/40 dark:text-nog-50">{s.headline}</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <Steps title="Getting in" steps={s.getIn} color="#C8862B" />
            <Steps title="Paying" steps={s.pay} color="#5A3F24" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[0.625rem] bg-nog-50 px-3 py-2 dark:bg-nog-900/40">
              <div className="text-[11px] font-medium uppercase tracking-wide text-nog-500 dark:text-nog-400">Went quiet</div>
              <div className="text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-400">{s.quiet.now.toLocaleString()}</div>
              <div className="text-xs text-nog-500 dark:text-nog-400">{weekChange(s.quiet.now, s.quiet.before)}</div>
            </div>
            <div className="rounded-[0.625rem] bg-nog-50 px-3 py-2 dark:bg-nog-900/40">
              <div className="text-[11px] font-medium uppercase tracking-wide text-nog-500 dark:text-nog-400">New payers</div>
              <div className="text-2xl font-bold tabular-nums text-nog-900 dark:text-nog-50">{s.money.newPayers.toLocaleString()}</div>
              <div className="text-xs text-nog-500 dark:text-nog-400">{weekChange(s.money.newPayers, s.money.newPayersBefore)}</div>
            </div>
            <div className="rounded-[0.625rem] bg-nog-50 px-3 py-2 dark:bg-nog-900/40">
              <div className="text-[11px] font-medium uppercase tracking-wide text-nog-500 dark:text-nog-400">Money in</div>
              <div className="text-2xl font-bold tabular-nums text-nog-900 dark:text-nog-50">{money(s.money.revenueCents)}</div>
              <div className="text-xs text-nog-500 dark:text-nog-400">week before: {money(s.money.revenueCentsBefore)}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-nog-500 dark:text-nog-400">
            Went quiet = has an account and has not used {s.product.name} for {s.product.quietDays} days.
            {s.notReported.length > 0 && <span className="text-orange-700 dark:text-orange-400"> Not reported by this product yet: {s.notReported.join(', ').replace(/_/g, ' ')}.</span>}
            {s.truncated && <span className="text-orange-700 dark:text-orange-400"> Too many steps to read them all; numbers are low.</span>}
          </p>
        </>
      )}
    </section>
  );
}

export default function FunnelWeeklyPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['funnels', 'weekly'], queryFn: getWeeklyFunnelReport });
  return (
    <div className="mx-auto max-w-[64rem] space-y-4 p-4 sm:p-6" data-testid="funnel-weekly-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/funnels" className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-honey-700 underline-offset-2 hover:underline dark:text-honey-400">
            <ArrowLeft className="h-4 w-4" /> Funnels
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-nog-900 dark:text-nog-50">Weekly funnel report</h1>
          <p className="text-sm text-nog-500 dark:text-nog-400">
            {data ? `${data.title} · ` : ''}the last 7 days next to the 7 days before. Emailed every Monday at 9:00 AM Eastern.
          </p>
        </div>
      </header>
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-nog-500 dark:text-nog-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Counting…
        </div>
      )}
      {!isLoading && error && (
        <div className="rounded-[0.625rem] border border-nog-200 bg-white p-4 text-sm text-red-700 dark:border-nog-700 dark:bg-nog-800 dark:text-red-400">Could not load the weekly report. Try again in a moment.</div>
      )}
      {data?.sections.map((s) => <Section key={s.product.slug} s={s} />)}
      {data && (
        <p className="px-1 text-xs text-nog-500 dark:text-nog-400">
          Every number is people, not clicks. Each product has its own meaning of "first real use" and "paid", so products are never added together.
        </p>
      )}
    </div>
  );
}

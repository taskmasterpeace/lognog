import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Pause, Play, X } from 'lucide-react';
import { FunnelOverviewRow, FunnelRung, getFunnelOverview } from '../api/client';
import { findProjectBrand } from '../utils/projectBrands';
import { boardSeconds, moneyIn, nextSlide, pctText } from '../utils/funnels';

/**
 * Funnel board (/funnels/board): the smartboard view. One product per slide,
 * led by its logo, type big enough to read from across the room, moving on by
 * itself. The first slide puts every product on one screen. ?seconds=20 sets
 * the pace, ?days=30 the range, ?product=slug pins one, ?product=all holds on
 * the every-product slide, ?label=SAMPLE stamps the screen (for made-up data).
 * Space pauses; the arrow keys step.
 */

function BigLogo({ slug, name }: { slug: string; name: string }) {
  const brand = findProjectBrand(slug);
  const [broken, setBroken] = useState(false);
  if (!brand || broken) return null;
  return (
    <span
      className={`flex h-[14vh] w-[14vh] shrink-0 items-center justify-center overflow-hidden rounded-[2vh] ${brand.lightPlate ? 'bg-nog-50' : 'bg-nog-900'}`}
      style={{ boxShadow: `inset 0 0 0 0.4vh ${brand.accent}` }}
    >
      <img src={brand.logo} alt={`${name} logo`} className="h-full w-full object-contain p-[1vh]" onError={() => setBroken(true)} />
    </span>
  );
}

function Rungs({ title, rungs, tone }: { title: string; rungs: FunnelRung[]; tone: 'honey' | 'cream' }) {
  const top = rungs.find((r) => r.applies)?.people ?? 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-[1.2vh] text-[2.2vh] font-semibold uppercase tracking-[0.12em] text-honey-300">{title}</div>
      <div className="space-y-[1.4vh]">
        {rungs.map((r) => (
          <div key={r.stage} className="flex items-center gap-[1vw]" data-stage={r.stage}>
            <div className="w-[14vw] shrink-0 whitespace-nowrap text-[3vh] font-medium leading-tight text-nog-100">{r.label}</div>
            <div className="w-[6vw] shrink-0 text-right font-display text-[5.4vh] font-semibold leading-none tabular-nums text-nog-50">
              {r.applies ? r.people.toLocaleString() : '—'}
            </div>
            <div className="relative h-[3.4vh] min-w-0 flex-1 overflow-hidden rounded-[0.8vh] bg-nog-800">
              {r.applies && (
                <div
                  className={`absolute inset-y-0 left-0 rounded-[0.8vh] transition-[width] duration-700 ${tone === 'honey' ? 'bg-honey-500' : 'bg-nog-200'}`}
                  style={{ width: `${top > 0 && r.people > 0 ? Math.max(2, (r.people / top) * 100) : 0}%`, opacity: r.reported ? 1 : 0.3 }}
                />
              )}
            </div>
            <div className="w-[9.5vw] shrink-0 whitespace-nowrap text-[2.2vh] tabular-nums text-nog-300">
              {!r.applies ? 'does not apply' : !r.reported ? 'not reported yet' : r.pctOfPrevious === null ? 'start' : `${pctText(r.pctOfPrevious)} made it`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 rounded-[1.4vh] bg-nog-800 px-[1.6vw] py-[1.6vh]">
      <div className="text-[2vh] font-semibold uppercase tracking-[0.1em] text-nog-300">{label}</div>
      <div className="font-display text-[6vh] font-semibold leading-none tabular-nums text-nog-50">{value}</div>
      {sub && <div className="mt-[0.4vh] text-[2vh] text-nog-300">{sub}</div>}
    </div>
  );
}

function Slide({ row, days }: { row: FunnelOverviewRow; days: number }) {
  return (
    <div className="flex h-full flex-col" data-testid={`board-${row.product.slug}`}>
      <div className="flex items-center gap-[2vw]">
        <BigLogo slug={row.product.slug} name={row.product.name} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[8.5vh] font-semibold leading-none tracking-tight text-nog-50">{row.product.name}</h1>
          <p className="mt-[0.8vh] text-[2.6vh] text-nog-300">Where people came in and fell off, last {days} days</p>
        </div>
      </div>
      {row.totals.events === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[4.5vh] text-nog-300">No funnel steps received from {row.product.name} yet.</div>
      ) : (
        <>
          <div className="mt-[4vh] flex flex-1 gap-[4vw]">
            <Rungs title="Getting in" rungs={row.getIn} tone="honey" />
            <Rungs title="Paying" rungs={row.pay} tone="cream" />
          </div>
          <div className="mt-[3vh] flex gap-[1.5vw]">
            <Tile label="Accounts" value={row.stopping.signedUp.toLocaleString()} sub={`${row.stopping.active.toLocaleString()} still using it`} />
            <Tile label="Went quiet" value={row.stopping.quiet.toLocaleString()} sub={`no use for ${row.product.quietDays} days`} />
            <Tile label="New payers" value={row.paid.payers.toLocaleString()} sub={row.paid.medianDaysSignupToPaid === null ? undefined : `${row.paid.medianDaysSignupToPaid} days to pay, typically`} />
            <Tile
              label="Money in"
              value={moneyIn(row.paid.revenueCents, row.paid.payments, row.paid.paymentsWithoutAmount).value}
              sub={moneyIn(row.paid.revenueCents, row.paid.payments, row.paid.paymentsWithoutAmount).note}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The five numbers on the every-product slide, and which earlier one each is measured against. */
const SUMMARY_STEPS: Array<{ ladder: 'getIn' | 'pay'; stage: string; label: string; of?: { ladder: 'getIn' | 'pay'; stage: string; words: string } }> = [
  { ladder: 'getIn', stage: 'visit', label: 'Visited' },
  { ladder: 'getIn', stage: 'signup', label: 'Signed up', of: { ladder: 'getIn', stage: 'visit', words: 'of visitors' } },
  { ladder: 'getIn', stage: 'activate', label: 'First real use', of: { ladder: 'getIn', stage: 'signup', words: 'of sign-ups' } },
  { ladder: 'getIn', stage: 'return', label: 'Came back', of: { ladder: 'getIn', stage: 'activate', words: 'of first uses' } },
  { ladder: 'pay', stage: 'paid', label: 'Paid', of: { ladder: 'pay', stage: 'signup', words: 'of sign-ups' } },
];

/** Every product on one screen: logo, name, and the five numbers that matter most. */
function SummarySlide({ rows, days }: { rows: FunnelOverviewRow[]; days: number }) {
  return (
    <div className="flex h-full flex-col" data-testid="board-all">
      <div className="flex items-end justify-between gap-[2vw]">
        <h1 className="font-display text-[8vh] font-semibold leading-none tracking-tight text-nog-50">Funnels</h1>
        <p className="pb-[0.6vh] text-[2.6vh] text-nog-300">People, not clicks · last {days} days</p>
      </div>
      <div className="mt-[3vh] flex min-h-0 flex-1 flex-col justify-around gap-[2vh]">
        {rows.map((row) => (
          <div key={row.product.slug} className="flex items-center gap-[2vw] rounded-[1.6vh] bg-nog-800 px-[2vw] py-[2vh]" data-product={row.product.slug}>
            <BigLogo slug={row.product.slug} name={row.product.name} />
            <div className="w-[19vw] shrink-0">
              <div className="font-display text-[4.6vh] font-semibold leading-tight text-nog-50">{row.product.name}</div>
              <div className="mt-[0.4vh] text-[2.2vh] text-nog-300">
                {row.totals.events === 0 ? 'no funnel steps yet' : `${row.stopping.quiet.toLocaleString()} went quiet · ${moneyIn(row.paid.revenueCents, row.paid.payments, row.paid.paymentsWithoutAmount).value} in`}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-stretch justify-between gap-[1vw]">
              {SUMMARY_STEPS.map((step) => {
                const r = row[step.ladder].find((x) => x.stage === step.stage);
                const base = step.of ? row[step.of.ladder].find((x) => x.stage === step.of!.stage) : undefined;
                const share = r && base && base.applies && base.reported && base.people > 0 ? `${pctText((r.people / base.people) * 100)} ${step.of!.words}` : null;
                return (
                  <div key={step.stage} className="min-w-0 flex-1 text-center">
                    <div className="truncate text-[2vh] font-semibold uppercase tracking-[0.08em] text-honey-300">{step.label}</div>
                    <div className={`font-display text-[7vh] font-semibold leading-none tabular-nums ${r && r.applies && r.reported ? 'text-nog-50' : 'text-nog-500'}`}>
                      {!r || !r.applies ? '—' : r.people.toLocaleString()}
                    </div>
                    <div className="mt-[0.4vh] text-[2vh] tabular-nums text-nog-300">
                      {!r || !r.applies ? 'does not apply' : !r.reported ? 'not reported yet' : !step.of ? 'start' : share ?? '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="flex flex-1 items-center justify-center text-[4vh] text-nog-300">No products to show.</div>}
      </div>
    </div>
  );
}

export default function FunnelBoardPage() {
  const [params] = useSearchParams();
  const days = [7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const seconds = boardSeconds(params.get('seconds'));
  const pinned = params.get('product');
  const label = (params.get('label') || '').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 24);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const { data, error } = useQuery({
    queryKey: ['funnels', 'board', days],
    queryFn: () => getFunnelOverview(days),
    refetchInterval: 5 * 60 * 1000,
  });
  const all = data?.products ?? [];
  // A slide is one product, or null for the every-product slide.
  const slides: Array<FunnelOverviewRow | null> =
    pinned === 'all' ? [null] : pinned ? all.filter((p) => p.product.slug === pinned) : all.length > 1 ? [null, ...all] : all;
  const count = slides.length;
  const current = count ? slides[index % count] : undefined;

  useEffect(() => {
    if (paused || count < 2) return;
    const t = window.setInterval(() => setIndex((i) => nextSlide(i, count, 1)), seconds * 1000);
    return () => window.clearInterval(t);
  }, [paused, count, seconds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A focused button handles its own Space/Enter; do not also act on it here.
      if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'ArrowRight') setIndex((i) => nextSlide(i, count, 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => nextSlide(i, count, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-nog-900 px-[3.5vw] py-[4vh] text-nog-50" data-testid="funnel-board">
      {label && (
        <div className="pointer-events-none absolute left-1/2 top-[4vh] z-10 -translate-x-1/2 rounded-[1vh] border-[0.4vh] border-honey-400 px-[1.4vw] py-[0.6vh] text-[3.2vh] font-bold uppercase tracking-[0.2em] text-honey-300" data-testid="board-label">
          {label}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {error && !data ? (
          <div className="flex h-full items-center justify-center text-[4vh] text-nog-300">Could not load the funnel numbers. Trying again shortly.</div>
        ) : current === undefined ? (
          <div className="flex h-full items-center justify-center text-[4vh] text-nog-300">{data ? 'No products to show.' : 'Loading…'}</div>
        ) : current === null ? (
          <SummarySlide rows={all} days={days} />
        ) : (
          <Slide key={current.product.slug} row={current} days={days} />
        )}
      </div>
      <footer className="mt-[2.5vh] flex items-center justify-between gap-4">
        <div className="flex items-center gap-[1vw]">
          <img src="/brands/lognog.png" alt="LogNog logo" className="h-[4.5vh] w-[4.5vh] rounded-[0.8vh] object-contain" />
          <span className="text-[2.2vh] text-nog-300">LogNog funnels · people, not clicks</span>
        </div>
        <div className="flex items-center gap-[0.8vw]" role="tablist" aria-label="Products">
          {slides.map((s, i) => (
            <button
              key={s ? s.product.slug : 'all'}
              type="button"
              role="tab"
              aria-selected={i === index % Math.max(count, 1)}
              aria-label={s ? `Show ${s.product.name}` : 'Show every product'}
              title={s ? s.product.name : 'Every product'}
              onClick={() => setIndex(i)}
              className={`h-[1.6vh] rounded-full transition-all duration-300 hover:bg-honey-400 ${i === index % Math.max(count, 1) ? 'w-[5vw] bg-honey-500' : 'w-[1.6vh] bg-nog-600'}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Start moving through products' : 'Stop on this product'}
            title={paused ? 'Start moving through products' : 'Stop on this product'}
            className="rounded-[0.625rem] p-2 text-nog-200 transition-colors hover:bg-nog-800"
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => nextSlide(i, count, 1))}
            aria-label="Next product"
            title="Next product"
            className="rounded-[0.625rem] p-2 text-nog-200 transition-colors hover:bg-nog-800"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <Link to="/funnels" aria-label="Leave the board" title="Leave the board" className="rounded-[0.625rem] p-2 text-nog-200 transition-colors hover:bg-nog-800">
            <X className="h-5 w-5" />
          </Link>
        </div>
      </footer>
    </div>
  );
}

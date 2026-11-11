/**
 * Product funnels: one shared stage language across every product.
 *
 *   GET /funnels/products            the products and what each stage means for them
 *   GET /funnels/report?product=&days=   one product's full funnel report
 *   GET /funnels/overview?days=      every product side by side
 *
 * Read-only. Every query is cut down to the indexes the caller may read.
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import { buildFunnelReport, FunnelReport } from '../services/funnels/compute.js';
import { fetchFunnelEvents } from '../services/funnels/store.js';
import { FUNNEL_PRODUCTS, FUNNEL_VERSION, FunnelProduct, SENT_STAGES, STAGE_LABELS, findFunnelProduct } from '../services/funnels/model.js';

const router = Router();
router.use(authenticate);

const DAY = 86_400_000;
/** Extra history read before the window so returning customers are not counted as new. */
const HISTORY_DAYS = 90;

function parseDays(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(1, n));
}

function canRead(product: FunnelProduct, allowed: string[] | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const lower = allowed.map((i) => String(i).toLowerCase());
  return product.indexes.some((i) => lower.includes(i));
}

async function reportFor(product: FunnelProduct, days: number, allowed: string[] | null | undefined): Promise<FunnelReport & { truncated: boolean }> {
  const now = Date.now();
  const from = now - days * DAY;
  const { events, truncated } = await fetchFunnelEvents(product, from - HISTORY_DAYS * DAY, allowed);
  return { ...buildFunnelReport(product, events, { from, to: now, now }), truncated };
}

router.get('/products', (req: Request, res: Response) => {
  res.json({
    version: FUNNEL_VERSION,
    stages: SENT_STAGES.map((s) => ({ stage: s, label: STAGE_LABELS[s] })),
    products: FUNNEL_PRODUCTS.filter((p) => canRead(p, req.allowedIndexes)).map((p) => ({
      slug: p.slug,
      name: p.name,
      indexes: p.indexes,
      quietDays: p.quietDays,
      activationMeans: p.activationMeans,
      paidMeans: p.paidMeans,
      notApplicable: p.notApplicable,
      strictPrivacy: !!p.strictPrivacy,
    })),
  });
});

router.get('/report', async (req: Request, res: Response) => {
  try {
    const product = findFunnelProduct(String(req.query.product ?? ''));
    if (!product || !canRead(product, req.allowedIndexes)) {
      return res.status(404).json({ error: 'Unknown product' });
    }
    res.json(await reportFor(product, parseDays(req.query.days), req.allowedIndexes));
  } catch (error) {
    console.error('Funnel report error:', error);
    res.status(500).json({ error: 'Could not build the funnel report' });
  }
});

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const days = parseDays(req.query.days);
    const products = FUNNEL_PRODUCTS.filter((p) => canRead(p, req.allowedIndexes));
    const reports = await Promise.all(products.map((p) => reportFor(p, days, req.allowedIndexes)));
    res.json({
      days,
      products: reports.map((r) => ({
        product: r.product,
        totals: r.totals,
        getIn: r.getIn,
        pay: r.pay,
        stopping: { signedUp: r.stopping.signedUp, active: r.stopping.active, quiet: r.stopping.quiet, neverUsed: r.stopping.neverUsed, cancelled: r.stopping.cancelled },
        paid: {
          payers: r.movingToPaid.payers,
          payments: r.movingToPaid.payments,
          paymentsWithoutAmount: r.movingToPaid.paymentsWithoutAmount,
          revenueCents: r.movingToPaid.revenueCents,
          medianDaysSignupToPaid: r.movingToPaid.medianDaysSignupToPaid,
        },
        notReported: r.notReported,
        truncated: r.truncated,
      })),
    });
  } catch (error) {
    console.error('Funnel overview error:', error);
    res.status(500).json({ error: 'Could not build the funnel overview' });
  }
});

export default router;

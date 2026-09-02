/**
 * Per-panel chart formatting, stored in `dashboard_panels.options.format`.
 * Everything is optional; charts fall back to their defaults. Kept small and
 * serialisable so it round-trips through export/import unchanged.
 */

export interface PanelThreshold {
  value: number;
  label?: string;
  /** Any CSS colour; defaults to the severity palette below. */
  color?: string;
}

export interface PanelFormat {
  /** Stack series (area/bar). */
  stacked?: boolean;
  /** Fixed value-axis range; leave undefined for auto. */
  yMin?: number;
  yMax?: number;
  yAxisLabel?: string;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'right';
  /** Horizontal reference lines (area/line/bar). */
  thresholds?: PanelThreshold[];
  /** Unit suffix for single-value / tooltips (e.g. "ms", "%"). */
  unit?: string;
  decimals?: number;
  /** Single value: compare against the previous half of the window and show a sparkline. */
  showTrend?: boolean;
}

export const THRESHOLD_COLORS = ['#b45309', '#c2410c', '#b91c1c'];

/** Read a format object out of raw panel options (which may be a JSON string). */
export function readPanelFormat(options: unknown): PanelFormat {
  let raw = options;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return {}; }
  }
  if (!raw || typeof raw !== 'object') return {};
  const format = (raw as { format?: unknown }).format;
  if (!format || typeof format !== 'object') return {};
  const f = format as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    stacked: f.stacked === true,
    yMin: num(f.yMin),
    yMax: num(f.yMax),
    yAxisLabel: typeof f.yAxisLabel === 'string' ? f.yAxisLabel : undefined,
    showLegend: typeof f.showLegend === 'boolean' ? f.showLegend : undefined,
    legendPosition: f.legendPosition === 'bottom' || f.legendPosition === 'right' ? f.legendPosition : f.legendPosition === 'top' ? 'top' : undefined,
    thresholds: Array.isArray(f.thresholds)
      ? (f.thresholds as unknown[])
          .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
          .filter((t): t is Record<string, unknown> => !!t && Number.isFinite(Number(t.value)))
          .map((t) => ({
            value: Number(t.value),
            label: typeof t.label === 'string' ? t.label : undefined,
            color: typeof t.color === 'string' ? t.color : undefined,
          }))
      : undefined,
    unit: typeof f.unit === 'string' ? f.unit : undefined,
    decimals: num(f.decimals),
    // Tri-state: undefined = default (show trend when the data is a series).
    showTrend: typeof f.showTrend === 'boolean' ? f.showTrend : undefined,
  };
}

/** Format a numeric value for display with the panel's unit/decimals. */
export function formatPanelValue(value: unknown, format: PanelFormat): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  const text = format.decimals !== undefined
    ? n.toLocaleString(undefined, { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals })
    : n.toLocaleString();
  return format.unit ? `${text}${format.unit.startsWith('%') ? '' : ' '}${format.unit}` : text;
}

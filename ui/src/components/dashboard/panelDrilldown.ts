/**
 * Per-panel drilldown + refresh configuration, stored in a panel's free-form
 * `options` JSON (no backend schema change):
 *   options.drilldown       = { type: 'search'|'dashboard'|'url', target, newTab? }
 *   options.refresh_seconds = number (auto-refresh this panel independently)
 *
 * The drilldown `target` is a template with tokens substituted from the click:
 *   $click.value$  the clicked value        $click.field$  the clicked field
 *   $row.<name>$   another field on the row  $earliest$/$latest$  the time range
 */

export type DrilldownType = 'search' | 'dashboard' | 'url';

export interface DrilldownConfig {
  type: DrilldownType;
  target: string;
  newTab?: boolean;
}

export interface DrilldownContext {
  field: string;
  value: string;
  row?: Record<string, unknown>;
  earliest?: string;
  latest?: string;
}

export function readDrilldownConfig(options: unknown): DrilldownConfig | null {
  if (!options || typeof options !== 'object') return null;
  const d = (options as Record<string, unknown>).drilldown;
  if (!d || typeof d !== 'object') return null;
  const { type, target, newTab } = d as Record<string, unknown>;
  if (
    (type === 'search' || type === 'dashboard' || type === 'url') &&
    typeof target === 'string' &&
    target.trim() !== ''
  ) {
    return { type, target, newTab: !!newTab };
  }
  return null;
}

export function readRefreshSeconds(options: unknown): number | null {
  if (!options || typeof options !== 'object') return null;
  const raw = (options as Record<string, unknown>).refresh_seconds;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function substituteTokens(template: string, ctx: DrilldownContext): string {
  return template
    .replace(/\$click\.value\$/g, ctx.value ?? '')
    .replace(/\$click\.field\$/g, ctx.field ?? '')
    .replace(/\$earliest\$/g, ctx.earliest ?? '')
    .replace(/\$latest\$/g, ctx.latest ?? '')
    .replace(/\$row\.([a-zA-Z0-9_.-]+)\$/g, (_match, name: string) => {
      const v = ctx.row?.[name];
      return v === undefined || v === null ? '' : String(v);
    });
}

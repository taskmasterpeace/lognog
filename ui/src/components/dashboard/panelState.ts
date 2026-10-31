// Small, pure rules behind the dashboard panels (tested in ui/tests/panel-state.test.ts).

export const LOGNOG_HONEY = '#C8862B';

/** Spinner only before a panel's first answer; later refreshes keep the last numbers on screen. */
export function showFirstLoadSpinner(data: { loading: boolean; loadedOnce?: boolean }): boolean {
  return data.loading && !data.loadedOnce;
}

/** A refresh (or a new time range) is in flight over numbers already on screen: dim them and spin the icon. */
export function isRefreshingInPlace(data: { loading: boolean; loadedOnce?: boolean }): boolean {
  return data.loading && !!data.loadedOnce;
}

/**
 * Series colours for a dashboard. A dashboard with an accent colour (a product
 * dashboard) leads with it; one without keeps the LogNog palette.
 */
export function seriesColors(accent: string | undefined, palette: string[]): string[] {
  if (!accent) return palette;
  return [accent, ...palette.filter((c) => c.toLowerCase() !== accent.toLowerCase())];
}

/** The main single-series colour: the dashboard's accent, else LogNog honey. */
export function mainColor(accent: string | undefined): string {
  return accent || LOGNOG_HONEY;
}

/** A 429 from the search route: worth a quiet retry rather than an error tile. */
export function isBusyError(message: string): boolean {
  return /too many requests/i.test(message);
}

export const BUSY_RETRY_LIMIT = 3;

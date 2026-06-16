// Shared LogNog brand chart palette + theme-aware chart chrome colors.
// Single source of truth for chart colors — see ui/BRANDING.md §2.4.
//
// Order matters: first series = most prominent. Lead warm (honey/chocolate),
// then harmonized secondaries. Severity/log-level colors live elsewhere and are
// functional — this palette is for generic categorical chart series.

/** Ordered brand chart palette (BRANDING.md §2.4). */
export const CHART_PALETTE: string[] = [
  '#C8862B', // honey-500 — primary accent
  '#5A3F24', // nog-600 — chocolate
  '#DCA23E', // honey-400
  '#8B7355', // nog-500 — warm brown
  '#0D9488', // teal-600 (functional secondary)
  '#16A34A', // green-600 (functional secondary)
  '#A66A1E', // honey-600
  '#D4C4B0', // nog-300 — muted tan
];

/** Default single-series / bar accent color. */
export const CHART_ACCENT = '#C8862B'; // honey-500

/**
 * Non-semantic intensity ramp for activity heatmaps (low → high).
 * Warm honey gradient: nog-100 cream → honey-400 gold → honey-700 deep caramel.
 */
export const HEATMAP_HONEY_RAMP: [string, string, string] = [
  '#F5F0E8', // nog-100
  '#DCA23E', // honey-400
  '#845117', // honey-700
];

/**
 * Theme-aware colors for chart chrome (axes, gridlines, labels, tooltips).
 * Derived from the warm `nog` ramp so charts never go cool-grey.
 */
export interface ChartTheme {
  /** Primary label / title text. */
  text: string;
  /** Muted / secondary label text. */
  textMuted: string;
  /** Axis line color. */
  axis: string;
  /** Gridline / split-line color. */
  grid: string;
  /** Tooltip background. */
  tooltipBg: string;
  /** Tooltip border. */
  tooltipBorder: string;
  /** axisPointer crosshair label background. */
  axisPointerBg: string;
  /** Zebra split-area shading (two alternating warm tints). */
  splitArea: [string, string];
}

const DARK: ChartTheme = {
  text: '#D4C4B0',        // nog-300
  textMuted: '#B8A68E',   // nog-400
  axis: '#5A3F24',        // nog-600
  grid: '#3D2A18',        // nog-700
  tooltipBg: 'rgba(45, 31, 19, 0.95)',  // nog-800
  tooltipBorder: '#5A3F24', // nog-600
  axisPointerBg: '#5A3F24', // nog-600
  splitArea: ['rgba(61, 42, 24, 0.2)', 'rgba(90, 63, 36, 0.2)'], // nog-700/nog-600 tints
};

const LIGHT: ChartTheme = {
  text: '#5A3F24',        // nog-600
  textMuted: '#8B7355',   // nog-500
  axis: '#E8DFD0',        // nog-200
  grid: '#E8DFD0',        // nog-200
  tooltipBg: 'rgba(255, 255, 255, 0.95)',
  tooltipBorder: '#E8DFD0', // nog-200
  axisPointerBg: '#8B7355', // nog-500
  splitArea: ['rgba(250, 248, 245, 0.6)', 'rgba(245, 240, 232, 0.6)'], // nog-50/nog-100 tints
};

/** Get theme-aware chart chrome colors for the active mode. */
export function getChartTheme(darkMode: boolean): ChartTheme {
  return darkMode ? DARK : LIGHT;
}

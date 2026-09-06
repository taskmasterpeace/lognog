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

// ---------------------------------------------------------------------------
// Severity (syslog 0–7) — the ONE source of truth per BRANDING.md §2.3.
// Every severity badge, chip, swatch, and chart series must come from here;
// this replaces four contradictory ad-hoc schemes (StatsPage, LogViewer,
// FieldSidebar, docs) that had four severities collapsed into identical honey.
// ---------------------------------------------------------------------------

export interface SeverityTone {
  /** Syslog level name. */
  name: string;
  /** Chart series color. 0–2 are shades of red (BRANDING groups them as red;
   *  slight shade variance keeps adjacent chart slices distinguishable). */
  hex: string;
  /** Badge classes (text + bg + ring), light and dark. */
  badge: string;
  /** Chip classes (text + bg + border), light and dark — facet/filter style. */
  chip: string;
  /** Subtle full-row tint, light and dark. */
  row: string;
}

export const SEVERITY_TONES: SeverityTone[] = [
  { name: 'Emergency', hex: '#B91C1C',
    badge: 'text-red-700 bg-red-100 ring-red-600/30 dark:text-red-400 dark:bg-red-950 dark:ring-red-800',
    chip: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
    row: 'bg-red-50/50 dark:bg-red-950/30' },
  { name: 'Alert', hex: '#DC2626',
    badge: 'text-red-700 bg-red-100 ring-red-600/30 dark:text-red-400 dark:bg-red-950 dark:ring-red-800',
    chip: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
    row: 'bg-red-50/50 dark:bg-red-950/30' },
  { name: 'Critical', hex: '#EF4444',
    badge: 'text-red-700 bg-red-100 ring-red-600/30 dark:text-red-400 dark:bg-red-950 dark:ring-red-800',
    chip: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
    row: 'bg-red-50/50 dark:bg-red-950/30' },
  { name: 'Error', hex: '#EA580C',
    badge: 'text-orange-700 bg-orange-100 ring-orange-600/30 dark:text-orange-400 dark:bg-orange-950 dark:ring-orange-800',
    chip: 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800',
    row: 'bg-orange-50/50 dark:bg-orange-950/30' },
  { name: 'Warning', hex: '#CA8A04',
    badge: 'text-amber-700 bg-amber-100 ring-amber-600/30 dark:text-amber-400 dark:bg-amber-950 dark:ring-amber-800',
    chip: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
    row: 'bg-amber-50/50 dark:bg-amber-950/30' },
  { name: 'Notice', hex: '#16A34A',
    badge: 'text-green-700 bg-green-100 ring-green-600/30 dark:text-green-400 dark:bg-green-950 dark:ring-green-800',
    chip: 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800',
    row: 'bg-green-50/50 dark:bg-green-950/30' },
  { name: 'Info', hex: '#0D9488',
    badge: 'text-teal-700 bg-teal-100 ring-teal-600/30 dark:text-teal-400 dark:bg-teal-950 dark:ring-teal-800',
    chip: 'text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-950 dark:border-teal-800',
    row: 'bg-teal-50/50 dark:bg-teal-950/30' },
  { name: 'Debug', hex: '#78716C',
    badge: 'text-stone-700 bg-stone-100 ring-stone-600/30 dark:text-stone-300 dark:bg-stone-800 dark:ring-stone-700',
    chip: 'text-stone-700 bg-stone-50 border-stone-200 dark:text-stone-300 dark:bg-stone-800 dark:border-stone-700',
    row: 'bg-stone-50/50 dark:bg-stone-800/30' },
];

/** Chart hex colors indexed by severity 0–7. */
export const SEVERITY_HEX: string[] = SEVERITY_TONES.map(t => t.hex);

/** Severity names indexed 0–7. */
export const SEVERITY_NAMES: string[] = SEVERITY_TONES.map(t => t.name);

const NEUTRAL_TONE: SeverityTone = {
  name: 'Unknown', hex: '#8B7355',
  badge: 'text-nog-700 bg-nog-100 ring-nog-600/30 dark:text-nog-300 dark:bg-nog-800 dark:ring-nog-700',
  chip: 'text-nog-700 bg-nog-50 border-nog-200 dark:text-nog-300 dark:bg-nog-800 dark:border-nog-700',
  row: 'bg-nog-50/50 dark:bg-nog-800/50',
};

/** Safe accessor: tone for a severity level, neutral nog for out-of-range. */
export function severityTone(level: number): SeverityTone {
  return Number.isInteger(level) && level >= 0 && level <= 7 ? SEVERITY_TONES[level] : NEUTRAL_TONE;
}

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

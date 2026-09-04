import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authFetch } from '../api/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
  Edit3,
  X,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart,
  Table2,
  Hash,
  ChevronDown,
  Grid3X3,
  Gauge,
  Play,
  Pause,
  Palette,
  Share2,
  Settings,
  Move,
  Download,
  Sparkles,
  Variable,
  Copy,
  Cloud,
  Maximize2,
  Minimize2,
  Circle,
  GitMerge,
  LayoutGrid,
  Folder,
  Star,
  ArrowLeft,
  MoreVertical,
  LayoutDashboard,
  Radar as RadarIcon,
  Workflow,
  TrendingUp,
} from 'lucide-react';
import { AreaChart, BarChart, PieChart, ScatterChart, FunnelChart, TreemapChart, StatCard, RadarChart, SankeyChart } from '../components/charts';
import { readPanelFormat, formatPanelValue, THRESHOLD_COLORS, type PanelFormat } from '../components/dashboard/panelFormat';
import { readDrilldownConfig, readRefreshSeconds, type DrilldownType } from '../components/dashboard/panelDrilldown';
import { downloadCsv } from '../components/dashboard/csvExport';
import { useTheme } from '../contexts/ThemeContext';
import {
  getDashboard,
  executeSearch,
  createDashboardPanel,
  updateDashboardPanel,
  deleteDashboardPanel,
  updateDashboardLayout,
  getDashboardVariables,
  getHealth,
  getDashboardVariableOptions,
  previewDashboardVariableOptions,
  updateDashboardVariable,
  deleteDashboardVariable,
  exportDashboard,
  duplicateDashboard,
  createDashboardPage,
  updateDashboardPage,
  deleteDashboardPage,
  DashboardPanel,
  DashboardPage,
  DashboardVariable as APIDashboardVariable,
} from '../api/client';
import { HeatmapChart, HeatmapData } from '../components/charts/HeatmapChart';
import { GaugeChart } from '../components/charts/GaugeChart';
import { WordCloudChart } from '../components/charts/WordCloudChart';
import TimePickerEnhanced from '../components/TimePickerEnhanced';
import {
  DashboardGrid,
  DashboardHeader,
  DashboardBrandingModal,
  DashboardShareModal,
  DashboardVariablesBar,
  VariableEditorModal,
  PaginatedTable,
  useDrilldown,
  AIInsightsPanel,
  type PanelLayout,
  type DashboardVariable,
} from '../components/dashboard';
import { InfoTip } from '../components/ui/InfoTip';
import { Tooltip as FloatingTooltip } from '../components/ui/Tooltip';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useToast } from '../contexts/ToastContext';
import PanelCopyModal from '../components/PanelCopyModal';
import PanelProvenanceModal from '../components/PanelProvenanceModal';
import { getDefaultDashboard, setDefaultDashboard } from './DashboardsPage';

// LogNog brand colors - honey-gold theme
const CHART_COLORS = ['#C8862B', '#DCA23E', '#A66A1E', '#E6BB63', '#845117', '#5A3F24', '#8B7355', '#D4C4B0'];

const VISUALIZATION_OPTIONS = [
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { value: 'pie', label: 'Pie Chart', icon: PieChartIcon },
  { value: 'line', label: 'Area Chart', icon: LineChart },
  { value: 'stat', label: 'Single Stat', icon: Hash },
  { value: 'heatmap', label: 'Heatmap', icon: Grid3X3 },
  { value: 'gauge', label: 'Gauge', icon: Gauge },
  { value: 'wordcloud', label: 'Word Cloud', icon: Cloud },
  { value: 'scatter', label: 'Scatter Plot', icon: Circle },
  { value: 'funnel', label: 'Funnel Chart', icon: GitMerge },
  { value: 'treemap', label: 'Treemap', icon: LayoutGrid },
  { value: 'linechart', label: 'Line Chart', icon: TrendingUp },
  { value: 'radar', label: 'Radar', icon: RadarIcon },
  { value: 'sankey', label: 'Sankey', icon: Workflow },
];

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
];

interface PanelData {
  results: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
}

/**
 * Long-form split-by result (time, splitBy, value) -> wide rows keyed by
 * time with one column per splitBy value. Returns null when the shape
 * doesn't match (no split column, or too many distinct values to chart).
 */
function pivotSplitBy(
  rows: Record<string, unknown>[],
  timeKey: string,
  valueKey: string,
  keys: string[]
): { rows: Record<string, unknown>[]; series: string[] } | null {
  const splitKey = keys.find((k) => k !== timeKey && k !== valueKey);
  if (!splitKey || keys.length !== 3) return null;
  const series = Array.from(new Set(rows.map((r) => String(r[splitKey] ?? '(empty)'))));
  if (series.length < 2 || series.length > 12) return null;
  const byTime = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const t = String(r[timeKey]);
    const wide = byTime.get(t) ?? { [timeKey]: r[timeKey] };
    wide[String(r[splitKey] ?? '(empty)')] = Number(r[valueKey]) || 0;
    byTime.set(t, wide);
  }
  const out = Array.from(byTime.values()).map((w) => {
    for (const s of series) if (!(s in w)) w[s] = 0;
    return w;
  });
  return { rows: out, series };
}

function PanelVisualization({
  panel,
  data,
  onRefresh,
  onDrilldown,
}: {
  panel: DashboardPanel;
  data: PanelData;
  onRefresh: () => void;
  onDrilldown?: (field: string, value: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  if (data.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-honey-500 animate-spin" />
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
        <p className="text-sm text-red-600">{data.error}</p>
        <button onClick={onRefresh} className="mt-2 text-xs text-honey-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data.results || data.results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-nog-400">
        No data
      </div>
    );
  }

  const results = data.results;
  const keys = Object.keys(results[0] || {});
  // ClickHouse returns numeric aggregates as strings, so `typeof === 'number'`
  // silently fails. Detect numeric columns by whether their values parse as
  // finite numbers across the result set.
  const isNumericColumn = (k: string) =>
    results.some((r) => r[k] !== null && r[k] !== '' && Number.isFinite(Number(r[k])));
  const numericKeys = keys.filter(isNumericColumn);
  const valueKey =
    keys.find((k) => /^(count|count_all|total|value|sum|avg|min|max)$/i.test(k) && isNumericColumn(k)) ||
    numericKeys[0] ||
    keys[keys.length - 1];
  const labelKey = keys.find((k) => k !== valueKey) || keys[0];
  // Series columns for time/multi-series charts: every numeric column except the label/time axis.
  const seriesKeys = (numericKeys.filter((k) => k !== labelKey).length > 0
    ? numericKeys.filter((k) => k !== labelKey)
    : [valueKey]);

  const handleChartClick = (chartData: Record<string, unknown>) => {
    if (onDrilldown && labelKey && chartData[labelKey]) {
      onDrilldown(labelKey, String(chartData[labelKey]));
    }
  };

  // Per-panel formatting (stack, axis range, legend, thresholds, unit …).
  const format = readPanelFormat((panel as { options?: unknown }).options);
  const thresholdLines = format.thresholds?.map((t, i) => ({
    ...t,
    color: t.color || THRESHOLD_COLORS[Math.min(i, THRESHOLD_COLORS.length - 1)],
  }));

  switch (panel.visualization) {
    case 'bar':
      // Rows came back but the aggregate is empty for every one of them
      // (e.g. sum() over a field that isn't numeric): a chart of zero-width
      // bars on a 0–1 axis says nothing — say what happened instead.
      if (!results.some((item) => Number(item[valueKey]) > 0)) {
        return (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center text-nog-400">
            <p className="text-sm">No numeric values in <code className="font-mono text-xs">{valueKey}</code> for this range.</p>
            <p className="text-xs mt-1">The query returned {results.length} {results.length === 1 ? 'row' : 'rows'}, all zero or empty.</p>
          </div>
        );
      }
      return (
        <BarChart
          data={results.map((item) => ({
            category: String(item[labelKey] || ''),
            value: Number(item[valueKey]) || 0,
          }))}
          height={200}
          horizontal={true}
          barColor="#C8862B"
          darkMode={isDarkMode}
          showValues={false}
          valueMin={format.yMin}
          valueMax={format.yMax}
          xAxisLabel={format.yAxisLabel}
          thresholds={thresholdLines}
          onBarClick={(category) => {
            const item = results.find((r) => String(r[labelKey]) === category);
            if (item) handleChartClick(item);
          }}
        />
      );

    case 'pie': {
      const pieData = results.map((item) => ({
        // An empty/null label is real information ("no value"), not "Item N".
        name: item[labelKey] === null || item[labelKey] === undefined || item[labelKey] === '' ? '(empty)' : String(item[labelKey]),
        value: Number(item[valueKey]) || 0,
      }));
      return (
        <div className="flex h-full">
          <div className="w-3/5">
            <PieChart
              data={pieData}
              height={200}
              donut={true}
              showLegend={false}
              darkMode={isDarkMode}
              colors={CHART_COLORS}
              onItemClick={(name) => {
                const index = pieData.findIndex((p) => p.name === name);
                const item = results[index];
                if (item && onDrilldown) handleChartClick(item);
              }}
            />
          </div>
          <div className="flex-1 flex flex-col justify-center gap-1 pr-2 overflow-y-auto">
            {pieData.slice(0, 6).map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="truncate text-nog-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'area':
    case 'linechart':
    case 'line': {
      // `timechart count by severity` comes back long-form: one row per
      // (bucket, severity) with a single value column. Splunk pivots that into
      // one series per split-by value; without the pivot the split-by column
      // itself was drawn as a series ("severity" line next to "count").
      const pivot = pivotSplitBy(results, labelKey, valueKey, keys);
      const chartData = pivot ? pivot.rows : results;
      const chartSeries = pivot
        ? pivot.series.map((name, i) => ({ name, dataKey: name, color: CHART_COLORS[i % CHART_COLORS.length] }))
        : seriesKeys.map((k, i) => ({ name: k, dataKey: k, color: CHART_COLORS[i % CHART_COLORS.length] }));
      // Axis labels: times only within a day or two, dates beyond that.
      const xs = chartData.map((r) => new Date(String(r[labelKey]).replace(' ', 'T')).getTime()).filter((t) => !isNaN(t));
      const spanMs = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
      const xFmt = (v: unknown) => {
        const s = String(v);
        if (!/\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const d = new Date(s.replace(' ', 'T'));
        if (isNaN(d.getTime())) return s.slice(0, 10);
        if (spanMs > 2 * 86_400_000) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      };
      return (
        <AreaChart
          data={chartData}
          series={chartSeries}
          xAxisKey={labelKey}
          height={200}
          darkMode={isDarkMode}
          fill={panel.visualization !== 'linechart'}
          stacked={format.stacked}
          yMin={format.yMin}
          yMax={format.yMax}
          yAxisLabel={format.yAxisLabel}
          showLegend={format.showLegend ?? chartSeries.length > 1}
          legendPosition={format.legendPosition}
          thresholds={thresholdLines}
          xAxisFormatter={xFmt}
        />
      );
    }

    case 'single':
    case 'stat': {
      // A time series (e.g. `timechart count`) becomes a single value with a
      // trend: latest bucket vs the bucket before, with the whole series as a
      // sparkline — Splunk's single-value-with-trendline.
      const timeKey = keys.find((k) => /(^|_)(time|timestamp|bucket|date)$/i.test(k) || k === '_time');
      const isSeries = results.length > 1 && !!timeKey && isNumericColumn(valueKey);
      if (isSeries && format.showTrend !== false) {
        const points = results.map((r) => Number(r[valueKey]) || 0);
        // The newest bucket is usually still filling (the current hour/day), so
        // comparing it against a complete one reads as a phantom collapse.
        // Compare the last two COMPLETE buckets instead when the newest bucket
        // started less than one span ago.
        const times = results.map((r) => new Date(String(r[timeKey!]).replace(' ', 'T')).getTime());
        const span = times.length > 1 ? times[times.length - 1] - times[times.length - 2] : 0;
        const lastIsPartial = span > 0 && Date.now() - times[times.length - 1] < span;
        const endIdx = lastIsPartial && points.length > 2 ? points.length - 2 : points.length - 1;
        const current = points[endIdx];
        const previous = endIdx > 0 ? points[endIdx - 1] : undefined;
        return (
          <div className="h-full">
            <StatCard
              title=""
              value={current}
              previousValue={previous}
              unit={format.unit}
              format="custom"
              customFormatter={(v) => formatPanelValue(v, { ...format, unit: undefined })}
              sparklineData={points}
              height={190}
              darkMode={isDarkMode}
              trendLabel={lastIsPartial ? 'vs previous (last complete bucket)' : 'vs previous'}
              color="#C8862B"
            />
          </div>
        );
      }

      // Show the metric value (numeric column), not the first column — for
      // `stats count by hostname` the first column is the hostname string.
      const raw = results[0] ? results[0][valueKey] : 0;
      const num = Number(raw);
      const statValue = Number.isFinite(num) ? num : raw;
      const thresholdHit = typeof statValue === 'number' && thresholdLines
        ? [...thresholdLines].sort((a, b) => b.value - a.value).find((t) => statValue >= t.value)
        : undefined;
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold text-nog-900 dark:text-nog-100" style={thresholdHit ? { color: thresholdHit.color } : undefined}>
            {typeof statValue === 'number' ? formatPanelValue(statValue, format) : String(statValue ?? 0)}
          </p>
          {results.length === 1 && labelKey !== valueKey && results[0][labelKey] != null && (
            <p className="text-xs text-nog-500 mt-1 truncate max-w-full">{String(results[0][labelKey])}</p>
          )}
          {thresholdHit?.label && (
            <p className="text-xs mt-1 font-medium" style={{ color: thresholdHit.color }}>{thresholdHit.label}</p>
          )}
        </div>
      );
    }

    case 'heatmap': {
      // Derive hour/day from a real time column when present. Never fabricate
      // positions from the row index — that produced plausible-looking but
      // meaningless plots for queries without hour/day fields.
      const timeKey = keys.find((k) => /(^|_)(time|timestamp|bucket|date)/i.test(k));
      const hasHour = keys.includes('hour') || keys.includes('day') || !!timeKey;
      if (!hasHour) {
        return (
          <div className="flex items-center justify-center h-full text-nog-400 text-sm text-center px-4">
            Heatmap needs an <code className="mx-1">hour</code>/<code className="mx-1">day</code> or time field.
            Try <code className="mx-1">bin _time span=1h</code> in the query.
          </div>
        );
      }
      const heatmapData: HeatmapData[] = results.map((item) => {
        const t = timeKey && item[timeKey] != null ? new Date(String(item[timeKey])) : null;
        const hour = item.hour != null && Number.isFinite(Number(item.hour))
          ? Number(item.hour)
          : t && !isNaN(t.getTime()) ? t.getHours() : 0;
        const day = item.day != null && Number.isFinite(Number(item.day))
          ? Number(item.day)
          : t && !isNaN(t.getTime()) ? t.getDay() : 0;
        const value = Number(item[valueKey]) || Number(item.count) || Number(item.value) || 0;
        return { hour, day, value };
      });
      return (
        <div className="h-full w-full">
          <HeatmapChart data={heatmapData} height={240} darkMode={isDarkMode} />
        </div>
      );
    }

    case 'gauge':
      // Handle both number and string values from API (ClickHouse returns strings)
      const gaugeValue = results[0]
        ? Number(Object.values(results[0]).find(v => v !== null && v !== '' && !isNaN(Number(v))) || 0)
        : 0;
      // Use custom max from options, or calculate based on value
      const gaugeOptions = (panel as any).options || {};
      const maxGaugeValue = gaugeOptions.max ?? Math.max(gaugeValue * 1.2, 100);
      // Use custom thresholds if provided, otherwise default to proportional
      const gaugeThresholds = gaugeOptions.thresholds
        ? { low: gaugeOptions.thresholds.low, medium: gaugeOptions.thresholds.medium, high: gaugeOptions.thresholds.high ?? maxGaugeValue }
        : { low: maxGaugeValue * 0.33, medium: maxGaugeValue * 0.66, high: maxGaugeValue };
      return (
        <div className="h-full w-full flex flex-col items-center justify-center">
          <GaugeChart
            value={gaugeValue}
            max={maxGaugeValue}
            height={200}
            darkMode={isDarkMode}
            thresholds={gaugeThresholds}
            unit={gaugeOptions.unit || ''}
            title={gaugeOptions.subtitle}
          />
        </div>
      );

    case 'wordcloud':
      // Transform data for word cloud: first column = name, second column = value
      const wordCloudData = results.map(row => {
        const values = Object.values(row);
        return {
          name: String(values[0] || ''),
          value: Number(values[1]) || 1,
        };
      }).filter(item => item.name);
      return (
        <div className="h-full w-full">
          <WordCloudChart
            data={wordCloudData}
            height={240}
            darkMode={isDarkMode}
            onWordClick={(word) => {
              if (onDrilldown && keys.length > 0) {
                onDrilldown(keys[0], word);
              }
            }}
          />
        </div>
      );

    case 'scatter': {
      // Scatter plot: needs x, y values. Look for numeric columns
      const numericKeys = keys.filter(k => typeof results[0][k] === 'number');
      const xKey = numericKeys[0] || keys[0];
      const yKey = numericKeys[1] || numericKeys[0] || keys[1] || keys[0];
      const nameKey = keys.find(k => !numericKeys.includes(k)) || keys[0];

      const scatterData = results.map(row => ({
        x: Number(row[xKey]) || 0,
        y: Number(row[yKey]) || 0,
        name: String(row[nameKey] || ''),
      }));

      return (
        <div className="h-full w-full">
          <ScatterChart
            data={scatterData}
            height={220}
            darkMode={isDarkMode}
            xAxisLabel={xKey}
            yAxisLabel={yKey}
            onPointClick={(point) => {
              if (onDrilldown && nameKey && point.name) {
                onDrilldown(nameKey, point.name);
              }
            }}
          />
        </div>
      );
    }

    case 'funnel': {
      // Funnel: first column = stage name, second column = value
      const funnelData = results.map(row => ({
        name: String(row[labelKey] || ''),
        value: Number(row[valueKey]) || 0,
      })).filter(item => item.name);

      return (
        <div className="h-full w-full">
          <FunnelChart
            data={funnelData}
            height={220}
            darkMode={isDarkMode}
            onStageClick={(name) => {
              if (onDrilldown && labelKey) {
                onDrilldown(labelKey, name);
              }
            }}
          />
        </div>
      );
    }

    case 'treemap': {
      // Treemap: first column = name, second column = value
      const treemapData = results.map(row => ({
        name: String(row[labelKey] || ''),
        value: Number(row[valueKey]) || 0,
      })).filter(item => item.name && item.value > 0);

      return (
        <div className="h-full w-full">
          <TreemapChart
            data={treemapData}
            height={220}
            darkMode={isDarkMode}
            onNodeClick={(node) => {
              if (onDrilldown && labelKey) {
                onDrilldown(labelKey, node.name);
              }
            }}
          />
        </div>
      );
    }

    case 'radar': {
      const radarData = results
        .map((r) => ({ category: String(r[labelKey] ?? ''), value: Number(r[valueKey]) || 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      return (
        <RadarChart
          data={radarData}
          height={240}
          darkMode={isDarkMode}
          seriesName={valueKey}
          onPointClick={(category) => {
            const item = results.find((r) => String(r[labelKey]) === category);
            if (item) handleChartClick(item);
          }}
        />
      );
    }

    case 'sankey': {
      // Needs two dimension columns + a value: the first two non-value keys
      // become source/target and the value column sets the band width. (A
      // numeric dimension like severity is still a valid category here.)
      const catKeys = keys.filter((k) => k !== valueKey);
      if (catKeys.length < 2) {
        return (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center text-nog-400">
            <p className="text-sm">Sankey needs two categories.</p>
            <p className="text-xs mt-1">Try <code className="font-mono text-xs">| stats count by field_a field_b</code>.</p>
          </div>
        );
      }
      const [srcKey, tgtKey] = catKeys;
      const links = results.map((r) => ({
        source: String(r[srcKey] ?? ''),
        target: String(r[tgtKey] ?? ''),
        value: Number(r[valueKey]) || 0,
      }));
      return <SankeyChart data={links} height={260} darkMode={isDarkMode} />;
    }

    case 'table':
    default:
      return (
        <PaginatedTable
          data={results}
          pageSize={10}
          format={format}
          onRowClick={(row) => {
            if (onDrilldown && keys.length > 0) {
              const firstKey = keys[0];
              if (row[firstKey]) {
                onDrilldown(firstKey, String(row[firstKey]));
              }
            }
          }}
        />
      );
  }
}

function PanelCard({
  panel,
  data,
  onEdit,
  onDelete,
  onDuplicate,
  onRefresh,
  onDrilldown,
  onFullscreen,
  onViewOrigin,
  editMode,
}: {
  panel: DashboardPanel;
  data: PanelData;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onDrilldown?: (field: string, value: string, panel: DashboardPanel) => void;
  onFullscreen?: () => void;
  onViewOrigin?: () => void;
  editMode?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRefreshSeconds = readRefreshSeconds(panel.options);

  // Per-panel auto-refresh: this panel re-runs on its own interval, independent
  // of the dashboard-wide auto-refresh.
  useEffect(() => {
    if (!panelRefreshSeconds || editMode) return;
    const timer = setInterval(onRefresh, panelRefreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [panelRefreshSeconds, editMode, onRefresh]);
  const vizOption = VISUALIZATION_OPTIONS.find(v => v.value === panel.visualization) || VISUALIZATION_OPTIONS[0];
  const VizIcon = vizOption.icon;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <div className="card flex flex-col h-full group">
      <div className={`flex items-center justify-between p-3 border-b border-nog-100 dark:border-nog-700 ${editMode ? 'panel-drag-handle cursor-move' : ''}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          {editMode && <Move className="w-4 h-4 text-nog-400 dark:text-nog-400 flex-shrink-0" />}
          <VizIcon className="w-4 h-4 text-nog-400 dark:text-nog-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-nog-900 dark:text-nog-100 text-sm leading-tight break-words" title={panel.title}>{panel.title}</h3>
            {panel.description && (
              <p className="text-xs text-nog-500 dark:text-nog-400 truncate" title={panel.description}>
                {panel.description}
              </p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 flex-shrink-0 ${editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} ref={menuRef}>
          {panelRefreshSeconds && (
            <span
              className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-honey-700 dark:text-honey-300 bg-honey-100 dark:bg-honey-900/40"
              title={`This panel auto-refreshes every ${panelRefreshSeconds}s`}
            >
              <RefreshCw className="w-2.5 h-2.5" />
              {panelRefreshSeconds}s
            </span>
          )}
          <button onClick={onRefresh} className="p-1.5 text-nog-400 dark:text-nog-400 hover:text-nog-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-nog-400 dark:text-nog-400 hover:text-nog-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded"
              title="More actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-nog-800 border border-nog-200 dark:border-nog-600 rounded-lg shadow-lg z-50 py-1 animate-fade-in">
                {onFullscreen && (
                  <button
                    onClick={() => { onFullscreen(); setShowMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-nog-700 dark:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 flex items-center gap-2"
                  >
                    <Maximize2 className="w-4 h-4" />
                    Fullscreen
                  </button>
                )}
                {onViewOrigin && (
                  <button
                    onClick={() => { onViewOrigin(); setShowMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-nog-700 dark:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 flex items-center gap-2"
                  >
                    <GitMerge className="w-4 h-4" />
                    View Origin
                  </button>
                )}
                <button
                  onClick={() => { onEdit(); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-nog-700 dark:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => { onDuplicate(); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-nog-700 dark:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
                <button
                  onClick={() => { downloadCsv(panel.title, data.results || []); setShowMenu(false); }}
                  disabled={!data.results || data.results.length === 0}
                  className="w-full px-3 py-2 text-left text-sm text-nog-700 dark:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>
                <div className="border-t border-nog-200 dark:border-nog-600 my-1" />
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 p-3 min-h-0 overflow-y-auto">
        <PanelVisualization
          panel={panel}
          data={data}
          onRefresh={onRefresh}
          onDrilldown={onDrilldown ? (field, value) => onDrilldown(field, value, panel) : undefined}
        />
      </div>
    </div>
  );
}

// Page Editor Modal for creating/editing dashboard pages
function PageEditorModal({
  page,
  onSave,
  onCancel,
}: {
  page: DashboardPage | null;
  onSave: (name: string, icon?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(page?.name || '');
  const [icon, setIcon] = useState(page?.icon || '');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-nog-900 dark:text-nog-100">
              {page ? 'Edit Page' : 'Add Page'}
            </h3>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="modal-body space-y-4">
          <div>
            <label className="text-sm font-medium text-nog-700 dark:text-nog-200 mb-1.5 block">
              Page Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., User Acquisition, Revenue, API Health"
              className="input"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-nog-700 dark:text-nog-200 mb-1.5 block">
              Icon (optional emoji)
            </label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g., 📈 or 💰"
              className="input"
              maxLength={4}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onSave(name, icon || undefined)}
            disabled={!name.trim()}
            className="btn-primary"
          >
            {page ? 'Save' : 'Create Page'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PanelSaveData {
  title: string;
  query: string;
  visualization: string;
  description?: string;
  page_id?: string | null;
  options?: Record<string, unknown>;
}

interface PanelEditorProps {
  panel?: DashboardPanel;
  pages?: DashboardPage[];
  /** Page pre-selected for a new panel (the tab the user is looking at). */
  defaultPageId?: string | null;
  onSave: (data: PanelSaveData) => void;
  onCancel: () => void;
  saving: boolean;
}

const FORMATTABLE_VIZ = new Set(['area', 'line', 'bar', 'stat', 'single']);

function PanelEditor({ panel, pages = [], defaultPageId = null, onSave, onCancel, saving }: PanelEditorProps) {
  const [title, setTitle] = useState(panel?.title || '');
  const [description, setDescription] = useState(panel?.description || '');
  const [query, setQuery] = useState(panel?.query || 'search * | stats count by hostname');
  const [visualization, setVisualization] = useState(panel?.visualization || 'bar');
  const [pageId, setPageId] = useState<string>(panel ? (panel.page_id || '') : (defaultPageId || ''));
  const existingOptions = (panel as { options?: Record<string, unknown> } | undefined)?.options;
  const [format, setFormat] = useState<PanelFormat>(() => readPanelFormat(existingOptions));
  const [showFormat, setShowFormat] = useState(() => Object.values(readPanelFormat(existingOptions)).some((v) => v !== undefined && v !== false));
  // Thresholds are edited as free text ("100, 250:Critical") to stay compact.
  const [thresholdText, setThresholdText] = useState(() =>
    (readPanelFormat(existingOptions).thresholds || []).map((t) => (t.label ? `${t.value}:${t.label}` : String(t.value))).join(', ')
  );
  // Drilldown + per-panel refresh (stored in options.drilldown / options.refresh_seconds).
  const [drilldownType, setDrilldownType] = useState<'' | DrilldownType>(() => readDrilldownConfig(existingOptions)?.type || '');
  const [drilldownTarget, setDrilldownTarget] = useState(() => readDrilldownConfig(existingOptions)?.target || '');
  const [drilldownNewTab, setDrilldownNewTab] = useState(() => !!readDrilldownConfig(existingOptions)?.newTab);
  const [refreshSeconds, setRefreshSeconds] = useState<string>(() => {
    const r = readRefreshSeconds(existingOptions);
    return r ? String(r) : '';
  });

  const parseThresholds = (text: string): PanelFormat['thresholds'] => {
    const parsed = text.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
      const [valuePart, ...labelParts] = entry.split(':');
      const value = Number(valuePart);
      return Number.isFinite(value) ? { value, label: labelParts.join(':').trim() || undefined } : null;
    }).filter((t): t is { value: number; label: string | undefined } => t !== null);
    return parsed.length > 0 ? parsed : undefined;
  };

  const handleSubmit = () => {
    if (title && query) {
      const cleaned: PanelFormat = { ...format, thresholds: parseThresholds(thresholdText) };
      // Drop unset keys so the stored options stay minimal.
      const formatOut = Object.fromEntries(
        Object.entries(cleaned).filter(([, v]) => v !== undefined && v !== '' && v !== false)
      );
      const options: Record<string, unknown> = { ...(existingOptions || {}) };
      if (Object.keys(formatOut).length > 0) options.format = formatOut; else delete options.format;

      // Drilldown config.
      if (drilldownType && drilldownTarget.trim()) {
        options.drilldown = { type: drilldownType, target: drilldownTarget.trim(), newTab: drilldownNewTab };
      } else {
        delete options.drilldown;
      }
      // Per-panel refresh interval.
      const rs = Number(refreshSeconds);
      if (Number.isFinite(rs) && rs > 0) options.refresh_seconds = rs;
      else delete options.refresh_seconds;

      onSave({ title, query, visualization, description: description || undefined, page_id: pageId || null, options });
    }
  };

  const numberOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v));

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-nog-900 dark:text-nog-100">
              {panel ? 'Edit Panel' : 'Add Panel'}
            </h3>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
              Title
              <InfoTip
                content="Display name for this panel shown in the dashboard"
                placement="right"
              />
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Panel title"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-nog-700 dark:text-nog-200 mb-1.5">
              Description
              <InfoTip
                content="Optional description shown below the panel title"
                placement="right"
              />
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this panel shows"
              className="input"
            />
          </div>

          {pages.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
                Page
                <InfoTip
                  content="Which tab this panel appears on. 'All pages' panels show on every tab."
                  placement="right"
                />
              </label>
              <select
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="input"
              >
                <option value="">All pages</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
              Query
              <InfoTip
                content={
                  <div className="space-y-1">
                    <p>DSL query to fetch data for this panel. Use aggregation queries for charts.</p>
                    <p className="text-xs opacity-80 mt-2">Tip: Use <code className="bg-nog-800 px-1 rounded">$variable$</code> syntax to reference dashboard variables</p>
                  </div>
                }
                code="search * | stats count by hostname
search error | timechart span=1h count"
                placement="right"
              />
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search * | stats count by hostname"
              rows={3}
              className="input font-mono text-sm resize-none"
            />
            <p className="text-xs text-nog-500 mt-1">
              Use $variable$ syntax to reference dashboard variables. Use aggregation queries for charts.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
              Visualization
              <InfoTip
                content={
                  <div className="space-y-1 text-xs">
                    <p><strong>Table:</strong> Display raw results in a tabular format</p>
                    <p><strong>Bar Chart:</strong> Compare values across categories</p>
                    <p><strong>Pie Chart:</strong> Show proportions of a whole</p>
                    <p><strong>Area Chart:</strong> Display trends over time</p>
                    <p><strong>Single Stat:</strong> Show one key metric prominently</p>
                    <p><strong>Heatmap:</strong> Visualize patterns in 2D data</p>
                    <p><strong>Gauge:</strong> Display a metric with min/max range</p>
                    <p><strong>Word Cloud:</strong> Visualize word frequency from aggregated data</p>
                  </div>
                }
                placement="right"
              />
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {VISUALIZATION_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <FloatingTooltip
                    key={option.value}
                    content={option.label}
                    placement="top"
                  >
                    <button
                      onClick={() => setVisualization(option.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        visualization === option.value
                          ? 'border-honey-500 bg-honey-50 dark:bg-honey-900/30 text-honey-700 dark:text-honey-300'
                          : 'border-nog-200 dark:border-nog-600 hover:border-nog-300 dark:hover:border-nog-500 text-nog-600 dark:text-nog-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{option.label}</span>
                    </button>
                  </FloatingTooltip>
                );
              })}
            </div>
          </div>

          {/* Format (Splunk-style chart formatting) */}
          {FORMATTABLE_VIZ.has(visualization) && (
            <div className="border border-nog-200 dark:border-nog-700 rounded-lg">
              <button
                type="button"
                onClick={() => setShowFormat((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-nog-700 dark:text-nog-200"
              >
                <span>Format</span>
                <span className="text-xs text-nog-500">{showFormat ? 'Hide' : 'Axis, legend, thresholds, units'}</span>
              </button>
              {showFormat && (
                <div className="px-3 pb-3 grid grid-cols-2 gap-3 text-sm">
                  {(visualization === 'area' || visualization === 'line') && (
                    <label className="flex items-center gap-2 col-span-2">
                      <input type="checkbox" checked={!!format.stacked} onChange={(e) => setFormat({ ...format, stacked: e.target.checked })} className="w-4 h-4 rounded border-nog-300" />
                      <span className="text-nog-700 dark:text-nog-300">Stack series</span>
                    </label>
                  )}
                  {visualization !== 'stat' && visualization !== 'single' && (
                    <>
                      <div>
                        <label className="block text-xs text-nog-500 mb-1">Axis min</label>
                        <input type="number" value={format.yMin ?? ''} onChange={(e) => setFormat({ ...format, yMin: numberOrUndefined(e.target.value) })} placeholder="auto" className="input" />
                      </div>
                      <div>
                        <label className="block text-xs text-nog-500 mb-1">Axis max</label>
                        <input type="number" value={format.yMax ?? ''} onChange={(e) => setFormat({ ...format, yMax: numberOrUndefined(e.target.value) })} placeholder="auto" className="input" />
                      </div>
                      <div>
                        <label className="block text-xs text-nog-500 mb-1">Axis label</label>
                        <input type="text" value={format.yAxisLabel ?? ''} onChange={(e) => setFormat({ ...format, yAxisLabel: e.target.value || undefined })} placeholder="Requests / min" className="input" />
                      </div>
                    </>
                  )}
                  {(visualization === 'area' || visualization === 'line') && (
                    <div>
                      <label className="block text-xs text-nog-500 mb-1">Legend</label>
                      <select
                        value={format.showLegend === false ? 'hidden' : (format.legendPosition || 'top')}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormat({ ...format, showLegend: v !== 'hidden', legendPosition: v === 'hidden' ? format.legendPosition : (v as PanelFormat['legendPosition']) });
                        }}
                        className="input"
                      >
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="right">Right</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-nog-500 mb-1">Unit</label>
                    <input type="text" value={format.unit ?? ''} onChange={(e) => setFormat({ ...format, unit: e.target.value || undefined })} placeholder="ms, %, req/s" className="input" />
                  </div>
                  <div>
                    <label className="block text-xs text-nog-500 mb-1">Decimals</label>
                    <input type="number" min={0} max={6} value={format.decimals ?? ''} onChange={(e) => setFormat({ ...format, decimals: numberOrUndefined(e.target.value) })} placeholder="auto" className="input" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-nog-500 mb-1">Thresholds</label>
                    <input
                      type="text"
                      value={thresholdText}
                      onChange={(e) => setThresholdText(e.target.value)}
                      placeholder="100:Warning, 250:Critical"
                      className="input font-mono text-sm"
                    />
                    <p className="text-xs text-nog-500 mt-1">Comma-separated <code>value:label</code>. Drawn as reference lines; a single value turns colour past them.</p>
                  </div>
                  {(visualization === 'stat' || visualization === 'single') && (
                    <label className="flex items-center gap-2 col-span-2">
                      <input type="checkbox" checked={format.showTrend !== false} onChange={(e) => setFormat({ ...format, showTrend: e.target.checked })} className="w-4 h-4 rounded border-nog-300" />
                      <span className="text-nog-700 dark:text-nog-300">Show trend + sparkline when the query is a time series (e.g. <code>timechart count</code>)</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Drilldown + per-panel refresh (apply to every visualization) */}
          <div className="border-t border-nog-100 dark:border-nog-700 pt-4">
            <div className="text-sm font-medium text-nog-700 dark:text-nog-200 mb-2">Drilldown &amp; refresh</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-nog-500 mb-1">On click</label>
                <select value={drilldownType} onChange={(e) => setDrilldownType(e.target.value as '' | DrilldownType)} className="input">
                  <option value="">Default (search this field)</option>
                  <option value="search">Custom search</option>
                  <option value="dashboard">Another dashboard</option>
                  <option value="url">External URL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-nog-500 mb-1">Auto-refresh (seconds)</label>
                <input type="number" min={0} value={refreshSeconds} onChange={(e) => setRefreshSeconds(e.target.value)} placeholder="off" className="input" />
              </div>
              {drilldownType && (
                <div className="col-span-2">
                  <label className="block text-xs text-nog-500 mb-1">
                    {drilldownType === 'search' ? 'Search query' : drilldownType === 'dashboard' ? 'Dashboard id or path' : 'URL'}
                  </label>
                  <input
                    type="text"
                    value={drilldownTarget}
                    onChange={(e) => setDrilldownTarget(e.target.value)}
                    placeholder={
                      drilldownType === 'search'
                        ? 'search source.ip=$click.value$ | stats count'
                        : drilldownType === 'dashboard'
                        ? '/dashboards/<id>?ip=$click.value$'
                        : 'https://ipinfo.io/$click.value$'
                    }
                    className="input font-mono text-sm"
                  />
                  <p className="text-xs text-nog-500 mt-1">
                    Tokens: <code>$click.value$</code>, <code>$click.field$</code>, <code>$row.&lt;field&gt;$</code>, <code>$earliest$</code>, <code>$latest$</code>.
                  </p>
                  <label className="flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={drilldownNewTab} onChange={(e) => setDrilldownNewTab(e.target.checked)} className="w-4 h-4 rounded border-nog-300" />
                    <span className="text-nog-700 dark:text-nog-300 text-sm">Open in a new tab</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title || !query || saving}
            className="btn-primary"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {panel ? 'Save Changes' : 'Add Panel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardViewPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { drilldown, drilldownConfigured } = useDrilldown();
  const { confirm } = useConfirm();
  const toast = useToast();

  const [timeRange, setTimeRange] = useState('-24h');
  const [timeRangeLatest, setTimeRangeLatest] = useState<string>('now');
  // Per-panel request sequence numbers, so a slow in-flight fetch can't clobber
  // a newer one (race guard for auto-refresh + manual + time/variable changes).
  const panelFetchSeq = useRef<Record<string, number>>({});
  const [showAutoRefreshDropdown, setShowAutoRefreshDropdown] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const [showPanelEditor, setShowPanelEditor] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DashboardPanel | undefined>();
  const [panelData, setPanelData] = useState<Record<string, PanelData>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isRefreshPaused, setIsRefreshPaused] = useState(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // New state for enhanced features
  const [editMode, setEditMode] = useState(false);
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVariableEditor, setShowVariableEditor] = useState(false);
  const [editingVariable, setEditingVariable] = useState<APIDashboardVariable | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [showPageEditor, setShowPageEditor] = useState(false);
  const [editingPage, setEditingPage] = useState<DashboardPage | null>(null);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const dashboardGridRef = useRef<HTMLDivElement>(null);
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [showPanelCopyModal, setShowPanelCopyModal] = useState(false);
  const [provenancePanel, setProvenancePanel] = useState<{ id: string; title: string } | null>(null);

  // The router reuses this component when navigating between dashboards, so
  // per-dashboard UI state must be reset explicitly. A page selected on
  // dashboard A otherwise keeps filtering dashboard B's panels (which has no
  // such page) down to nothing, with the tab bar hidden and no way out.
  useEffect(() => {
    setSelectedPageId(null);
    setEditMode(false);
    setFullscreenPanel(null);
    setVariableValues({});
  }, [id]);

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(id!),
    enabled: !!id,
  });

  const { data: variables = [], isFetched: variablesFetched } = useQuery({
    queryKey: ['dashboard-variables', id],
    queryFn: () => getDashboardVariables(id!),
    enabled: !!id,
  });

  // Backend health, polled while the dashboard is open. When the log store is
  // down every panel would otherwise show the same opaque error and
  // auto-refresh would keep hammering a dead database (and the rate limit).
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: false,
  });
  // `store` is the configured log store (ClickHouse or SQLite); older APIs only report `clickhouse`.
  const storeDown = !!health && (health.services?.store ?? health.services?.clickhouse) !== 'ok';
  const storeDownRef = useRef(false);
  storeDownRef.current = storeDown;

  // Convert API variables to component format
  const dashboardVariables: DashboardVariable[] = useMemo(() => {
    return variables.map((v: APIDashboardVariable) => ({
      id: v.id || v.name,
      name: v.name,
      label: v.label || v.name,
      type: v.type as DashboardVariable['type'],
      default_value: v.default_value,
      query: v.query,
      options: v.type === 'custom'
        ? Array.from(new Set((v.custom_values || v.default_value || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean)))
        : undefined,
      multi_select: !!v.multi_select,
      include_all: !!v.include_all,
    }));
  }, [variables]);

  // Dropdown options come from the API (query variables run their search over
  // the dashboard's current time range). Stable identity matters: the bar
  // re-fetches when this callback changes.
  const getVariableOptions = useCallback(
    (variableId: string) => getDashboardVariableOptions(id!, variableId, { earliest: timeRange, latest: timeRangeLatest }),
    [id, timeRange, timeRangeLatest]
  );

  // Initialize variable values from defaults
  useEffect(() => {
    const defaults: Record<string, string> = {};
    dashboardVariables.forEach((v) => {
      if (v.default_value && !variableValues[v.name]) {
        defaults[v.name] = v.default_value;
      }
    });
    if (Object.keys(defaults).length > 0) {
      setVariableValues((prev) => ({ ...prev, ...defaults }));
    }
  }, [dashboardVariables]);

  // Substitute `$name$` tokens in a panel query.
  //
  // Multi-select values arrive comma-joined and "All" arrives as `*`, neither
  // of which can be dropped into `field=$name$` verbatim (`hostname=a,b` is a
  // parse error). When the token is the right-hand side of `field=`:
  //   - `*` / empty      -> the clause is removed (no filter)
  //   - several values   -> `field IN ("a", "b")`
  //   - one value        -> `field="a"`
  // Bare tokens elsewhere get the raw value.
  const substituteVariables = useCallback((query: string): string => {
    const quote = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
    let result = query;
    for (const variable of dashboardVariables) {
      const name = variable.name;
      const raw = variableValues[name] ?? variable.default_value ?? '';
      const values = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const isAll = raw === '*' || values.includes('*') || values.length === 0;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      result = result.replace(new RegExp(`(\\w+)\\s*=\\s*\\$${escaped}\\$`, 'g'), (_m, field: string) => {
        if (isAll) return '*';
        if (values.length > 1) return `${field} IN (${values.map(quote).join(', ')})`;
        return `${field}=${quote(values[0])}`;
      });
      result = result.replace(new RegExp(`\\$${escaped}\\$`, 'g'), isAll ? '*' : values.join(','));
    }
    // A token with no matching variable (deleted, or typo'd in the query)
    // must never reach the parser as a literal `$`: treat it as "All".
    result = result.replace(/(\w+)\s*=\s*\$[A-Za-z0-9_]+\$/g, '*').replace(/\$[A-Za-z0-9_]+\$/g, '*');
    return result;
  }, [variableValues, dashboardVariables]);

  const createPanelMutation = useMutation({
    mutationFn: (data: PanelSaveData) => createDashboardPanel(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPanelEditor(false);
    },
    onError: (err) => toast.error('Panel Not Saved', err instanceof Error ? err.message : 'Unknown error'),
  });

  const updatePanelMutation = useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: PanelSaveData }) =>
      updateDashboardPanel(id!, panelId, data as Partial<DashboardPanel>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPanelEditor(false);
      setEditingPanel(undefined);
    },
    onError: (err) => toast.error('Panel Not Saved', err instanceof Error ? err.message : 'Unknown error'),
  });

  const deletePanelMutation = useMutation({
    mutationFn: (panelId: string) => deleteDashboardPanel(id!, panelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  const duplicatePanelMutation = useMutation({
    mutationFn: (panel: DashboardPanel) =>
      createDashboardPanel(id!, {
        title: `${panel.title} (Copy)`,
        query: panel.query,
        visualization: panel.visualization,
        position: {
          x: (panel.position_x ?? 0) + 1,
          y: panel.position_y ?? 0,
          width: panel.width ?? 4,
          height: panel.height ?? 4,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  const updateLayoutMutation = useMutation({
    mutationFn: (layout: Array<{ panelId: string; x: number; y: number; w: number; h: number }>) =>
      updateDashboardLayout(id!, layout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateDashboard(id!),
    onSuccess: (newDashboard) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      navigate(`/dashboards/${newDashboard.id}`);
    },
  });

  // Page mutations
  const createPageMutation = useMutation({
    mutationFn: ({ name, icon }: { name: string; icon?: string }) =>
      createDashboardPage(id!, name, { icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPageEditor(false);
      setEditingPage(null);
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: ({ pageId, updates }: { pageId: string; updates: { name?: string; icon?: string } }) =>
      updateDashboardPage(id!, pageId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPageEditor(false);
      setEditingPage(null);
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: (pageId: string) => deleteDashboardPage(id!, pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setSelectedPageId(null);
    },
  });

  const fetchPanelData = useCallback(async (panel: DashboardPanel) => {
    // Sequence guard: a slow older request must not overwrite a newer one for
    // the same panel (auto-refresh + manual refresh + time/variable changes can
    // otherwise land stale results for the wrong range).
    const seq = (panelFetchSeq.current[panel.id] || 0) + 1;
    panelFetchSeq.current[panel.id] = seq;

    setPanelData((prev) => ({
      ...prev,
      [panel.id]: { results: prev[panel.id]?.results || [], loading: true, error: null },
    }));

    try {
      const queryWithVars = substituteVariables(panel.query);
      const result = await executeSearch(queryWithVars, timeRange, timeRangeLatest);
      if (panelFetchSeq.current[panel.id] !== seq) return; // superseded
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { results: result.results, loading: false, error: null },
      }));
    } catch (err) {
      if (panelFetchSeq.current[panel.id] !== seq) return; // superseded
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { results: [], loading: false, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [timeRange, timeRangeLatest, substituteVariables]);

  // Refetch only when something that affects RESULTS changes (queries, time,
  // variables, refresh) — not on every layout drag/resize, which merely changes
  // panel positions and previously triggered a full refetch storm.
  const panelQuerySignature = dashboard?.panels
    ?.map((p) => `${p.id}:${p.query}`)
    .join('|');
  useEffect(() => {
    // Wait for the variable definitions: fetching before they arrive sent
    // panel queries with literal `$host$` tokens (a 400 per panel, then a
    // second, correct fetch once variables loaded).
    if (dashboard?.panels && variablesFetched) {
      dashboard.panels.forEach((panel) => {
        fetchPanelData(panel);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelQuerySignature, timeRange, timeRangeLatest, refreshKey, fetchPanelData, variableValues, variablesFetched]);

  const handleRefreshAll = () => {
    setRefreshKey((k) => k + 1);
  };

  // Auto-refresh effect with countdown
  useEffect(() => {
    // Clear any existing countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (autoRefreshInterval > 0 && !isRefreshPaused) {
      // Initialize countdown
      const totalSeconds = Math.floor(autoRefreshInterval / 1000);
      setCountdownSeconds(totalSeconds);

      // Countdown ticker - runs every second
      countdownIntervalRef.current = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            // Time to refresh — unless the store is down, in which case wait
            // for the next tick rather than refiring every panel into an error.
            if (!storeDownRef.current) setRefreshKey((k) => k + 1);
            return totalSeconds; // Reset countdown
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    } else {
      setCountdownSeconds(0);
    }
  }, [autoRefreshInterval, isRefreshPaused]);

  // Pause auto-refresh on user interaction with dashboard
  const handleDashboardInteraction = useCallback(() => {
    if (autoRefreshInterval > 0 && !isRefreshPaused) {
      setIsRefreshPaused(true);
      // Resume after 30 seconds of no interaction
      setTimeout(() => {
        setIsRefreshPaused(false);
      }, 30000);
    }
  }, [autoRefreshInterval, isRefreshPaused]);

  const handleEditPanel = (panel: DashboardPanel) => {
    setEditingPanel(panel);
    setShowPanelEditor(true);
  };

  const handleSavePanel = (data: PanelSaveData) => {
    if (editingPanel) {
      updatePanelMutation.mutate({ panelId: editingPanel.id, data });
    } else {
      createPanelMutation.mutate(data);
    }
  };

  const handleLayoutChange = (newLayout: PanelLayout[]) => {
    if (!editMode) return;

    const layoutUpdate = newLayout.map((item) => ({
      panelId: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));

    updateLayoutMutation.mutate(layoutUpdate);
  };

  const handleDrilldown = (field: string, value: string, panel?: DashboardPanel) => {
    const config = panel ? readDrilldownConfig(panel.options) : null;
    if (config) {
      drilldownConfigured(config, { field, value, earliest: timeRange, latest: timeRangeLatest });
    } else {
      drilldown({ field, value, timeRange, timeRangeLatest });
    }
  };

  const handleExport = async () => {
    if (!id) return;
    try {
      const exportData = await exportDashboard(id);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dashboard?.name || 'dashboard'}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleExportPdf = async () => {
    if (!dashboardGridRef.current || !dashboard) return;

    setIsExportingPdf(true);

    try {
      // Wait for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const element = dashboardGridRef.current;

      // Capture the dashboard as canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: document.documentElement.classList.contains('dark') ? '#1E150E' : '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Calculate PDF dimensions (A4 landscape or portrait based on aspect ratio)
      const aspectRatio = imgWidth / imgHeight;
      const isLandscape = aspectRatio > 1;

      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Add header with dashboard name and export date
      const headerHeight = 15;
      pdf.setFontSize(18);
      pdf.setTextColor(40);
      pdf.text(dashboard.name, 10, 12);

      pdf.setFontSize(10);
      pdf.setTextColor(120);
      pdf.text(`Exported: ${new Date().toLocaleString()}`, 10, 18);
      pdf.text(`Time Range: ${timeRange}`, pageWidth - 50, 18);

      // Draw a separator line
      pdf.setDrawColor(200);
      pdf.line(10, headerHeight + 5, pageWidth - 10, headerHeight + 5);

      // Calculate image dimensions to fit page
      const availableHeight = pageHeight - headerHeight - 20; // 20mm for margins
      const availableWidth = pageWidth - 20; // 10mm margin on each side

      let finalWidth = availableWidth;
      let finalHeight = (imgHeight / imgWidth) * finalWidth;

      if (finalHeight > availableHeight) {
        finalHeight = availableHeight;
        finalWidth = (imgWidth / imgHeight) * finalHeight;
      }

      // Center the image
      const xOffset = (pageWidth - finalWidth) / 2;
      const yOffset = headerHeight + 10;

      // Add the dashboard image
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

      // Add footer with page number
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`Generated by LogNog`, 10, pageHeight - 5);
      pdf.text(`Page 1 of 1`, pageWidth - 25, pageHeight - 5);

      // Save the PDF
      pdf.save(`${dashboard.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Convert panels to layout format (filtered by selected page)
  const panelLayouts: PanelLayout[] = useMemo(() => {
    if (!dashboard?.panels) return [];
    const filteredPanels = dashboard.panels.filter(
      panel => !selectedPageId || panel.page_id === selectedPageId
    );
    return filteredPanels.map((panel, index) => ({
      id: panel.id,
      x: panel.position_x ?? (index % 3) * 4,
      y: panel.position_y ?? Math.floor(index / 3) * 4,
      w: panel.width ?? 4,
      h: panel.height ?? 4,
    }));
  }, [dashboard?.panels, selectedPageId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-honey-500 animate-spin mb-4" />
        <p className="text-nog-600">Loading dashboard...</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-8">
        <div className="card border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-900">Failed to load dashboard</p>
          <p className="text-sm text-red-700 mt-1">{String(error)}</p>
          <Link to="/dashboards" className="mt-4 inline-block text-sm text-honey-600 hover:underline">
            Back to Dashboards
          </Link>
        </div>
      </div>
    );
  }

  // selectedPreset moved to TimePickerEnhanced component

  const isDefaultDashboard = getDefaultDashboard() === id;

  return (
    <div className="min-h-full bg-nog-50 dark:bg-nog-900 flex flex-col">
      {/* Default Dashboard Banner */}
      {isDefaultDashboard && (
        <div className="bg-gradient-to-r from-honey-500 to-honey-600 text-nog-900 px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-current" />
            <span>This is your default dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboards?all=true"
              className="flex items-center gap-1 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              View all dashboards
            </Link>
            <button
              onClick={() => {
                setDefaultDashboard(null);
                queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
              }}
              className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs"
            >
              Remove default
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <DashboardHeader
        name={dashboard.name}
        description={dashboard.description}
        logoUrl={dashboard.logo_url}
        accentColor={dashboard.accent_color}
        headerColor={dashboard.header_color}
        backLink="/dashboards"
        actions={
          <div className="flex items-center gap-2">
            {/* Open this dashboard in the Studio to add/edit panels visually. */}
            <button
              onClick={() => navigate(`/dashboards/studio?dashboard=${id}`)}
              className="btn-secondary"
              title="Edit in Dashboard Studio"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 text-sm">Studio</span>
            </button>
            {/* Variables — always available so the FIRST variable can be created
                (previously gated on length > 0, an unbreakable chicken-and-egg). */}
            <button
              onClick={() => setShowVariableEditor(true)}
              className="btn-secondary"
              title={dashboardVariables.length > 0 ? 'Edit variables' : 'Add a variable'}
            >
              <Variable className="w-4 h-4" />
              {dashboardVariables.length > 0 && (
                <span className="ml-1 text-xs">{dashboardVariables.length}</span>
              )}
            </button>

            {/* Time Range Selector - Enhanced */}
            <TimePickerEnhanced
              onRangeChange={(earliest, latest) => {
                setTimeRange(earliest);
                setTimeRangeLatest(latest || 'now');
              }}
              defaultRange={timeRange}
            />

            {/* Auto-Refresh Selector with Countdown */}
            <div className="relative">
              <button
                onClick={() => setShowAutoRefreshDropdown(!showAutoRefreshDropdown)}
                className={`btn-secondary ${autoRefreshInterval > 0 ? (isRefreshPaused ? 'text-honey-600 border-honey-300' : 'text-green-600 border-green-300') : ''}`}
              >
                {autoRefreshInterval > 0 ? (
                  isRefreshPaused ? (
                    <Pause className="w-4 h-4 text-honey-500" />
                  ) : (
                    <Play className="w-4 h-4 text-green-500" />
                  )
                ) : (
                  <Pause className="w-4 h-4 text-nog-400" />
                )}
                <span className="hidden sm:inline">
                  {autoRefreshInterval > 0 && countdownSeconds > 0 ? (
                    <span className="tabular-nums">
                      {isRefreshPaused ? 'Paused' : `${countdownSeconds}s`}
                    </span>
                  ) : (
                    AUTO_REFRESH_OPTIONS.find(o => o.value === autoRefreshInterval)?.label || 'Auto-refresh'
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-nog-400" />
              </button>

              {showAutoRefreshDropdown && (
                <div className="dropdown right-0 w-44 animate-fade-in">
                  {AUTO_REFRESH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setAutoRefreshInterval(option.value);
                        setIsRefreshPaused(false);
                        setShowAutoRefreshDropdown(false);
                      }}
                      className={`dropdown-item ${
                        autoRefreshInterval === option.value ? 'bg-honey-50 dark:bg-honey-900/30 text-honey-600 font-medium' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {autoRefreshInterval > 0 && (
                    <>
                      <div className="border-t border-nog-100 dark:border-nog-700 my-1" />
                      <button
                        onClick={() => {
                          setIsRefreshPaused(!isRefreshPaused);
                          setShowAutoRefreshDropdown(false);
                        }}
                        className="dropdown-item"
                      >
                        {isRefreshPaused ? (
                          <>
                            <Play className="w-4 h-4 text-green-500" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="w-4 h-4 text-honey-500" />
                            Pause
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleRefreshAll} className="btn-secondary">
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Share button - prominent */}
            <button
              onClick={() => setShowShareModal(true)}
              className="btn-secondary text-honey-600 border-honey-200 hover:bg-honey-50 dark:text-honey-400 dark:border-honey-800 dark:hover:bg-honey-900/30"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Actions dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                className="btn-secondary"
              >
                <Settings className="w-4 h-4" />
                <ChevronDown className="w-4 h-4 text-nog-400" />
              </button>

              {showActionsDropdown && (
                <div className="dropdown right-0 w-48 animate-fade-in">
                  {dashboard.is_owner === false && (
                    <div className="px-3 py-2 text-xs text-nog-500 dark:text-nog-400 border-b border-nog-100 dark:border-nog-700">
                      Owned by another user — view only. Duplicate it to make changes.
                    </div>
                  )}
                  {dashboard.is_owner !== false && (
                    <button
                      onClick={() => { setEditMode(!editMode); setShowActionsDropdown(false); }}
                      className="dropdown-item"
                    >
                      <Move className="w-4 h-4" />
                      {editMode ? 'Exit Edit Mode' : 'Edit Layout'}
                    </button>
                  )}
                  {dashboard.is_owner !== false && (
                    <button
                      onClick={() => { setShowBrandingModal(true); setShowActionsDropdown(false); }}
                      className="dropdown-item"
                    >
                      <Palette className="w-4 h-4" />
                      Branding
                    </button>
                  )}
                  {dashboard.is_owner !== false && (
                    <button
                      onClick={() => { setShowShareModal(true); setShowActionsDropdown(false); }}
                      className="dropdown-item"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  )}
                  <button
                    onClick={() => { handleExport(); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Download className="w-4 h-4" />
                    Export JSON
                  </button>
                  <button
                    onClick={() => { handleExportPdf(); setShowActionsDropdown(false); }}
                    disabled={isExportingPdf}
                    className="dropdown-item"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExportingPdf ? 'Generating PDF...' : 'Export PDF'}
                  </button>
                  <button
                    onClick={() => { duplicateMutation.mutate(); setShowActionsDropdown(false); }}
                    disabled={duplicateMutation.isPending}
                    className="dropdown-item"
                  >
                    <Copy className="w-4 h-4" />
                    {duplicateMutation.isPending ? 'Duplicating...' : 'Duplicate'}
                  </button>
                  <button
                    onClick={() => {
                      if (isDefaultDashboard) {
                        setDefaultDashboard(null);
                      } else {
                        setDefaultDashboard(id!);
                      }
                      setShowActionsDropdown(false);
                      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
                    }}
                    className="dropdown-item"
                  >
                    <Star className={`w-4 h-4 ${isDefaultDashboard ? 'fill-honey-500 text-honey-500' : ''}`} />
                    {isDefaultDashboard ? 'Remove Default' : 'Set as Default'}
                  </button>
                  <button
                    onClick={() => { setShowAIInsights(!showAIInsights); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Sparkles className="w-4 h-4" />
                    {showAIInsights ? 'Hide AI Insights' : 'AI Insights'}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowPanelCopyModal(true)}
              className="btn-secondary"
              title="Copy existing panel from another dashboard"
            >
              <Folder className="w-4 h-4" />
              <span className="hidden sm:inline">Copy Panel</span>
            </button>

            <button
              onClick={() => {
                setEditingPanel(undefined);
                setShowPanelEditor(true);
              }}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>Add Panel</span>
            </button>
          </div>
        }
      />

      {/* Log store outage banner */}
      {storeDown && (
        <div className="flex items-center gap-3 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <span className="font-medium">The log database is unreachable.</span>{' '}
            Panels can't load right now; auto-refresh is paused until it recovers.
          </span>
          <button onClick={handleRefreshAll} className="ml-auto text-xs underline hover:no-underline">
            Retry now
          </button>
        </div>
      )}

      {/* Variables Bar */}
      {(dashboardVariables.length > 0 || editMode) && (
        <DashboardVariablesBar
          variables={dashboardVariables}
          values={variableValues}
          onChange={setVariableValues}
          getOptions={getVariableOptions}
          editMode={editMode}
          onAddVariable={() => { setEditingVariable(null); setShowVariableEditor(true); }}
          onEditVariable={(v) => {
            const apiVariable = variables.find((x: APIDashboardVariable) => x.id === v.id) || null;
            setEditingVariable(apiVariable);
            setShowVariableEditor(true);
          }}
        />
      )}

      {/* Page Tabs */}
      {(dashboard.pages && dashboard.pages.length > 0 || editMode) && (
        <div className="bg-white dark:bg-nog-800 border-b border-nog-200 dark:border-nog-700 px-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedPageId(null)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                selectedPageId === null
                  ? 'border-honey-500 text-honey-600 dark:text-honey-400'
                  : 'border-transparent text-nog-600 dark:text-nog-300 hover:text-nog-900 dark:hover:text-nog-100'
              }`}
            >
              All Panels
            </button>
            {dashboard.pages?.map((page) => (
              <div key={page.id} className="relative group flex items-center">
                <button
                  onClick={() => setSelectedPageId(page.id)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    selectedPageId === page.id
                      ? 'border-honey-500 text-honey-600 dark:text-honey-400'
                      : 'border-transparent text-nog-600 dark:text-nog-300 hover:text-nog-900 dark:hover:text-nog-100'
                  }`}
                >
                  {page.icon && <span className="mr-1.5">{page.icon}</span>}
                  {page.name}
                </button>
                {editMode && (
                  <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPage(page);
                        setShowPageEditor(true);
                      }}
                      className="p-1 text-nog-400 hover:text-nog-600 dark:hover:text-nog-200"
                      title="Edit Page"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const confirmed = await confirm({
                          title: 'Delete Page',
                          message: `Are you sure you want to delete the page "${page.name}"? This action cannot be undone.`,
                          confirmText: 'Delete',
                          cancelText: 'Cancel',
                          variant: 'danger',
                        });
                        if (confirmed) {
                          deletePageMutation.mutate(page.id);
                        }
                      }}
                      className="p-1 text-nog-400 hover:text-red-500"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {editMode && (
              <button
                onClick={() => {
                  setEditingPage(null);
                  setShowPageEditor(true);
                }}
                className="px-3 py-2.5 text-sm text-nog-400 hover:text-nog-600 dark:hover:text-nog-200"
                title="Add Page"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit Mode Banner */}
      {editMode && (
        <div className="bg-honey-50 border-b border-honey-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-honey-800">
            <Move className="w-4 h-4" />
            <span className="text-sm font-medium">Edit Mode: Drag panels to rearrange, resize from corners</span>
          </div>
          <button
            onClick={() => setEditMode(false)}
            className="text-sm text-honey-600 hover:text-honey-800 font-medium"
          >
            Done Editing
          </button>
        </div>
      )}

      {/* AI Insights Panel */}
      {showAIInsights && (
        <div className="p-4 border-b border-nog-200 bg-white">
          <AIInsightsPanel dashboardId={id!} timeRange={timeRange} />
        </div>
      )}

      {/* Panels Grid */}
      <div ref={dashboardGridRef} className="flex-1 p-4 overflow-auto" onClick={handleDashboardInteraction} onScroll={handleDashboardInteraction}>
        {dashboard.panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="w-16 h-16 bg-nog-100 dark:bg-nog-800 rounded-full flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-nog-400" />
            </div>
            <h3 className="text-lg font-semibold text-nog-900 dark:text-nog-100 mb-2">No panels yet</h3>
            <p className="text-nog-500 dark:text-nog-400 text-center max-w-md mb-6">
              Add panels to visualize your log data with charts, tables, and stats
            </p>
            <button
              onClick={() => {
                setEditingPanel(undefined);
                setShowPanelEditor(true);
              }}
              className="btn-primary"
            >
              <Plus className="w-5 h-5" />
              Add Your First Panel
            </button>
          </div>
        ) : (
          <DashboardGrid
            layouts={panelLayouts}
            editMode={editMode}
            onLayoutChange={handleLayoutChange}
          >
            {dashboard.panels
              .filter(panel => !selectedPageId || panel.page_id === selectedPageId)
              .map((panel) => (
              <div key={panel.id} className="group">
                <PanelCard
                  panel={panel}
                  data={panelData[panel.id] || { results: [], loading: true, error: null }}
                  onEdit={() => handleEditPanel(panel)}
                  onDelete={() => deletePanelMutation.mutate(panel.id)}
                  onDuplicate={() => duplicatePanelMutation.mutate(panel)}
                  onRefresh={() => fetchPanelData(panel)}
                  onDrilldown={handleDrilldown}
                  onFullscreen={() => setFullscreenPanel(panel.id)}
                  onViewOrigin={() => setProvenancePanel({ id: panel.id, title: panel.title })}
                  editMode={editMode}
                />
              </div>
            ))}
          </DashboardGrid>
        )}
      </div>

      {/* Annotations - TODO: Implement annotations feature */}
      {/* {id && (
        <DashboardAnnotations
          annotations={[]}
          editMode={isEditing}
        />
      )} */}

      {/* Page Editor Modal */}
      {showPageEditor && (
        <PageEditorModal
          page={editingPage}
          onSave={(name: string, icon?: string) => {
            if (editingPage) {
              updatePageMutation.mutate({ pageId: editingPage.id, updates: { name, icon } });
            } else {
              createPageMutation.mutate({ name, icon });
            }
          }}
          onCancel={() => {
            setShowPageEditor(false);
            setEditingPage(null);
          }}
        />
      )}

      {/* Panel Editor Modal */}
      {showPanelEditor && (
        <PanelEditor
          panel={editingPanel}
          pages={dashboard.pages || []}
          defaultPageId={selectedPageId}
          onSave={handleSavePanel}
          onCancel={() => {
            setShowPanelEditor(false);
            setEditingPanel(undefined);
          }}
          saving={createPanelMutation.isPending || updatePanelMutation.isPending}
        />
      )}

      {/* Branding Modal */}
      {showBrandingModal && (
        <DashboardBrandingModal
          branding={{
            logo_url: dashboard.logo_url,
            accent_color: dashboard.accent_color,
            header_color: dashboard.header_color,
            description: dashboard.description,
          }}
          onCancel={() => setShowBrandingModal(false)}
          onSave={async (branding) => {
            await authFetch(`/dashboards/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(branding),
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
            setShowBrandingModal(false);
          }}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <DashboardShareModal
          dashboardId={id!}
          dashboardName={dashboard.name}
          settings={{
            is_public: !!dashboard.is_public,
            public_token: dashboard.public_token,
            has_password: dashboard.has_password,
            public_expires_at: dashboard.public_expires_at,
          }}
          onCancel={() => setShowShareModal(false)}
          onSave={async (settings) => {
            const wasPublic = !!dashboard.is_public && !!dashboard.public_token;
            const res = await authFetch(`/dashboards/${id}/share`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settings),
            });
            if (!res.ok) {
              const msg = await res.text().catch(() => '');
              toast.error('Sharing Failed', msg ? msg.slice(0, 120) : 'Could not update sharing settings');
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
            // Keep the modal open on first enable so the freshly minted link is
            // visible (it only exists after the save round-trips).
            if (!settings.is_public || wasPublic) setShowShareModal(false);
            toast.success(settings.is_public ? 'Sharing Enabled' : 'Sharing Disabled',
              settings.is_public ? 'Anyone with the link can view this dashboard' : 'Public link revoked');
          }}
        />
      )}

      {/* Variable Editor Modal */}
      {showVariableEditor && (
        <VariableEditorModal
          variable={editingVariable ? {
            id: editingVariable.id,
            name: editingVariable.name,
            label: editingVariable.label,
            type: editingVariable.type,
            query: editingVariable.query,
            custom_values: editingVariable.custom_values,
            default_value: editingVariable.default_value,
            multi_select: !!editingVariable.multi_select,
            include_all: !!editingVariable.include_all,
          } : undefined}
          onCancel={() => { setShowVariableEditor(false); setEditingVariable(null); }}
          onTest={(query) => previewDashboardVariableOptions(id!, query)}
          onDelete={editingVariable ? async () => {
            const ok = await confirm({
              title: 'Delete Variable',
              message: `Delete "$${editingVariable.name}$"? Panels still referencing it will run with the token unreplaced.`,
              confirmText: 'Delete',
              cancelText: 'Cancel',
              variant: 'danger',
            });
            if (!ok) return;
            await deleteDashboardVariable(id!, editingVariable.id);
            setVariableValues((prev) => { const next = { ...prev }; delete next[editingVariable.name]; return next; });
            queryClient.invalidateQueries({ queryKey: ['dashboard-variables', id] });
            setShowVariableEditor(false);
            setEditingVariable(null);
          } : undefined}
          onSave={async (data) => {
            try {
              if (editingVariable) {
                await updateDashboardVariable(id!, editingVariable.id, data);
              } else {
                await authFetch(`/dashboards/${id}/variables`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                });
              }
              queryClient.invalidateQueries({ queryKey: ['dashboard-variables', id] });
              setShowVariableEditor(false);
              setEditingVariable(null);
            } catch (err) {
              toast.error('Variable Not Saved', err instanceof Error ? err.message : 'Unknown error');
            }
          }}
        />
      )}

      {/* Fullscreen Panel Modal */}
      {fullscreenPanel && (() => {
        const panel = dashboard?.panels.find(p => p.id === fullscreenPanel);
        if (!panel) return null;
        const data = panelData[panel.id] || { results: [], loading: true, error: null };
        const vizOption = VISUALIZATION_OPTIONS.find(v => v.value === panel.visualization) || VISUALIZATION_OPTIONS[0];
        const VizIcon = vizOption.icon;

        return (
          <div className="modal-overlay p-4" onClick={() => setFullscreenPanel(null)}>
            <div className="bg-white dark:bg-nog-800 rounded-xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-nog-200 dark:border-nog-700">
                <div className="flex items-center gap-3">
                  <VizIcon className="w-5 h-5 text-nog-400 dark:text-nog-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-nog-900 dark:text-nog-100">{panel.title}</h2>
                    {panel.description && (
                      <p className="text-sm text-nog-500 dark:text-nog-400">{panel.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchPanelData(panel)}
                    className="btn-ghost p-2"
                    title="Refresh"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setFullscreenPanel(null)}
                    className="btn-ghost p-2"
                    title="Exit fullscreen"
                  >
                    <Minimize2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 p-4 min-h-0 overflow-auto">
                <PanelVisualization
                  panel={panel}
                  data={data}
                  onRefresh={() => fetchPanelData(panel)}
                  onDrilldown={handleDrilldown}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Panel Copy Modal */}
      {showPanelCopyModal && (
        <PanelCopyModal
          targetDashboardId={id!}
          onClose={() => setShowPanelCopyModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
            setShowPanelCopyModal(false);
          }}
        />
      )}

      {/* Panel Provenance Modal */}
      {provenancePanel && (
        <PanelProvenanceModal
          dashboardId={id!}
          panelId={provenancePanel.id}
          panelTitle={provenancePanel.title}
          onClose={() => setProvenancePanel(null)}
        />
      )}
    </div>
  );
}

import {
  AreaChart,
  BarChart,
  PieChart,
  GaugeChart,
  HeatmapChart,
  WordCloudChart,
  type HeatmapData,
} from '../charts';
import { CHART_PALETTE } from '../charts';

const CHART_COLORS = CHART_PALETTE;

export type PanelVizType =
  | 'table'
  | 'stat'
  | 'single'
  | 'line'
  | 'area'
  | 'bar'
  | 'pie'
  | 'gauge'
  | 'heatmap'
  | 'wordcloud';

export interface PanelChartProps {
  visualization: string;
  results: Record<string, unknown>[];
  darkMode?: boolean;
  height?: number;
}

/**
 * Analyze a result set and derive the column roles used by every chart.
 * Centralizes the "ClickHouse returns numbers as strings" handling so the
 * Studio preview and the dashboard renderer agree on what's numeric.
 */
export function analyzeResults(results: Record<string, unknown>[]) {
  const keys = Object.keys(results[0] || {});
  const isNumericColumn = (k: string) =>
    results.some((r) => r[k] !== null && r[k] !== '' && Number.isFinite(Number(r[k])));
  const numericKeys = keys.filter(isNumericColumn);
  const valueKey =
    keys.find((k) => /^(count|count_all|total|value|sum|avg|min|max)$/i.test(k) && isNumericColumn(k)) ||
    numericKeys[0] ||
    keys[keys.length - 1];
  const labelKey = keys.find((k) => k !== valueKey) || keys[0];
  const timeKey = keys.find((k) => /(^|_)(time|timestamp|bucket|date)/i.test(k));
  const seriesKeys =
    numericKeys.filter((k) => k !== labelKey).length > 0
      ? numericKeys.filter((k) => k !== labelKey)
      : [valueKey];
  return { keys, numericKeys, valueKey, labelKey, timeKey, seriesKeys };
}

/**
 * Kibana-Lens-style visualization suggestion: pick a sensible default chart
 * from the shape of the result set. Returned first entry is the recommended
 * type; the rest are reasonable alternatives to offer as switch options.
 */
export function suggestVisualizations(results: Record<string, unknown>[]): PanelVizType[] {
  if (!results || results.length === 0) return ['table'];
  const { keys, numericKeys, timeKey } = analyzeResults(results);

  // Single row, single numeric column → a big number.
  if (results.length === 1 && numericKeys.length >= 1 && keys.length <= 2) {
    return ['stat', 'gauge', 'table'];
  }
  // A time/bucket column present → time series.
  if (timeKey && numericKeys.length >= 1) {
    return ['line', 'area', 'bar', 'table'];
  }
  // One category + one metric → ranked bar / pie.
  if (keys.length === 2 && numericKeys.length === 1) {
    return results.length <= 8 ? ['bar', 'pie', 'table'] : ['bar', 'table', 'pie'];
  }
  // Everything else → table is the safe default.
  return ['table', 'bar'];
}

const VIZ_LABEL: Record<PanelVizType, string> = {
  table: 'Table',
  stat: 'Single value',
  single: 'Single value',
  line: 'Line',
  area: 'Area',
  bar: 'Bar',
  pie: 'Pie',
  gauge: 'Gauge',
  heatmap: 'Heatmap',
  wordcloud: 'Word cloud',
};

export function vizLabel(v: string): string {
  return VIZ_LABEL[v as PanelVizType] || v;
}

/**
 * Render a query result as a chart. Standalone (no drilldown) renderer shared
 * by the Dashboard Studio preview; uses the same column analysis as the
 * dashboard view so previews match saved panels.
 */
export function PanelChart({ visualization, results, darkMode, height = 220 }: PanelChartProps) {
  if (!results || results.length === 0) {
    return <div className="flex items-center justify-center h-full text-nog-400 text-sm">No data</div>;
  }

  const { keys, valueKey, labelKey, timeKey, seriesKeys } = analyzeResults(results);

  switch (visualization) {
    case 'stat':
    case 'single': {
      const raw = results[0] ? results[0][valueKey] : 0;
      const num = Number(raw);
      const statValue = Number.isFinite(num) ? num : raw;
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold text-nog-900 dark:text-nog-100">
            {typeof statValue === 'number' ? statValue.toLocaleString() : String(statValue ?? 0)}
          </p>
          {results.length === 1 && labelKey !== valueKey && results[0][labelKey] != null && (
            <p className="text-xs text-nog-500 mt-1 truncate max-w-full">{String(results[0][labelKey])}</p>
          )}
        </div>
      );
    }

    case 'line':
    case 'area':
      return (
        <AreaChart
          data={results}
          series={seriesKeys.map((k, i) => ({ name: k, dataKey: k, color: CHART_COLORS[i % CHART_COLORS.length] }))}
          xAxisKey={labelKey}
          height={height}
          darkMode={darkMode}
          xAxisFormatter={(v) => {
            if (String(v).match(/\d{4}-\d{2}-\d{2}/)) {
              return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return String(v).slice(0, 10);
          }}
        />
      );

    case 'bar':
      return (
        <BarChart
          data={results.map((item) => ({
            category: String(item[labelKey] || ''),
            value: Number(item[valueKey]) || 0,
          }))}
          height={height}
          horizontal
          barColor={CHART_COLORS[0]}
          darkMode={darkMode}
          showValues={false}
        />
      );

    case 'pie':
      return (
        <PieChart
          data={results.map((item, i) => ({
            name: String(item[labelKey] || `Item ${i + 1}`),
            value: Number(item[valueKey]) || 0,
          }))}
          height={height}
          donut
          showLegend
          darkMode={darkMode}
          colors={CHART_COLORS}
        />
      );

    case 'gauge': {
      const gaugeValue = Number(results[0]?.[valueKey]) || 0;
      const max = Math.max(gaugeValue * 1.2, 100);
      return (
        <div className="h-full w-full flex items-center justify-center">
          <GaugeChart
            value={gaugeValue}
            max={max}
            height={height}
            darkMode={darkMode}
            thresholds={{ low: max * 0.33, medium: max * 0.66, high: max }}
          />
        </div>
      );
    }

    case 'heatmap': {
      const hasHour = keys.includes('hour') || keys.includes('day') || !!timeKey;
      if (!hasHour) {
        return (
          <div className="flex items-center justify-center h-full text-nog-400 text-xs text-center px-4">
            Heatmap needs an hour/day or time field.
          </div>
        );
      }
      const data: HeatmapData[] = results.map((item) => {
        const t = timeKey && item[timeKey] != null ? new Date(String(item[timeKey])) : null;
        const hour = item.hour != null && Number.isFinite(Number(item.hour))
          ? Number(item.hour)
          : t && !isNaN(t.getTime()) ? t.getHours() : 0;
        const day = item.day != null && Number.isFinite(Number(item.day))
          ? Number(item.day)
          : t && !isNaN(t.getTime()) ? t.getDay() : 0;
        return { hour, day, value: Number(item[valueKey]) || 0 };
      });
      return <HeatmapChart data={data} height={Math.max(height, 240)} darkMode={darkMode} />;
    }

    case 'wordcloud':
      return (
        <WordCloudChart
          data={results
            .map((row) => {
              const vals = Object.values(row);
              return { name: String(vals[0] || ''), value: Number(vals[1]) || 1 };
            })
            .filter((d) => d.name)}
          height={Math.max(height, 240)}
          darkMode={darkMode}
        />
      );

    case 'table':
    default:
      return (
        <div className="overflow-auto h-full">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-nog-100 dark:bg-nog-800">
              <tr>
                {keys.map((k) => (
                  <th key={k} className="px-2 py-1 font-semibold text-nog-700 dark:text-nog-300 whitespace-nowrap">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-t border-nog-200/60 dark:border-nog-700/60">
                  {keys.map((k) => (
                    <td key={k} className="px-2 py-1 text-nog-600 dark:text-nog-400 whitespace-nowrap">
                      {String(row[k] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

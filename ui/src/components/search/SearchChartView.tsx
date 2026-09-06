// Renders `| chart` query results as an actual chart, driven by the compiler's
// metadata.chart hint ({chartType, xField, yField, groupBy}). Column detection
// prefers the hint but falls back to row keys, since the aggregate column is
// aliased (e.g. avg_duration_ms) rather than named after yField.
import { useMemo } from 'react';
import { AreaChart, BarChart, PieChart, ScatterChart } from '../charts';
import { CHART_ACCENT, CHART_PALETTE } from '../charts/palette';
import type { ChartHint } from '../../api/client';

interface SearchChartViewProps {
  results: Record<string, unknown>[];
  hint: ChartHint;
  darkMode: boolean;
  height?: number;
}

export function SearchChartView({ results, hint, darkMode, height = 380 }: SearchChartViewProps) {
  // Resolve which columns hold the x category, the optional series split, and
  // the aggregated value. Chart queries emit exactly x [, groupBy], aggregate.
  const { xKey, groupKey, valueKey } = useMemo(() => {
    const keys = results.length > 0 ? Object.keys(results[0]) : [];
    const x = hint.xField && keys.includes(hint.xField) ? hint.xField : keys[0];
    const group = hint.groupBy && keys.includes(hint.groupBy) ? hint.groupBy : undefined;
    const value = keys.find((k) => k !== x && k !== group) ?? keys[keys.length - 1];
    return { xKey: x, groupKey: group, valueKey: value };
  }, [results, hint]);

  // Pivot rows for multi-series line/area: one row per x, one column per group.
  const { pivotRows, series } = useMemo(() => {
    if (!groupKey) {
      const rows = results.map((r) => ({
        [xKey]: String(r[xKey]),
        [valueKey]: Number(r[valueKey]) || 0,
      }));
      return {
        pivotRows: rows,
        series: [{ name: valueKey, dataKey: valueKey, color: CHART_ACCENT }],
      };
    }
    const groups: string[] = [];
    const byX = new Map<string, Record<string, unknown>>();
    for (const r of results) {
      const x = String(r[xKey]);
      const g = String(r[groupKey]);
      if (!groups.includes(g)) groups.push(g);
      if (!byX.has(x)) byX.set(x, { [xKey]: x });
      byX.get(x)![g] = Number(r[valueKey]) || 0;
    }
    return {
      pivotRows: Array.from(byX.values()),
      series: groups.map((g, i) => ({
        name: g,
        dataKey: g,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
      })),
    };
  }, [results, xKey, groupKey, valueKey]);

  if (!results.length || !xKey || !valueKey) {
    return (
      <div className="card p-8 text-center text-nog-500 dark:text-nog-400">
        No chartable data in this result set.
      </div>
    );
  }

  const summary = [
    hint.chartType,
    valueKey,
    hint.xField ? `by ${hint.xField}` : null,
    hint.groupBy ? `split by ${hint.groupBy}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let chart: JSX.Element;
  switch (hint.chartType) {
    case 'pie':
      chart = (
        <PieChart
          data={results.map((r) => ({ name: String(r[xKey]), value: Number(r[valueKey]) || 0 }))}
          height={height}
          darkMode={darkMode}
          colors={CHART_PALETTE}
          showLegend
        />
      );
      break;
    case 'bar':
      chart = (
        <BarChart
          data={results.map((r) => ({
            // With a split-by series, keep bars honest via composite categories.
            category: groupKey ? `${String(r[xKey])} · ${String(r[groupKey])}` : String(r[xKey]),
            value: Number(r[valueKey]) || 0,
          }))}
          height={height}
          darkMode={darkMode}
          xAxisLabel={hint.xField}
          yAxisLabel={valueKey}
        />
      );
      break;
    case 'scatter': {
      const numericX = results.every((r) => Number.isFinite(Number(r[xKey])));
      chart = (
        <ScatterChart
          data={results.map((r, i) => ({
            x: numericX ? Number(r[xKey]) : i,
            y: Number(r[valueKey]) || 0,
            name: String(r[xKey]),
          }))}
          height={height}
          darkMode={darkMode}
          xAxisLabel={hint.xField}
          yAxisLabel={valueKey}
          showLabels={results.length <= 30}
        />
      );
      break;
    }
    case 'line':
    case 'area':
    default:
      chart = (
        <AreaChart
          data={pivotRows}
          series={series}
          xAxisKey={xKey}
          height={height}
          darkMode={darkMode}
          fill={hint.chartType === 'area'}
          showLegend={series.length > 1}
        />
      );
      break;
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-nog-900 dark:text-nog-100 capitalize">
          {summary}
        </span>
        <span className="text-xs text-nog-500 dark:text-nog-400">
          from <code className="code text-xs">| chart</code>
        </span>
      </div>
      {chart}
    </div>
  );
}

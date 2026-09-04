import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getChartTheme, HEATMAP_HONEY_RAMP } from './palette';

export interface MatrixHeatmapData {
  x: string;
  y: string;
  value: number;
}

export interface MatrixHeatmapChartProps {
  data: MatrixHeatmapData[];
  height?: number;
  darkMode?: boolean;
  xLabel?: string;
  yLabel?: string;
}

/**
 * A general category × category heatmap (e.g. `stats count by host severity`):
 * one axis per dimension, cell colour = the value. Complements the time-based
 * HeatmapChart (hour × day).
 */
export const MatrixHeatmapChart: React.FC<MatrixHeatmapChartProps> = ({
  data,
  height = 260,
  darkMode = false,
  xLabel,
  yLabel,
}) => {
  const theme = getChartTheme(darkMode);

  const { xCats, yCats, points, max } = React.useMemo(() => {
    const xs = Array.from(new Set(data.map((d) => (d.x === '' ? '(empty)' : d.x))));
    const ys = Array.from(new Set(data.map((d) => (d.y === '' ? '(empty)' : d.y))));
    const xi = new Map(xs.map((c, i) => [c, i]));
    const yi = new Map(ys.map((c, i) => [c, i]));
    const pts = data.map((d) => [xi.get(d.x === '' ? '(empty)' : d.x)!, yi.get(d.y === '' ? '(empty)' : d.y)!, d.value]);
    return { xCats: xs, yCats: ys, points: pts, max: Math.max(1, ...data.map((d) => d.value)) };
  }, [data]);

  const option: EChartsOption = React.useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top' as const,
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.text },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => `${xCats[p.data[0]]} × ${yCats[p.data[1]]}: ${p.data[2]}`,
      },
      grid: { top: 12, left: 10, right: 16, bottom: 56, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: xCats,
        name: xLabel,
        nameLocation: 'middle' as const,
        nameGap: 34,
        nameTextStyle: { color: theme.textMuted, fontSize: 11 },
        axisLabel: { color: theme.textMuted, interval: 0, rotate: xCats.length > 6 ? 40 : 0, width: 80, overflow: 'truncate' as const, fontSize: 11 },
        axisLine: { lineStyle: { color: theme.axis } },
        splitArea: { show: true, areaStyle: { color: theme.splitArea } },
      },
      yAxis: {
        type: 'category' as const,
        data: yCats,
        name: yLabel,
        axisLabel: { color: theme.textMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: theme.axis } },
        splitArea: { show: true, areaStyle: { color: theme.splitArea } },
      },
      visualMap: {
        min: 0,
        max,
        calculable: true,
        orient: 'horizontal' as const,
        left: 'center' as const,
        bottom: 0,
        itemHeight: 80,
        textStyle: { color: theme.textMuted },
        inRange: { color: [...HEATMAP_HONEY_RAMP] },
      },
      series: [
        {
          type: 'heatmap' as const,
          data: points,
          label: { show: false },
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.25)' } },
        },
      ],
    }),
    [xCats, yCats, points, max, theme, xLabel, yLabel],
  );

  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-nog-400 dark:text-nog-500" style={{ height: `${height}px` }}>
        No data to display
      </div>
    );
  }

  return (
    <div className="w-full">
      <ReactECharts option={option} style={{ height: `${height}px` }} notMerge={true} lazyUpdate={true} />
    </div>
  );
};

export default MatrixHeatmapChart;

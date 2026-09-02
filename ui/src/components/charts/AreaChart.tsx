import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getChartTheme } from './palette';

export interface AreaChartSeries {
  name: string;
  dataKey: string;
  color: string;
  gradientColor?: string;
}

export interface AreaChartThreshold {
  value: number;
  label?: string;
  color?: string;
}

export interface AreaChartProps {
  data: Record<string, any>[];
  series: AreaChartSeries[];
  xAxisKey: string;
  title?: string;
  height?: number;
  darkMode?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'right';
  /** Stack the series on top of each other. */
  stacked?: boolean;
  yMin?: number;
  yMax?: number;
  yAxisLabel?: string;
  /** Horizontal reference lines. */
  thresholds?: AreaChartThreshold[];
  xAxisFormatter?: (value: any) => string;
  tooltipFormatter?: (value: any) => string;
}

export const AreaChart: React.FC<AreaChartProps> = ({
  data,
  series,
  xAxisKey,
  title,
  height = 300,
  darkMode = false,
  showGrid = true,
  showLegend = true,
  legendPosition = 'top',
  stacked = false,
  yMin,
  yMax,
  yAxisLabel,
  thresholds,
  xAxisFormatter,
  tooltipFormatter,
}) => {
  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const markLine = thresholds && thresholds.length > 0 ? {
      silent: true,
      symbol: 'none',
      lineStyle: { type: 'dashed' as const, width: 1.5 },
      label: { position: 'insideEndTop' as const, color: theme.textMuted, fontSize: 11 },
      data: thresholds.map((t) => ({
        yAxis: t.value,
        name: t.label || String(t.value),
        lineStyle: { color: t.color || '#b91c1c' },
        label: { formatter: t.label || String(t.value) },
      })),
    } : undefined;
    const gradientDefs = series.map((s) => ({
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: s.gradientColor || s.color + '4D' }, // 30% opacity
        { offset: 1, color: s.gradientColor ? s.gradientColor + '00' : s.color + '00' }, // 0% opacity
      ],
    }));

    const seriesConfig = series.map((s, idx) => ({
      name: s.name,
      type: 'line' as const,
      smooth: true,
      symbol: 'none',
      stack: stacked ? 'total' : undefined,
      data: data.map(d => d[s.dataKey]),
      itemStyle: {
        color: s.color,
      },
      lineStyle: {
        width: 2,
        color: s.color,
      },
      areaStyle: {
        // Stacked series need a solid fill or they read as one blob.
        color: stacked ? s.color + '99' : gradientDefs[idx],
      },
      emphasis: {
        focus: 'series' as const,
      },
      // Only draw the reference lines once (on the first series).
      markLine: idx === 0 ? markLine : undefined,
    }));

    const legendLayout = legendPosition === 'right'
      ? { orient: 'vertical' as const, right: 10, top: 'middle' as const }
      : legendPosition === 'bottom'
        ? { bottom: 0 }
        : { top: title ? 30 : 10 };

    return {
      title: title ? {
        text: title,
        textStyle: {
          color: theme.text,
          fontSize: 16,
        },
      } : undefined,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        borderRadius: 12,
        textStyle: {
          color: theme.text,
        },
        formatter: tooltipFormatter ? (params: any) => {
          const time = tooltipFormatter(params[0]?.axisValue);
          let result = `<div style="font-weight: 500; margin-bottom: 4px;">${time}</div>`;
          params.forEach((p: any) => {
            result += `<div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color};"></span>
              <span>${p.seriesName}: ${p.value?.toLocaleString() ?? 0}</span>
            </div>`;
          });
          return result;
        } : undefined,
      },
      legend: showLegend ? {
        data: series.map(s => s.name),
        ...legendLayout,
        textStyle: {
          color: theme.text,
        },
      } : undefined,
      grid: {
        left: '3%',
        right: showLegend && legendPosition === 'right' ? 120 : '4%',
        bottom: showLegend && legendPosition === 'bottom' ? 36 : '10%',
        top: title ? 60 : 40,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.map(d => d[xAxisKey]),
        boundaryGap: false,
        axisLabel: {
          color: theme.textMuted,
          fontSize: 12,
          formatter: xAxisFormatter,
        },
        axisLine: {
          lineStyle: {
            color: theme.axis,
          },
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        nameTextStyle: { color: theme.textMuted },
        min: yMin,
        max: yMax,
        axisLabel: {
          color: theme.textMuted,
          fontSize: 12,
        },
        axisLine: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: theme.grid,
            type: 'dashed',
          },
        },
      },
      series: seriesConfig,
    };
  }, [data, series, xAxisKey, title, darkMode, showGrid, showLegend, legendPosition, stacked, yMin, yMax, yAxisLabel, thresholds, xAxisFormatter, tooltipFormatter, theme]);

  if (!data || data.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-nog-400 dark:text-nog-500"
        style={{ height: `${height}px` }}
      >
        No data to display
      </div>
    );
  }

  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: `${height}px` }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};

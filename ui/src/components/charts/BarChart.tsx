import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHART_ACCENT, getChartTheme } from './palette';

export interface BarChartData {
  category: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartData[];
  title?: string;
  height?: number;
  darkMode?: boolean;
  horizontal?: boolean;
  topN?: number;
  sortOrder?: 'asc' | 'desc';
  showValues?: boolean;
  barColor?: string;
  onBarClick?: (category: string, value: number) => void;
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Fixed value-axis range (auto when undefined). */
  valueMin?: number;
  valueMax?: number;
  /** Reference lines on the value axis. */
  thresholds?: { value: number; label?: string; color?: string }[];
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  title,
  height = 400,
  darkMode = false,
  horizontal = false,
  topN,
  sortOrder = 'desc',
  showValues = true,
  barColor = CHART_ACCENT,
  onBarClick,
  xAxisLabel,
  yAxisLabel,
  valueMin,
  valueMax,
  thresholds,
}) => {
  const processedData = React.useMemo(() => {
    let sorted = [...data];

    // Sort data
    sorted.sort((a, b) => {
      return sortOrder === 'desc' ? b.value - a.value : a.value - b.value;
    });

    // Apply topN filter
    if (topN && topN > 0) {
      sorted = sorted.slice(0, topN);
    }

    return sorted;
  }, [data, sortOrder, topN]);

  const categories = React.useMemo(() => {
    return processedData.map(d => d.category);
  }, [processedData]);

  const values = React.useMemo(() => {
    return processedData.map(d => d.value);
  }, [processedData]);

  // Horizontal bars need ~28px per category or the y-axis labels overlap into an
  // unreadable smear. Grow the chart to fit every label (the panel body scrolls);
  // vertical bars keep the caller's height.
  const effectiveHeight = React.useMemo(() => {
    if (!horizontal) return height;
    return Math.max(height, processedData.length * 28 + 40);
  }, [horizontal, height, processedData.length]);

  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const categoryAxis = {
      type: 'category' as const,
      // An empty category (rows where the group-by field is missing) still
      // gets a bar; label it so the bar doesn't look shifted off its row.
      data: categories.map((c) => (c === '' ? '(empty)' : c)),
      name: horizontal ? yAxisLabel : xAxisLabel,
      nameTextStyle: {
        color: theme.textMuted,
      },
      axisLabel: {
        color: theme.textMuted,
        interval: 0,
        rotate: horizontal ? 0 : 45,
        fontSize: 12,
        // Long category names (hostnames, URLs) get an ellipsis instead of
        // colliding with the plot; the full value is in the tooltip.
        width: horizontal ? 140 : undefined,
        overflow: horizontal ? ('truncate' as const) : undefined,
      },
      axisLine: {
        lineStyle: {
          color: theme.axis,
        },
      },
    };

    const valueAxis = {
      type: 'value' as const,
      name: horizontal ? xAxisLabel : yAxisLabel,
      min: valueMin,
      max: valueMax,
      nameTextStyle: {
        color: theme.textMuted,
      },
      axisLabel: {
        color: theme.textMuted,
      },
      axisLine: {
        lineStyle: {
          color: theme.axis,
        },
      },
      splitLine: {
        lineStyle: {
          color: theme.grid,
        },
      },
    };

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
        axisPointer: {
          type: 'shadow',
        },
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: {
          color: theme.text,
        },
        formatter: (params: any) => {
          const param = Array.isArray(params) ? params[0] : params;
          return `${param.name}<br/>Count: ${param.value}`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: horizontal ? '10%' : '15%',
        top: title ? 50 : 30,
        containLabel: true,
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: [
        {
          type: 'bar',
          data: values,
          itemStyle: {
            color: barColor,
            borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
          },
          label: {
            show: showValues,
            position: horizontal ? 'right' : 'top',
            color: theme.text,
            fontSize: 11,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.25)',
            },
          },
          barMaxWidth: 60,
          markLine: thresholds && thresholds.length > 0 ? {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed' as const, width: 1.5 },
            label: { color: theme.textMuted, fontSize: 11, position: horizontal ? 'insideEndTop' as const : 'insideEndTop' as const },
            data: thresholds.map((t) => ({
              ...(horizontal ? { xAxis: t.value } : { yAxis: t.value }),
              lineStyle: { color: t.color || '#b91c1c' },
              label: { formatter: t.label || String(t.value) },
            })),
          } : undefined,
        },
      ],
    };
  }, [categories, values, title, darkMode, horizontal, showValues, barColor, xAxisLabel, yAxisLabel, valueMin, valueMax, thresholds, theme]);

  const onEvents = React.useMemo(() => {
    if (!onBarClick) return undefined;

    return {
      click: (params: any) => {
        if (params.componentType === 'series') {
          const category = categories[params.dataIndex];
          const value = values[params.dataIndex];
          onBarClick(category, value);
        }
      },
    };
  }, [onBarClick, categories, values]);

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
        style={{ height: `${effectiveHeight}px` }}
        notMerge={true}
        lazyUpdate={true}
        onEvents={onEvents}
      />
    </div>
  );
};

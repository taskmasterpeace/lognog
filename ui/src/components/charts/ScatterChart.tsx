import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHART_PALETTE, getChartTheme } from './palette';

export interface ScatterChartData {
  x: number;
  y: number;
  name?: string;
  size?: number;
  category?: string;
}

export interface ScatterChartProps {
  data: ScatterChartData[];
  title?: string;
  height?: number;
  darkMode?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLabels?: boolean;
  symbolSize?: number | ((value: number[]) => number);
  onPointClick?: (point: ScatterChartData) => void;
}

export const ScatterChart: React.FC<ScatterChartProps> = ({
  data,
  title,
  height = 400,
  darkMode = false,
  xAxisLabel,
  yAxisLabel,
  showLabels = false,
  symbolSize = 10,
  onPointClick,
}) => {
  const theme = getChartTheme(darkMode);

  // Group data by category if present
  const seriesData = React.useMemo(() => {
    const categories = new Map<string, ScatterChartData[]>();

    data.forEach(point => {
      const cat = point.category || 'default';
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(point);
    });

    return Array.from(categories.entries()).map(([name, points]) => ({
      name,
      type: 'scatter' as const,
      data: points.map(p => ({
        value: [p.x, p.y, p.size || 1],
        name: p.name,
      })),
      symbolSize: typeof symbolSize === 'function'
        ? symbolSize
        : (value: number[]) => (value[2] ? Math.sqrt(value[2]) * symbolSize / 2 : symbolSize),
      label: {
        show: showLabels,
        formatter: (params: any) => params.data.name || '',
        position: 'top' as const,
        color: theme.text,
        fontSize: 10,
      },
      emphasis: {
        focus: 'series' as const,
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.25)',
        },
      },
    }));
  }, [data, symbolSize, showLabels, theme]);

  const option: EChartsOption = React.useMemo(() => ({
    color: CHART_PALETTE,
    title: title ? {
      text: title,
      textStyle: {
        color: theme.text,
        fontSize: 16,
      },
    } : undefined,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: {
        color: theme.text,
      },
      formatter: (params: any) => {
        const point = params.data;
        const name = point.name ? `<strong>${point.name}</strong><br/>` : '';
        return `${name}${xAxisLabel || 'X'}: ${point.value[0]}<br/>${yAxisLabel || 'Y'}: ${point.value[1]}`;
      },
    },
    legend: seriesData.length > 1 ? {
      data: seriesData.map(s => s.name),
      textStyle: {
        color: theme.textMuted,
      },
      top: title ? 30 : 10,
    } : undefined,
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: title ? (seriesData.length > 1 ? 60 : 50) : (seriesData.length > 1 ? 40 : 30),
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      name: xAxisLabel,
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
    },
    yAxis: {
      type: 'value',
      name: yAxisLabel,
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
    },
    series: seriesData,
  }), [title, darkMode, xAxisLabel, yAxisLabel, seriesData, theme]);

  const onEvents = React.useMemo(() => {
    if (!onPointClick) return undefined;

    return {
      click: (params: any) => {
        if (params.componentType === 'series') {
          const point: ScatterChartData = {
            x: params.data.value[0],
            y: params.data.value[1],
            name: params.data.name,
            size: params.data.value[2],
            category: params.seriesName,
          };
          onPointClick(point);
        }
      },
    };
  }, [onPointClick]);

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
        onEvents={onEvents}
      />
    </div>
  );
};

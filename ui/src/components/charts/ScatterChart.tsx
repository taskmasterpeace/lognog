import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

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
        color: darkMode ? '#e5e7eb' : '#1f2937',
        fontSize: 10,
      },
      emphasis: {
        focus: 'series' as const,
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
        },
      },
    }));
  }, [data, symbolSize, showLabels, darkMode]);

  const option: EChartsOption = React.useMemo(() => ({
    title: title ? {
      text: title,
      textStyle: {
        color: darkMode ? '#e5e7eb' : '#1f2937',
        fontSize: 16,
      },
    } : undefined,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: darkMode ? '#4b5563' : '#d1d5db',
      textStyle: {
        color: darkMode ? '#e5e7eb' : '#1f2937',
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
        color: darkMode ? '#9ca3af' : '#6b7280',
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
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      axisLabel: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      axisLine: {
        lineStyle: {
          color: darkMode ? '#4b5563' : '#d1d5db',
        },
      },
      splitLine: {
        lineStyle: {
          color: darkMode ? '#374151' : '#f3f4f6',
        },
      },
    },
    yAxis: {
      type: 'value',
      name: yAxisLabel,
      nameTextStyle: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      axisLabel: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      axisLine: {
        lineStyle: {
          color: darkMode ? '#4b5563' : '#d1d5db',
        },
      },
      splitLine: {
        lineStyle: {
          color: darkMode ? '#374151' : '#f3f4f6',
        },
      },
    },
    series: seriesData,
  }), [title, darkMode, xAxisLabel, yAxisLabel, seriesData]);

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

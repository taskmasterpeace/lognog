import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface FunnelChartData {
  name: string;
  value: number;
}

export interface FunnelChartProps {
  data: FunnelChartData[];
  title?: string;
  height?: number;
  darkMode?: boolean;
  showLabels?: boolean;
  sortOrder?: 'ascending' | 'descending' | 'none';
  orientation?: 'vertical' | 'horizontal';
  onStageClick?: (name: string, value: number) => void;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({
  data,
  title,
  height = 400,
  darkMode = false,
  showLabels = true,
  sortOrder = 'descending',
  orientation = 'vertical',
  onStageClick,
}) => {
  const processedData = React.useMemo(() => {
    if (sortOrder === 'none') return data;

    const sorted = [...data].sort((a, b) => {
      return sortOrder === 'descending' ? b.value - a.value : a.value - b.value;
    });
    return sorted;
  }, [data, sortOrder]);

  // Calculate percentages
  const maxValue = React.useMemo(() => {
    return Math.max(...data.map(d => d.value), 1);
  }, [data]);

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
        const percentage = ((params.value / maxValue) * 100).toFixed(1);
        return `<strong>${params.name}</strong><br/>Value: ${params.value.toLocaleString()}<br/>Percentage: ${percentage}%`;
      },
    },
    legend: {
      data: processedData.map(d => d.name),
      orient: orientation === 'horizontal' ? 'horizontal' : 'vertical',
      left: orientation === 'horizontal' ? 'center' : 'left',
      top: orientation === 'horizontal' ? (title ? 35 : 10) : 'middle',
      textStyle: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
    },
    series: [
      {
        name: title || 'Funnel',
        type: 'funnel',
        left: orientation === 'horizontal' ? '10%' : '25%',
        right: '10%',
        top: title ? 60 : 40,
        bottom: 20,
        width: orientation === 'horizontal' ? '80%' : '60%',
        minSize: '10%',
        maxSize: '100%',
        sort: sortOrder,
        orient: orientation,
        gap: 4,
        label: {
          show: showLabels,
          position: 'inside',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold',
          formatter: (params: any) => {
            const percentage = ((params.value / maxValue) * 100).toFixed(0);
            return `${params.name}\n${percentage}%`;
          },
        },
        labelLine: {
          show: false,
        },
        itemStyle: {
          borderColor: darkMode ? '#1f2937' : '#fff',
          borderWidth: 2,
        },
        emphasis: {
          label: {
            fontSize: 14,
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        data: processedData.map((item, index) => ({
          name: item.name,
          value: item.value,
          itemStyle: {
            color: getColorByIndex(index, darkMode),
          },
        })),
      },
    ],
  }), [title, darkMode, showLabels, sortOrder, orientation, processedData, maxValue]);

  const onEvents = React.useMemo(() => {
    if (!onStageClick) return undefined;

    return {
      click: (params: any) => {
        if (params.componentType === 'series') {
          onStageClick(params.name, params.value);
        }
      },
    };
  }, [onStageClick]);

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

// Color palette for funnel stages
function getColorByIndex(index: number, darkMode: boolean): string {
  const colors = darkMode
    ? ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80']
    : ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#0ea5e9', '#22c55e'];
  return colors[index % colors.length];
}

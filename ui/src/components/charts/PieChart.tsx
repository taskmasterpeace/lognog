import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface PieChartData {
  name: string;
  value: number;
}

export interface PieChartProps {
  data: PieChartData[];
  title?: string;
  height?: number;
  darkMode?: boolean;
  donut?: boolean;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  radius?: string | [string, string];
  onItemClick?: (name: string, value: number) => void;
}

const DEFAULT_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
];

export const PieChart: React.FC<PieChartProps> = ({
  data,
  title,
  height = 400,
  darkMode = false,
  donut = false,
  showLegend = true,
  legendPosition = 'right',
  radius,
  onItemClick,
}) => {
  const defaultRadius = donut ? ['40%', '70%'] : '70%';
  const pieRadius = radius || defaultRadius;

  const option: EChartsOption = React.useMemo(() => {
    const legendConfig: any = showLegend ? {
      orient: legendPosition === 'top' || legendPosition === 'bottom' ? 'horizontal' : 'vertical',
      [legendPosition]: legendPosition === 'top' || legendPosition === 'bottom' ? 'center' : 10,
      [legendPosition === 'top' || legendPosition === 'bottom' ? legendPosition : 'top']:
        legendPosition === 'top' || legendPosition === 'bottom'
          ? (legendPosition === 'top' ? (title ? 40 : 10) : 10)
          : 'middle',
      textStyle: {
        color: darkMode ? '#e5e7eb' : '#1f2937',
      },
      type: 'scroll',
    } : undefined;

    return {
      title: title ? {
        text: title,
        left: 'center',
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
          return `${params.name}<br/>Count: ${params.value} (${params.percent}%)`;
        },
      },
      legend: legendConfig,
      color: DEFAULT_COLORS,
      series: [
        {
          type: 'pie',
          radius: pieRadius,
          data: data,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          label: {
            color: darkMode ? '#e5e7eb' : '#1f2937',
            formatter: (params: any) => {
              return `{name|${params.name}}\n{percent|${params.percent}%}`;
            },
            rich: {
              name: {
                fontSize: 12,
                lineHeight: 18,
              },
              percent: {
                fontSize: 11,
                color: darkMode ? '#9ca3af' : '#6b7280',
              },
            },
          },
          labelLine: {
            lineStyle: {
              color: darkMode ? '#4b5563' : '#d1d5db',
            },
          },
          center: legendPosition === 'left' ? ['60%', '50%'] :
                  legendPosition === 'right' ? ['40%', '50%'] :
                  legendPosition === 'top' ? ['50%', '55%'] :
                  ['50%', '45%'],
        },
      ],
    };
  }, [data, title, darkMode, donut, showLegend, legendPosition, pieRadius]);

  const onEvents = React.useMemo(() => {
    if (!onItemClick) return undefined;

    return {
      click: (params: any) => {
        if (params.componentType === 'series') {
          onItemClick(params.name, params.value);
        }
      },
    };
  }, [onItemClick]);

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

import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHART_PALETTE, getChartTheme } from './palette';

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
  colors?: string[];
}

const DEFAULT_COLORS = CHART_PALETTE;

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
  colors,
}) => {
  const defaultRadius = donut ? ['40%', '70%'] : '70%';
  const pieRadius = radius || defaultRadius;
  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const legendConfig: any = showLegend ? {
      orient: legendPosition === 'top' || legendPosition === 'bottom' ? 'horizontal' : 'vertical',
      [legendPosition]: legendPosition === 'top' || legendPosition === 'bottom' ? 'center' : 10,
      [legendPosition === 'top' || legendPosition === 'bottom' ? legendPosition : 'top']:
        legendPosition === 'top' || legendPosition === 'bottom'
          ? (legendPosition === 'top' ? (title ? 40 : 10) : 10)
          : 'middle',
      textStyle: {
        color: theme.text,
      },
      type: 'scroll',
    } : undefined;

    return {
      title: title ? {
        text: title,
        left: 'center',
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
          return `${params.name}<br/>Count: ${params.value} (${params.percent}%)`;
        },
      },
      legend: legendConfig,
      color: colors || DEFAULT_COLORS,
      series: [
        {
          type: 'pie',
          radius: pieRadius,
          data: data,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.25)',
            },
          },
          label: {
            color: theme.text,
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
                color: theme.textMuted,
              },
            },
          },
          labelLine: {
            lineStyle: {
              color: theme.axis,
            },
          },
          center: legendPosition === 'left' ? ['60%', '50%'] :
                  legendPosition === 'right' ? ['40%', '50%'] :
                  legendPosition === 'top' ? ['50%', '55%'] :
                  ['50%', '45%'],
        },
      ],
    };
  }, [data, title, darkMode, donut, showLegend, legendPosition, pieRadius, colors, theme]);

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

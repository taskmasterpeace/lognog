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

  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      name: horizontal ? yAxisLabel : xAxisLabel,
      nameTextStyle: {
        color: theme.textMuted,
      },
      axisLabel: {
        color: theme.textMuted,
        interval: 0,
        rotate: horizontal ? 0 : 45,
        fontSize: 11,
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
        },
      ],
    };
  }, [categories, values, title, darkMode, horizontal, showValues, barColor, xAxisLabel, yAxisLabel, theme]);

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
        style={{ height: `${height}px` }}
        notMerge={true}
        lazyUpdate={true}
        onEvents={onEvents}
      />
    </div>
  );
};

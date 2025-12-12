import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

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
  barColor = '#5470c6',
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

  const option: EChartsOption = React.useMemo(() => {
    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      name: horizontal ? yAxisLabel : xAxisLabel,
      nameTextStyle: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      axisLabel: {
        color: darkMode ? '#9ca3af' : '#6b7280',
        interval: 0,
        rotate: horizontal ? 0 : 45,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: darkMode ? '#4b5563' : '#d1d5db',
        },
      },
    };

    const valueAxis = {
      type: 'value' as const,
      name: horizontal ? xAxisLabel : yAxisLabel,
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
    };

    return {
      title: title ? {
        text: title,
        textStyle: {
          color: darkMode ? '#e5e7eb' : '#1f2937',
          fontSize: 16,
        },
      } : undefined,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#4b5563' : '#d1d5db',
        textStyle: {
          color: darkMode ? '#e5e7eb' : '#1f2937',
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
            color: darkMode ? '#e5e7eb' : '#1f2937',
            fontSize: 11,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          barMaxWidth: 60,
        },
      ],
    };
  }, [categories, values, title, darkMode, horizontal, showValues, barColor, xAxisLabel, yAxisLabel]);

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

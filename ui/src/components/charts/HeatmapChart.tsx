import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface HeatmapData {
  hour: number;
  day: number;
  value: number;
}

export interface HeatmapChartProps {
  data: HeatmapData[];
  title?: string;
  height?: number;
  darkMode?: boolean;
  colorRange?: [string, string];
  showValues?: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i}:00`);

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data,
  title,
  height = 400,
  darkMode = false,
  colorRange = ['#10b981', '#ef4444'],
  showValues = false,
}) => {
  const processedData = React.useMemo(() => {
    return data.map(item => [item.hour, item.day, item.value]);
  }, [data]);

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
      position: 'top',
      backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: darkMode ? '#4b5563' : '#d1d5db',
      textStyle: {
        color: darkMode ? '#e5e7eb' : '#1f2937',
      },
      formatter: (params: any) => {
        const [hour, day, value] = params.data;
        return `${DAYS[day]} ${HOURS[hour]}<br/>Count: ${value}`;
      },
    },
    grid: {
      height: '70%',
      top: title ? 60 : 40,
      left: 80,
      right: 80,
    },
    xAxis: {
      type: 'category',
      data: HOURS,
      name: 'Hour of Day',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        color: darkMode ? '#9ca3af' : '#6b7280',
        fontSize: 12,
      },
      axisLabel: {
        color: darkMode ? '#9ca3af' : '#6b7280',
        interval: 2,
      },
      axisLine: {
        lineStyle: {
          color: darkMode ? '#4b5563' : '#d1d5db',
        },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: darkMode
            ? ['rgba(55, 65, 81, 0.2)', 'rgba(75, 85, 99, 0.2)']
            : ['rgba(250, 250, 250, 0.5)', 'rgba(240, 240, 240, 0.5)'],
        },
      },
    },
    yAxis: {
      type: 'category',
      data: DAYS,
      name: 'Day of Week',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: {
        color: darkMode ? '#9ca3af' : '#6b7280',
        fontSize: 12,
      },
      axisLabel: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      axisLine: {
        lineStyle: {
          color: darkMode ? '#4b5563' : '#d1d5db',
        },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: darkMode
            ? ['rgba(55, 65, 81, 0.2)', 'rgba(75, 85, 99, 0.2)']
            : ['rgba(250, 250, 250, 0.5)', 'rgba(240, 240, 240, 0.5)'],
        },
      },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%',
      textStyle: {
        color: darkMode ? '#9ca3af' : '#6b7280',
      },
      inRange: {
        color: [colorRange[0], '#fbbf24', colorRange[1]],
      },
    },
    series: [
      {
        name: 'Activity',
        type: 'heatmap',
        data: processedData,
        label: {
          show: showValues,
          color: darkMode ? '#e5e7eb' : '#1f2937',
          fontSize: 10,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  }), [processedData, maxValue, title, darkMode, colorRange, showValues]);

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

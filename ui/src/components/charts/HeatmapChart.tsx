import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getChartTheme, HEATMAP_HONEY_RAMP } from './palette';

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
  colorRange,
  showValues = false,
}) => {
  const theme = getChartTheme(darkMode);

  // Non-semantic activity heatmap: warm honey ramp by default. A caller-supplied
  // semantic range (e.g. green→red) is honored with an amber midpoint.
  const visualMapColors = React.useMemo<string[]>(() => {
    return colorRange
      ? [colorRange[0], '#CA8A04', colorRange[1]] // amber-600 midpoint (functional/semantic)
      : [...HEATMAP_HONEY_RAMP];
  }, [colorRange]);

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
        color: theme.text,
        fontSize: 16,
      },
    } : undefined,
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: {
        color: theme.text,
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
        color: theme.textMuted,
        fontSize: 12,
      },
      axisLabel: {
        color: theme.textMuted,
        interval: 2,
      },
      axisLine: {
        lineStyle: {
          color: theme.axis,
        },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: theme.splitArea,
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
        color: theme.textMuted,
        fontSize: 12,
      },
      axisLabel: {
        color: theme.textMuted,
      },
      axisLine: {
        lineStyle: {
          color: theme.axis,
        },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: theme.splitArea,
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
        color: theme.textMuted,
      },
      inRange: {
        color: visualMapColors,
      },
    },
    series: [
      {
        name: 'Activity',
        type: 'heatmap',
        data: processedData,
        label: {
          show: showValues,
          color: theme.text,
          fontSize: 10,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.25)',
          },
        },
      },
    ],
  }), [processedData, maxValue, title, darkMode, visualMapColors, showValues, theme]);

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

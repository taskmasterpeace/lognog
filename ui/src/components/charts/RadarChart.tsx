import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHART_ACCENT, getChartTheme } from './palette';

export interface RadarChartData {
  category: string;
  value: number;
}

export interface RadarChartProps {
  data: RadarChartData[];
  height?: number;
  darkMode?: boolean;
  seriesName?: string;
  color?: string;
  onPointClick?: (category: string, value: number) => void;
}

/**
 * Radar (spider) chart — compares one series across several categories, e.g.
 * `stats count by severity`. Each category becomes an axis.
 */
export const RadarChart: React.FC<RadarChartProps> = ({
  data,
  height = 240,
  darkMode = false,
  seriesName = 'value',
  color = CHART_ACCENT,
  onPointClick,
}) => {
  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.value));
    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.text },
      },
      radar: {
        indicator: data.map((d) => ({
          name: d.category === '' ? '(empty)' : d.category,
          max: Math.ceil(max * 1.1),
        })),
        axisName: { color: theme.textMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.grid } },
        splitArea: { areaStyle: { color: ['transparent'] } },
        axisLine: { lineStyle: { color: theme.axis } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: data.map((d) => d.value),
              name: seriesName,
              areaStyle: { color, opacity: 0.2 },
              lineStyle: { color, width: 2 },
              itemStyle: { color },
            },
          ],
        },
      ],
    };
  }, [data, theme, seriesName, color]);

  const onEvents = React.useMemo(() => {
    if (!onPointClick) return undefined;
    return {
      // Radar clicks report the series, not a specific axis, so drill on the
      // top category when the shape is clicked.
      click: () => {
        if (data.length > 0) onPointClick(data[0].category, data[0].value);
      },
    };
  }, [onPointClick, data]);

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

export default RadarChart;

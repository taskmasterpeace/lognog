import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHART_ACCENT, getChartTheme } from './palette';

export interface TimeSeriesData {
  timestamp: string | number;
  value: number;
  series?: string;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesData[];
  title?: string;
  height?: number;
  showZoom?: boolean;
  showArea?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  darkMode?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
  onBrushEnd?: (startTime: number, endTime: number) => void;
  chartType?: 'line' | 'bar';
  onBarClick?: (timestamp: number) => void;
  barColor?: string;
  barHoverColor?: string;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  title,
  height = 400,
  showZoom = true,
  showArea = true,
  darkMode = false,
  yAxisLabel = 'Count',
  xAxisLabel = 'Time',
  onBrushEnd,
  chartType = 'line',
  onBarClick,
  barColor = CHART_ACCENT, // honey-500
  barHoverColor,
}) => {
  const seriesMap = React.useMemo(() => {
    const map = new Map<string, { timestamps: number[]; values: number[] }>();

    data.forEach(item => {
      const seriesName = item.series || 'default';
      if (!map.has(seriesName)) {
        map.set(seriesName, { timestamps: [], values: [] });
      }
      const series = map.get(seriesName)!;
      const timestamp = typeof item.timestamp === 'string'
        ? new Date(item.timestamp).getTime()
        : item.timestamp;
      series.timestamps.push(timestamp);
      series.values.push(item.value);
    });

    return map;
  }, [data]);

  // Calculate hover color based on dark mode
  const computedHoverColor = barHoverColor || (darkMode ? '#DCA23E' : '#A66A1E');
  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const seriesConfig = Array.from(seriesMap.entries()).map(([name, { timestamps, values }]) => {
      if (chartType === 'bar') {
        return {
          name,
          type: 'bar' as const,
          data: timestamps.map((time, idx) => [time, values[idx]]),
          itemStyle: {
            color: barColor,
            borderRadius: [2, 2, 0, 0],
          },
          emphasis: {
            itemStyle: {
              color: computedHoverColor,
            },
          },
          barMaxWidth: 50,
        };
      }
      return {
        name,
        type: 'line' as const,
        data: timestamps.map((time, idx) => [time, values[idx]]),
        smooth: true,
        areaStyle: showArea ? { opacity: 0.3 } : undefined,
        emphasis: {
          focus: 'series' as const,
        },
      };
    });

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
          type: 'cross',
          label: {
            backgroundColor: theme.axisPointerBg,
          },
        },
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: {
          color: theme.text,
        },
      },
      legend: seriesMap.size > 1 ? {
        data: Array.from(seriesMap.keys()),
        textStyle: {
          color: theme.text,
        },
        top: title ? 35 : 10,
      } : undefined,
      grid: {
        left: '3%',
        right: '4%',
        bottom: showZoom ? '15%' : '10%',
        top: seriesMap.size > 1 ? (title ? 70 : 50) : (title ? 50 : 30),
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        name: xAxisLabel,
        nameTextStyle: {
          color: theme.textMuted,
        },
        axisLabel: {
          color: theme.textMuted,
          hideOverlap: true,
          formatter: (value: number) => {
            const date = new Date(value);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
          },
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
      dataZoom: showZoom ? [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          start: 0,
          end: 100,
          textStyle: {
            color: theme.textMuted,
          },
          borderColor: theme.axis,
          dataBackground: {
            lineStyle: {
              color: theme.axis,
            },
            areaStyle: {
              color: theme.grid,
            },
          },
        },
      ] : undefined,
      toolbox: onBrushEnd ? {
        show: true,
        right: 10,
        top: 0,
        feature: {
          brush: {
            type: ['lineX', 'clear'],
            title: {
              lineX: 'Horizontal selection',
              clear: 'Clear selection',
            },
          },
        },
        iconStyle: {
          borderColor: theme.textMuted,
        },
        emphasis: {
          iconStyle: {
            borderColor: CHART_ACCENT,
          },
        },
      } : undefined,
      brush: onBrushEnd ? {
        toolbox: ['lineX', 'clear'],
        brushLink: 'all',
        xAxisIndex: 0,
        brushType: 'lineX',  // Enable brush mode automatically for drag-to-select
        throttleType: 'debounce',
        throttleDelay: 300,
        brushStyle: {
          borderWidth: 1,
          color: 'rgba(200, 134, 43, 0.2)', // honey-500 @ 20%
          borderColor: CHART_ACCENT,
        },
      } : undefined,
      series: seriesConfig,
    };
  }, [seriesMap, title, showZoom, showArea, darkMode, yAxisLabel, xAxisLabel, onBrushEnd, chartType, barColor, computedHoverColor, theme]);

  const onEvents = React.useMemo(() => {
    const events: Record<string, (params: unknown) => void> = {};

    if (onBrushEnd) {
      // Handle brush selection end
      events.brushEnd = (params: any) => {
        if (params.areas && params.areas.length > 0) {
          const area = params.areas[0];
          if (area.coordRange && area.coordRange.length >= 2) {
            const [startTime, endTime] = area.coordRange;
            onBrushEnd(startTime, endTime);
          }
        }
      };

      // Also handle brushSelected for immediate feedback
      events.brushSelected = (params: any) => {
        if (params.batch && params.batch.length > 0) {
          const batch = params.batch[0];
          if (batch.areas && batch.areas.length > 0) {
            const area = batch.areas[0];
            if (area.coordRange && area.coordRange.length >= 2) {
              const [startTime, endTime] = area.coordRange;
              onBrushEnd(startTime, endTime);
            }
          }
        }
      };
    }

    if (onBarClick && chartType === 'bar') {
      events.click = (params: any) => {
        // Handle different data formats from ECharts
        let timestamp: number | undefined;
        if (params.data) {
          if (Array.isArray(params.data) && params.data.length >= 1) {
            timestamp = params.data[0];
          } else if (typeof params.data === 'object' && params.data.value) {
            // Handle object format { value: [time, count] }
            timestamp = Array.isArray(params.data.value) ? params.data.value[0] : params.data.value;
          }
        }
        // Also check params.value directly (some ECharts versions use this)
        if (!timestamp && params.value && Array.isArray(params.value)) {
          timestamp = params.value[0];
        }
        if (timestamp) {
          onBarClick(timestamp);
        }
      };
    }

    return Object.keys(events).length > 0 ? events : undefined;
  }, [onBrushEnd, onBarClick, chartType]);

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

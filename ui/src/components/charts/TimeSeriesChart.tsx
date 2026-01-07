import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

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
  autoRefresh = false,
  refreshInterval = 30000,
  darkMode = false,
  yAxisLabel = 'Count',
  xAxisLabel = 'Time',
  onBrushEnd,
  chartType = 'line',
  onBarClick,
  barColor = '#f59e0b', // amber-500
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
  const computedHoverColor = barHoverColor || (darkMode ? '#fbbf24' : '#d97706');

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
          color: darkMode ? '#e5e7eb' : '#1f2937',
          fontSize: 16,
        },
      } : undefined,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: darkMode ? '#374151' : '#6b7280',
          },
        },
        backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#4b5563' : '#d1d5db',
        textStyle: {
          color: darkMode ? '#e5e7eb' : '#1f2937',
        },
      },
      legend: seriesMap.size > 1 ? {
        data: Array.from(seriesMap.keys()),
        textStyle: {
          color: darkMode ? '#e5e7eb' : '#1f2937',
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
          color: darkMode ? '#9ca3af' : '#6b7280',
        },
        axisLabel: {
          color: darkMode ? '#9ca3af' : '#6b7280',
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
            color: darkMode ? '#9ca3af' : '#6b7280',
          },
          borderColor: darkMode ? '#4b5563' : '#d1d5db',
          dataBackground: {
            lineStyle: {
              color: darkMode ? '#4b5563' : '#d1d5db',
            },
            areaStyle: {
              color: darkMode ? '#374151' : '#f3f4f6',
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
          borderColor: darkMode ? '#9ca3af' : '#6b7280',
        },
        emphasis: {
          iconStyle: {
            borderColor: '#f59e0b',
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
          color: 'rgba(245, 158, 11, 0.2)',
          borderColor: '#f59e0b',
        },
      } : undefined,
      series: seriesConfig,
    };
  }, [seriesMap, title, showZoom, showArea, darkMode, yAxisLabel, xAxisLabel, onBrushEnd, chartType, barColor, computedHoverColor]);

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

  React.useEffect(() => {
    if (!autoRefresh || !refreshInterval) return;

    const interval = setInterval(() => {
      // Trigger re-render or refetch data
      // This is a placeholder - actual implementation would depend on data fetching strategy
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

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

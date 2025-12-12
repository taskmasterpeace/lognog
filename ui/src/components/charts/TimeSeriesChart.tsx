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

  const option: EChartsOption = React.useMemo(() => {
    const seriesConfig = Array.from(seriesMap.entries()).map(([name, { timestamps, values }]) => ({
      name,
      type: 'line' as const,
      data: timestamps.map((time, idx) => [time, values[idx]]),
      smooth: true,
      areaStyle: showArea ? { opacity: 0.3 } : undefined,
      emphasis: {
        focus: 'series' as const,
      },
    }));

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
          formatter: (value: number) => {
            const date = new Date(value);
            return date.toLocaleTimeString();
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
      brush: onBrushEnd ? {
        toolbox: ['lineX', 'clear'],
        xAxisIndex: 0,
      } : undefined,
      series: seriesConfig,
    };
  }, [seriesMap, title, showZoom, showArea, darkMode, yAxisLabel, xAxisLabel, onBrushEnd]);

  const onEvents = React.useMemo(() => {
    if (!onBrushEnd) return undefined;

    return {
      brushEnd: (params: any) => {
        if (params.areas && params.areas.length > 0) {
          const area = params.areas[0];
          const [startTime, endTime] = area.coordRange;
          onBrushEnd(startTime, endTime);
        }
      },
    };
  }, [onBrushEnd]);

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

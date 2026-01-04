import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface TimeSeriesData {
  timestamp: string | number;
  value: number;
  series?: string;
}

export type YAxisScaleMode = 'auto' | 'padded' | 'percentile' | 'log' | 'fixed';

export interface TimeSeriesChartEnhancedProps {
  data: TimeSeriesData[];
  title?: string;
  height?: number | 'auto';
  minHeight?: number;
  maxHeight?: number;
  showZoom?: boolean;
  showArea?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  darkMode?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
  onBrushEnd?: (startTime: number, endTime: number) => void;
  // New Y-axis scaling options
  yAxisScaleMode?: YAxisScaleMode;
  yAxisMin?: number;
  yAxisMax?: number;
  percentileThreshold?: number; // For percentile mode, default 95
  paddingPercent?: number; // For padded mode, default 10
}

/**
 * Calculate Y-axis domain based on scale mode
 */
function calculateYAxisDomain(
  values: number[],
  mode: YAxisScaleMode,
  options: {
    min?: number;
    max?: number;
    percentile?: number;
    padding?: number;
  }
): { min: number | 'dataMin' | undefined; max: number | 'dataMax' | undefined; type: 'value' | 'log' } {
  if (values.length === 0) {
    return { min: undefined, max: undefined, type: 'value' };
  }

  switch (mode) {
    case 'auto':
      // Let ECharts handle it automatically
      return { min: undefined, max: undefined, type: 'value' };

    case 'padded': {
      // Add padding to min/max to ensure lines are visible
      const dataMin = Math.min(...values);
      const dataMax = Math.max(...values);
      const range = dataMax - dataMin || 1;
      const padding = range * ((options.padding || 10) / 100);
      return {
        min: Math.max(0, dataMin - padding),
        max: dataMax + padding,
        type: 'value',
      };
    }

    case 'percentile': {
      // Use percentile to handle spikes - ignore outliers
      const sorted = [...values].sort((a, b) => a - b);
      const percentileIndex = Math.floor(sorted.length * ((options.percentile || 95) / 100));
      const percentileMax = sorted[Math.min(percentileIndex, sorted.length - 1)];
      const dataMin = Math.min(...values);
      // Add 10% padding above percentile max
      return {
        min: Math.max(0, dataMin * 0.9),
        max: percentileMax * 1.1,
        type: 'value',
      };
    }

    case 'log':
      // Logarithmic scale for data with large variance
      return {
        min: undefined,
        max: undefined,
        type: 'log',
      };

    case 'fixed':
      // User-defined fixed range
      return {
        min: options.min ?? 0,
        max: options.max ?? Math.max(...values) * 1.1,
        type: 'value',
      };

    default:
      return { min: undefined, max: undefined, type: 'value' };
  }
}

/**
 * Calculate optimal chart height based on data
 */
function calculateAutoHeight(
  dataCount: number,
  seriesCount: number,
  minHeight: number,
  maxHeight: number
): number {
  // Base height plus adjustments for data density
  const baseHeight = 300;
  const seriesAdjustment = Math.min(seriesCount * 30, 150);
  const densityAdjustment = Math.min(Math.log10(dataCount + 1) * 50, 100);

  const calculatedHeight = baseHeight + seriesAdjustment + densityAdjustment;

  return Math.max(minHeight, Math.min(maxHeight, calculatedHeight));
}

export const TimeSeriesChartEnhanced: React.FC<TimeSeriesChartEnhancedProps> = ({
  data,
  title,
  height = 400,
  minHeight = 200,
  maxHeight = 600,
  showZoom = true,
  showArea = true,
  autoRefresh = false,
  refreshInterval = 30000,
  darkMode = false,
  yAxisLabel = 'Count',
  xAxisLabel = 'Time',
  onBrushEnd,
  yAxisScaleMode = 'padded',
  yAxisMin,
  yAxisMax,
  percentileThreshold = 95,
  paddingPercent = 10,
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

  // Calculate actual chart height
  const chartHeight = React.useMemo(() => {
    if (height === 'auto') {
      return calculateAutoHeight(data.length, seriesMap.size, minHeight, maxHeight);
    }
    return height;
  }, [height, data.length, seriesMap.size, minHeight, maxHeight]);

  // Calculate Y-axis domain
  const yAxisDomain = React.useMemo(() => {
    const allValues = Array.from(seriesMap.values()).flatMap(s => s.values);
    return calculateYAxisDomain(allValues, yAxisScaleMode, {
      min: yAxisMin,
      max: yAxisMax,
      percentile: percentileThreshold,
      padding: paddingPercent,
    });
  }, [seriesMap, yAxisScaleMode, yAxisMin, yAxisMax, percentileThreshold, paddingPercent]);

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
      // Make sure line is visible
      lineStyle: {
        width: 2,
      },
      symbolSize: 4,
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
        type: yAxisDomain.type,
        name: yAxisLabel,
        min: yAxisDomain.min,
        max: yAxisDomain.max,
        nameTextStyle: {
          color: darkMode ? '#9ca3af' : '#6b7280',
        },
        axisLabel: {
          color: darkMode ? '#9ca3af' : '#6b7280',
          formatter: (value: number) => {
            // Format large numbers
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
            return value.toString();
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
  }, [seriesMap, title, showZoom, showArea, darkMode, yAxisLabel, xAxisLabel, onBrushEnd, yAxisDomain]);

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
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: `${chartHeight}px` }}
        notMerge={true}
        lazyUpdate={true}
        onEvents={onEvents}
      />
    </div>
  );
};

/**
 * Scale mode selector component for use in dashboard panels
 */
export const YAxisScaleModeSelector: React.FC<{
  value: YAxisScaleMode;
  onChange: (mode: YAxisScaleMode) => void;
  darkMode?: boolean;
}> = ({ value, onChange, darkMode }) => {
  const modes: { value: YAxisScaleMode; label: string; description: string }[] = [
    { value: 'auto', label: 'Auto', description: 'Let chart determine scale automatically' },
    { value: 'padded', label: 'Padded', description: 'Auto with 10% padding for visibility' },
    { value: 'percentile', label: '95th %ile', description: 'Ignore spikes above 95th percentile' },
    { value: 'log', label: 'Log', description: 'Logarithmic scale for large variance' },
    { value: 'fixed', label: 'Fixed', description: 'Set min/max manually' },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        Y-Axis:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as YAxisScaleMode)}
        className={`text-xs px-2 py-1 rounded border ${
          darkMode
            ? 'bg-slate-800 border-slate-600 text-slate-300'
            : 'bg-white border-slate-300 text-slate-700'
        }`}
      >
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value} title={mode.description}>
            {mode.label}
          </option>
        ))}
      </select>
    </div>
  );
};

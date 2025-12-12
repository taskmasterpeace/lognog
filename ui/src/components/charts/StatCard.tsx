import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: number | string;
  previousValue?: number;
  unit?: string;
  format?: 'number' | 'percentage' | 'bytes' | 'custom';
  customFormatter?: (value: number | string) => string;
  sparklineData?: number[];
  height?: number;
  darkMode?: boolean;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  color?: string;
}

const formatValue = (
  value: number | string,
  format: 'number' | 'percentage' | 'bytes' | 'custom',
  customFormatter?: (value: number | string) => string
): string => {
  if (typeof value === 'string') return value;

  if (customFormatter) return customFormatter(value);

  switch (format) {
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'bytes':
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = value;
      let unitIndex = 0;
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }
      return `${size.toFixed(1)} ${units[unitIndex]}`;
    case 'number':
    default:
      return value.toLocaleString();
  }
};

const calculateTrend = (current: number, previous?: number): number => {
  if (previous === undefined || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  previousValue,
  unit,
  format = 'number',
  customFormatter,
  sparklineData,
  height = 150,
  darkMode = false,
  icon,
  trend,
  trendLabel,
  color = '#5470c6',
}) => {
  const formattedValue = formatValue(value, format, customFormatter);

  const trendPercentage = React.useMemo(() => {
    if (typeof value === 'string' || previousValue === undefined) return null;
    return calculateTrend(value, previousValue);
  }, [value, previousValue]);

  const trendDirection = trend || (trendPercentage !== null
    ? (trendPercentage > 0 ? 'up' : trendPercentage < 0 ? 'down' : 'neutral')
    : 'neutral');

  const sparklineOption: EChartsOption | null = React.useMemo(() => {
    if (!sparklineData || sparklineData.length === 0) return null;

    return {
      backgroundColor: 'transparent',
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      },
      xAxis: {
        type: 'category',
        show: false,
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        show: false,
      },
      series: [
        {
          type: 'line',
          data: sparklineData,
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: color,
            width: 2,
            opacity: 0.4,
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}40` },
                { offset: 1, color: `${color}10` },
              ],
            },
          },
        },
      ],
    };
  }, [sparklineData, color]);

  const getTrendIcon = () => {
    switch (trendDirection) {
      case 'up':
        return <TrendingUp className="w-4 h-4" />;
      case 'down':
        return <TrendingDown className="w-4 h-4" />;
      case 'neutral':
      default:
        return <Minus className="w-4 h-4" />;
    }
  };

  const getTrendColor = () => {
    switch (trendDirection) {
      case 'up':
        return darkMode ? 'text-green-400' : 'text-green-600';
      case 'down':
        return darkMode ? 'text-red-400' : 'text-red-600';
      case 'neutral':
      default:
        return darkMode ? 'text-gray-400' : 'text-gray-600';
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${
        darkMode
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200'
      }`}
      style={{ height: `${height}px` }}
    >
      {/* Sparkline background */}
      {sparklineOption && (
        <div className="absolute inset-0 opacity-30">
          <ReactECharts
            option={sparklineOption}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      )}

      {/* Content */}
      <div className="relative h-full p-4 flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              {title}
            </p>
          </div>
          {icon && (
            <div
              className={`flex-shrink-0 ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="flex-1 flex items-center">
          <div>
            <p
              className={`text-3xl font-bold ${
                darkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              {formattedValue}
              {unit && (
                <span
                  className={`text-lg ml-1 ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  {unit}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Trend */}
        {(trendPercentage !== null || trendLabel) && (
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-sm font-medium ${getTrendColor()}`}>
              {getTrendIcon()}
              {trendPercentage !== null && `${Math.abs(trendPercentage).toFixed(1)}%`}
            </span>
            {trendLabel && (
              <span
                className={`text-sm ${
                  darkMode ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

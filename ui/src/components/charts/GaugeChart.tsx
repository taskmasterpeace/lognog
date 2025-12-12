import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface GaugeChartProps {
  value: number;
  title?: string;
  min?: number;
  max?: number;
  height?: number;
  darkMode?: boolean;
  thresholds?: {
    low: number;
    medium: number;
    high: number;
  };
  unit?: string;
  animated?: boolean;
}

export const GaugeChart: React.FC<GaugeChartProps> = ({
  value,
  title,
  min = 0,
  max = 100,
  height = 300,
  darkMode = false,
  thresholds = { low: 33, medium: 66, high: 100 },
  unit = '',
  animated = true,
}) => {
  const option: EChartsOption = React.useMemo(() => ({
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min,
        max,
        splitNumber: 10,
        itemStyle: {
          color: 'auto' as any,
        },
        progress: {
          show: true,
          width: 18,
        },
        pointer: {
          length: '70%',
          width: 8,
          itemStyle: {
            color: 'auto',
          },
        },
        axisLine: {
          lineStyle: {
            width: 18,
            color: [
              [thresholds.low / max, '#10b981'],
              [thresholds.medium / max, '#fbbf24'],
              [1, '#ef4444'],
            ],
          },
        },
        axisTick: {
          distance: -22,
          splitNumber: 5,
          lineStyle: {
            width: 2,
            color: darkMode ? '#4b5563' : '#d1d5db',
          },
        },
        splitLine: {
          distance: -25,
          length: 14,
          lineStyle: {
            width: 3,
            color: darkMode ? '#4b5563' : '#d1d5db',
          },
        },
        axisLabel: {
          distance: -45,
          color: darkMode ? '#9ca3af' : '#6b7280',
          fontSize: 12,
        },
        anchor: {
          show: false,
        },
        title: {
          show: !!title,
          offsetCenter: [0, '80%'],
          fontSize: 14,
          color: darkMode ? '#9ca3af' : '#6b7280',
        },
        detail: {
          valueAnimation: animated,
          width: '60%',
          lineHeight: 40,
          borderRadius: 8,
          offsetCenter: [0, '10%'],
          fontSize: 32,
          fontWeight: 'bold',
          formatter: (val: number) => `{value|${val.toFixed(1)}}${unit ? `{unit|${unit}}` : ''}`,
          color: 'auto',
          rich: {
            value: {
              fontSize: 32,
              fontWeight: 'bold',
              color: darkMode ? '#e5e7eb' : '#1f2937',
            },
            unit: {
              fontSize: 18,
              color: darkMode ? '#9ca3af' : '#6b7280',
              padding: [0, 0, 0, 5],
            },
          },
        },
        data: [
          {
            value,
            name: title || '',
          },
        ],
      },
    ],
  }), [value, title, min, max, darkMode, thresholds, unit, animated]);

  return (
    <div className="w-full flex items-center justify-center">
      <ReactECharts
        option={option}
        style={{ height: `${height}px`, width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};

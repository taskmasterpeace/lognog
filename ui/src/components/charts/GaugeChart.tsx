import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getChartTheme } from './palette';

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
  const theme = getChartTheme(darkMode);

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
              [thresholds.low / max, '#16A34A'],   // green-600 — low/healthy
              [thresholds.medium / max, '#C8862B'], // honey-500 — medium (brand-warm)
              [1, '#DC2626'],                       // red-600 — high/critical
            ],
          },
        },
        axisTick: {
          distance: -22,
          splitNumber: 5,
          lineStyle: {
            width: 2,
            color: theme.axis,
          },
        },
        splitLine: {
          distance: -25,
          length: 14,
          lineStyle: {
            width: 3,
            color: theme.axis,
          },
        },
        axisLabel: {
          distance: -45,
          color: theme.textMuted,
          fontSize: 12,
        },
        anchor: {
          show: false,
        },
        title: {
          show: !!title,
          offsetCenter: [0, '80%'],
          fontSize: 14,
          color: theme.textMuted,
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
              color: theme.text,
            },
            unit: {
              fontSize: 18,
              color: theme.textMuted,
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
  }), [value, title, min, max, darkMode, thresholds, unit, animated, theme]);

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

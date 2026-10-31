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
  // In a small dashboard tile the tick labels and ticks pile on top of the
  // value; drop them and draw a thinner band with the value below the dial.
  const compact = height < 180;

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
          // Off: the coloured axisLine (green→honey→red zones) + pointer is the
          // gauge. A progress overlay defaults to ECharts blue, which is off-brand.
          show: false,
        },
        pointer: {
          length: compact ? '55%' : '70%',
          width: compact ? 5 : 8,
          itemStyle: {
            color: 'auto',
          },
        },
        axisLine: {
          lineStyle: {
            width: compact ? 10 : 18,
            color: (() => {
              // Guard against max <= 0 (would NaN/Infinity the offsets) and keep
              // the offset stops within an ascending [0, 1] range.
              const divisor = max > 0 ? max : 1;
              const clamp = (n: number) => Math.min(1, Math.max(0, n));
              const lowStop = clamp(thresholds.low / divisor);
              const medStop = clamp(Math.max(thresholds.medium / divisor, lowStop));
              return [
                [lowStop, '#16A34A'],   // green-600 — low/healthy
                [medStop, '#C8862B'],   // honey-500 — medium (brand-warm)
                [1, '#DC2626'],         // red-600 — high/critical
              ];
            })(),
          },
        },
        axisTick: {
          show: !compact,
          distance: -22,
          splitNumber: 5,
          lineStyle: {
            width: 2,
            color: theme.axis,
          },
        },
        splitLine: {
          show: !compact,
          distance: -25,
          length: 14,
          lineStyle: {
            width: 3,
            color: theme.axis,
          },
        },
        axisLabel: {
          show: !compact,
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
          offsetCenter: [0, compact ? '45%' : '10%'],
          fontSize: compact ? 20 : 32,
          fontWeight: 'bold',
          formatter: (val: number) => {
            const n = Number(val);
            const display = Number.isFinite(n) ? n.toFixed(1) : '0';
            return `{value|${display}}${unit ? `{unit|${unit}}` : ''}`;
          },
          color: 'auto',
          rich: {
            value: {
              fontSize: compact ? 20 : 32,
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
  }), [value, title, min, max, darkMode, thresholds, unit, animated, theme, compact]);

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

import React from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import 'echarts-wordcloud';

export interface WordCloudData {
  name: string;
  value: number;
}

export interface WordCloudChartProps {
  data: WordCloudData[];
  height?: number;
  darkMode?: boolean;
  shape?: 'circle' | 'cardioid' | 'diamond' | 'triangle' | 'star' | 'pentagon';
  colorScheme?: string[];
  onWordClick?: (word: string, value: number) => void;
  maxWords?: number;
}

const DEFAULT_COLORS = [
  '#f59e0b', // amber-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#22c55e', // green-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
];

export const WordCloudChart: React.FC<WordCloudChartProps> = ({
  data,
  height = 300,
  darkMode = false,
  shape = 'circle',
  colorScheme = DEFAULT_COLORS,
  onWordClick,
  maxWords = 100,
}) => {
  // Limit and sort data
  const processedData = React.useMemo(() => {
    return [...data]
      .sort((a, b) => b.value - a.value)
      .slice(0, maxWords)
      .map((item) => ({
        name: item.name,
        value: item.value,
      }));
  }, [data, maxWords]);

  const option = React.useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      formatter: (params: any) => {
        return `<strong>${params.name}</strong>: ${params.value.toLocaleString()}`;
      },
      backgroundColor: darkMode ? '#1e293b' : '#fff',
      borderColor: darkMode ? '#334155' : '#e2e8f0',
      textStyle: {
        color: darkMode ? '#e2e8f0' : '#1e293b',
      },
    },
    series: [
      {
        type: 'wordCloud',
        shape: shape,
        left: 'center',
        top: 'center',
        width: '90%',
        height: '90%',
        sizeRange: [12, 60],
        rotationRange: [-45, 45],
        rotationStep: 15,
        gridSize: 8,
        drawOutOfBound: false,
        layoutAnimation: true,
        textStyle: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 'bold',
          color: () => {
            return colorScheme[Math.floor(Math.random() * colorScheme.length)];
          },
        },
        emphasis: {
          focus: 'self',
          textStyle: {
            textShadowBlur: 10,
            textShadowColor: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          },
        },
        data: processedData,
      },
    ],
  }), [processedData, darkMode, shape, colorScheme]);

  const handleEvents = React.useMemo(() => ({
    click: (params: any) => {
      if (onWordClick && params.name) {
        onWordClick(params.name, params.value);
      }
    },
  }), [onWordClick]);

  if (!data || data.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-slate-400 dark:text-slate-500"
        style={{ height: `${height}px` }}
      >
        No data for word cloud
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactECharts
        echarts={echarts}
        option={option}
        style={{ height: `${height}px`, width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
        onEvents={handleEvents}
      />
    </div>
  );
};

import React from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import 'echarts-wordcloud';
import { CHART_PALETTE } from './palette';

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

const DEFAULT_COLORS = CHART_PALETTE;

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
      backgroundColor: darkMode ? 'rgba(45, 31, 19, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: darkMode ? '#5A3F24' : '#E8DFD0',
      textStyle: {
        color: darkMode ? '#D4C4B0' : '#5A3F24',
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
        className="w-full flex items-center justify-center text-nog-400 dark:text-nog-500"
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

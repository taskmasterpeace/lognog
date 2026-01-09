import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface TreemapNode {
  name: string;
  value: number;
  children?: TreemapNode[];
}

export interface TreemapChartProps {
  data: TreemapNode[];
  title?: string;
  height?: number;
  darkMode?: boolean;
  showLabels?: boolean;
  maxDepth?: number;
  onNodeClick?: (node: TreemapNode, path: string[]) => void;
}

export const TreemapChart: React.FC<TreemapChartProps> = ({
  data,
  title,
  height = 400,
  darkMode = false,
  showLabels = true,
  maxDepth = 2,
  onNodeClick,
}) => {
  const option: EChartsOption = React.useMemo(() => ({
    title: title ? {
      text: title,
      textStyle: {
        color: darkMode ? '#e5e7eb' : '#1f2937',
        fontSize: 16,
      },
    } : undefined,
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: darkMode ? '#4b5563' : '#d1d5db',
      textStyle: {
        color: darkMode ? '#e5e7eb' : '#1f2937',
      },
      formatter: (params: any) => {
        const treePathInfo = params.treePathInfo || [];
        const path = treePathInfo.map((item: any) => item.name).join(' / ');
        return `<strong>${path}</strong><br/>Value: ${params.value?.toLocaleString() || 0}`;
      },
    },
    series: [
      {
        name: title || 'Treemap',
        type: 'treemap',
        visibleMin: 300,
        leafDepth: maxDepth,
        roam: false,
        top: title ? 50 : 20,
        left: 10,
        right: 10,
        bottom: 10,
        label: {
          show: showLabels,
          formatter: '{b}',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold',
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowBlur: 4,
        },
        upperLabel: {
          show: true,
          height: 30,
          color: darkMode ? '#e5e7eb' : '#1f2937',
          backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          borderRadius: 4,
          padding: [4, 8],
        },
        itemStyle: {
          borderColor: darkMode ? '#1f2937' : '#fff',
          borderWidth: 2,
          gapWidth: 2,
        },
        levels: [
          {
            itemStyle: {
              borderColor: darkMode ? '#374151' : '#e5e7eb',
              borderWidth: 4,
              gapWidth: 4,
            },
            upperLabel: {
              show: false,
            },
          },
          {
            colorSaturation: [0.35, 0.6],
            itemStyle: {
              borderColorSaturation: 0.6,
              gapWidth: 2,
            },
          },
          {
            colorSaturation: [0.3, 0.5],
            itemStyle: {
              borderColorSaturation: 0.5,
              gapWidth: 1,
            },
          },
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        data: addColorsToData(data, darkMode),
      },
    ],
  }), [title, darkMode, showLabels, maxDepth, data]);

  const onEvents = React.useMemo(() => {
    if (!onNodeClick) return undefined;

    return {
      click: (params: any) => {
        if (params.componentType === 'series') {
          const path = (params.treePathInfo || []).map((item: any) => item.name);
          const node: TreemapNode = {
            name: params.name,
            value: params.value,
          };
          onNodeClick(node, path);
        }
      },
    };
  }, [onNodeClick]);

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

// Add colors to data recursively
function addColorsToData(data: TreemapNode[], darkMode: boolean): TreemapNode[] {
  const colors = darkMode
    ? ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80', '#e879f9', '#f472b6']
    : ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#0ea5e9', '#22c55e', '#d946ef', '#ec4899'];

  return data.map((node, index) => ({
    ...node,
    itemStyle: {
      color: colors[index % colors.length],
    },
    children: node.children ? addColorsToData(node.children, darkMode) : undefined,
  }));
}

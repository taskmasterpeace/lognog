import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHART_PALETTE, getChartTheme } from './palette';

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyChartProps {
  data: SankeyLink[];
  height?: number;
  darkMode?: boolean;
}

// Zero-width marker so a value that is both a source and a target (e.g. the same
// host on the left and right) becomes two distinct nodes instead of a cycle,
// which ECharts' sankey refuses to lay out. Stripped from the visible label.
const T = '​';

/**
 * Sankey (flow) diagram between two categorical columns, e.g.
 * `stats count by app_name action` → app on the left, action on the right,
 * band width = count.
 */
export const SankeyChart: React.FC<SankeyChartProps> = ({ data, height = 260, darkMode = false }) => {
  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const nodeNames = new Set<string>();
    for (const l of data) {
      nodeNames.add(l.source);
      nodeNames.add(l.target + T);
    }
    const nodes = Array.from(nodeNames).map((name) => ({ name }));
    const links = data
      .filter((l) => l.value > 0 && l.source !== '' && l.target !== '')
      .map((l) => ({ source: l.source, target: l.target + T, value: l.value }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.text },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) =>
          String(p.name || '').split(T).join('') + (p.value != null ? `: ${p.value}` : ''),
      },
      series: [
        {
          type: 'sankey',
          data: nodes,
          links,
          emphasis: { focus: 'adjacency' as const },
          nodeAlign: 'justify' as const,
          label: {
            color: theme.text,
            fontSize: 11,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (p: any) => String(p.name || '').split(T).join(''),
          },
          lineStyle: { color: 'gradient' as const, opacity: 0.45 },
          itemStyle: { color: CHART_PALETTE[0], borderColor: theme.tooltipBorder },
          left: 8,
          right: 8,
          top: 10,
          bottom: 10,
        },
      ],
    };
  }, [data, theme]);

  if (!data || data.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-nog-400 dark:text-nog-500"
        style={{ height: `${height}px` }}
      >
        No data to display
      </div>
    );
  }

  return (
    <div className="w-full">
      <ReactECharts option={option} style={{ height: `${height}px` }} notMerge={true} lazyUpdate={true} />
    </div>
  );
};

export default SankeyChart;

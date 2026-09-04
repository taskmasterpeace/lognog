import React from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { getChartTheme, CHART_ACCENT } from './palette';

export interface GeoMapData {
  /** Country name matching the world GeoJSON `properties.name` (e.g. "United States"). */
  name: string;
  value: number;
}

export interface GeoMapChartProps {
  data: GeoMapData[];
  height?: number;
  darkMode?: boolean;
  onCountryClick?: (name: string, value: number) => void;
}

// The world map (~250KB) is served from /maps and registered once, lazily, so
// it never bloats the main bundle. echarts-for-react shares this echarts module.
let registered = false;
let mapPromise: Promise<boolean> | null = null;
function ensureWorldMap(): Promise<boolean> {
  if (registered) return Promise.resolve(true);
  if (!mapPromise) {
    mapPromise = fetch('/maps/world.json')
      .then((r) => r.json())
      .then((geo) => {
        echarts.registerMap('world', geo);
        registered = true;
        return true;
      })
      .catch(() => {
        mapPromise = null;
        return false;
      });
  }
  return mapPromise;
}

/**
 * Choropleth world map — colours countries by a value, e.g.
 * `stats count by country`. Country names must match the GeoJSON.
 */
export const GeoMapChart: React.FC<GeoMapChartProps> = ({ data, height = 300, darkMode = false, onCountryClick }) => {
  const [ready, setReady] = React.useState(registered);

  React.useEffect(() => {
    let alive = true;
    ensureWorldMap().then((ok) => alive && setReady(ok));
    return () => {
      alive = false;
    };
  }, []);

  const theme = getChartTheme(darkMode);

  const option: EChartsOption = React.useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.value));
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.text },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => `${p.name}: ${p.value != null && !Number.isNaN(p.value) ? p.value : 0}`,
      },
      visualMap: {
        min: 0,
        max,
        left: 'left',
        bottom: 8,
        calculable: true,
        orient: 'horizontal' as const,
        inRange: { color: ['#F0E2CE', CHART_ACCENT, '#5A3F24'] },
        textStyle: { color: theme.textMuted },
      },
      series: [
        {
          type: 'map' as const,
          map: 'world',
          roam: false,
          data,
          itemStyle: { borderColor: theme.axis, areaColor: darkMode ? '#2B2015' : '#F5F0E8' },
          emphasis: { itemStyle: { areaColor: '#C8862B' }, label: { show: false } },
          label: { show: false },
        },
      ],
    };
  }, [data, theme, darkMode]);

  const onEvents = React.useMemo(
    () =>
      onCountryClick
        ? {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            click: (p: any) => {
              if (p?.name) onCountryClick(p.name, Number(p.value) || 0);
            },
          }
        : undefined,
    [onCountryClick],
  );

  if (!ready) {
    return (
      <div className="w-full flex items-center justify-center text-nog-400 dark:text-nog-500" style={{ height: `${height}px` }}>
        Loading map…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-nog-400 dark:text-nog-500" style={{ height: `${height}px` }}>
        No data to display
      </div>
    );
  }

  return (
    <div className="w-full">
      <ReactECharts option={option} style={{ height: `${height}px` }} notMerge={true} lazyUpdate={true} onEvents={onEvents} />
    </div>
  );
};

export default GeoMapChart;

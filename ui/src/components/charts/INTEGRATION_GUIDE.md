# Chart Components Integration Guide

This guide shows how to integrate the chart components into existing Spunk pages.

## Import Methods

### Method 1: Direct from charts directory
```tsx
import {
  TimeSeriesChart,
  BarChart,
  PieChart,
  StatCard,
} from '@/components/charts';
```

### Method 2: From main components index
```tsx
import {
  TimeSeriesChart,
  BarChart,
  PieChart,
  StatCard,
} from '@/components';
```

## SearchPage Integration

Add visualizations above the log results table.

```tsx
// File: src/pages/SearchPage.tsx

import React from 'react';
import { TimeSeriesChart, BarChart, PieChart, StatCard } from '@/components/charts';

function SearchPage() {
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState({ start: Date.now() - 3600000, end: Date.now() });
  const [results, setResults] = useState([]);

  // Fetch search results
  const { data, isLoading } = useQuery({
    queryKey: ['search', query, timeRange],
    queryFn: async () => {
      const response = await fetch('/api/search', {
        method: 'POST',
        body: JSON.stringify({ query, startTime: timeRange.start, endTime: timeRange.end }),
      });
      return response.json();
    },
  });

  // Transform data for charts
  const chartData = React.useMemo(() => {
    if (!data) return null;

    return {
      timeSeries: data.events.map(e => ({
        timestamp: e.timestamp,
        value: 1,
      })),
      topHosts: Object.entries(data.facets?.hostname || {}).map(([name, value]) => ({
        category: name,
        value: value as number,
      })),
      severityPie: Object.entries(data.facets?.severity || {}).map(([name, value]) => ({
        name,
        value: value as number,
      })),
    };
  }, [data]);

  return (
    <div className="p-6">
      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search host=firewall severity>=warning"
          className="w-full p-3 border rounded"
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Events"
          value={data?.totalCount || 0}
          darkMode={false}
        />
        <StatCard
          title="Unique Hosts"
          value={Object.keys(data?.facets?.hostname || {}).length}
          darkMode={false}
        />
        <StatCard
          title="Error Rate"
          value={((data?.facets?.severity?.error || 0) / (data?.totalCount || 1)) * 100}
          format="percentage"
          darkMode={false}
        />
        <StatCard
          title="Avg Size"
          value={data?.avgSize || 0}
          format="bytes"
          darkMode={false}
        />
      </div>

      {/* Time Series Chart */}
      {chartData && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <TimeSeriesChart
            data={chartData.timeSeries}
            title="Events Over Time"
            height={300}
            showZoom={true}
            onBrushEnd={(start, end) => {
              setTimeRange({ start, end });
            }}
          />
        </div>
      )}

      {/* Distribution Charts */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <BarChart
            data={chartData?.topHosts || []}
            title="Top Hosts"
            topN={10}
            onBarClick={(host) => {
              setQuery(`${query} host=${host}`);
            }}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <PieChart
            data={chartData?.severityPie || []}
            title="By Severity"
            donut={true}
            onItemClick={(severity) => {
              setQuery(`${query} severity=${severity}`);
            }}
          />
        </div>
      </div>

      {/* Log Results Table */}
      <LogViewer logs={data?.events || []} />
    </div>
  );
}
```

## DashboardsPage Integration

Create custom dashboards with draggable chart panels.

```tsx
// File: src/pages/DashboardsPage.tsx

import React from 'react';
import {
  TimeSeriesChart,
  BarChart,
  PieChart,
  GaugeChart,
  HeatmapChart,
  StatCard,
} from '@/components/charts';

interface DashboardPanel {
  id: string;
  type: 'timeseries' | 'bar' | 'pie' | 'gauge' | 'heatmap' | 'stat';
  query: string;
  title: string;
  options?: Record<string, any>;
}

function DashboardViewPage() {
  const [panels, setPanels] = useState<DashboardPanel[]>([
    { id: '1', type: 'timeseries', query: 'search *', title: 'All Events' },
    { id: '2', type: 'bar', query: 'stats count by hostname', title: 'Top Hosts' },
    { id: '3', type: 'pie', query: 'stats count by severity', title: 'By Severity' },
    { id: '4', type: 'stat', query: 'stats count', title: 'Total Events' },
  ]);

  const renderPanel = (panel: DashboardPanel) => {
    const { type, title, query } = panel;

    // Fetch data for this panel
    const { data } = useQuery({
      queryKey: ['dashboard-panel', query],
      queryFn: async () => {
        const res = await fetch('/api/search', {
          method: 'POST',
          body: JSON.stringify({ query }),
        });
        return res.json();
      },
    });

    switch (type) {
      case 'timeseries':
        return <TimeSeriesChart data={data?.timeSeries || []} title={title} />;

      case 'bar':
        return <BarChart data={data?.barData || []} title={title} topN={10} />;

      case 'pie':
        return <PieChart data={data?.pieData || []} title={title} donut />;

      case 'gauge':
        return <GaugeChart value={data?.value || 0} title={title} />;

      case 'heatmap':
        return <HeatmapChart data={data?.heatmapData || []} title={title} />;

      case 'stat':
        return <StatCard title={title} value={data?.value || 0} />;

      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {panels.filter(p => p.type === 'stat').map(panel => (
          <div key={panel.id}>
            {renderPanel(panel)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {panels.filter(p => p.type !== 'stat').map(panel => (
          <div key={panel.id} className="bg-white rounded-lg shadow p-6">
            {renderPanel(panel)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## StatsPage Integration

Display aggregation results as charts.

```tsx
// File: src/pages/StatsPage.tsx

import React from 'react';
import { BarChart, PieChart, StatCard } from '@/components/charts';

function StatsPage() {
  const [query, setQuery] = useState('stats count by hostname');

  const { data } = useQuery({
    queryKey: ['stats', query],
    queryFn: async () => {
      const res = await fetch('/api/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      return res.json();
    },
  });

  // Detect aggregation type from query
  const chartType = query.includes('by') ? 'bar' : 'stat';

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Statistics</h1>

      {/* Query Input */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="stats count by hostname"
        className="w-full p-3 border rounded mb-6"
      />

      {/* Chart Rendering */}
      {chartType === 'stat' ? (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="Count"
            value={data?.result?.count || 0}
          />
          <StatCard
            title="Sum"
            value={data?.result?.sum || 0}
          />
          <StatCard
            title="Average"
            value={data?.result?.avg || 0}
          />
          <StatCard
            title="Max"
            value={data?.result?.max || 0}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <BarChart
              data={data?.results || []}
              title="Results (Bar)"
              topN={20}
            />
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <PieChart
              data={data?.results || []}
              title="Results (Pie)"
              donut={true}
            />
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="mt-6 bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">Field</th>
              <th className="px-6 py-3 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {data?.results?.map((row, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-6 py-3">{row.category || row.name}</td>
                <td className="px-6 py-3 text-right">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## ReportsPage Integration

Include charts in scheduled reports.

```tsx
// File: src/pages/ReportsPage.tsx

import React from 'react';
import { TimeSeriesChart, BarChart, PieChart } from '@/components/charts';

function ReportView({ reportId }: { reportId: string }) {
  const { data } = useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/${reportId}`);
      return res.json();
    },
  });

  return (
    <div className="p-6 bg-white">
      {/* Report Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{data?.title}</h1>
        <p className="text-gray-600">
          Generated: {new Date(data?.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Executive Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Events" value={data?.stats?.total || 0} />
        <StatCard title="Errors" value={data?.stats?.errors || 0} />
        <StatCard title="Warnings" value={data?.stats?.warnings || 0} />
        <StatCard title="Unique Hosts" value={data?.stats?.hosts || 0} />
      </div>

      {/* Charts */}
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Event Trend</h2>
          <TimeSeriesChart
            data={data?.timeSeries || []}
            height={300}
            showZoom={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Top Sources</h2>
            <BarChart data={data?.topSources || []} topN={10} />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Severity Distribution</h2>
            <PieChart data={data?.severityDist || []} donut />
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Dark Mode Support

All components support dark mode. Here's how to implement it globally:

```tsx
// File: src/App.tsx

import React, { createContext, useContext, useState } from 'react';

const DarkModeContext = createContext({
  darkMode: false,
  toggleDarkMode: () => {},
});

export const useDarkMode = () => useContext(DarkModeContext);

function App() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <DarkModeContext.Provider
      value={{
        darkMode,
        toggleDarkMode: () => setDarkMode(!darkMode),
      }}
    >
      <div className={darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}>
        {/* Your app content */}
      </div>
    </DarkModeContext.Provider>
  );
}

// Usage in components:
function MyPage() {
  const { darkMode } = useDarkMode();

  return (
    <TimeSeriesChart data={data} darkMode={darkMode} />
  );
}
```

## Real-time Updates

Enable auto-refresh for real-time dashboards:

```tsx
function RealtimeDashboard() {
  const [data, setData] = useState([]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch('/api/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'search *' }),
      });
      const json = await res.json();
      setData(json.timeSeries);
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <TimeSeriesChart
      data={data}
      autoRefresh={true}
      refreshInterval={30000}
    />
  );
}
```

## Export Charts

Export charts as images for reports:

```tsx
import ReactECharts from 'echarts-for-react';

function ExportableChart() {
  const chartRef = useRef<ReactECharts>(null);

  const exportChart = () => {
    if (chartRef.current) {
      const chart = chartRef.current.getEchartsInstance();
      const url = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff',
      });

      // Download image
      const link = document.createElement('a');
      link.href = url;
      link.download = 'chart.png';
      link.click();
    }
  };

  return (
    <div>
      <button onClick={exportChart}>Export Chart</button>
      <TimeSeriesChart
        data={data}
        ref={chartRef}
      />
    </div>
  );
}
```

## Performance Tips

1. **Memoize transformations**:
```tsx
const chartData = useMemo(() => {
  return rawData.map(transform);
}, [rawData]);
```

2. **Lazy load charts**:
```tsx
const LazyChart = lazy(() => import('@/components/charts/TimeSeriesChart'));

<Suspense fallback={<div>Loading...</div>}>
  <LazyChart data={data} />
</Suspense>
```

3. **Virtualize dashboard panels**:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

// Render only visible panels
```

## Next Steps

1. Add charts to SearchPage.tsx
2. Create dashboard builder in DashboardsPage.tsx
3. Add chart selection to StatsPage.tsx
4. Enable chart export in ReportsPage.tsx
5. Implement dark mode context
6. Add real-time updates
7. Create chart presets/templates

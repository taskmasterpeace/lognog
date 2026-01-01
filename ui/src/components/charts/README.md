# Chart Components

Advanced chart components for the LogNog UI built with Apache ECharts and echarts-for-react.

## Overview

This directory contains a comprehensive set of chart components designed for log visualization and analytics dashboards. All components support dark mode, are fully typed with TypeScript, and use TailwindCSS for styling.

## Components

### 1. TimeSeriesChart

Line/area chart for displaying log volume over time with multiple series support.

**Features:**
- Multiple time series support
- Zoom and brush selection for time range filtering
- Interactive tooltips with detailed information
- Auto-refresh capability
- Area fill option
- Customizable axes labels

**Usage:**
```tsx
import { TimeSeriesChart } from '@/components/charts';

<TimeSeriesChart
  data={[
    { timestamp: '2025-12-11T10:00:00Z', value: 100, series: 'errors' },
    { timestamp: '2025-12-11T10:01:00Z', value: 150, series: 'errors' },
    { timestamp: '2025-12-11T10:00:00Z', value: 50, series: 'warnings' },
  ]}
  title="Log Volume Over Time"
  height={400}
  showZoom={true}
  showArea={true}
  darkMode={false}
  yAxisLabel="Events per minute"
  xAxisLabel="Time"
  onBrushEnd={(startTime, endTime) => {
    console.log('Selected range:', startTime, endTime);
  }}
/>
```

**Props:**
- `data`: Array of `{ timestamp: string | number, value: number, series?: string }`
- `title?`: Chart title
- `height?`: Chart height in pixels (default: 400)
- `showZoom?`: Enable zoom controls (default: true)
- `showArea?`: Fill area under line (default: true)
- `autoRefresh?`: Enable auto-refresh (default: false)
- `refreshInterval?`: Refresh interval in ms (default: 30000)
- `darkMode?`: Dark mode theme (default: false)
- `yAxisLabel?`: Y-axis label (default: 'Count')
- `xAxisLabel?`: X-axis label (default: 'Time')
- `onBrushEnd?`: Callback when brush selection ends

---

### 2. HeatmapChart

Heatmap visualization for severity or activity patterns by hour and day of week.

**Features:**
- Day of week vs hour matrix
- Color gradient from green to red
- Interactive tooltips
- Customizable color ranges

**Usage:**
```tsx
import { HeatmapChart } from '@/components/charts';

<HeatmapChart
  data={[
    { hour: 0, day: 0, value: 10 },  // Sunday, 00:00
    { hour: 1, day: 0, value: 15 },  // Sunday, 01:00
    { hour: 0, day: 1, value: 20 },  // Monday, 00:00
  ]}
  title="Event Activity by Day and Hour"
  height={500}
  darkMode={false}
  colorRange={['#10b981', '#ef4444']}
  showValues={false}
/>
```

**Props:**
- `data`: Array of `{ hour: number, day: number, value: number }`
  - `hour`: 0-23 (hour of day)
  - `day`: 0-6 (0=Sunday, 6=Saturday)
- `title?`: Chart title
- `height?`: Chart height in pixels (default: 400)
- `darkMode?`: Dark mode theme (default: false)
- `colorRange?`: Color gradient [min, max] (default: ['#10b981', '#ef4444'])
- `showValues?`: Show values in cells (default: false)

---

### 3. GaugeChart

Single value gauge chart with color-coded thresholds.

**Features:**
- Animated needle
- Color zones (green/yellow/red)
- Min/max thresholds
- Custom units

**Usage:**
```tsx
import { GaugeChart } from '@/components/charts';

<GaugeChart
  value={75}
  title="CPU Usage"
  min={0}
  max={100}
  height={300}
  darkMode={false}
  thresholds={{ low: 33, medium: 66, high: 100 }}
  unit="%"
  animated={true}
/>
```

**Props:**
- `value`: Current value to display
- `title?`: Gauge title
- `min?`: Minimum value (default: 0)
- `max?`: Maximum value (default: 100)
- `height?`: Chart height in pixels (default: 300)
- `darkMode?`: Dark mode theme (default: false)
- `thresholds?`: Color zone thresholds (default: { low: 33, medium: 66, high: 100 })
- `unit?`: Value unit (e.g., '%', 'ms')
- `animated?`: Enable needle animation (default: true)

---

### 4. PieChart

Pie or donut chart for category distributions.

**Features:**
- Pie or donut (ring) styles
- Interactive legend
- Hover details
- Click handlers
- Customizable legend position

**Usage:**
```tsx
import { PieChart } from '@/components/charts';

<PieChart
  data={[
    { name: 'Error', value: 234 },
    { name: 'Warning', value: 567 },
    { name: 'Info', value: 1234 },
  ]}
  title="Events by Severity"
  height={400}
  darkMode={false}
  donut={false}
  showLegend={true}
  legendPosition="right"
  onItemClick={(name, value) => {
    console.log('Clicked:', name, value);
  }}
/>
```

**Props:**
- `data`: Array of `{ name: string, value: number }`
- `title?`: Chart title
- `height?`: Chart height in pixels (default: 400)
- `darkMode?`: Dark mode theme (default: false)
- `donut?`: Use donut style (default: false)
- `showLegend?`: Show legend (default: true)
- `legendPosition?`: Legend position: 'top' | 'bottom' | 'left' | 'right' (default: 'right')
- `radius?`: Custom radius (string or [inner, outer])
- `onItemClick?`: Click handler `(name: string, value: number) => void`

---

### 5. BarChart

Horizontal or vertical bar chart for top-N rankings.

**Features:**
- Horizontal or vertical orientation
- Top-N filtering
- Sorting (ascending/descending)
- Value labels
- Click handlers for drill-down

**Usage:**
```tsx
import { BarChart } from '@/components/charts';

<BarChart
  data={[
    { category: 'firewall', value: 1234 },
    { category: 'router', value: 987 },
    { category: 'server', value: 765 },
  ]}
  title="Top Hosts by Event Count"
  height={400}
  darkMode={false}
  horizontal={false}
  topN={10}
  sortOrder="desc"
  showValues={true}
  barColor="#5470c6"
  xAxisLabel="Host"
  yAxisLabel="Event Count"
  onBarClick={(category, value) => {
    console.log('Clicked:', category, value);
  }}
/>
```

**Props:**
- `data`: Array of `{ category: string, value: number }`
- `title?`: Chart title
- `height?`: Chart height in pixels (default: 400)
- `darkMode?`: Dark mode theme (default: false)
- `horizontal?`: Horizontal bars (default: false)
- `topN?`: Limit to top N items
- `sortOrder?`: 'asc' | 'desc' (default: 'desc')
- `showValues?`: Show value labels (default: true)
- `barColor?`: Bar color (default: '#5470c6')
- `xAxisLabel?`: X-axis label
- `yAxisLabel?`: Y-axis label
- `onBarClick?`: Click handler `(category: string, value: number) => void`

---

### 6. StatCard

Big number stat card with trend indicator and sparkline background.

**Features:**
- Current value display
- Trend arrow (up/down/neutral)
- Sparkline background
- Multiple format options (number, percentage, bytes)
- Custom icons

**Usage:**
```tsx
import { StatCard } from '@/components/charts';
import { Activity } from 'lucide-react';

<StatCard
  title="Total Events"
  value={12345}
  previousValue={11000}
  darkMode={false}
  icon={<Activity className="w-5 h-5" />}
  sparklineData={[10, 20, 15, 30, 25, 40, 35, 50]}
  color="#5470c6"
  format="number"
/>
```

**Props:**
- `title`: Card title
- `value`: Current value (number or string)
- `previousValue?`: Previous value for trend calculation
- `unit?`: Value unit
- `format?`: 'number' | 'percentage' | 'bytes' | 'custom' (default: 'number')
- `customFormatter?`: Custom formatter function
- `sparklineData?`: Array of numbers for sparkline
- `height?`: Card height in pixels (default: 150)
- `darkMode?`: Dark mode theme (default: false)
- `icon?`: React node icon
- `trend?`: Override trend direction: 'up' | 'down' | 'neutral'
- `trendLabel?`: Trend label text
- `color?`: Sparkline color (default: '#5470c6')

---

## Common Features

All chart components share these common features:

1. **Dark Mode Support**: All components have a `darkMode` prop that adapts colors and themes
2. **TypeScript**: Fully typed interfaces for all props and data structures
3. **Responsive**: Charts adapt to container width
4. **Performance**: Optimized with `React.useMemo` and `lazyUpdate`
5. **Customizable**: Extensive prop options for customization
6. **TailwindCSS**: Container styling uses Tailwind utility classes

## Installation

The required dependencies are already installed in the project:

```json
{
  "echarts": "^6.0.0",
  "echarts-for-react": "^3.0.5",
  "lucide-react": "^0.312.0"
}
```

## Examples

See `ChartExamples.tsx` for a comprehensive demo of all chart components.

To view the examples, import and render the component:

```tsx
import { ChartExamples } from '@/components/charts/ChartExamples';

function App() {
  const [darkMode, setDarkMode] = useState(false);

  return <ChartExamples darkMode={darkMode} />;
}
```

## Integration with LogNog

### Search Results Visualization

```tsx
import { TimeSeriesChart, BarChart, PieChart } from '@/components/charts';

function SearchResultsPage() {
  const { data } = useSearchResults();

  return (
    <div className="space-y-6">
      <TimeSeriesChart
        data={data.timeSeries}
        title="Events Over Time"
        darkMode={isDark}
      />

      <div className="grid grid-cols-2 gap-6">
        <BarChart
          data={data.topHosts}
          title="Top Hosts"
          topN={10}
        />
        <PieChart
          data={data.severityDistribution}
          title="By Severity"
          donut={true}
        />
      </div>
    </div>
  );
}
```

### Dashboard Page

```tsx
import { StatCard, GaugeChart, HeatmapChart } from '@/components/charts';

function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Events" value={12345} />
        <StatCard title="Error Rate" value={2.5} unit="%" />
        <StatCard title="Avg Latency" value={245} unit="ms" />
        <StatCard title="Active Hosts" value={42} />
      </div>

      <HeatmapChart
        data={weeklyActivity}
        title="Weekly Activity Pattern"
      />
    </div>
  );
}
```

## Performance Tips

1. **Memoize Data**: Use `React.useMemo` to avoid recalculating chart data on every render
2. **Lazy Updates**: All charts use `lazyUpdate={true}` for better performance
3. **Limit Data Points**: For time series, consider aggregating data for large time ranges
4. **Top-N Filtering**: Use `topN` prop in BarChart to limit rendered items

## Customization

### Custom Colors

```tsx
// Override default colors
<PieChart
  data={data}
  // ECharts will use default color palette
/>

// Custom bar color
<BarChart
  data={data}
  barColor="#10b981"
/>

// Custom heatmap gradient
<HeatmapChart
  data={data}
  colorRange={['#3b82f6', '#ef4444']}
/>
```

### Custom Formatters

```tsx
<StatCard
  value={12345678}
  format="custom"
  customFormatter={(val) => {
    if (typeof val === 'number') {
      return `${(val / 1000000).toFixed(1)}M`;
    }
    return val;
  }}
/>
```

## Troubleshooting

### Chart Not Rendering

- Ensure parent container has a defined height
- Check that data is not empty
- Verify TypeScript types match expected interfaces

### Dark Mode Not Working

- Ensure `darkMode` prop is passed and reactive
- Check that parent container also uses dark mode classes

### Performance Issues

- Reduce data points for large datasets
- Use `topN` filtering
- Implement data pagination or aggregation

## License

Part of the LogNog project. See main project LICENSE.

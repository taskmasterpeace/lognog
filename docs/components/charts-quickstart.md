# Chart Components Quick Start

## Installation

All dependencies are already installed. No additional setup needed!

## Import

```tsx
import {
  TimeSeriesChart,
  HeatmapChart,
  GaugeChart,
  PieChart,
  BarChart,
  StatCard,
} from '@/components/charts';
```

## Quick Examples

### 1. Time Series Chart

```tsx
<TimeSeriesChart
  data={[
    { timestamp: Date.now(), value: 100 },
    { timestamp: Date.now() + 60000, value: 150 },
  ]}
  title="Events Over Time"
  darkMode={false}
/>
```

### 2. Heatmap Chart

```tsx
<HeatmapChart
  data={[
    { hour: 0, day: 0, value: 10 },  // Sunday, 00:00
    { hour: 1, day: 0, value: 15 },  // Sunday, 01:00
  ]}
  title="Weekly Activity"
  darkMode={false}
/>
```

### 3. Gauge Chart

```tsx
<GaugeChart
  value={75}
  title="CPU Usage"
  unit="%"
  darkMode={false}
/>
```

### 4. Pie Chart

```tsx
<PieChart
  data={[
    { name: 'Error', value: 234 },
    { name: 'Warning', value: 567 },
  ]}
  title="By Severity"
  donut={false}
  darkMode={false}
/>
```

### 5. Bar Chart

```tsx
<BarChart
  data={[
    { category: 'firewall', value: 1234 },
    { category: 'router', value: 987 },
  ]}
  title="Top Hosts"
  topN={10}
  darkMode={false}
/>
```

### 6. Stat Card

```tsx
<StatCard
  title="Total Events"
  value={12345}
  previousValue={11000}
  darkMode={false}
/>
```

## Typical Dashboard Layout

```tsx
function Dashboard() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={darkMode ? 'bg-gray-900' : 'bg-gray-50'}>
      {/* Stat Cards Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard title="Events" value={12345} darkMode={darkMode} />
        <StatCard title="Errors" value={234} darkMode={darkMode} />
        <StatCard title="Hosts" value={42} darkMode={darkMode} />
        <StatCard title="Avg Size" value={1024} format="bytes" darkMode={darkMode} />
      </div>

      {/* Time Series */}
      <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg">
        <TimeSeriesChart data={timeSeriesData} darkMode={darkMode} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg">
          <BarChart data={barData} darkMode={darkMode} />
        </div>
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg">
          <PieChart data={pieData} donut={true} darkMode={darkMode} />
        </div>
      </div>
    </div>
  );
}
```

## Interactive Features

### Click Handlers

```tsx
// Bar chart with click handler
<BarChart
  data={data}
  onBarClick={(category, value) => {
    // Filter logs by this category
    console.log('Filter by:', category);
  }}
/>

// Pie chart with click handler
<PieChart
  data={data}
  onItemClick={(name, value) => {
    // Drill down into this category
    console.log('Drill down:', name);
  }}
/>
```

### Time Range Selection

```tsx
<TimeSeriesChart
  data={data}
  onBrushEnd={(startTime, endTime) => {
    // Update time range filter
    setTimeRange({ start: startTime, end: endTime });
  }}
/>
```

## Data Formats

### Time Series

```tsx
interface TimeSeriesData {
  timestamp: string | number;  // ISO string or Unix timestamp
  value: number;
  series?: string;  // Optional series name for multi-line
}
```

### Heatmap

```tsx
interface HeatmapData {
  hour: number;   // 0-23
  day: number;    // 0-6 (0=Sunday)
  value: number;
}
```

### Bar/Pie

```tsx
interface ChartData {
  category: string;  // or 'name' for pie
  value: number;
}
```

## Dark Mode

All components support dark mode via the `darkMode` prop:

```tsx
const [darkMode, setDarkMode] = useState(false);

<TimeSeriesChart data={data} darkMode={darkMode} />
```

## Responsive

All charts are responsive and will fill their container width:

```tsx
<div className="w-full lg:w-1/2">
  <BarChart data={data} />
</div>
```

## Performance Tips

1. **Memoize data**: Use `useMemo` for data transformations
2. **Limit data points**: Use `topN` prop or aggregate data
3. **Lazy loading**: Load charts on demand

```tsx
const chartData = useMemo(() => {
  return rawData.map(item => ({
    timestamp: item.time,
    value: item.count,
  }));
}, [rawData]);
```

## Common Patterns

### Loading State

```tsx
{isLoading ? (
  <div className="h-96 flex items-center justify-center">
    Loading...
  </div>
) : (
  <TimeSeriesChart data={data} />
)}
```

### Empty State

```tsx
{data.length === 0 ? (
  <div className="h-96 flex items-center justify-center text-gray-500">
    No data available
  </div>
) : (
  <BarChart data={data} />
)}
```

### Error State

```tsx
{error ? (
  <div className="h-96 flex items-center justify-center text-red-500">
    Error loading chart
  </div>
) : (
  <PieChart data={data} />
)}
```

## See Also

- [README.md](./README.md) - Full documentation
- [ChartExamples.tsx](./ChartExamples.tsx) - Complete examples

import React from 'react';
import {
  TimeSeriesChart,
  HeatmapChart,
  GaugeChart,
  PieChart,
  BarChart,
  StatCard,
} from './index';
import { Activity, Database, AlertTriangle } from 'lucide-react';

/**
 * Example usage of all chart components
 * This file demonstrates how to use the chart components with sample data
 */

export const ChartExamples: React.FC<{ darkMode?: boolean }> = ({ darkMode = false }) => {
  // Sample data for TimeSeriesChart
  const timeSeriesData = React.useMemo(() => {
    const now = Date.now();
    const data = [];
    for (let i = 0; i < 100; i++) {
      data.push({
        timestamp: now - (100 - i) * 60000, // 1-minute intervals
        value: Math.floor(Math.random() * 100) + 50,
        series: 'Series 1',
      });
      data.push({
        timestamp: now - (100 - i) * 60000,
        value: Math.floor(Math.random() * 80) + 30,
        series: 'Series 2',
      });
    }
    return data;
  }, []);

  // Sample data for HeatmapChart
  const heatmapData = React.useMemo(() => {
    const data = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        data.push({
          hour,
          day,
          value: Math.floor(Math.random() * 100),
        });
      }
    }
    return data;
  }, []);

  // Sample data for PieChart
  const pieData = React.useMemo(() => [
    { name: 'Error', value: 234 },
    { name: 'Warning', value: 567 },
    { name: 'Info', value: 1234 },
    { name: 'Debug', value: 456 },
    { name: 'Critical', value: 123 },
  ], []);

  // Sample data for BarChart
  const barData = React.useMemo(() => [
    { category: 'firewall', value: 1234 },
    { category: 'router', value: 987 },
    { category: 'switch', value: 765 },
    { category: 'server', value: 543 },
    { category: 'database', value: 321 },
    { category: 'api', value: 234 },
    { category: 'web', value: 156 },
  ], []);

  // Sample sparkline data for StatCard
  const sparklineData = React.useMemo(() => {
    return Array.from({ length: 20 }, () => Math.floor(Math.random() * 100));
  }, []);

  return (
    <div className={`p-8 space-y-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <h1 className={`text-3xl font-bold mb-8 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        Chart Components Examples
      </h1>

      {/* StatCards Grid */}
      <section>
        <h2 className={`text-2xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Stat Cards
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Events"
            value={12345}
            previousValue={11000}
            darkMode={darkMode}
            icon={<Activity className="w-5 h-5" />}
            sparklineData={sparklineData}
            color="#5470c6"
          />
          <StatCard
            title="Error Rate"
            value={2.5}
            previousValue={3.2}
            unit="%"
            format="percentage"
            darkMode={darkMode}
            icon={<AlertTriangle className="w-5 h-5" />}
            sparklineData={sparklineData}
            color="#ef4444"
          />
          <StatCard
            title="Storage Used"
            value={5368709120}
            format="bytes"
            darkMode={darkMode}
            icon={<Database className="w-5 h-5" />}
            trendLabel="of 10 GB"
            color="#10b981"
          />
          <StatCard
            title="Avg Response Time"
            value={245}
            previousValue={280}
            unit="ms"
            darkMode={darkMode}
            sparklineData={sparklineData}
            color="#fbbf24"
          />
        </div>
      </section>

      {/* TimeSeriesChart */}
      <section>
        <h2 className={`text-2xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Time Series Chart
        </h2>
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <TimeSeriesChart
            data={timeSeriesData}
            title="Log Volume Over Time"
            height={400}
            darkMode={darkMode}
            showZoom={true}
            showArea={true}
            yAxisLabel="Events per minute"
            xAxisLabel="Time"
            onBrushEnd={(start, end) => {
              console.log('Brush selection:', new Date(start), new Date(end));
            }}
          />
        </div>
      </section>

      {/* Charts Grid */}
      <section>
        <h2 className={`text-2xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Distribution Charts
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PieChart */}
          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <PieChart
              data={pieData}
              title="Events by Severity"
              height={400}
              darkMode={darkMode}
              donut={false}
              showLegend={true}
              legendPosition="right"
              onItemClick={(name, value) => {
                console.log('Clicked:', name, value);
              }}
            />
          </div>

          {/* Donut Chart */}
          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <PieChart
              data={pieData}
              title="Events by Severity (Donut)"
              height={400}
              darkMode={darkMode}
              donut={true}
              showLegend={true}
              legendPosition="bottom"
            />
          </div>
        </div>
      </section>

      {/* BarChart */}
      <section>
        <h2 className={`text-2xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Bar Charts
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vertical Bar */}
          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <BarChart
              data={barData}
              title="Top Hosts by Event Count"
              height={400}
              darkMode={darkMode}
              horizontal={false}
              topN={10}
              sortOrder="desc"
              showValues={true}
              barColor="#5470c6"
              yAxisLabel="Event Count"
              xAxisLabel="Host"
              onBarClick={(category, value) => {
                console.log('Bar clicked:', category, value);
              }}
            />
          </div>

          {/* Horizontal Bar */}
          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <BarChart
              data={barData}
              title="Top Hosts by Event Count (Horizontal)"
              height={400}
              darkMode={darkMode}
              horizontal={true}
              topN={5}
              sortOrder="desc"
              showValues={true}
              barColor="#91cc75"
              xAxisLabel="Event Count"
              yAxisLabel="Host"
            />
          </div>
        </div>
      </section>

      {/* HeatmapChart */}
      <section>
        <h2 className={`text-2xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Heatmap Chart
        </h2>
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <HeatmapChart
            data={heatmapData}
            title="Event Activity by Day and Hour"
            height={500}
            darkMode={darkMode}
            colorRange={['#10b981', '#ef4444']}
            showValues={false}
          />
        </div>
      </section>

      {/* GaugeChart */}
      <section>
        <h2 className={`text-2xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Gauge Charts
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <GaugeChart
              value={35}
              title="CPU Usage"
              min={0}
              max={100}
              height={250}
              darkMode={darkMode}
              thresholds={{ low: 33, medium: 66, high: 100 }}
              unit="%"
              animated={true}
            />
          </div>

          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <GaugeChart
              value={72}
              title="Memory Usage"
              min={0}
              max={100}
              height={250}
              darkMode={darkMode}
              thresholds={{ low: 33, medium: 66, high: 100 }}
              unit="%"
              animated={true}
            />
          </div>

          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <GaugeChart
              value={92}
              title="Disk Usage"
              min={0}
              max={100}
              height={250}
              darkMode={darkMode}
              thresholds={{ low: 33, medium: 66, high: 100 }}
              unit="%"
              animated={true}
            />
          </div>
        </div>
      </section>
    </div>
  );
};

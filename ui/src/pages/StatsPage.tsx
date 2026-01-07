import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Server,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Zap,
  Database,
  HardDrive,
  BarChart3,
} from 'lucide-react';
import { AreaChart, BarChart, PieChart } from '../components/charts';
import { getStats, getTimeSeries } from '../api/client';
import StorageTab from '../components/analytics/StorageTab';
import { useTheme } from '../contexts/ThemeContext';

const SEVERITY_COLORS = ['#dc2626', '#ea580c', '#d97706', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4'];
const SEVERITY_NAMES = ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Info', 'Debug'];

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: string;
  color: string;
  iconBg: string;
}

function StatCard({ icon: Icon, label, value, subValue, trend, color, iconBg }: StatCardProps) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className={`p-2 sm:p-3 rounded-xl ${iconBg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-amber-600 bg-amber-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
            <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {trend}
          </span>
        )}
      </div>
      <div className="mt-3 sm:mt-4">
        <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
        {subValue && <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

type TabType = 'analytics' | 'storage';

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('analytics');
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    refetchInterval: 30000,
  });

  const { data: timeSeries, isLoading: timeSeriesLoading } = useQuery({
    queryKey: ['timeSeries'],
    queryFn: () => getTimeSeries('1 HOUR', 24),
    refetchInterval: 60000,
  });

  // Drill-down handler - navigate to search with pre-filled query
  const handleDrilldown = (field: string, value: string) => {
    const query = `search ${field}="${value}"`;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const severityData = stats?.bySeverity.map((s) => ({
    name: SEVERITY_NAMES[s.severity] || `Level ${s.severity}`,
    value: s.count,
    fill: SEVERITY_COLORS[s.severity] || '#6b7280',
    severity: s.severity,
  })) || [];

  const errorCount = stats?.bySeverity.filter(s => s.severity <= 3).reduce((sum, s) => sum + s.count, 0) || 0;

  return (
    <div className="min-h-full bg-nog-50 dark:bg-nog-900">
      {/* Header */}
      <div className="bg-white dark:bg-nog-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Analytics</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 hidden sm:block">Real-time log metrics and insights</p>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
              <span className="hidden sm:inline">Auto-refreshing every 30s</span>
              <span className="sm:hidden">Live</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 mt-4 border-b border-slate-200 dark:border-slate-700 -mb-px">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'storage'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              Storage
            </button>
          </div>
        </div>
      </div>

      {/* Storage Tab Content */}
      {activeTab === 'storage' && (
        <div className="p-4 sm:p-6">
          <StorageTab />
        </div>
      )}

      {/* Analytics Tab Content */}
      {activeTab === 'analytics' && (statsLoading || timeSeriesLoading) && (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading analytics...</p>
        </div>
      )}

      {activeTab === 'analytics' && !statsLoading && !timeSeriesLoading && (

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={Database}
            label="Total Logs"
            value={stats?.totalLogs || 0}
            subValue="All time"
            color="text-amber-600"
            iconBg="bg-amber-50"
          />
          <StatCard
            icon={Activity}
            label="Last 24 Hours"
            value={stats?.last24Hours || 0}
            trend="+12%"
            color="text-amber-600"
            iconBg="bg-amber-50"
          />
          <StatCard
            icon={AlertTriangle}
            label="Errors (24h)"
            value={errorCount}
            subValue="Severity 0-3"
            color="text-red-600"
            iconBg="bg-red-50"
          />
          <StatCard
            icon={Server}
            label="Active Hosts"
            value={stats?.topHosts.length || 0}
            subValue="Unique sources"
            color="text-amber-600"
            iconBg="bg-amber-50"
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Time Series Chart */}
          <div className="card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 sm:mb-4 gap-2">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">Log Volume</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Events per hour (last 24h)</p>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500"></span>
                  Total
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></span>
                  Errors
                </span>
              </div>
            </div>
            <AreaChart
              data={timeSeries || []}
              series={[
                { name: 'Total', dataKey: 'count', color: '#f59e0b' },
                { name: 'Errors', dataKey: 'errors', color: '#ef4444' },
              ]}
              xAxisKey="time"
              height={288}
              darkMode={isDarkMode}
              xAxisFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              tooltipFormatter={(v) => new Date(v).toLocaleString()}
            />
          </div>

          {/* Severity Distribution */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">Severity Distribution</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Click to filter by severity</p>
            </div>
            <PieChart
              data={severityData.map(s => ({ name: s.name, value: s.value }))}
              height={288}
              darkMode={isDarkMode}
              donut={true}
              showLegend={false}
              radius={['50%', '70%']}
              colors={severityData.map(s => s.fill)}
              onItemClick={(name) => {
                const item = severityData.find(s => s.name === name);
                if (item) handleDrilldown('severity', String(item.severity));
              }}
            />
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-3 sm:mt-4">
              {severityData.slice(0, 6).map((entry) => (
                <button
                  key={entry.name}
                  onClick={() => handleDrilldown('severity', String(entry.severity))}
                  className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                >
                  <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Top Hosts */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">Top Hosts</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Click to search by host</p>
            </div>
            <BarChart
              data={(stats?.topHosts || []).map(h => ({ category: h.hostname, value: h.count }))}
              height={288}
              darkMode={isDarkMode}
              horizontal={true}
              barColor="#f59e0b"
              showValues={false}
              onBarClick={(category) => handleDrilldown('hostname', category)}
            />
          </div>

          {/* Top Applications */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">Top Applications</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Click to search by app</p>
            </div>
            <BarChart
              data={(stats?.topApps || []).map(a => ({ category: a.app_name, value: a.count }))}
              height={288}
              darkMode={isDarkMode}
              horizontal={true}
              barColor="#8b5cf6"
              showValues={false}
              onBarClick={(category) => handleDrilldown('app_name', category)}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

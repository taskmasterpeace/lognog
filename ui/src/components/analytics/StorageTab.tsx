import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HardDrive,
  Database,
  TrendingUp,
  Calendar,
  Clock,
  Settings,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { getStorageStats, updateRetentionSetting, triggerRetentionCleanup } from '../../api/client';
import RetentionConfigModal from './RetentionConfigModal';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  color: string;
  iconBg: string;
}

function StatCard({ icon: Icon, label, value, subValue, color, iconBg }: StatCardProps) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className={`p-2 sm:p-3 rounded-xl ${iconBg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
        </div>
      </div>
      <div className="mt-3 sm:mt-4">
        <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
        {subValue && <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

// Colors for the index bar chart
const INDEX_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
];

export default function StorageTab() {
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: storage, isLoading, error, refetch } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: getStorageStats,
    refetchInterval: 60000, // Refresh every minute
  });

  const cleanupMutation = useMutation({
    mutationFn: triggerRetentionCleanup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
    },
  });

  const updateRetentionMutation = useMutation({
    mutationFn: ({ indexName, days }: { indexName: string; days: number }) =>
      updateRetentionSetting(indexName, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      setIsModalOpen(false);
      setSelectedIndex(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading storage metrics...</p>
      </div>
    );
  }

  if (error || !storage) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Failed to load storage metrics</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate days until oldest data expires (based on 90 day default)
  const oldestDate = storage.oldest_data ? new Date(storage.oldest_data) : null;
  const daysOfData = oldestDate
    ? Math.ceil((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Prepare daily trend data for chart
  const trendData = storage.daily_counts.map((d) => ({
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    bytes: d.bytes,
    count: d.count,
  }));

  // Prepare index data for bar chart
  const indexData = storage.indexes.slice(0, 10).map((idx, i) => ({
    name: idx.index_name.length > 15 ? idx.index_name.slice(0, 12) + '...' : idx.index_name,
    fullName: idx.index_name,
    size: idx.size_bytes,
    count: idx.row_count,
    retention: idx.retention_days,
    daysUntilExpiry: idx.days_until_expiry,
    color: INDEX_COLORS[i % INDEX_COLORS.length],
  }));

  const handleIndexClick = (indexName: string) => {
    setSelectedIndex(indexName);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Storage Overview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitor disk usage and configure retention policies
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
            Run Cleanup
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={HardDrive}
          label="Total Disk Usage"
          value={formatBytes(storage.total_disk_bytes)}
          subValue="Actual on disk"
          color="text-amber-600"
          iconBg="bg-amber-50 dark:bg-amber-900/30"
        />
        <StatCard
          icon={Database}
          label="Total Logs"
          value={formatNumber(storage.total_rows)}
          subValue="All indexes"
          color="text-blue-600"
          iconBg="bg-blue-50 dark:bg-blue-900/30"
        />
        <StatCard
          icon={TrendingUp}
          label="Weekly Growth"
          value={formatBytes(storage.growth_rate.weekly_bytes)}
          subValue={`${storage.growth_rate.daily > 0 ? '+' : ''}${storage.growth_rate.daily.toFixed(1)}% daily`}
          color="text-green-600"
          iconBg="bg-green-50 dark:bg-green-900/30"
        />
        <StatCard
          icon={Calendar}
          label="Data Age"
          value={`${daysOfData} days`}
          subValue={oldestDate ? `Since ${oldestDate.toLocaleDateString()}` : 'No data'}
          color="text-purple-600"
          iconBg="bg-purple-50 dark:bg-purple-900/30"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Daily Growth Trend */}
        <div className="card p-4 sm:p-5">
          <div className="mb-3 sm:mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
              Storage Trend (7 Days)
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Daily data volume
            </p>
          </div>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorBytes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <XAxis
                  dataKey="day"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatBytes(v)}
                />
                <Tooltip
                  formatter={(value: number) => [formatBytes(value), 'Size']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: 'white',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="bytes"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#colorBytes)"
                  name="Data Size"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Index Sizes */}
        <div className="card p-4 sm:p-5">
          <div className="mb-3 sm:mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
              Storage by Index
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Click to configure retention
            </p>
          </div>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={indexData} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatBytes(v)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="#94a3b8"
                  fontSize={12}
                  width={100}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [formatBytes(value), 'Size']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: 'white',
                  }}
                />
                <Bar
                  dataKey="size"
                  radius={[0, 6, 6, 0]}
                  cursor="pointer"
                  onClick={(data) => handleIndexClick(data.fullName)}
                >
                  {indexData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Index Details Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Index Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Index</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Size</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Logs</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Retention</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Expires In</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Daily Growth</th>
                <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {storage.indexes.map((idx, i) => (
                <tr
                  key={idx.index_name}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: INDEX_COLORS[i % INDEX_COLORS.length] }}
                      />
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {idx.index_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                    {formatBytes(idx.size_bytes)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                    {formatNumber(idx.row_count)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      <Clock className="w-3 h-3" />
                      {idx.retention_days} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        idx.days_until_expiry <= 7
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : idx.days_until_expiry <= 30
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {idx.days_until_expiry} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                    {formatBytes(idx.growth_rate_daily)}/day
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleIndexClick(idx.index_name)}
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                      title="Configure retention"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Retention Config Modal */}
      {isModalOpen && selectedIndex && (
        <RetentionConfigModal
          indexName={selectedIndex}
          currentRetention={
            storage.indexes.find((i) => i.index_name === selectedIndex)?.retention_days || 90
          }
          onSave={(days) => updateRetentionMutation.mutate({ indexName: selectedIndex, days })}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedIndex(null);
          }}
          isLoading={updateRetentionMutation.isPending}
        />
      )}
    </div>
  );
}

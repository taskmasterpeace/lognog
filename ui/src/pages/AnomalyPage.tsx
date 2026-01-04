import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Activity,
  TrendingUp,
  TrendingDown,
  Loader2,
  Zap,
  Brain,
  Shield,
  Clock,
  User,
  Server,
  ChevronRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import { authFetch } from '../contexts/AuthContext';

// Types
interface AnomalyEvent {
  id: string;
  timestamp: string;
  entityType: 'user' | 'host' | 'ip' | 'app';
  entityId: string;
  anomalyType: 'spike' | 'drop' | 'time_anomaly' | 'new_behavior' | 'peer_anomaly';
  metricName: string;
  observedValue: number;
  expectedValue: number;
  deviationScore: number;
  riskScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  relatedLogs: string[];
  contextData: Record<string, unknown>;
}

interface AnomalyDashboard {
  totalAnomalies: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  topEntities: { entityType: string; entityId: string; count: number; avgRisk: number }[];
  recentTrend: { hour: string; count: number }[];
}

// API functions
async function getAnomalyDashboard(): Promise<AnomalyDashboard> {
  const response = await authFetch('/anomaly/dashboard?hoursBack=24');
  if (!response.ok) throw new Error('Failed to fetch dashboard');
  return response.json();
}

async function getAnomalies(options?: {
  severity?: string;
  limit?: number;
}): Promise<{ anomalies: AnomalyEvent[] }> {
  const params = new URLSearchParams();
  if (options?.severity) params.set('severity', options.severity);
  if (options?.limit) params.set('limit', String(options.limit));

  const response = await authFetch(`/anomaly/events?${params}`);
  if (!response.ok) throw new Error('Failed to fetch anomalies');
  return response.json();
}

async function runDetection(): Promise<{ detected: number; stored: number }> {
  const response = await authFetch('/anomaly/detect', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to run detection');
  return response.json();
}

async function calculateBaselines(): Promise<{ processed: number }> {
  const response = await authFetch('/anomaly/baselines/calculate', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to calculate baselines');
  return response.json();
}

async function submitFeedback(id: string, isFalsePositive: boolean): Promise<void> {
  const response = await authFetch('/anomaly/feedback', {
    method: 'POST',
    body: JSON.stringify({ id, isFalsePositive }),
  });
  if (!response.ok) throw new Error('Failed to submit feedback');
}

async function analyzeAnomaly(id: string): Promise<{ analysis: unknown }> {
  const response = await authFetch(`/anomaly/analyze/${id}`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to analyze anomaly');
  return response.json();
}

// Severity colors
const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: AlertTriangle },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: AlertTriangle },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', icon: Activity },
  low: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: Activity },
};

const ENTITY_ICONS = {
  user: User,
  host: Server,
  ip: Shield,
  app: Zap,
};

const ANOMALY_TYPE_LABELS = {
  spike: 'Spike',
  drop: 'Drop',
  time_anomaly: 'Unusual Time',
  new_behavior: 'New Behavior',
  peer_anomaly: 'Peer Anomaly',
};

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color,
  iconBg,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  iconBg: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className={`p-2 sm:p-3 rounded-xl ${iconBg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
        </div>
      </div>
      <div className="mt-3 sm:mt-4">
        <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
        {subValue && (
          <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
}

// Anomaly Row Component
function AnomalyRow({
  anomaly,
  onFeedback,
  onAnalyze,
}: {
  anomaly: AnomalyEvent;
  onFeedback: (id: string, isFalsePositive: boolean) => void;
  onAnalyze: (id: string) => void;
}) {
  const config = SEVERITY_CONFIG[anomaly.severity];
  const EntityIcon = ENTITY_ICONS[anomaly.entityType] || Server;

  return (
    <div className={`p-4 border-l-4 ${config.border} hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <EntityIcon className={`w-4 h-4 ${config.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {anomaly.entityId}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${config.bg} ${config.text}`}>
                {anomaly.severity}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {ANOMALY_TYPE_LABELS[anomaly.anomalyType]}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {anomaly.metricName}: {anomaly.observedValue.toFixed(1)} (expected {anomaly.expectedValue.toFixed(1)})
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(anomaly.timestamp).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                {anomaly.deviationScore > 0 ? (
                  <TrendingUp className="w-3 h-3 text-red-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-amber-500" />
                )}
                {Math.abs(anomaly.deviationScore).toFixed(1)}σ
              </span>
              <span className="font-medium">Risk: {anomaly.riskScore}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onAnalyze(anomaly.id)}
            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            title="Analyze with AI"
          >
            <Brain className="w-4 h-4" />
          </button>
          <button
            onClick={() => onFeedback(anomaly.id, true)}
            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Mark as false positive"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onFeedback(anomaly.id, false)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Confirm as true positive"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    </div>
  );
}

export default function AnomalyPage() {
  const queryClient = useQueryClient();
  const [selectedSeverity, setSelectedSeverity] = useState<string | undefined>();

  // Queries
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['anomaly-dashboard'],
    queryFn: getAnomalyDashboard,
    refetchInterval: 60000,
  });

  const { data: anomaliesData, isLoading: anomaliesLoading } = useQuery({
    queryKey: ['anomalies', selectedSeverity],
    queryFn: () => getAnomalies({ severity: selectedSeverity, limit: 50 }),
    refetchInterval: 30000,
  });

  // Mutations
  const detectMutation = useMutation({
    mutationFn: runDetection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomaly-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
    },
  });

  const baselineMutation = useMutation({
    mutationFn: calculateBaselines,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomaly-dashboard'] });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, isFalsePositive }: { id: string; isFalsePositive: boolean }) =>
      submitFeedback(id, isFalsePositive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeAnomaly,
  });

  const isLoading = dashboardLoading || anomaliesLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading anomaly detection...</p>
      </div>
    );
  }

  const anomalies = anomaliesData?.anomalies || [];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="w-6 h-6 text-amber-600" />
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Anomaly Detection
                </h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 hidden sm:block">
                UEBA - User and Entity Behavior Analytics
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => baselineMutation.mutate()}
                disabled={baselineMutation.isPending}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {baselineMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Calculate Baselines
              </button>
              <button
                onClick={() => detectMutation.mutate()}
                disabled={detectMutation.isPending}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {detectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Run Detection
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={AlertTriangle}
            label="Total Anomalies"
            value={dashboard?.totalAnomalies || 0}
            subValue="Last 24 hours"
            color="text-amber-600"
            iconBg="bg-amber-50"
          />
          <StatCard
            icon={AlertTriangle}
            label="Critical"
            value={dashboard?.bySeverity?.critical || 0}
            subValue="Requires attention"
            color="text-red-600"
            iconBg="bg-red-50"
          />
          <StatCard
            icon={Activity}
            label="High Risk"
            value={dashboard?.bySeverity?.high || 0}
            subValue="Investigate soon"
            color="text-orange-600"
            iconBg="bg-orange-50"
          />
          <StatCard
            icon={Shield}
            label="Entities Affected"
            value={dashboard?.topEntities?.length || 0}
            subValue="Unique entities"
            color="text-amber-600"
            iconBg="bg-amber-50"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Anomaly Trend */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                Anomaly Trend
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Detections per hour (last 24h)
              </p>
            </div>
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard?.recentTrend || []}>
                  <defs>
                    <linearGradient id="colorAnomalies" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fill="url(#colorAnomalies)"
                    name="Anomalies"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Affected Entities */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                Top Affected Entities
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Entities with most anomalies
              </p>
            </div>
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard?.topEntities?.slice(0, 8) || []} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="entityId"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={11}
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.length > 12 ? v.slice(0, 12) + '...' : v}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Bar dataKey="count" fill="#a855f7" radius={[0, 6, 6, 0]} name="Anomalies" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Anomaly List */}
        <div className="card">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  Recent Anomalies
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {anomalies.length} anomalies detected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSeverity || ''}
                  onChange={(e) => setSelectedSeverity(e.target.value || undefined)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600"
                >
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {anomalies.length === 0 ? (
              <div className="p-8 text-center">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400">No anomalies detected</p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                  Click "Run Detection" to scan for anomalies
                </p>
              </div>
            ) : (
              anomalies.map((anomaly) => (
                <AnomalyRow
                  key={anomaly.id}
                  anomaly={anomaly}
                  onFeedback={(id, isFalsePositive) =>
                    feedbackMutation.mutate({ id, isFalsePositive })
                  }
                  onAnalyze={(id) => analyzeMutation.mutate(id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

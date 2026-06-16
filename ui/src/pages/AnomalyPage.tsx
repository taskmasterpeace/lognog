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
import { AreaChart, BarChart } from '../components/charts';
import { useTheme } from '../contexts/ThemeContext';
import { authFetch } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

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

interface AnomalyAnalysis {
  riskScore: number;
  explanation: string;
  suggestedActions: string[];
  relatedThreatTypes: string[];
  confidence: number;
}

async function analyzeAnomaly(id: string): Promise<{ anomalyId: string; analysis: AnomalyAnalysis; provider?: string }> {
  const response = await authFetch(`/anomaly/analyze/${id}`, { method: 'POST' });
  if (!response.ok) {
    let message = 'Failed to analyze anomaly';
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
  return response.json();
}

// Severity colors
const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800', icon: AlertTriangle },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800', icon: AlertTriangle },
  medium: { bg: 'bg-honey-100 dark:bg-honey-900/20', text: 'text-honey-700 dark:text-honey-400', border: 'border-honey-200 dark:border-honey-800', icon: Activity },
  low: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800', icon: Activity },
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
        <p className="text-2xl sm:text-3xl font-bold text-nog-900 dark:text-nog-100">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-xs sm:text-sm text-nog-500 dark:text-nog-400 mt-1">{label}</p>
        {subValue && (
          <p className="text-[10px] sm:text-xs text-nog-400 dark:text-nog-500 mt-0.5">
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
  isAnalyzing,
}: {
  anomaly: AnomalyEvent;
  onFeedback: (id: string, isFalsePositive: boolean) => void;
  onAnalyze: (id: string) => void;
  isAnalyzing: boolean;
}) {
  const config = SEVERITY_CONFIG[anomaly.severity];
  const EntityIcon = ENTITY_ICONS[anomaly.entityType] || Server;

  return (
    <div className={`p-4 border-l-4 ${config.border} hover:bg-nog-50 dark:hover:bg-nog-800 transition-colors`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <EntityIcon className={`w-4 h-4 ${config.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-nog-900 dark:text-nog-100">
                {anomaly.entityId}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${config.bg} ${config.text}`}>
                {anomaly.severity}
              </span>
              <span className="text-xs text-nog-500 dark:text-nog-400">
                {ANOMALY_TYPE_LABELS[anomaly.anomalyType]}
              </span>
            </div>
            <p className="text-sm text-nog-600 dark:text-nog-400 mt-1">
              {anomaly.metricName}: {(anomaly.observedValue ?? 0).toFixed(1)} (expected {(anomaly.expectedValue ?? 0).toFixed(1)})
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-nog-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(anomaly.timestamp).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                {anomaly.deviationScore > 0 ? (
                  <TrendingUp className="w-3 h-3 text-red-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-green-500" />
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
            disabled={isAnalyzing}
            aria-label="Analyze anomaly with AI"
            className="p-2 text-honey-600 hover:bg-honey-50 dark:hover:bg-honey-900/20 rounded-lg transition-colors disabled:opacity-50"
            title="Analyze with AI"
          >
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onFeedback(anomaly.id, true)}
            aria-label="Mark anomaly as false positive"
            className="p-2 text-nog-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
            title="Mark as false positive"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onFeedback(anomaly.id, false)}
            aria-label="Confirm anomaly as true positive"
            className="p-2 text-nog-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Confirm as true positive"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
          <ChevronRight className="w-4 h-4 text-nog-400" />
        </div>
      </div>
    </div>
  );
}

export default function AnomalyPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedSeverity, setSelectedSeverity] = useState<string | undefined>();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

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
    onMutate: (id: string) => {
      setAnalyzingId(id);
    },
    onSuccess: (data) => {
      const a = data.analysis;
      const actions = a.suggestedActions?.length
        ? ` Suggested: ${a.suggestedActions.slice(0, 2).join('; ')}`
        : '';
      toast.success(
        `AI Analysis (risk ${a.riskScore})`,
        `${a.explanation}${actions}`
      );
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
    },
    onError: (error) => {
      toast.error('Analysis Failed', error instanceof Error ? error.message : 'Unknown error');
    },
    onSettled: () => {
      setAnalyzingId(null);
    },
  });

  const isLoading = dashboardLoading || anomaliesLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-honey-500 animate-spin mb-4" />
        <p className="text-nog-600 dark:text-nog-400">Loading anomaly detection...</p>
      </div>
    );
  }

  const anomalies = anomaliesData?.anomalies || [];

  return (
    <div className="min-h-full bg-nog-50 dark:bg-nog-900">
      {/* Header */}
      <div className="bg-white dark:bg-nog-800 border-b border-nog-200 dark:border-nog-700 shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="w-6 h-6 text-honey-600" />
                <h1 className="text-xl sm:text-2xl font-bold text-nog-900 dark:text-nog-100">
                  Anomaly Detection
                </h1>
              </div>
              <p className="text-nog-500 dark:text-nog-400 text-sm mt-1 hidden sm:block">
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
            color="text-honey-600"
            iconBg="bg-honey-50"
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
            color="text-honey-600"
            iconBg="bg-honey-50"
          />
          <StatCard
            icon={Shield}
            label="Entities Affected"
            value={dashboard?.topEntities?.length || 0}
            subValue="Unique entities"
            color="text-honey-600"
            iconBg="bg-honey-50"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Anomaly Trend */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-nog-900 dark:text-nog-100 text-sm sm:text-base">
                Anomaly Trend
              </h3>
              <p className="text-xs sm:text-sm text-nog-500 dark:text-nog-400">
                Detections per hour (last 24h)
              </p>
            </div>
            <AreaChart
              data={dashboard?.recentTrend || []}
              series={[{ name: 'Anomalies', dataKey: 'count', color: '#C8862B' }]}
              xAxisKey="hour"
              height={256}
              darkMode={isDarkMode}
              xAxisFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              tooltipFormatter={(v) => new Date(v).toLocaleString()}
            />
          </div>

          {/* Top Affected Entities */}
          <div className="card p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <h3 className="font-semibold text-nog-900 dark:text-nog-100 text-sm sm:text-base">
                Top Affected Entities
              </h3>
              <p className="text-xs sm:text-sm text-nog-500 dark:text-nog-400">
                Entities with most anomalies
              </p>
            </div>
            <BarChart
              data={(dashboard?.topEntities?.slice(0, 8) || []).map((e) => ({
                category: e.entityId.length > 12 ? e.entityId.slice(0, 12) + '...' : e.entityId,
                value: e.count,
              }))}
              height={256}
              darkMode={isDarkMode}
              horizontal={true}
              barColor="#C8862B"
              showValues={false}
            />
          </div>
        </div>

        {/* Anomaly List */}
        <div className="card">
          <div className="p-4 sm:p-5 border-b border-nog-200 dark:border-nog-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-nog-900 dark:text-nog-100">
                  Recent Anomalies
                </h3>
                <p className="text-sm text-nog-500 dark:text-nog-400">
                  {anomalies.length} anomalies detected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSeverity || ''}
                  onChange={(e) => setSelectedSeverity(e.target.value || undefined)}
                  className="px-3 py-1.5 text-sm border border-nog-300 rounded-lg bg-white dark:bg-nog-800 dark:border-nog-600"
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

          <div className="divide-y divide-nog-200 dark:divide-nog-700">
            {anomalies.length === 0 ? (
              <div className="p-8 text-center">
                <Shield className="w-12 h-12 text-nog-300 mx-auto mb-3" />
                <p className="text-nog-600 dark:text-nog-400">No anomalies detected</p>
                <p className="text-sm text-nog-500 dark:text-nog-500 mt-1">
                  Click "Run Detection" to scan for anomalies
                </p>
              </div>
            ) : (
              anomalies.map((anomaly) => (
                <AnomalyRow
                  key={anomaly.id}
                  anomaly={anomaly}
                  isAnalyzing={analyzingId === anomaly.id}
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

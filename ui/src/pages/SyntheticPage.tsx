import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Plus,
  Trash2,
  Loader2,
  X,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Globe,
  Server,
  Wifi,
  ChevronDown,
  ChevronRight,
  Settings,
  BarChart3,
} from 'lucide-react';
import {
  getSyntheticTests,
  getSyntheticDashboard,
  getSyntheticResults,
  createSyntheticTest,
  updateSyntheticTest,
  deleteSyntheticTest,
  toggleSyntheticTest,
  runSyntheticTest,
  SyntheticTest,
  SyntheticTestType,
  SyntheticTestConfig,
  SyntheticResult,
  SyntheticStatus,
} from '../api/client';

// Constants
const TEST_TYPES: { value: SyntheticTestType; label: string; icon: typeof Globe; description: string }[] = [
  { value: 'http', label: 'HTTP', icon: Globe, description: 'HTTP/HTTPS endpoint check' },
  { value: 'api', label: 'API', icon: Server, description: 'API endpoint with assertions' },
  { value: 'tcp', label: 'TCP', icon: Wifi, description: 'TCP port connectivity' },
  { value: 'browser', label: 'Browser', icon: Activity, description: 'Playwright browser test' },
];

const SCHEDULE_OPTIONS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const STATUS_COLORS: Record<SyntheticStatus, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  success: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: CheckCircle2 },
  failure: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: XCircle },
  timeout: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', icon: Timer },
  error: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: AlertTriangle },
};

export default function SyntheticPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [editingTest, setEditingTest] = useState<SyntheticTest | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    test_type: 'http' as SyntheticTestType,
    schedule: '*/5 * * * *',
    timeout_ms: 30000,
    alert_after_failures: 3,
    config: {
      url: '',
      method: 'GET',
      headers: {} as Record<string, string>,
      body: '',
      host: '',
      port: 80,
      followRedirects: true,
      assertions: [] as NonNullable<SyntheticTestConfig['assertions']>,
    },
    tags: [] as string[],
  });

  // Queries
  const { data: tests = [], isLoading: testsLoading } = useQuery({
    queryKey: ['synthetic-tests'],
    queryFn: () => getSyntheticTests(),
  });

  const { data: dashboard } = useQuery({
    queryKey: ['synthetic-dashboard'],
    queryFn: getSyntheticDashboard,
    refetchInterval: 30000,
  });

  const { data: selectedResults = [] } = useQuery({
    queryKey: ['synthetic-results', selectedTestId],
    queryFn: () => (selectedTestId ? getSyntheticResults(selectedTestId, 50) : Promise.resolve([])),
    enabled: !!selectedTestId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createSyntheticTest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synthetic-tests'] });
      queryClient.invalidateQueries({ queryKey: ['synthetic-dashboard'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<SyntheticTest> }) =>
      updateSyntheticTest(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synthetic-tests'] });
      setShowCreateModal(false);
      setEditingTest(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSyntheticTest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synthetic-tests'] });
      queryClient.invalidateQueries({ queryKey: ['synthetic-dashboard'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleSyntheticTest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synthetic-tests'] });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (testId: string) => {
      setRunningTests((prev) => new Set(prev).add(testId));
      try {
        return await runSyntheticTest(testId);
      } finally {
        setRunningTests((prev) => {
          const next = new Set(prev);
          next.delete(testId);
          return next;
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synthetic-tests'] });
      queryClient.invalidateQueries({ queryKey: ['synthetic-results'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      test_type: 'http',
      schedule: '*/5 * * * *',
      timeout_ms: 30000,
      alert_after_failures: 3,
      config: {
        url: '',
        method: 'GET',
        headers: {},
        body: '',
        host: '',
        port: 80,
        followRedirects: true,
        assertions: [],
      },
      tags: [],
    });
  };

  const openEditModal = (test: SyntheticTest) => {
    setEditingTest(test);
    setFormData({
      name: test.name,
      description: test.description || '',
      test_type: test.test_type,
      schedule: test.schedule,
      timeout_ms: test.timeout_ms,
      alert_after_failures: test.alert_after_failures,
      config: {
        url: test.config.url || '',
        method: test.config.method || 'GET',
        headers: test.config.headers || {},
        body: test.config.body || '',
        host: test.config.host || '',
        port: test.config.port || 80,
        followRedirects: test.config.followRedirects !== false,
        assertions: test.config.assertions || [],
      },
      tags: test.tags || [],
    });
    setShowCreateModal(true);
  };

  const handleSubmit = () => {
    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      test_type: formData.test_type,
      schedule: formData.schedule,
      timeout_ms: formData.timeout_ms,
      alert_after_failures: formData.alert_after_failures,
      config: formData.config,
      tags: formData.tags,
    };

    if (editingTest) {
      updateMutation.mutate({ id: editingTest.id, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleExpanded = (testId: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) {
        next.delete(testId);
      } else {
        next.add(testId);
      }
      return next;
    });
  };

  const getTestTypeInfo = (type: SyntheticTestType) => {
    return TEST_TYPES.find((t) => t.value === type) || TEST_TYPES[0];
  };

  const formatResponseTime = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString();
  };

  if (testsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Synthetic Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Proactive uptime testing and endpoint monitoring
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingTest(null);
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Test
        </button>
      </div>

      {/* Dashboard Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Tests</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{dashboard.total_tests}</div>
            <div className="text-xs text-slate-400 mt-1">
              {dashboard.enabled_tests} enabled, {dashboard.disabled_tests} disabled
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Healthy</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {dashboard.by_status?.success || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {dashboard.tests_with_failures} with failures
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Avg Response</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatResponseTime(dashboard.avg_response_time_ms)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">By Type</div>
            <div className="text-xs space-y-1 mt-2">
              {Object.entries(dashboard.by_type || {}).map(([type, count]) => (
                <div key={type} className="flex justify-between">
                  <span className="text-slate-500">{type.toUpperCase()}</span>
                  <span className="text-slate-900 dark:text-slate-100">{count as number}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tests List */}
      {tests.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
          <Activity className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No synthetic tests yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Create your first test to start monitoring endpoints and services.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Test
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => {
            const typeInfo = getTestTypeInfo(test.test_type);
            const TypeIcon = typeInfo.icon;
            const isExpanded = expandedTests.has(test.id);
            const isRunning = runningTests.has(test.id);
            const statusInfo = test.last_status ? STATUS_COLORS[test.last_status] : null;
            const StatusIcon = statusInfo?.icon;

            return (
              <div
                key={test.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Test Header */}
                <div className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Expand Button */}
                    <button
                      onClick={() => toggleExpanded(test.id)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>

                    {/* Type Icon */}
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700">
                      <TypeIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </div>

                    {/* Test Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">{test.name}</h3>
                        {!test.enabled && (
                          <span className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                        {test.test_type === 'http' || test.test_type === 'api'
                          ? test.config.url
                          : `${test.config.host}:${test.config.port}`}
                      </div>
                    </div>

                    {/* Status Badge */}
                    {statusInfo && StatusIcon && (
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${statusInfo.bg}`}>
                        <StatusIcon className={`w-4 h-4 ${statusInfo.text}`} />
                        <span className={`text-xs font-medium ${statusInfo.text}`}>{test.last_status}</span>
                      </div>
                    )}

                    {/* Response Time */}
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatResponseTime(test.last_response_time_ms)}
                      </div>
                      <div className="text-xs text-slate-500">{formatTimestamp(test.last_run)}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runMutation.mutate(test.id)}
                        disabled={isRunning}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Run now"
                      >
                        {isRunning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(test.id)}
                        className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                        title={test.enabled ? 'Disable' : 'Enable'}
                      >
                        {test.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEditModal(test)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTestId(test.id);
                          setShowResultsModal(true);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title="View results"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this test?')) {
                            deleteMutation.mutate(test.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Schedule</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{test.schedule}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Timeout</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{test.timeout_ms}ms</div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Consecutive Failures</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {test.consecutive_failures} / {test.alert_after_failures}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Assertions</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {test.config.assertions?.length || 0} configured
                        </div>
                      </div>
                    </div>
                    {test.description && (
                      <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">{test.description}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingTest ? 'Edit Test' : 'Create Test'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTest(null);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Test Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    placeholder="e.g., API Health Check"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    rows={2}
                    placeholder="Optional description..."
                  />
                </div>
              </div>

              {/* Test Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Test Type
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {TEST_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        onClick={() => setFormData({ ...formData, test_type: type.value })}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          formData.test_type === type.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-1 ${formData.test_type === type.value ? 'text-blue-600' : 'text-slate-400'}`} />
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{type.label}</div>
                        <div className="text-xs text-slate-500">{type.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* HTTP/API Config */}
              {(formData.test_type === 'http' || formData.test_type === 'api') && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="w-32">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Method
                      </label>
                      <select
                        value={formData.config.method}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, method: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        {HTTP_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        URL
                      </label>
                      <input
                        type="url"
                        value={formData.config.url}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, url: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="https://api.example.com/health"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TCP Config */}
              {formData.test_type === 'tcp' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Host
                    </label>
                    <input
                      type="text"
                      value={formData.config.host}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, host: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      placeholder="database.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={formData.config.port}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, port: parseInt(e.target.value) || 80 },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      placeholder="5432"
                    />
                  </div>
                </div>
              )}

              {/* Schedule & Timeout */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Schedule
                  </label>
                  <select
                    value={formData.schedule}
                    onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  >
                    {SCHEDULE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={formData.timeout_ms}
                    onChange={(e) => setFormData({ ...formData, timeout_ms: parseInt(e.target.value) || 30000 })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Alert Settings */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alert after consecutive failures
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.alert_after_failures}
                  onChange={(e) => setFormData({ ...formData, alert_after_failures: parseInt(e.target.value) || 3 })}
                  className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTest(null);
                  resetForm();
                }}
                className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || !formData.name}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {editingTest ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && selectedTestId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Test Results
              </h2>
              <button
                onClick={() => {
                  setShowResultsModal(false);
                  setSelectedTestId(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Response Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Assertions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {selectedResults.map((result: SyntheticResult) => {
                    const statusInfo = STATUS_COLORS[result.status];
                    const StatusIcon = statusInfo.icon;
                    return (
                      <tr key={result.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                          {formatTimestamp(result.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${statusInfo.bg}`}>
                            <StatusIcon className={`w-3 h-3 ${statusInfo.text}`} />
                            <span className={`text-xs font-medium ${statusInfo.text}`}>{result.status}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                          {formatResponseTime(result.response_time_ms)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                          {result.status_code || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="text-green-600">{result.assertions_passed} passed</span>
                          {result.assertions_failed > 0 && (
                            <span className="text-red-600 ml-2">{result.assertions_failed} failed</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-500 dark:text-red-400 max-w-xs truncate">
                          {result.error_message || '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {selectedResults.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No results yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

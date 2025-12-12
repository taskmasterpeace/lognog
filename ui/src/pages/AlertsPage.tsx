import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Plus,
  Trash2,
  Loader2,
  Clock,
  X,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Zap,
  Mail,
  Globe,
  FileText,
  ChevronDown,
  ChevronRight,
  History,
  TestTube,
  Settings,
} from 'lucide-react';
import {
  getAlerts,
  getAlertHistory,
  createAlert,
  updateAlert,
  deleteAlert,
  toggleAlert,
  testAlert,
  evaluateAlert,
  Alert,
  AlertAction,
} from '../api/client';

// Local type for alert history (used in UI)
interface LocalAlertHistory {
  id: string;
  alert_id: string;
  triggered_at: string;
  result_count: number;
  trigger_value?: string;
  severity: string;
  actions_executed?: { type: string; success: boolean; message: string }[];
  sample_results?: Record<string, unknown>[];
  acknowledged: number;
  acknowledged_by?: string;
  acknowledged_at?: string;
  notes?: string;
}

// Constants
const TRIGGER_TYPES = [
  { value: 'number_of_results', label: 'Number of Results' },
  { value: 'number_of_hosts', label: 'Number of Hosts' },
  { value: 'custom_condition', label: 'Custom (any results)' },
];

const TRIGGER_CONDITIONS = [
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
  { value: 'equal_to', label: 'is equal to' },
  { value: 'not_equal_to', label: 'is not equal to' },
  { value: 'drops_by', label: 'drops by' },
  { value: 'rises_by', label: 'rises by' },
];

const SEVERITIES = [
  { value: 'info', label: 'Info', icon: Info, color: 'text-blue-500', bg: 'bg-blue-100' },
  { value: 'low', label: 'Low', icon: AlertCircle, color: 'text-slate-500', bg: 'bg-slate-100' },
  { value: 'medium', label: 'Medium', icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100' },
  { value: 'high', label: 'High', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-100' },
  { value: 'critical', label: 'Critical', icon: Zap, color: 'text-red-500', bg: 'bg-red-100' },
];

const SCHEDULE_OPTIONS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
];

const TIME_RANGES = [
  { label: 'Last 1 minute', value: '-1m' },
  { label: 'Last 5 minutes', value: '-5m' },
  { label: 'Last 15 minutes', value: '-15m' },
  { label: 'Last 1 hour', value: '-1h' },
  { label: 'Last 4 hours', value: '-4h' },
  { label: 'Last 24 hours', value: '-24h' },
];

export default function AlertsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    search_query: 'search severity<=3',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 0,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'medium',
    throttle_enabled: false,
    throttle_window_seconds: 300,
    actions: [] as AlertAction[],
  });

  const [testResult, setTestResult] = useState<{
    wouldTrigger: boolean;
    resultCount: number;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const queryClient = useQueryClient();

  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
  });

  const { data: alertHistory } = useQuery<LocalAlertHistory[]>({
    queryKey: ['alertHistory', selectedAlertId],
    queryFn: () => getAlertHistory(selectedAlertId || undefined) as Promise<LocalAlertHistory[]>,
    enabled: showHistoryModal,
  });

  const createMutation = useMutation({
    mutationFn: () => createAlert({
      ...formData,
      throttle_enabled: formData.throttle_enabled,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingAlert) throw new Error('No alert selected');
      return updateAlert(editingAlert.id, {
        ...formData,
        throttle_enabled: formData.throttle_enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setShowCreateModal(false);
      setEditingAlert(null);
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: evaluateAlert,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertHistory'] });
      alert(data.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      search_query: 'search severity<=3',
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      schedule_type: 'cron',
      cron_expression: '*/5 * * * *',
      time_range: '-5m',
      severity: 'medium',
      throttle_enabled: false,
      throttle_window_seconds: 300,
      actions: [],
    });
    setTestResult(null);
  };

  const handleEdit = (alert: Alert) => {
    setEditingAlert(alert);
    setFormData({
      name: alert.name,
      description: alert.description || '',
      search_query: alert.search_query,
      trigger_type: alert.trigger_type,
      trigger_condition: alert.trigger_condition,
      trigger_threshold: alert.trigger_threshold,
      schedule_type: alert.schedule_type,
      cron_expression: alert.cron_expression || '*/5 * * * *',
      time_range: alert.time_range,
      severity: alert.severity,
      throttle_enabled: Boolean(alert.throttle_enabled),
      throttle_window_seconds: alert.throttle_window_seconds,
      actions: alert.actions,
    });
    setShowCreateModal(true);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testAlert({
        search_query: formData.search_query,
        trigger_type: formData.trigger_type,
        trigger_condition: formData.trigger_condition,
        trigger_threshold: formData.trigger_threshold,
        time_range: formData.time_range,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        wouldTrigger: false,
        resultCount: 0,
        message: 'Test failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
      });
    } finally {
      setTesting(false);
    }
  };

  const addAction = (type: AlertAction['type']) => {
    const newAction: AlertAction = {
      type,
      config: type === 'email' ? { to: '', subject: '', body: '' } :
              type === 'webhook' ? { url: '', method: 'POST' } :
              {},
    };
    setFormData({ ...formData, actions: [...formData.actions, newAction] });
  };

  const updateAction = (index: number, updates: Partial<AlertAction['config']>) => {
    const newActions = [...formData.actions];
    newActions[index] = { ...newActions[index], config: { ...newActions[index].config, ...updates } };
    setFormData({ ...formData, actions: newActions });
  };

  const removeAction = (index: number) => {
    setFormData({ ...formData, actions: formData.actions.filter((_, i) => i !== index) });
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedAlerts);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedAlerts(newExpanded);
  };

  const getSeverityConfig = (severity: string) => {
    return SEVERITIES.find(s => s.value === severity) || SEVERITIES[2];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        Error loading alerts: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bell className="w-7 h-7 text-sky-500" />
            Alerts
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure alert rules to notify you when conditions are met
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectedAlertId(null);
              setShowHistoryModal(true);
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            Alert History
          </button>
          <button
            onClick={() => {
              resetForm();
              setEditingAlert(null);
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Alert
          </button>
        </div>
      </div>

      {/* Alerts List */}
      {alerts && alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const severity = getSeverityConfig(alert.severity);
            const SeverityIcon = severity.icon;
            const isExpanded = expandedAlerts.has(alert.id);

            return (
              <div
                key={alert.id}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border ${
                  alert.enabled ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200/50 dark:border-slate-700/50 opacity-60'
                }`}
              >
                {/* Alert Header */}
                <div className="p-4 flex items-center gap-4">
                  <button
                    onClick={() => toggleExpand(alert.id)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>

                  <div className={`p-2 rounded-lg ${severity.bg}`}>
                    <SeverityIcon className={`w-5 h-5 ${severity.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {alert.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      {alert.search_query}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {alert.cron_expression}
                    </div>
                    {alert.trigger_count > 0 && (
                      <div className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                        Triggered {alert.trigger_count}x
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => evaluateMutation.mutate(alert.id)}
                      disabled={evaluateMutation.isPending}
                      className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                      title="Run Now"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(alert.id)}
                      className={`p-2 rounded-lg ${
                        alert.enabled
                          ? 'text-green-500 hover:bg-green-50'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title={alert.enabled ? 'Disable' : 'Enable'}
                    >
                      {alert.enabled ? <CheckCircle2 className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(alert)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                      title="Edit"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this alert?')) {
                          deleteMutation.mutate(alert.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Trigger Condition</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {TRIGGER_TYPES.find(t => t.value === alert.trigger_type)?.label}{' '}
                          {TRIGGER_CONDITIONS.find(c => c.value === alert.trigger_condition)?.label}{' '}
                          {alert.trigger_threshold}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Time Range</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {TIME_RANGES.find(t => t.value === alert.time_range)?.label || alert.time_range}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Last Run</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {alert.last_run ? new Date(alert.last_run).toLocaleString() : 'Never'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Last Triggered</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {alert.last_triggered ? new Date(alert.last_triggered).toLocaleString() : 'Never'}
                        </div>
                      </div>
                    </div>
                    {alert.actions.length > 0 && (
                      <div className="mt-4">
                        <div className="text-slate-500 dark:text-slate-400 text-sm mb-2">Actions</div>
                        <div className="flex flex-wrap gap-2">
                          {alert.actions.map((action, i) => (
                            <div
                              key={i}
                              className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-sm flex items-center gap-2"
                            >
                              {action.type === 'email' && <Mail className="w-3 h-3" />}
                              {action.type === 'webhook' && <Globe className="w-3 h-3" />}
                              {action.type === 'log' && <FileText className="w-3 h-3" />}
                              {action.type}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No alerts configured</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Create your first alert to monitor your logs
          </p>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Alert
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {editingAlert ? 'Edit Alert' : 'Create Alert'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingAlert(null);
                  resetForm();
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Basic Information</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Alert Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., High Error Rate"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Alert when error count is high"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Search Query */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Search Query</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    DSL Query
                  </label>
                  <textarea
                    value={formData.search_query}
                    onChange={(e) => setFormData({ ...formData, search_query: e.target.value })}
                    placeholder="search severity<=3 | stats count"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Trigger Condition */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Trigger Condition</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Type
                    </label>
                    <select
                      value={formData.trigger_type}
                      onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      {TRIGGER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Condition
                    </label>
                    <select
                      value={formData.trigger_condition}
                      onChange={(e) => setFormData({ ...formData, trigger_condition: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      {TRIGGER_CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Threshold
                    </label>
                    <input
                      type="number"
                      value={formData.trigger_threshold}
                      onChange={(e) => setFormData({ ...formData, trigger_threshold: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Schedule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Run Schedule
                    </label>
                    <select
                      value={formData.cron_expression}
                      onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      {SCHEDULE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Time Range to Search
                    </label>
                    <select
                      value={formData.time_range}
                      onChange={(e) => setFormData({ ...formData, time_range: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      {TIME_RANGES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Severity */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">Severity</h3>
                <div className="flex gap-2">
                  {SEVERITIES.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, severity: s.value })}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                          formData.severity === s.value
                            ? `${s.bg} border-current ${s.color}`
                            : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${s.color}`} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Throttling */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="throttle"
                    checked={formData.throttle_enabled}
                    onChange={(e) => setFormData({ ...formData, throttle_enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <label htmlFor="throttle" className="font-medium text-slate-900 dark:text-slate-100">
                    Enable Throttling
                  </label>
                </div>
                {formData.throttle_enabled && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Suppress for (seconds)
                    </label>
                    <input
                      type="number"
                      value={formData.throttle_window_seconds}
                      onChange={(e) => setFormData({ ...formData, throttle_window_seconds: parseInt(e.target.value) || 300 })}
                      className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">Actions</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => addAction('email')}
                      className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" /> Email
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('webhook')}
                      className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" /> Webhook
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('log')}
                      className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> Log
                    </button>
                  </div>
                </div>

                {formData.actions.length === 0 ? (
                  <p className="text-sm text-slate-500">No actions configured. Alert will only log to history.</p>
                ) : (
                  <div className="space-y-3">
                    {formData.actions.map((action, index) => (
                      <div key={index} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 font-medium capitalize">
                            {action.type === 'email' && <Mail className="w-4 h-4" />}
                            {action.type === 'webhook' && <Globe className="w-4 h-4" />}
                            {action.type === 'log' && <FileText className="w-4 h-4" />}
                            {action.type}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAction(index)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {action.type === 'email' && (
                          <div className="space-y-2">
                            <input
                              type="email"
                              placeholder="recipient@example.com"
                              value={action.config.to || ''}
                              onChange={(e) => updateAction(index, { to: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                            />
                          </div>
                        )}

                        {action.type === 'webhook' && (
                          <div className="space-y-2">
                            <input
                              type="url"
                              placeholder="https://api.example.com/webhook"
                              value={action.config.url || ''}
                              onChange={(e) => updateAction(index, { url: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                            />
                            <select
                              value={action.config.method || 'POST'}
                              onChange={(e) => updateAction(index, { method: e.target.value as 'GET' | 'POST' | 'PUT' })}
                              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                            >
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`p-4 rounded-lg ${testResult.wouldTrigger ? 'bg-orange-50 text-orange-800' : 'bg-green-50 text-green-800'}`}>
                  <div className="font-medium flex items-center gap-2">
                    {testResult.wouldTrigger ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    {testResult.wouldTrigger ? 'Alert Would Trigger' : 'Alert Would Not Trigger'}
                  </div>
                  <div className="text-sm mt-1">
                    {testResult.resultCount} results found. {testResult.message}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !formData.search_query}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                Test Alert
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingAlert(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editingAlert ? updateMutation.mutate() : createMutation.mutate()}
                  disabled={!formData.name || !formData.search_query || createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingAlert ? 'Update Alert' : 'Create Alert'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <History className="w-5 h-5" />
                Alert History
              </h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {alertHistory && alertHistory.length > 0 ? (
                <div className="space-y-3">
                  {alertHistory.map((entry) => {
                    const severity = getSeverityConfig(entry.severity);
                    const SeverityIcon = severity.icon;
                    const alert = alerts?.find(a => a.id === entry.alert_id);

                    return (
                      <div
                        key={entry.id}
                        className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${severity.bg}`}>
                            <SeverityIcon className={`w-4 h-4 ${severity.color}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {alert?.name || 'Unknown Alert'}
                              </div>
                              <div className="text-sm text-slate-500">
                                {new Date(entry.triggered_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                              {entry.result_count} results triggered this alert
                            </div>
                            {entry.actions_executed && entry.actions_executed.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {entry.actions_executed.map((action, i) => (
                                  <span
                                    key={i}
                                    className={`text-xs px-2 py-1 rounded ${
                                      action.success
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {action.type}: {action.success ? 'OK' : 'Failed'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  No alert history yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

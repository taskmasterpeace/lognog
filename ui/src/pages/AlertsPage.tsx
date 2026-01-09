import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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
  BellOff,
  Send,
  Terminal,
  LogIn,
  Filter,
  ArrowUpDown,
  Timer,
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
  createSilence,
  getNotificationChannels,
  NotificationChannel,
} from '../api/client';
import VariableHelper from '../components/VariableHelper';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../components/ui/ConfirmDialog';
// Note: VariableInsertHelper is available for advanced template editing
import { InfoTip } from '../components/ui/InfoTip';
import AppScopeFilter from '../components/AppScopeFilter';
import { useDateFormat } from '../contexts/DateFormatContext';

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
  { value: 'info', label: 'Info', icon: Info, color: 'text-amber-500', bg: 'bg-amber-100' },
  { value: 'low', label: 'Low', icon: AlertCircle, color: 'text-slate-500', bg: 'bg-nog-100' },
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

// Email validation helper
const isValidEmail = (email: string): boolean => {
  if (!email || !email.trim()) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

const TIME_RANGES = [
  { label: 'Last 1 minute', value: '-1m' },
  { label: 'Last 5 minutes', value: '-5m' },
  { label: 'Last 15 minutes', value: '-15m' },
  { label: 'Last 1 hour', value: '-1h' },
  { label: 'Last 4 hours', value: '-4h' },
  { label: 'Last 24 hours', value: '-24h' },
];

export default function AlertsPage() {
  const { formatDate } = useDateFormat();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSilenceModal, setShowSilenceModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [silencingAlertId, setSilencingAlertId] = useState<string | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [appScope, setAppScope] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'severity' | 'trigger_count' | 'created_at'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Refs for action inputs (for variable insertion)
  const emailSubjectRefs = useRef<(HTMLInputElement | null)[]>([]);
  const emailBodyRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const webhookPayloadRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const appriseTitleRefs = useRef<(HTMLInputElement | null)[]>([]);
  const appriseMessageRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const scriptCommandRefs = useRef<(HTMLInputElement | null)[]>([]);
  const loginNotifTitleRefs = useRef<(HTMLInputElement | null)[]>([]);
  const loginNotifMessageRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

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
    sampleResults?: Record<string, unknown>[];
  } | null>(null);
  const [showSampleResults, setShowSampleResults] = useState(false);
  const [testing, setTesting] = useState(false);

  const queryClient = useQueryClient();

  // Handle URL params for "Create from Search" flow
  useEffect(() => {
    const action = searchParams.get('action');
    const queryParam = searchParams.get('query');
    const timeRangeParam = searchParams.get('timeRange');

    if (action === 'create' && queryParam) {
      // Pre-populate form with search query
      setFormData((prev) => ({
        ...prev,
        search_query: queryParam,
        time_range: timeRangeParam || prev.time_range,
        name: '', // User should name their alert
      }));

      // Open the create modal
      setShowCreateModal(true);

      // Clear URL params to prevent re-triggering
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['alerts', appScope],
    queryFn: () => getAlerts(appScope === 'all' ? undefined : appScope),
  });

  // Sort alerts
  const sortedAlerts = useMemo(() => {
    if (!alerts) return [];
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return [...alerts].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'severity':
          cmp = (severityOrder[a.severity as keyof typeof severityOrder] ?? 5) -
                (severityOrder[b.severity as keyof typeof severityOrder] ?? 5);
          break;
        case 'trigger_count':
          cmp = (a.trigger_count ?? 0) - (b.trigger_count ?? 0);
          break;
        case 'created_at':
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [alerts, sortBy, sortDir]);

  const { data: alertHistory } = useQuery<LocalAlertHistory[]>({
    queryKey: ['alertHistory', selectedAlertId],
    queryFn: () => getAlertHistory(selectedAlertId || undefined) as Promise<LocalAlertHistory[]>,
    enabled: showHistoryModal,
  });

  // Load notification channels for Apprise action
  const { data: notificationChannels = [] } = useQuery<NotificationChannel[]>({
    queryKey: ['notificationChannels'],
    queryFn: getNotificationChannels,
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
      toast.success('Alert Created', `"${formData.name}" has been created`);
    },
    onError: (error) => {
      toast.error('Create Failed', error instanceof Error ? error.message : 'Failed to create alert');
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
      toast.success('Alert Updated', `"${formData.name}" has been updated`);
    },
    onError: (error) => {
      toast.error('Update Failed', error instanceof Error ? error.message : 'Failed to update alert');
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
      toast.success('Alert Evaluated', data.message);
    },
    onError: (error) => {
      toast.error('Evaluation Failed', error instanceof Error ? error.message : 'Unknown error');
    },
  });

  // Bulk operations
  const bulkToggleMutation = useMutation({
    mutationFn: async ({ alertIds, enable }: { alertIds: string[]; enable: boolean }) => {
      const enableValue = enable ? 1 : 0;
      const alertsToToggle = alerts?.filter(a => alertIds.includes(a.id) && a.enabled !== enableValue) || [];
      await Promise.all(alertsToToggle.map(a => toggleAlert(a.id)));
      return alertsToToggle.length;
    },
    onSuccess: (count, { enable }) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setSelectedAlerts(new Set());
      toast.success('Bulk Update', `${count} alert(s) ${enable ? 'enabled' : 'disabled'}`);
    },
    onError: (error) => {
      toast.error('Bulk Update Failed', error instanceof Error ? error.message : 'Unknown error');
    },
  });

  const handleSelectAlert = (alertId: string, selected: boolean) => {
    setSelectedAlerts(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(alertId);
      } else {
        next.delete(alertId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedAlerts.size === sortedAlerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(sortedAlerts.map(a => a.id)));
    }
  };

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
              type === 'apprise' ? { channel: '', title: '', message: '' } :
              type === 'script' ? { command: '' } :
              type === 'show_on_login' ? { title: '', message: '', expires_in: '24h' } :
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

  const insertVariableIntoField = (variable: string, inputRef: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!inputRef) return;

    const start = inputRef.selectionStart || 0;
    const end = inputRef.selectionEnd || 0;
    const currentValue = inputRef.value;
    const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);

    // Update the value
    inputRef.value = newValue;

    // Trigger change event to update formData
    const event = new Event('input', { bubbles: true });
    inputRef.dispatchEvent(event);

    // Set cursor position after inserted variable
    setTimeout(() => {
      inputRef.focus();
      inputRef.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
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

  // Validate all actions have required config
  const areActionsValid = () => {
    return formData.actions.every((action) => {
      if (action.type === 'email') {
        return isValidEmail(action.config.to || '');
      }
      if (action.type === 'webhook') {
        const url = action.config.url || '';
        return url.trim() && (url.startsWith('http://') || url.startsWith('https://'));
      }
      if (action.type === 'apprise') {
        // Must have either a channel or custom URLs
        return !!(action.config.channel || action.config.apprise_urls?.trim());
      }
      if (action.type === 'script') {
        // Must have a command
        return !!(action.config.command?.trim());
      }
      if (action.type === 'show_on_login') {
        // Title is required (message is optional, will use alert name as fallback)
        return !!(action.config.title?.trim());
      }
      return true; // log type doesn't need config
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bell className="w-6 sm:w-7 h-6 sm:h-7 text-amber-500" />
            Alerts
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">
            Configure alert rules to notify you when conditions are met
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <AppScopeFilter value={appScope} onChange={setAppScope} />
          </div>
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <select
              value={`${sortBy}-${sortDir}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split('-') as [typeof sortBy, typeof sortDir];
                setSortBy(field);
                setSortDir(dir);
              }}
              className="px-2 py-1.5 text-sm bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-lg text-slate-700 dark:text-slate-300"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="severity-asc">Severity (High first)</option>
              <option value="severity-desc">Severity (Low first)</option>
              <option value="trigger_count-desc">Most triggered</option>
              <option value="trigger_count-asc">Least triggered</option>
              <option value="created_at-desc">Newest</option>
              <option value="created_at-asc">Oldest</option>
            </select>
          </div>
          <button
            onClick={() => {
              setSelectedAlertId(null);
              setShowHistoryModal(true);
            }}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg flex items-center justify-center gap-2"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Alert History</span>
            <span className="sm:hidden">History</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setEditingAlert(null);
              setShowCreateModal(true);
            }}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Alert</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedAlerts.size > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedAlerts.size === sortedAlerts.length}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {selectedAlerts.size} alert{selectedAlerts.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => bulkToggleMutation.mutate({ alertIds: Array.from(selectedAlerts), enable: true })}
              disabled={bulkToggleMutation.isPending}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Enable
            </button>
            <button
              onClick={() => bulkToggleMutation.mutate({ alertIds: Array.from(selectedAlerts), enable: false })}
              disabled={bulkToggleMutation.isPending}
              className="px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <Pause className="w-4 h-4" />
              Disable
            </button>
            <button
              onClick={() => setSelectedAlerts(new Set())}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Alerts List */}
      {sortedAlerts && sortedAlerts.length > 0 ? (
        <div className="space-y-4">
          {sortedAlerts.map((alert) => {
            const severity = getSeverityConfig(alert.severity);
            const SeverityIcon = severity.icon;
            const isExpanded = expandedAlerts.has(alert.id);

            return (
              <div
                key={alert.id}
                className={`bg-white dark:bg-nog-800 rounded-xl shadow-sm border ${
                  alert.enabled ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200/50 dark:border-slate-700/50 opacity-60'
                }`}
              >
                {/* Alert Header */}
                <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  {/* Top row on mobile: checkbox, expand button, severity, title */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedAlerts.has(alert.id)}
                      onChange={(e) => handleSelectAlert(alert.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-amber-500 flex-shrink-0"
                    />
                    <button
                      onClick={() => toggleExpand(alert.id)}
                      className="text-slate-400 hover:text-slate-600 flex-shrink-0"
                    >
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>

                    <div className={`p-2 rounded-lg ${severity.bg} flex-shrink-0`}>
                      <SeverityIcon className={`w-5 h-5 ${severity.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate text-sm sm:text-base">
                        {alert.name}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                        {alert.search_query}
                      </p>
                    </div>
                  </div>

                  {/* Schedule and trigger info */}
                  <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-500 ml-8 sm:ml-0 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 sm:w-4 h-3 sm:h-4" />
                      <span className="hidden sm:inline">{alert.cron_expression || '*/5 * * * *'}</span>
                      <span className="sm:hidden">{(alert.cron_expression || '').split(' ')[0] === '*' ? '1m' : (alert.cron_expression || '').split(' ')[0].replace('*/', '') + 'm'}</span>
                    </div>
                    {alert.trigger_count > 0 && (
                      <div className="px-2 py-0.5 sm:py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                        {alert.trigger_count}x
                      </div>
                    )}
                  </div>

                  {/* Action buttons - scrollable on mobile */}
                  <div className="flex items-center gap-1 sm:gap-2 ml-8 sm:ml-0 overflow-x-auto scrollbar-hide">
                    <button
                      onClick={() => evaluateMutation.mutate(alert.id)}
                      disabled={evaluateMutation.isPending}
                      className="p-1.5 sm:p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg flex-shrink-0"
                      title="Run Now"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <SnoozeDropdown
                      alertId={alert.id}
                      alertName={alert.name}
                      onFullSilence={() => {
                        setSilencingAlertId(alert.id);
                        setShowSilenceModal(true);
                      }}
                    />
                    <button
                      onClick={() => toggleMutation.mutate(alert.id)}
                      className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${
                        alert.enabled
                          ? 'text-green-500 hover:bg-green-50'
                          : 'text-slate-400 hover:bg-nog-100'
                      }`}
                      title={alert.enabled ? 'Disable' : 'Enable'}
                    >
                      {alert.enabled ? <CheckCircle2 className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(alert)}
                      className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 hover:bg-nog-100 rounded-lg flex-shrink-0"
                      title="Edit"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: 'Delete Alert',
                          message: `Are you sure you want to delete "${alert.name}"? This action cannot be undone.`,
                          confirmText: 'Delete',
                          cancelText: 'Cancel',
                          variant: 'danger',
                        });
                        if (confirmed) {
                          deleteMutation.mutate(alert.id, {
                            onSuccess: () => toast.success('Alert Deleted', `"${alert.name}" has been deleted`),
                            onError: (err) => toast.error('Delete Failed', err instanceof Error ? err.message : 'Unknown error'),
                          });
                        }
                      }}
                      className="p-1.5 sm:p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-slate-100 dark:border-slate-700 pt-3 sm:pt-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
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
                          {alert.last_run ? formatDate(alert.last_run) : 'Never'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Last Triggered</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {alert.last_triggered ? formatDate(alert.last_triggered) : 'Never'}
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
                              className="px-3 py-1 bg-nog-100 dark:bg-nog-700 rounded-full text-sm flex items-center gap-2"
                            >
                              {action.type === 'email' && <Mail className="w-3 h-3" />}
                              {action.type === 'webhook' && <Globe className="w-3 h-3" />}
                              {action.type === 'log' && <FileText className="w-3 h-3" />}
                              {action.type === 'apprise' && <Send className="w-3 h-3" />}
                              {action.type === 'script' && <Terminal className="w-3 h-3" />}
                              {action.type === 'show_on_login' && <LogIn className="w-3 h-3" />}
                              {action.type === 'show_on_login' ? 'On Login' : action.type}
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
        <div className="text-center py-12 bg-white dark:bg-nog-800 rounded-xl">
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
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Alert
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-nog-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                className="p-2 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg"
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Trigger Condition */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">Trigger Condition</h3>
                  <InfoTip
                    content="Define when this alert should fire based on search results. The alert will trigger when the condition is met."
                    placement="right"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Type
                      <InfoTip
                        content={
                          <div className="space-y-1">
                            <p><strong>Number of Results:</strong> Trigger based on total log count</p>
                            <p><strong>Number of Hosts:</strong> Trigger based on unique hosts count</p>
                            <p><strong>Custom:</strong> Trigger if any results match</p>
                          </div>
                        }
                        placement="top"
                      />
                    </label>
                    <select
                      value={formData.trigger_type}
                      onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
                    >
                      {TRIGGER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Condition
                      <InfoTip
                        content="Compare the result count/value against the threshold. Use 'drops by' or 'rises by' to detect sudden changes."
                        placement="top"
                      />
                    </label>
                    <select
                      value={formData.trigger_condition}
                      onChange={(e) => setFormData({ ...formData, trigger_condition: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
                    >
                      {TRIGGER_CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Threshold
                      <InfoTip
                        content="The numeric value to compare against. For example, set to 10 to trigger when results exceed 10."
                        placement="top"
                      />
                    </label>
                    <input
                      type="number"
                      value={formData.trigger_threshold}
                      onChange={(e) => setFormData({ ...formData, trigger_threshold: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">Schedule</h3>
                  <InfoTip
                    content="Configure how often this alert runs and what time range to search."
                    placement="right"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Run Schedule
                      <InfoTip
                        content="How frequently the alert runs. For example, 'Every 5 minutes' will check for alert conditions every 5 minutes."
                        placement="top"
                      />
                    </label>
                    <select
                      value={formData.cron_expression}
                      onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
                    >
                      {SCHEDULE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Time Range to Search
                      <InfoTip
                        content="How far back to search when the alert runs. For example, 'Last 5 minutes' will search the most recent 5 minutes of logs."
                        placement="top"
                      />
                    </label>
                    <select
                      value={formData.time_range}
                      onChange={(e) => setFormData({ ...formData, time_range: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
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
                            : 'border-slate-200 dark:border-slate-600 hover:bg-nog-50 dark:hover:bg-slate-700'
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
                  <label htmlFor="throttle" className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                    Enable Throttling
                    <InfoTip
                      content="Prevent alert fatigue by suppressing notifications after the first trigger. The alert won't fire again until the throttle window expires."
                      placement="right"
                    />
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
                      className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addAction('apprise')}
                      className="px-3 py-1 text-sm bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg flex items-center gap-1"
                      title="Send to Slack, Discord, Telegram, PagerDuty, and 100+ more"
                    >
                      <Send className="w-3 h-3" /> Notify
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('email')}
                      className="px-3 py-1 text-sm bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" /> Email
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('webhook')}
                      className="px-3 py-1 text-sm bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" /> Webhook
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('script')}
                      className="px-3 py-1 text-sm bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <Terminal className="w-3 h-3" /> Script
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('log')}
                      className="px-3 py-1 text-sm bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> Log
                    </button>
                    <button
                      type="button"
                      onClick={() => addAction('show_on_login')}
                      className="px-3 py-1 text-sm bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg flex items-center gap-1"
                      title="Show notification in UI on next login"
                    >
                      <LogIn className="w-3 h-3" /> On Login
                    </button>
                  </div>
                </div>

                {formData.actions.length === 0 ? (
                  <p className="text-sm text-slate-500">No actions configured. Alert will only log to history.</p>
                ) : (
                  <div className="space-y-3">
                    {formData.actions.map((action, index) => (
                      <div key={index} className="p-4 bg-nog-50 dark:bg-nog-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 font-medium capitalize">
                            {action.type === 'email' && <Mail className="w-4 h-4" />}
                            {action.type === 'webhook' && <Globe className="w-4 h-4" />}
                            {action.type === 'apprise' && <Send className="w-4 h-4" />}
                            {action.type === 'script' && <Terminal className="w-4 h-4" />}
                            {action.type === 'log' && <FileText className="w-4 h-4" />}
                            {action.type === 'show_on_login' && <LogIn className="w-4 h-4" />}
                            {action.type === 'apprise' ? 'Notification Channel' :
                             action.type === 'show_on_login' ? 'Login Notification' : action.type}
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
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Recipient Email
                              </label>
                              <input
                                type="email"
                                placeholder="recipient@example.com"
                                value={action.config.to || ''}
                                onChange={(e) => updateAction(index, { to: e.target.value })}
                                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm ${
                                  action.config.to && !isValidEmail(action.config.to)
                                    ? 'border-red-400 focus:ring-red-200 focus:border-red-400'
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}
                              />
                              {action.config.to && !isValidEmail(action.config.to) && (
                                <p className="text-xs text-red-500">Please enter a valid email address</p>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Subject (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, emailSubjectRefs.current[index])} />
                              </div>
                              <input
                                ref={(el) => { emailSubjectRefs.current[index] = el; }}
                                type="text"
                                placeholder="e.g., High Error Rate on {{hostname}}"
                                value={action.config.subject || ''}
                                onChange={(e) => updateAction(index, { subject: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Body (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, emailBodyRefs.current[index])} />
                              </div>
                              <textarea
                                ref={(el) => { emailBodyRefs.current[index] = el; }}
                                placeholder="Alert triggered with {{result_count}} results. Host: {{hostname}}"
                                value={action.config.body || ''}
                                onChange={(e) => updateAction(index, { body: e.target.value })}
                                rows={4}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                              />
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Leave empty to use default template
                              </p>
                            </div>
                          </div>
                        )}

                        {action.type === 'webhook' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Webhook URL
                              </label>
                              <input
                                type="url"
                                placeholder="https://api.example.com/webhook"
                                value={action.config.url || ''}
                                onChange={(e) => updateAction(index, { url: e.target.value })}
                                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm ${
                                  action.config.url && !(action.config.url.startsWith('http://') || action.config.url.startsWith('https://'))
                                    ? 'border-red-400 focus:ring-red-200 focus:border-red-400'
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}
                              />
                              {action.config.url && !(action.config.url.startsWith('http://') || action.config.url.startsWith('https://')) && (
                                <p className="text-xs text-red-500">URL must start with http:// or https://</p>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                HTTP Method
                              </label>
                              <select
                                value={action.config.method || 'POST'}
                                onChange={(e) => updateAction(index, { method: e.target.value as 'GET' | 'POST' | 'PUT' })}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                              </select>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Custom Payload (JSON, supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, webhookPayloadRefs.current[index])} />
                              </div>
                              <textarea
                                ref={(el) => { webhookPayloadRefs.current[index] = el; }}
                                placeholder={'{\n  "alert": "{{alert_name}}",\n  "host": "{{hostname}}",\n  "count": {{result_count}}\n}'}
                                value={action.config.payload || ''}
                                onChange={(e) => updateAction(index, { payload: e.target.value })}
                                rows={6}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                              />
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Leave empty to use default payload
                              </p>
                            </div>
                          </div>
                        )}

                        {action.type === 'apprise' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Notification Channel
                              </label>
                              <select
                                value={action.config.channel || ''}
                                onChange={(e) => updateAction(index, { channel: e.target.value, apprise_urls: '' })}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              >
                                <option value="">Select a channel or use custom URL...</option>
                                {notificationChannels?.filter(ch => ch.enabled).map((channel) => (
                                  <option key={channel.id} value={channel.id}>
                                    {channel.name} ({channel.service})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {!action.config.channel && (
                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  Custom Apprise URL
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., slack://tokenA/tokenB/tokenC/#channel"
                                  value={action.config.apprise_urls || ''}
                                  onChange={(e) => updateAction(index, { apprise_urls: e.target.value })}
                                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                                />
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  <a href="https://github.com/caronc/apprise/wiki" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline">
                                    View all supported services →
                                  </a>
                                </p>
                              </div>
                            )}

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Title (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, appriseTitleRefs.current[index])} />
                              </div>
                              <input
                                ref={(el) => { appriseTitleRefs.current[index] = el; }}
                                type="text"
                                placeholder="e.g., 🚨 {{alert_name:upper}}"
                                value={action.config.title || ''}
                                onChange={(e) => updateAction(index, { title: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Message (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, appriseMessageRefs.current[index])} />
                              </div>
                              <textarea
                                ref={(el) => { appriseMessageRefs.current[index] = el; }}
                                placeholder={"{{ai_summary}}\n\nResults: {{result_count:comma}}\nTime: {{timestamp:relative}}"}
                                value={action.config.message || ''}
                                onChange={(e) => updateAction(index, { message: e.target.value })}
                                rows={4}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                              />
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Use <code className="text-amber-600">{'{{ai_summary}}'}</code> for AI-generated summary
                              </p>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Format
                              </label>
                              <select
                                value={action.config.format || 'text'}
                                onChange={(e) => updateAction(index, { format: e.target.value as 'text' | 'markdown' | 'html' })}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              >
                                <option value="text">Plain Text</option>
                                <option value="markdown">Markdown</option>
                                <option value="html">HTML</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {action.type === 'script' && (
                          <div className="space-y-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Command (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, scriptCommandRefs.current[index])} />
                              </div>
                              <input
                                ref={(el) => { scriptCommandRefs.current[index] = el; }}
                                type="text"
                                placeholder='e.g., python /scripts/alert.py --name "{{alert_name}}" --count {{result_count}}'
                                value={action.config.command || ''}
                                onChange={(e) => updateAction(index, { command: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                              />
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Execute a shell command when the alert triggers
                              </p>
                            </div>

                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <p className="text-xs text-amber-800 dark:text-amber-200">
                                <strong>Security Note:</strong> Scripts run with the API server's permissions.
                                Only use trusted commands and sanitize any dynamic content.
                              </p>
                            </div>
                          </div>
                        )}

                        {action.type === 'show_on_login' && (
                          <div className="space-y-3">
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <p className="text-xs text-amber-800 dark:text-amber-200">
                                This notification will appear in the LogNog UI when users log in.
                              </p>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Title (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, loginNotifTitleRefs.current[index])} />
                              </div>
                              <input
                                ref={(el) => { loginNotifTitleRefs.current[index] = el; }}
                                type="text"
                                placeholder="e.g., High Error Rate on {{hostname}}"
                                value={action.config.title || ''}
                                onChange={(e) => updateAction(index, { title: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Message (supports variables)
                                </label>
                                <VariableHelper onInsert={(variable) => insertVariableIntoField(variable, loginNotifMessageRefs.current[index])} />
                              </div>
                              <textarea
                                ref={(el) => { loginNotifMessageRefs.current[index] = el; }}
                                placeholder={"{{result_count}} errors detected in the last {{time_range}}. Check the logs for details."}
                                value={action.config.message || ''}
                                onChange={(e) => updateAction(index, { message: e.target.value })}
                                rows={3}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                              />
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Leave empty to use alert name as message
                              </p>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Expires After
                              </label>
                              <select
                                value={action.config.expires_in || '24h'}
                                onChange={(e) => updateAction(index, { expires_in: e.target.value })}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-700 text-slate-900 dark:text-slate-100 text-sm"
                              >
                                <option value="1h">1 hour</option>
                                <option value="4h">4 hours</option>
                                <option value="12h">12 hours</option>
                                <option value="24h">24 hours</option>
                                <option value="7d">7 days</option>
                                <option value="">Never (manual dismiss only)</option>
                              </select>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                How long the notification remains visible before auto-expiring
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`rounded-lg overflow-hidden ${testResult.wouldTrigger ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                  <div className={`p-4 ${testResult.wouldTrigger ? 'text-orange-800 dark:text-orange-300' : 'text-green-800 dark:text-green-300'}`}>
                    <div className="font-medium flex items-center gap-2">
                      {testResult.wouldTrigger ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      {testResult.wouldTrigger ? 'Alert Would Trigger' : 'Alert Would Not Trigger'}
                    </div>
                    <div className="text-sm mt-1">
                      {testResult.resultCount} results found. {testResult.message}
                    </div>
                  </div>
                  {testResult.sampleResults && testResult.sampleResults.length > 0 && (
                    <div className="border-t border-orange-200 dark:border-orange-800">
                      <button
                        type="button"
                        onClick={() => setShowSampleResults(!showSampleResults)}
                        className={`w-full px-4 py-2 text-sm flex items-center justify-between ${testResult.wouldTrigger ? 'text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30' : 'text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'}`}
                      >
                        <span>View Sample Results ({Math.min(testResult.sampleResults.length, 10)} of {testResult.resultCount})</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showSampleResults ? 'rotate-180' : ''}`} />
                      </button>
                      {showSampleResults && (
                        <div className="px-4 pb-4 max-h-64 overflow-auto">
                          <div className="bg-white dark:bg-nog-800 rounded border border-slate-200 dark:border-nog-700 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 dark:bg-nog-700 text-slate-600 dark:text-nog-300">
                                <tr>
                                  {Object.keys(testResult.sampleResults[0]).slice(0, 5).map((key) => (
                                    <th key={key} className="px-3 py-2 text-left font-medium">{key}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="text-slate-700 dark:text-nog-200">
                                {testResult.sampleResults.slice(0, 5).map((row, i) => (
                                  <tr key={i} className="border-t border-slate-100 dark:border-nog-700">
                                    {Object.keys(testResult.sampleResults![0]).slice(0, 5).map((key) => (
                                      <td key={key} className="px-3 py-2 truncate max-w-[200px]" title={String(row[key] ?? '')}>
                                        {String(row[key] ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !formData.search_query}
                className="px-4 py-2 bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-2 disabled:opacity-50"
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
                  className="px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editingAlert ? updateMutation.mutate() : createMutation.mutate()}
                  disabled={!formData.name.trim() || !formData.search_query.trim() || !areActionsValid() || createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
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
          <div className="bg-white dark:bg-nog-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <History className="w-5 h-5" />
                Alert History
              </h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg"
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
                        className="p-4 bg-nog-50 dark:bg-nog-700/50 rounded-lg"
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
                                {formatDate(entry.triggered_at)}
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

      {/* Quick Silence Modal */}
      {showSilenceModal && silencingAlertId && (
        <QuickSilenceModal
          alertId={silencingAlertId}
          alertName={alerts?.find(a => a.id === silencingAlertId)?.name || ''}
          onClose={() => {
            setShowSilenceModal(false);
            setSilencingAlertId(null);
          }}
        />
      )}
    </div>
  );
}

// Snooze dropdown component
interface SnoozeDropdownProps {
  alertId: string;
  alertName: string;
  onFullSilence: () => void;
}

function SnoozeDropdown({ alertId, alertName, onFullSilence }: SnoozeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const snoozeMutation = useMutation({
    mutationFn: (duration: string) =>
      createSilence({
        level: 'alert',
        target_id: alertId,
        duration,
        reason: `Quick snooze for ${duration}`,
      }),
    onSuccess: (_, duration) => {
      queryClient.invalidateQueries({ queryKey: ['silences'] });
      toast.success('Alert Snoozed', `${alertName} snoozed for ${duration}`);
      setIsOpen(false);
    },
    onError: (error) => {
      toast.error('Snooze Failed', error instanceof Error ? error.message : 'Unknown error');
    },
  });

  const snoozeOptions = [
    { label: '15 min', value: '15m' },
    { label: '30 min', value: '30m' },
    { label: '1 hour', value: '1h' },
    { label: '4 hours', value: '4h' },
    { label: '8 hours', value: '8h' },
    { label: '24 hours', value: '24h' },
  ];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 sm:p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg flex-shrink-0 flex items-center gap-0.5"
        title="Snooze this alert"
      >
        <Timer className="w-4 h-4" />
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-lg shadow-lg py-1 min-w-[140px]">
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-100 dark:border-nog-700">
            Quick Snooze
          </div>
          {snoozeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => snoozeMutation.mutate(opt.value)}
              disabled={snoozeMutation.isPending}
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 flex items-center gap-2 disabled:opacity-50"
            >
              <Timer className="w-3 h-3 text-amber-500" />
              {opt.label}
            </button>
          ))}
          <div className="border-t border-slate-100 dark:border-nog-700 mt-1 pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                onFullSilence();
              }}
              className="w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-nog-50 dark:hover:bg-nog-700 flex items-center gap-2"
            >
              <BellOff className="w-3 h-3" />
              More options...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface QuickSilenceModalProps {
  alertId: string;
  alertName: string;
  onClose: () => void;
}

function QuickSilenceModal({ alertId, alertName, onClose }: QuickSilenceModalProps) {
  const [duration, setDuration] = useState('4h');
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const silenceMutation = useMutation({
    mutationFn: () =>
      createSilence({
        level: 'alert',
        target_id: alertId,
        duration,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['silences'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    silenceMutation.mutate();
  };

  const durationOptions = [
    { label: '1 hour', value: '1h' },
    { label: '4 hours', value: '4h' },
    { label: '24 hours', value: '24h' },
    { label: '1 week', value: '1w' },
    { label: 'Indefinite', value: 'indefinite' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-nog-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BellOff className="h-5 w-5 text-amber-500" />
              Silence Alert
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <p className="text-slate-600 dark:text-slate-400">
              Silence <span className="font-medium text-slate-900 dark:text-slate-100">{alertName}</span>
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-nog-700 dark:text-slate-100"
              >
                {durationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-nog-700 dark:text-slate-100"
                rows={3}
                placeholder="Why are you silencing this alert?"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-nog-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={silenceMutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {silenceMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Silencing...
                </span>
              ) : (
                'Silence Alert'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

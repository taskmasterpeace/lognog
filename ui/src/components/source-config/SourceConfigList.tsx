import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Settings,
  Trash2,
  Edit,
  Loader2,
  Play,
  Pause,
  ChevronRight,
  Filter,
  Regex,
  ArrowRightLeft,
  Route,
  TestTube,
  X,
} from 'lucide-react';
import {
  getSourceConfigs,
  createSourceConfig,
  updateSourceConfig,
  deleteSourceConfig,
  testSourceConfig,
  getRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  SourceConfig,
  SourceRoutingRule,
} from '../../api/client';

export default function SourceConfigList() {
  const [activeSection, setActiveSection] = useState<'configs' | 'routing'>('configs');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRoutingModal, setShowRoutingModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SourceConfig | null>(null);
  const [editingRule, setEditingRule] = useState<SourceRoutingRule | null>(null);
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null);
  const [testSampleLog, setTestSampleLog] = useState('');
  const [testResult, setTestResult] = useState<unknown>(null);

  const queryClient = useQueryClient();

  // Fetch source configs
  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['source-configs'],
    queryFn: () => getSourceConfigs(),
  });

  // Fetch routing rules
  const { data: routingRules, isLoading: rulesLoading } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: () => getRoutingRules(),
  });

  // Create/Update config mutation
  const configMutation = useMutation({
    mutationFn: (data: { id?: string; config: Partial<SourceConfig> }) =>
      data.id ? updateSourceConfig(data.id, data.config) : createSourceConfig(data.config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source-configs'] });
      setShowCreateModal(false);
      setEditingConfig(null);
    },
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: deleteSourceConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['source-configs'] }),
  });

  // Toggle enabled mutation
  const toggleConfigMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSourceConfig(id, { enabled: enabled ? 1 : 0 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['source-configs'] }),
  });

  // Routing rule mutations
  const routingMutation = useMutation({
    mutationFn: (data: { id?: string; rule: Partial<SourceRoutingRule> }) =>
      data.id ? updateRoutingRule(data.id, data.rule) : createRoutingRule(data.rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] });
      setShowRoutingModal(false);
      setEditingRule(null);
    },
  });

  const deleteRoutingMutation = useMutation({
    mutationFn: deleteRoutingRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  // Test config
  const handleTestConfig = async () => {
    if (!testingConfigId || !testSampleLog.trim()) return;

    try {
      const result = await testSourceConfig(testingConfigId, testSampleLog);
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: String(error) });
    }
  };

  const isLoading = configsLoading || rulesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveSection('configs')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeSection === 'configs'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Source Configs ({configs?.length || 0})
          </div>
        </button>
        <button
          onClick={() => setActiveSection('routing')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeSection === 'routing'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4" />
            Routing Rules ({routingRules?.length || 0})
          </div>
        </button>
      </div>

      {/* Source Configs Section */}
      {activeSection === 'configs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Define source patterns to match incoming logs and configure parsing, field extraction, and index routing.
            </p>
            <button
              onClick={() => {
                setEditingConfig(null);
                setShowCreateModal(true);
              }}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              New Config
            </button>
          </div>

          {configs && configs.length > 0 ? (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="bg-white dark:bg-nog-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-slate-900 dark:text-slate-100">
                          {config.name}
                        </h4>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            config.enabled
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {config.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      {config.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {config.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                        {config.hostname_pattern && (
                          <span className="flex items-center gap-1">
                            <Regex className="w-3 h-3" />
                            Host: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{config.hostname_pattern}</code>
                          </span>
                        )}
                        {config.app_name_pattern && (
                          <span className="flex items-center gap-1">
                            <Regex className="w-3 h-3" />
                            App: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{config.app_name_pattern}</code>
                          </span>
                        )}
                        {config.target_index && (
                          <span className="flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            Index: <code className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1 rounded">{config.target_index}</code>
                          </span>
                        )}
                        <span>Mode: {config.parsing_mode}</span>
                        <span>Priority: {config.priority}</span>
                        <span>Matches: {config.match_count.toLocaleString()}</span>
                        {config.extraction_count !== undefined && (
                          <span className="flex items-center gap-1">
                            <Filter className="w-3 h-3" />
                            {config.extraction_count} extractions
                          </span>
                        )}
                        {config.transform_count !== undefined && (
                          <span className="flex items-center gap-1">
                            <ArrowRightLeft className="w-3 h-3" />
                            {config.transform_count} transforms
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTestingConfigId(config.id)}
                        className="btn-ghost p-2"
                        title="Test config"
                      >
                        <TestTube className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleConfigMutation.mutate({ id: config.id, enabled: !config.enabled })}
                        className="btn-ghost p-2"
                        title={config.enabled ? 'Disable' : 'Enable'}
                      >
                        {config.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => {
                          setEditingConfig(config);
                          setShowCreateModal(true);
                        }}
                        className="btn-ghost p-2"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this source config?')) {
                            deleteConfigMutation.mutate(config.id);
                          }
                        }}
                        className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-nog-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
              <Settings className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                No source configurations yet. Create one to define how logs are parsed and routed.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Routing Rules Section */}
      {activeSection === 'routing' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Route incoming logs to specific indexes based on conditions like hostname, app name, or message content.
            </p>
            <button
              onClick={() => {
                setEditingRule(null);
                setShowRoutingModal(true);
              }}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          </div>

          {routingRules && routingRules.length > 0 ? (
            <div className="space-y-3">
              {routingRules.map((rule) => {
                let conditions: Array<{ field: string; operator: string; value: string }> = [];
                try {
                  conditions = JSON.parse(rule.conditions);
                } catch {
                  conditions = [];
                }

                return (
                  <div
                    key={rule.id}
                    className="bg-white dark:bg-nog-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-slate-900 dark:text-slate-100">
                            {rule.name}
                          </h4>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              rule.enabled
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {rule.enabled ? 'Active' : 'Disabled'}
                          </span>
                          <span className="text-xs text-slate-400">
                            Match: {rule.match_mode === 'all' ? 'ALL conditions' : 'ANY condition'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            Conditions:
                          </span>
                          {conditions.map((cond, i) => (
                            <span
                              key={i}
                              className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded"
                            >
                              {cond.field} {cond.operator} "{cond.value}"
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            Route to: <code className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1 rounded">{rule.target_index}</code>
                          </span>
                          <span>Priority: {rule.priority}</span>
                          <span>Matches: {rule.match_count.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingRule(rule);
                            setShowRoutingModal(true);
                          }}
                          className="btn-ghost p-2"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this routing rule?')) {
                              deleteRoutingMutation.mutate(rule.id);
                            }
                          }}
                          className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-nog-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
              <Route className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                No routing rules yet. Create one to route logs to specific indexes.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Config Modal */}
      {showCreateModal && (
        <ConfigModal
          config={editingConfig}
          onSave={(config) => configMutation.mutate({ id: editingConfig?.id, config })}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingConfig(null);
          }}
          saving={configMutation.isPending}
        />
      )}

      {/* Create/Edit Routing Rule Modal */}
      {showRoutingModal && (
        <RoutingRuleModal
          rule={editingRule}
          onSave={(rule) => routingMutation.mutate({ id: editingRule?.id, rule })}
          onCancel={() => {
            setShowRoutingModal(false);
            setEditingRule(null);
          }}
          saving={routingMutation.isPending}
        />
      )}

      {/* Test Config Modal */}
      {testingConfigId && (
        <div className="modal-overlay" onClick={() => setTestingConfigId(null)}>
          <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TestTube className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Test Configuration
                  </h3>
                </div>
                <button onClick={() => setTestingConfigId(null)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Sample Log
                </label>
                <textarea
                  value={testSampleLog}
                  onChange={(e) => setTestSampleLog(e.target.value)}
                  placeholder="Paste a sample log line to test against this configuration..."
                  rows={4}
                  className="input font-mono text-sm"
                />
              </div>
              <button
                onClick={handleTestConfig}
                disabled={!testSampleLog.trim()}
                className="btn-primary w-full"
              >
                Run Test
              </button>
              {testResult !== null && (
                <div className="p-4 bg-nog-50 dark:bg-nog-800 rounded-lg">
                  <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Results</h4>
                  <pre className="text-xs overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(testResult as object, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Config Modal Component
function ConfigModal({
  config,
  onSave,
  onCancel,
  saving,
}: {
  config: SourceConfig | null;
  onSave: (config: Partial<SourceConfig>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(config?.name || '');
  const [description, setDescription] = useState(config?.description || '');
  const [hostnamePattern, setHostnamePattern] = useState(config?.hostname_pattern || '');
  const [appNamePattern, setAppNamePattern] = useState(config?.app_name_pattern || '');
  const [targetIndex, setTargetIndex] = useState(config?.target_index || '');
  const [parsingMode, setParsingMode] = useState(config?.parsing_mode || 'auto');
  const [priority, setPriority] = useState(config?.priority || 100);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name,
      description: description || undefined,
      hostname_pattern: hostnamePattern || undefined,
      app_name_pattern: appNamePattern || undefined,
      target_index: targetIndex || undefined,
      parsing_mode: parsingMode,
      priority,
      enabled: config?.enabled ?? 1,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {config ? 'Edit Source Config' : 'New Source Config'}
              </h3>
            </div>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="modal-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Web Servers"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this configuration matches..."
              rows={2}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Hostname Pattern (regex)
              </label>
              <input
                type="text"
                value={hostnamePattern}
                onChange={(e) => setHostnamePattern(e.target.value)}
                placeholder="e.g., ^web-.*"
                className="input font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                App Name Pattern (regex)
              </label>
              <input
                type="text"
                value={appNamePattern}
                onChange={(e) => setAppNamePattern(e.target.value)}
                placeholder="e.g., nginx|apache"
                className="input font-mono text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Target Index
              </label>
              <input
                type="text"
                value={targetIndex}
                onChange={(e) => setTargetIndex(e.target.value)}
                placeholder="e.g., web-logs"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Parsing Mode
              </label>
              <select
                value={parsingMode}
                onChange={(e) => setParsingMode(e.target.value)}
                className="input"
              >
                <option value="auto">Auto-detect</option>
                <option value="json">JSON</option>
                <option value="syslog">Syslog</option>
                <option value="kv">Key=Value</option>
                <option value="csv">CSV</option>
                <option value="raw">Raw</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Priority (lower = higher priority)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
              min={1}
              max={1000}
              className="input w-32"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="btn-primary"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : config ? (
              'Save Changes'
            ) : (
              'Create Config'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Routing Rule Modal Component
function RoutingRuleModal({
  rule,
  onSave,
  onCancel,
  saving,
}: {
  rule: SourceRoutingRule | null;
  onSave: (rule: Partial<SourceRoutingRule>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [targetIndex, setTargetIndex] = useState(rule?.target_index || '');
  const [matchMode, setMatchMode] = useState(rule?.match_mode || 'all');
  const [priority, setPriority] = useState(rule?.priority || 100);
  const [conditions, setConditions] = useState<Array<{ field: string; operator: string; value: string }>>(() => {
    if (rule?.conditions) {
      try {
        return JSON.parse(rule.conditions);
      } catch {
        return [];
      }
    }
    return [{ field: 'hostname', operator: 'contains', value: '' }];
  });

  const addCondition = () => {
    setConditions([...conditions, { field: 'hostname', operator: 'contains', value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<typeof conditions[0]>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const handleSubmit = () => {
    if (!name.trim() || !targetIndex.trim() || conditions.length === 0) return;
    const validConditions = conditions.filter((c) => c.value.trim());
    if (validConditions.length === 0) return;

    onSave({
      name,
      target_index: targetIndex,
      match_mode: matchMode,
      priority,
      conditions: JSON.stringify(validConditions),
      enabled: rule?.enabled ?? 1,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {rule ? 'Edit Routing Rule' : 'New Routing Rule'}
              </h3>
            </div>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="modal-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Rule Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Route web traffic"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Target Index *
              </label>
              <input
                type="text"
                value={targetIndex}
                onChange={(e) => setTargetIndex(e.target.value)}
                placeholder="e.g., web-logs"
                className="input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Match Mode
              </label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value)}
                className="input"
              >
                <option value="all">Match ALL conditions</option>
                <option value="any">Match ANY condition</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Priority
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
                min={1}
                max={1000}
                className="input"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Conditions
              </label>
              <button onClick={addCondition} className="btn-ghost text-xs">
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={cond.field}
                    onChange={(e) => updateCondition(i, { field: e.target.value })}
                    className="input flex-1"
                  >
                    <option value="hostname">Hostname</option>
                    <option value="app_name">App Name</option>
                    <option value="source_type">Source Type</option>
                    <option value="message">Message</option>
                  </select>
                  <select
                    value={cond.operator}
                    onChange={(e) => updateCondition(i, { operator: e.target.value })}
                    className="input flex-1"
                  >
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="starts_with">starts with</option>
                    <option value="ends_with">ends with</option>
                    <option value="regex">regex</option>
                  </select>
                  <input
                    type="text"
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder="Value"
                    className="input flex-1"
                  />
                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(i)}
                      className="btn-ghost p-1.5 text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !targetIndex.trim() || saving}
            className="btn-primary"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : rule ? (
              'Save Changes'
            ) : (
              'Create Rule'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Database,
  CheckCircle2,
  BarChart3,
  PieChart,
  LineChart,
  Table2,
  Hash,
  Grid3X3,
  Zap,
  AlertCircle,
} from 'lucide-react';
import {
  getIndexDetails,
  getIndexFields,
  createDashboardFromWizard,
  type WizardPanelSpec,
} from '../api/client';

interface DashboardBuilderWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (dashboardId: string) => void;
}

const VIZ_OPTIONS: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
  line: {
    icon: <LineChart className="w-5 h-5" />,
    label: 'Line Chart',
    description: 'Time series data',
  },
  bar: {
    icon: <BarChart3 className="w-5 h-5" />,
    label: 'Bar Chart',
    description: 'Top N values',
  },
  pie: {
    icon: <PieChart className="w-5 h-5" />,
    label: 'Pie Chart',
    description: 'Distribution',
  },
  table: {
    icon: <Table2 className="w-5 h-5" />,
    label: 'Table',
    description: 'Detailed data',
  },
  heatmap: {
    icon: <Grid3X3 className="w-5 h-5" />,
    label: 'Heatmap',
    description: 'Time + category',
  },
  single: {
    icon: <Hash className="w-5 h-5" />,
    label: 'Single Value',
    description: 'Big number',
  },
};

function MiniSparkline({ data, className = '' }: { data: number[]; className?: string }) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data, 1);
  const width = 80;
  const height = 24;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (val / max) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default function DashboardBuilderWizard({
  isOpen,
  onClose,
  onSuccess,
}: DashboardBuilderWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldVizTypes, setFieldVizTypes] = useState<Record<string, string>>({});
  const [dashboardName, setDashboardName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch indexes for step 1
  const { data: indexData, isLoading: indexesLoading } = useQuery({
    queryKey: ['wizard-indexes'],
    queryFn: getIndexDetails,
    enabled: isOpen,
  });

  // Fetch fields for step 2
  const { data: fieldData, isLoading: fieldsLoading } = useQuery({
    queryKey: ['wizard-fields', selectedIndex],
    queryFn: () => selectedIndex ? getIndexFields(selectedIndex) : Promise.resolve({ fields: [] }),
    enabled: isOpen && !!selectedIndex && step >= 2,
  });

  // Reset state when wizard opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSelectedIndex(null);
      setSelectedFields(new Set());
      setFieldVizTypes({});
      setDashboardName('');
      setError(null);
    }
  }, [isOpen]);

  // Auto-select recommended fields and viz types when fields load
  useEffect(() => {
    if (fieldData?.fields && selectedFields.size === 0) {
      const autoSelected = new Set<string>();
      const autoViz: Record<string, string> = {};

      // Always include timestamp (time series)
      const timestampField = fieldData.fields.find(f => f.name === 'timestamp');
      if (timestampField) {
        autoSelected.add('timestamp');
        autoViz['timestamp'] = 'line';
      }

      // Include severity if present
      const severityField = fieldData.fields.find(f => f.name === 'severity');
      if (severityField) {
        autoSelected.add('severity');
        autoViz['severity'] = 'pie';
      }

      // Include hostname if present
      const hostnameField = fieldData.fields.find(f => f.name === 'hostname');
      if (hostnameField) {
        autoSelected.add('hostname');
        autoViz['hostname'] = 'bar';
      }

      setSelectedFields(autoSelected);
      setFieldVizTypes(autoViz);
    }
  }, [fieldData?.fields]);

  // Auto-generate dashboard name
  useEffect(() => {
    if (selectedIndex && !dashboardName) {
      setDashboardName(`${selectedIndex} Overview`);
    }
  }, [selectedIndex]);

  const handleFieldToggle = (fieldName: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
        // Remove viz type selection
        setFieldVizTypes(vt => {
          const { [fieldName]: _, ...rest } = vt;
          return rest;
        });
      } else {
        next.add(fieldName);
        // Auto-select first recommended viz
        const field = fieldData?.fields.find(f => f.name === fieldName);
        if (field?.recommended_viz?.[0]) {
          setFieldVizTypes(vt => ({
            ...vt,
            [fieldName]: field.recommended_viz[0],
          }));
        }
      }
      return next;
    });
  };

  const handleVizTypeChange = (fieldName: string, vizType: string) => {
    setFieldVizTypes(prev => ({
      ...prev,
      [fieldName]: vizType,
    }));
  };

  const handleQuickSetup = () => {
    // Select all fields with default viz types
    if (fieldData?.fields) {
      const autoSelected = new Set<string>();
      const autoViz: Record<string, string> = {};

      fieldData.fields.forEach(field => {
        if (field.recommended_viz?.[0]) {
          autoSelected.add(field.name);
          autoViz[field.name] = field.recommended_viz[0];
        }
      });

      setSelectedFields(autoSelected);
      setFieldVizTypes(autoViz);
    }
  };

  const handleCreate = async () => {
    if (!selectedIndex || !dashboardName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const panels: WizardPanelSpec[] = Array.from(selectedFields).map(field => ({
        field,
        vizType: fieldVizTypes[field] || 'table',
      }));

      const result = await createDashboardFromWizard(
        dashboardName.trim(),
        selectedIndex,
        panels,
        panels.length === 0 // useDefaults if no panels selected
      );

      onSuccess(result.dashboard_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dashboard');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedIndex;
      case 2: return selectedFields.size > 0;
      case 3: return Array.from(selectedFields).every(f => fieldVizTypes[f]);
      case 4: return dashboardName.trim().length > 0;
      default: return false;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal animate-slide-up max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Dashboard Builder Wizard
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Step {step} of 4: {
                  step === 1 ? 'Select Index' :
                  step === 2 ? 'Choose Fields' :
                  step === 3 ? 'Pick Visualizations' :
                  'Preview & Create'
                }
              </p>
            </div>
            <button onClick={onClose} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex gap-2 mt-4">
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="modal-body flex-1 overflow-y-auto">
          {/* Step 1: Select Index */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-slate-600 dark:text-slate-400">
                Select an index to build your dashboard from:
              </p>

              {indexesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                </div>
              ) : indexData?.indexes && indexData.indexes.length > 0 ? (
                <div className="grid gap-3">
                  {indexData.indexes.map(index => (
                    <button
                      key={index.name}
                      onClick={() => setSelectedIndex(index.name)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        selectedIndex === index.name
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            selectedIndex === index.name
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}>
                            <Database className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {index.name}
                            </div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              {formatNumber(index.count)} events · {formatBytes(index.size_bytes)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <MiniSparkline
                            data={index.sparkline}
                            className="text-amber-500"
                          />
                          {selectedIndex === index.name && (
                            <CheckCircle2 className="w-5 h-5 text-amber-500" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-slate-400">No indexes found</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                    Start sending logs to create an index
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Choose Fields */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-600 dark:text-slate-400">
                  Select fields to visualize on your dashboard:
                </p>
                <button
                  onClick={handleQuickSetup}
                  className="btn-ghost text-amber-600 dark:text-amber-400 text-sm"
                >
                  <Zap className="w-4 h-4" />
                  Quick Setup
                </button>
              </div>

              {fieldsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                </div>
              ) : fieldData?.fields && fieldData.fields.length > 0 ? (
                <div className="space-y-2">
                  {fieldData.fields.map(field => (
                    <label
                      key={field.name}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedFields.has(field.name)
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.has(field.name)}
                        onChange={() => handleFieldToggle(field.name)}
                        className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {field.name}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded">
                            {field.type}
                          </span>
                          {field.recommended_viz?.length > 0 && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                        {field.sample_values?.length > 0 && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                            e.g. {field.sample_values.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                      {field.cardinality > 0 && (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {field.cardinality} unique
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-slate-400">No fields discovered</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Pick Visualizations */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-slate-600 dark:text-slate-400">
                Choose how to visualize each field:
              </p>

              <div className="space-y-4">
                {Array.from(selectedFields).map(fieldName => {
                  const field = fieldData?.fields.find(f => f.name === fieldName);
                  const recommendedViz = field?.recommended_viz || ['bar', 'table'];

                  return (
                    <div key={fieldName} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {fieldName}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded">
                          {field?.type}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {recommendedViz.map(vizType => {
                          const viz = VIZ_OPTIONS[vizType];
                          if (!viz) return null;

                          return (
                            <button
                              key={vizType}
                              onClick={() => handleVizTypeChange(fieldName, vizType)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                                fieldVizTypes[fieldName] === vizType
                                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {viz.icon}
                              <span className="text-sm font-medium">{viz.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Preview & Create */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Dashboard Name
                </label>
                <input
                  type="text"
                  value={dashboardName}
                  onChange={e => setDashboardName(e.target.value)}
                  placeholder="My Dashboard"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Panels to be created ({selectedFields.size})
                </h4>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                  <div className="grid gap-2">
                    {Array.from(selectedFields).map(fieldName => {
                      const vizType = fieldVizTypes[fieldName];
                      const viz = VIZ_OPTIONS[vizType];

                      return (
                        <div
                          key={fieldName}
                          className="flex items-center gap-3 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700"
                        >
                          {viz?.icon && (
                            <div className="text-amber-500">
                              {viz.icon}
                            </div>
                          )}
                          <div className="flex-1">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {fieldName}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 ml-2 text-sm">
                              {viz?.label || vizType}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex gap-3">
                  <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Ready to create!</strong> Your dashboard will be generated with{' '}
                    {selectedFields.size} panels for the <code className="px-1 py-0.5 bg-amber-200/50 dark:bg-amber-800/50 rounded">{selectedIndex}</code> index.
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : onClose()}
              className="btn-secondary"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="btn-primary"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={!canProceed() || isCreating}
                className="btn-primary"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Create Dashboard
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

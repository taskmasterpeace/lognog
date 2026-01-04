import { useState } from 'react';
import { X, Variable, Play, Loader2 } from 'lucide-react';

interface VariableFormData {
  name: string;
  label: string;
  type: 'query' | 'custom' | 'textbox' | 'interval';
  query: string;
  custom_values: string;
  default_value: string;
  multi_select: boolean;
  include_all: boolean;
}

interface VariableEditorModalProps {
  variable?: {
    id: string;
    name: string;
    label?: string;
    type: 'query' | 'custom' | 'textbox' | 'interval';
    query?: string;
    default_value?: string;
    multi_select: boolean;
    include_all: boolean;
  };
  onSave: (data: VariableFormData) => void;
  onCancel: () => void;
  onTest?: (query: string) => Promise<string[]>;
  saving?: boolean;
}

export function VariableEditorModal({
  variable,
  onSave,
  onCancel,
  onTest,
  saving = false,
}: VariableEditorModalProps) {
  const [name, setName] = useState(variable?.name || '');
  const [label, setLabel] = useState(variable?.label || '');
  const [type, setType] = useState<'query' | 'custom' | 'textbox' | 'interval'>(
    variable?.type || 'query'
  );
  const [query, setQuery] = useState(variable?.query || 'search * | stats count by hostname | table hostname');
  const [customValues, setCustomValues] = useState('');
  const [defaultValue, setDefaultValue] = useState(variable?.default_value || '');
  const [multiSelect, setMultiSelect] = useState(variable?.multi_select || false);
  const [includeAll, setIncludeAll] = useState(variable?.include_all || false);

  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    setTestError(null);
    try {
      const results = await onTest(query);
      setTestResults(results);
    } catch (err) {
      setTestError(String(err));
      setTestResults([]);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim().replace(/\s+/g, '_'),
      label: label.trim() || name.trim(),
      type,
      query: type === 'query' ? query : '',
      custom_values: type === 'custom' ? customValues : '',
      default_value: defaultValue,
      multi_select: multiSelect,
      include_all: includeAll,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Variable className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {variable ? 'Edit Variable' : 'Add Variable'}
              </h3>
            </div>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="hostname"
                className="input font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">Use in queries as ${`{${name || 'name'}}`}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Select Host"
                className="input"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'query', label: 'Query' },
                { value: 'custom', label: 'Custom' },
                { value: 'textbox', label: 'Text' },
                { value: 'interval', label: 'Interval' },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value as typeof type)}
                  className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    type === t.value
                      ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Query (for query type) */}
          {type === 'query' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Query
              </label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search * | stats count by hostname | table hostname"
                rows={3}
                className="input font-mono text-sm resize-none"
              />
              <p className="text-xs text-slate-500 mt-1">
                Query should return a single column with the values for the dropdown
              </p>

              {/* Test Query Button */}
              {onTest && (
                <div className="mt-2">
                  <button
                    onClick={handleTest}
                    disabled={testing || !query}
                    className="btn-secondary text-sm"
                  >
                    {testing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Test Query
                  </button>

                  {testError && (
                    <p className="text-sm text-red-600 mt-2">{testError}</p>
                  )}

                  {testResults.length > 0 && (
                    <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Preview ({testResults.length} values):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {testResults.slice(0, 20).map((v, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600"
                          >
                            {v}
                          </span>
                        ))}
                        {testResults.length > 20 && (
                          <span className="px-2 py-0.5 text-xs text-slate-500">
                            +{testResults.length - 20} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Custom Values (for custom type) */}
          {type === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Values (one per line)
              </label>
              <textarea
                value={customValues}
                onChange={(e) => setCustomValues(e.target.value)}
                placeholder="value1&#10;value2&#10;value3"
                rows={4}
                className="input font-mono text-sm resize-none"
              />
            </div>
          )}

          {/* Interval Options (for interval type) */}
          {type === 'interval' && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Interval variables provide time span options: 1m, 5m, 15m, 1h, 4h, 1d
              </p>
            </div>
          )}

          {/* Default Value */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Default Value
            </label>
            <input
              type="text"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              placeholder="Optional default"
              className="input"
            />
          </div>

          {/* Options */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={multiSelect}
                onChange={(e) => setMultiSelect(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Allow multi-select</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAll}
                onChange={(e) => setIncludeAll(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Include "All" option</span>
            </label>
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
            {saving ? 'Saving...' : variable ? 'Save Changes' : 'Add Variable'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VariableEditorModal;

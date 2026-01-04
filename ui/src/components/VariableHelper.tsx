import { useState } from 'react';
import { HelpCircle, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface VariableHelperProps {
  onInsert?: (variable: string) => void;
}

interface VariableCategory {
  name: string;
  description: string;
  variables: {
    name: string;
    description: string;
    example: string;
  }[];
}

const VARIABLE_CATEGORIES: VariableCategory[] = [
  {
    name: 'Alert Metadata',
    description: 'Information about the alert itself',
    variables: [
      { name: 'alert_name', description: 'Name of the alert', example: 'High Error Rate' },
      { name: 'alert_severity', description: 'Severity level (CRITICAL, HIGH, etc.)', example: 'CRITICAL' },
      { name: 'result_count', description: 'Number of results that triggered the alert', example: '150' },
      { name: 'timestamp', description: 'When the alert was triggered', example: '2025-12-16T10:30:00Z' },
    ],
  },
  {
    name: 'Result Fields',
    description: 'Fields from the first result',
    variables: [
      { name: 'hostname', description: 'Hostname from logs', example: 'web-01' },
      { name: 'app_name', description: 'Application name', example: 'nginx' },
      { name: 'severity', description: 'Log severity level', example: '3' },
      { name: 'message', description: 'Log message', example: 'Connection timeout' },
      { name: 'source_ip', description: 'Source IP address', example: '192.168.1.100' },
      { name: 'user', description: 'User from logs', example: 'admin' },
    ],
  },
  {
    name: 'Aggregated Fields',
    description: 'Fields from stats commands',
    variables: [
      { name: 'count', description: 'Count from stats', example: '42' },
      { name: 'sum', description: 'Sum from stats', example: '1024' },
      { name: 'avg', description: 'Average from stats', example: '25.5' },
      { name: 'max', description: 'Maximum value', example: '100' },
      { name: 'min', description: 'Minimum value', example: '1' },
    ],
  },
  {
    name: 'Advanced Access',
    description: 'Access specific results or nested fields',
    variables: [
      { name: 'result.hostname', description: 'Direct field access from first result', example: 'web-01' },
      { name: 'result[0].hostname', description: 'Access first result explicitly', example: 'web-01' },
      { name: 'result[1].hostname', description: 'Access second result', example: 'web-02' },
      { name: 'result.nested.field', description: 'Access nested fields using dot notation', example: 'value' },
    ],
  },
];

export default function VariableHelper({ onInsert }: VariableHelperProps) {
  const [showHelper, setShowHelper] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Alert Metadata']));
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleCopyVariable = (variable: string) => {
    const formatted = `{{${variable}}}`;
    navigator.clipboard.writeText(formatted);
    setCopiedVariable(variable);
    setTimeout(() => setCopiedVariable(null), 2000);

    if (onInsert) {
      onInsert(formatted);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowHelper(!showHelper)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
      >
        <HelpCircle className="w-4 h-4" />
        Variable Helper
      </button>

      {showHelper && (
        <div className="absolute top-full mt-2 left-0 z-50 w-[500px] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-[500px] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Available Variables</h3>
              <button
                onClick={() => setShowHelper(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Click any variable to copy it to your clipboard. Use <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">{'{{variable}}'}</code> syntax.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {VARIABLE_CATEGORIES.map((category) => {
              const isExpanded = expandedCategories.has(category.name);

              return (
                <div key={category.name} className="mb-4 last:mb-0">
                  <button
                    onClick={() => toggleCategory(category.name)}
                    className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{category.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{category.description}</div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="ml-6 mt-2 space-y-2">
                      {category.variables.map((variable) => {
                        const isCopied = copiedVariable === variable.name;

                        return (
                          <button
                            key={variable.name}
                            onClick={() => handleCopyVariable(variable.name)}
                            className="w-full p-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg text-left border border-transparent hover:border-amber-200 dark:hover:border-amber-800 transition-colors group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <code className="text-sm font-mono text-amber-600 dark:text-amber-400">
                                    {'{{' + variable.name + '}}'}
                                  </code>
                                  {isCopied ? (
                                    <Check className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-300 mb-1">
                                  {variable.description}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  Example: <span className="font-mono">{variable.example}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <strong>Tips:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Variables are replaced with actual values when the alert triggers</li>
                <li>If a field doesn't exist, the raw variable name is shown</li>
                <li>Use dot notation for nested fields: <code className="px-1 bg-white dark:bg-slate-800 rounded">{'{{result.field.subfield}}'}</code></li>
                <li>Access specific results: <code className="px-1 bg-white dark:bg-slate-800 rounded">{'{{result[0].field}}'}</code></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

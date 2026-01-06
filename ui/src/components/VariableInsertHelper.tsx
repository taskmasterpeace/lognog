import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Sparkles, Zap, Code2, Clock, Hash, FileText, GitBranch } from 'lucide-react';

interface VariableInsertHelperProps {
  onInsert: (variable: string) => void;
  compact?: boolean;
}

interface VariableCategory {
  name: string;
  icon: React.ReactNode;
  description: string;
  variables: Array<{
    name: string;
    description: string;
    example?: string;
  }>;
}

const VARIABLE_CATEGORIES: VariableCategory[] = [
  {
    name: 'Alert Info',
    icon: <Zap className="w-4 h-4" />,
    description: 'Basic alert metadata',
    variables: [
      { name: '{{alert_name}}', description: 'Alert name', example: 'High CPU Usage' },
      { name: '{{alert_severity}}', description: 'Alert severity', example: 'CRITICAL' },
      { name: '{{alert_severity:badge}}', description: 'Severity with emoji', example: '🔴 CRITICAL' },
      { name: '{{result_count}}', description: 'Number of results', example: '1234' },
      { name: '{{result_count:comma}}', description: 'Results with commas', example: '1,234' },
      { name: '{{search_query}}', description: 'The search query', example: 'host=* cpu>90' },
    ],
  },
  {
    name: 'Time',
    icon: <Clock className="w-4 h-4" />,
    description: 'Timestamps and dates',
    variables: [
      { name: '{{timestamp}}', description: 'ISO timestamp', example: '2025-12-31T15:45:00Z' },
      { name: '{{timestamp:relative}}', description: 'Relative time', example: '5 minutes ago' },
      { name: '{{timestamp:date}}', description: 'Formatted date', example: 'Dec 31, 2025' },
      { name: '{{timestamp:time}}', description: 'Formatted time', example: '3:45:00 PM' },
    ],
  },
  {
    name: 'Result Fields',
    icon: <FileText className="w-4 h-4" />,
    description: 'Fields from search results',
    variables: [
      { name: '{{result.hostname}}', description: 'First result hostname', example: 'web-01' },
      { name: '{{result.message}}', description: 'First result message', example: 'Error occurred...' },
      { name: '{{result.message:truncate:80}}', description: 'Truncated message', example: 'Error occu...' },
      { name: '{{result[0].field}}', description: 'Specific result field', example: 'value' },
    ],
  },
  {
    name: 'Aggregates',
    icon: <Hash className="w-4 h-4" />,
    description: 'Calculations across all results',
    variables: [
      { name: '{{results:count}}', description: 'Total count', example: '42' },
      { name: '{{results:sum:bytes}}', description: 'Sum of field', example: '1048576' },
      { name: '{{results:avg:latency}}', description: 'Average of field', example: '123.45' },
      { name: '{{results:max:cpu}}', description: 'Maximum value', example: '98.5' },
      { name: '{{results:min:memory}}', description: 'Minimum value', example: '256' },
      { name: '{{results:pluck:hostname:join:", "}}', description: 'List of values', example: 'host1, host2, host3' },
      { name: '{{results:unique:hostname:count}}', description: 'Unique count', example: '5' },
    ],
  },
  {
    name: 'AI Summary',
    icon: <Sparkles className="w-4 h-4" />,
    description: 'AI-generated content',
    variables: [
      { name: '{{ai_summary}}', description: 'AI-generated summary of the alert', example: 'High CPU detected on 3 servers...' },
    ],
  },
  {
    name: 'Conditionals',
    icon: <GitBranch className="w-4 h-4" />,
    description: 'Conditional content blocks',
    variables: [
      { name: '{{#if severity == "critical"}}...{{/if}}', description: 'Conditional block' },
      { name: '{{#if result_count > 100}}...{{/if}}', description: 'Numeric condition' },
      { name: '{{#else}}', description: 'Else block' },
      { name: '{{#else if severity == "high"}}', description: 'Else-if block' },
      { name: '{{#each results limit=5}}...{{/each}}', description: 'Loop over results' },
      { name: '{{@index}}', description: 'Loop index (0-based)' },
      { name: '{{@number}}', description: 'Loop number (1-based)' },
    ],
  },
];

const FILTERS = [
  { name: 'upper', description: 'UPPERCASE', example: '{{name:upper}}' },
  { name: 'lower', description: 'lowercase', example: '{{name:lower}}' },
  { name: 'capitalize', description: 'Capitalize first', example: '{{name:capitalize}}' },
  { name: 'truncate:N', description: 'Limit to N chars', example: '{{msg:truncate:100}}' },
  { name: 'comma', description: 'Add thousands separator', example: '{{count:comma}}' },
  { name: 'round:N', description: 'Round to N decimals', example: '{{val:round:2}}' },
  { name: 'percent', description: 'Format as %', example: '{{ratio:percent}}' },
  { name: 'bytes', description: 'Human bytes', example: '{{size:bytes}}' },
  { name: 'relative', description: 'Relative time', example: '{{ts:relative}}' },
  { name: 'date', description: 'Format date', example: '{{ts:date}}' },
  { name: 'badge', description: 'Severity emoji', example: '{{severity:badge}}' },
  { name: 'json', description: 'Pretty JSON', example: '{{data:json}}' },
  { name: 'default:val', description: 'Fallback value', example: '{{name:default:N/A}}' },
];

export default function VariableInsertHelper({ onInsert, compact = false }: VariableInsertHelperProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleInsertClick = (variable: string) => {
    onInsert(variable);
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {VARIABLE_CATEGORIES.slice(0, 3).flatMap(cat =>
          cat.variables.slice(0, 2).map(v => (
            <button
              key={v.name}
              onClick={() => handleInsertClick(v.name)}
              className="px-2 py-1 text-xs bg-nog-100 dark:bg-nog-700 text-slate-600 dark:text-slate-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 font-mono transition-colors"
              title={v.description}
            >
              {v.name.replace(/\{\{|\}\}/g, '')}
            </button>
          ))
        )}
        <button
          onClick={() => setExpandedCategory(expandedCategory ? null : 'all')}
          className="px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
        >
          More...
        </button>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="bg-nog-50 dark:bg-nog-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Code2 className="w-4 h-4" />
          Template Variables
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Click to insert into message template
        </p>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {/* Categories */}
        {VARIABLE_CATEGORIES.map((category) => (
          <div key={category.name} className="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category.name ? null : category.name)}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-nog-50 dark:hover:bg-nog-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{category.icon}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{category.name}</span>
              </div>
              {expandedCategory === category.name ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {expandedCategory === category.name && (
              <div className="px-3 pb-3 space-y-1">
                {category.variables.map((variable) => (
                  <div
                    key={variable.name}
                    className="flex items-start justify-between gap-2 p-2 rounded bg-nog-50 dark:bg-nog-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 group cursor-pointer"
                    onClick={() => handleInsertClick(variable.name)}
                  >
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-mono text-amber-600 dark:text-amber-400 break-all">
                        {variable.name}
                      </code>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {variable.description}
                        {variable.example && (
                          <span className="text-slate-400 dark:text-slate-500"> ({variable.example})</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(variable.name);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copied === variable.name ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Filters */}
        <div className="border-b border-slate-100 dark:border-slate-700">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-nog-50 dark:hover:bg-nog-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-400"><Hash className="w-4 h-4" /></span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters</span>
              <span className="text-xs text-slate-400">(append with :filter)</span>
            </div>
            {showFilters ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showFilters && (
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-1">
                {FILTERS.map((filter) => (
                  <div
                    key={filter.name}
                    className="p-1.5 rounded bg-nog-50 dark:bg-nog-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-pointer"
                    onClick={() => handleCopy(`:${filter.name.replace(':N', ':')}`)}
                    title={filter.example}
                  >
                    <code className="text-xs font-mono text-amber-600 dark:text-amber-400">
                      :{filter.name}
                    </code>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {filter.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pro tips */}
      <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <strong>Pro tip:</strong> Chain filters like <code className="text-amber-800 dark:text-amber-200">{'{{result_count:comma}}'}</code> or use math like <code className="text-amber-800 dark:text-amber-200">{'{{result.bytes / 1024 / 1024}}'}</code>
        </p>
      </div>
    </div>
  );
}

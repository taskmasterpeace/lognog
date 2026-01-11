import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Maximize2,
  X,
  Code,
  List,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AnnotatedValue, useSourceAnnotationsOptional } from './SourceAnnotations';
import { useDateFormat } from '../contexts/DateFormatContext';
import { getFullMessage, getLogContext, LogContextResponse, diagnoseError, ErrorDiagnosisResponse } from '../api/client';

// Types
export interface LogEntry {
  id?: string;
  timestamp: string;
  hostname?: string;
  app_name?: string;
  severity?: number;
  message?: string;
  message_truncated?: boolean;
  [key: string]: any;
}

interface LogViewerProps {
  logs: LogEntry[];
  onAddFilter?: (field: string, value: string, exclude?: boolean) => void;
  searchTerms?: string[];
  isLoading?: boolean;
}

// Severity configuration
const SEVERITY_CONFIG = {
  0: { name: 'Emergency', color: 'text-red-700 bg-red-100 ring-red-600/30', bgColor: 'bg-red-50/50' },
  1: { name: 'Alert', color: 'text-red-700 bg-red-100 ring-red-600/30', bgColor: 'bg-red-50/50' },
  2: { name: 'Critical', color: 'text-orange-700 bg-orange-100 ring-orange-600/30', bgColor: 'bg-orange-50/50' },
  3: { name: 'Error', color: 'text-red-700 bg-red-100 ring-red-600/30', bgColor: 'bg-red-50/50' },
  4: { name: 'Warning', color: 'text-amber-700 bg-amber-100 ring-amber-600/30', bgColor: 'bg-amber-50/50' },
  5: { name: 'Notice', color: 'text-amber-700 bg-amber-100 ring-amber-600/30', bgColor: 'bg-amber-50/50' },
  6: { name: 'Info', color: 'text-amber-700 bg-amber-100 ring-amber-600/30', bgColor: 'bg-amber-50/50' },
  7: { name: 'Debug', color: 'text-slate-700 dark:text-slate-300 bg-nog-100 dark:bg-nog-800 ring-slate-600/30', bgColor: 'bg-nog-50/50 dark:bg-nog-800/50' },
};

// Helper function to get relative time
const getRelativeTime = (timestamp: string): string => {
  try {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return '';
  }
};

// Helper function to highlight search terms
const highlightText = (text: string, searchTerms?: string[]): JSX.Element => {
  if (!searchTerms || searchTerms.length === 0) {
    return <>{text}</>;
  }

  let result: (string | JSX.Element)[] = [text];

  searchTerms.forEach((term) => {
    if (!term) return;
    const newResult: (string | JSX.Element)[] = [];

    result.forEach((part) => {
      if (typeof part === 'string') {
        const regex = new RegExp(`(${term})`, 'gi');
        const parts = part.split(regex);
        parts.forEach((p, i) => {
          if (p.toLowerCase() === term.toLowerCase()) {
            newResult.push(
              <mark key={`${term}-${i}`} className="bg-yellow-200 dark:bg-yellow-500/30 text-slate-900 dark:text-yellow-200 px-0.5 rounded">
                {p}
              </mark>
            );
          } else if (p) {
            newResult.push(p);
          }
        });
      } else {
        newResult.push(part);
      }
    });

    result = newResult;
  });

  return <>{result}</>;
};

// Field value component with quick actions
interface FieldValueProps {
  field: string;
  value: any;
  onAddFilter?: (field: string, value: string, exclude?: boolean) => void;
  searchTerms?: string[];
}

// Fields that support annotations (tooltip/card context)
const ANNOTATABLE_FIELDS = ['hostname', 'app_name', 'source', 'host', 'service', 'application'];

const FieldValue: React.FC<FieldValueProps> = ({ field, value, onAddFilter, searchTerms }) => {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hideTimeout, setHideTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const annotationContext = useSourceAnnotationsOptional();
  const { formatDate } = useDateFormat();

  const handleMouseEnter = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      setHideTimeout(null);
    }
    setShowActions(true);
  };

  const handleMouseLeave = () => {
    // Delay hiding to allow mouse to move to popup
    const timeout = setTimeout(() => {
      setShowActions(false);
    }, 150);
    setHideTimeout(timeout);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const valueStr = String(value);
  const isAnnotatable = ANNOTATABLE_FIELDS.includes(field);
  const hasAnnotation = isAnnotatable && annotationContext?.getAnnotation(field, valueStr);

  // Render the value content
  const renderValue = () => {
    if (field === 'severity' && typeof value === 'number') {
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${SEVERITY_CONFIG[value as keyof typeof SEVERITY_CONFIG]?.color || 'text-slate-700 dark:text-slate-300 bg-nog-100 dark:bg-nog-800 ring-slate-600/30'}`}>
          {SEVERITY_CONFIG[value as keyof typeof SEVERITY_CONFIG]?.name || value}
        </span>
      );
    }
    if (field === 'timestamp') {
      return (
        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <span>{formatDate(valueStr)}</span>
          <span className="text-xs text-slate-400">({getRelativeTime(valueStr)})</span>
        </span>
      );
    }
    return highlightText(valueStr, searchTerms);
  };

  // Wrap with AnnotatedValue if this field type supports annotations
  const valueElement = isAnnotatable ? (
    <AnnotatedValue field={field} value={valueStr}>
      {renderValue()}
    </AnnotatedValue>
  ) : (
    renderValue()
  );

  return (
    <div
      className="group relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={`font-mono text-sm ${hasAnnotation ? 'cursor-help' : ''}`}>
        {valueElement}
      </span>

      {/* Quick Actions Popup - positioned with no gap and handles its own hover */}
      {showActions && onAddFilter && field !== 'timestamp' && (
        <div
          className="absolute left-0 top-full pt-1 z-10"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-lg shadow-lg p-1 flex gap-1 whitespace-nowrap animate-fade-in">
            <button
              onClick={() => onAddFilter(field, valueStr, false)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
              title="Add to filter"
            >
              <Plus className="w-3 h-3" />
              Include
            </button>
            <button
              onClick={() => onAddFilter(field, valueStr, true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
              title="Exclude from filter"
            >
              <Minus className="w-3 h-3" />
              Exclude
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-nog-300 hover:bg-nog-50 dark:hover:bg-nog-700 rounded transition-colors"
              title="Copy value"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Log row component
interface LogRowProps {
  log: LogEntry;
  index: number;
  style: React.CSSProperties;
  isExpanded: boolean;
  onToggleExpand: (index: number) => void;
  onAddFilter?: (field: string, value: string, exclude?: boolean) => void;
  onLoadFullMessage?: (logId: string) => void;
  onViewContext?: (logId: string) => void;
  searchTerms?: string[];
}

const LogRow: React.FC<LogRowProps> = ({
  log,
  index,
  style,
  isExpanded,
  onToggleExpand,
  onAddFilter,
  onLoadFullMessage,
  onViewContext,
  searchTerms,
}) => {
  const { formatDate } = useDateFormat();
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<{
    loading: boolean;
    data: ErrorDiagnosisResponse | null;
    error: string | null;
  }>({ loading: false, data: null, error: null });
  const severity = typeof log.severity === 'number' ? log.severity : 6;
  const severityConfig = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG[6];

  // AI Error Diagnosis handler
  const handleAiDiagnosis = useCallback(async () => {
    setAiDiagnosis({ loading: true, data: null, error: null });
    try {
      const result = await diagnoseError({
        timestamp: log.timestamp,
        severity: log.severity,
        message: log.message,
        hostname: log.hostname,
        app_name: log.app_name,
      });
      setAiDiagnosis({ loading: false, data: result, error: null });
    } catch (err) {
      setAiDiagnosis({ loading: false, data: null, error: err instanceof Error ? err.message : 'Failed to analyze error' });
    }
  }, [log]);

  // Copy JSON to clipboard
  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [log]);

  // Parse structured_data if it's a JSON string
  const parsedStructuredData = useMemo(() => {
    if (log.structured_data) {
      if (typeof log.structured_data === 'string') {
        try {
          return JSON.parse(log.structured_data);
        } catch {
          return null;
        }
      } else if (typeof log.structured_data === 'object') {
        return log.structured_data;
      }
    }
    return null;
  }, [log.structured_data]);

  // Primary fields to show in collapsed view
  const primaryFields = ['timestamp', 'severity', 'hostname', 'app_name', 'message'];
  const excludeFromAdditional = [...primaryFields, 'structured_data', 'raw', 'facility'];
  const allFields = Object.keys(log);
  const additionalFields = allFields.filter(f => !excludeFromAdditional.includes(f));

  // Get structured data fields for display
  const structuredFields = parsedStructuredData ? Object.keys(parsedStructuredData) : [];

  return (
    <div
      style={style}
      className={`border-b border-slate-200 dark:border-nog-700 transition-colors ${
        isExpanded ? severityConfig.bgColor : 'hover:bg-nog-50 dark:hover:bg-nog-800'
      }`}
    >
      <div className="flex items-start gap-2 px-4 py-2">
        {/* Expand/Collapse Button */}
        <button
          onClick={() => onToggleExpand(index)}
          className="mt-1 p-1 hover:bg-slate-200 dark:hover:bg-nog-700 rounded transition-colors flex-shrink-0"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-600 dark:text-nog-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-nog-400" />
          )}
        </button>

        {/* Log Content */}
        <div className="flex-1 min-w-0">
          {/* Collapsed View - Single Line */}
          {!isExpanded && (
            <div className="flex items-start gap-3 text-sm">
              <span className="text-slate-500 dark:text-nog-400 font-mono text-xs whitespace-nowrap flex-shrink-0 w-40">
                {log.timestamp ? formatDate(log.timestamp) : '—'}
              </span>

              {log.severity !== undefined && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 flex-shrink-0 ${severityConfig.color}`}>
                  {severityConfig.name}
                </span>
              )}

              {log.hostname && (
                <span className="text-green-600 dark:text-green-400 font-mono text-xs flex-shrink-0">
                  {log.hostname}
                </span>
              )}

              {log.app_name && (
                <span className="text-amber-600 dark:text-amber-400 font-mono text-xs flex-shrink-0">
                  {log.app_name}
                </span>
              )}

              <span className="text-slate-700 dark:text-nog-200 font-mono text-xs truncate">
                {log.message ? highlightText(log.message, searchTerms) : '—'}
              </span>
              {log.message_truncated && (
                <span className="ml-2 text-amber-500 dark:text-amber-400 text-xs flex-shrink-0">[truncated]</span>
              )}
            </div>
          )}

          {/* Expanded View - All Fields */}
          {isExpanded && (
            <div className="space-y-2">
              {/* View Toggle */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-nog-700">
                <div className="flex items-center gap-1 bg-nog-100 dark:bg-nog-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setShowJson(false)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      !showJson
                        ? 'bg-white dark:bg-nog-600 text-slate-900 dark:text-nog-100 shadow-sm'
                        : 'text-slate-600 dark:text-nog-400 hover:text-slate-900 dark:hover:text-nog-100'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    Fields
                  </button>
                  <button
                    onClick={() => setShowJson(true)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      showJson
                        ? 'bg-white dark:bg-nog-600 text-slate-900 dark:text-nog-100 shadow-sm'
                        : 'text-slate-600 dark:text-nog-400 hover:text-slate-900 dark:hover:text-nog-100'
                    }`}
                  >
                    <Code className="w-3 h-3" />
                    JSON
                  </button>
                </div>
                <button
                  onClick={copyJson}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 dark:text-nog-400 hover:text-slate-700 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded transition-colors"
                  title="Copy as JSON"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-green-500" />
                      <span className="text-green-500">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>

              {/* JSON View */}
              {showJson ? (
                <pre className="text-xs font-mono text-slate-700 dark:text-nog-300 bg-slate-50 dark:bg-nog-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                  {JSON.stringify(log, null, 2)}
                </pre>
              ) : (
                <>
              {/* Primary Fields */}
              <div className="grid grid-cols-1 gap-2">
                {primaryFields.map((field) => {
                  if (log[field] === undefined) return null;
                  return (
                    <div key={field} className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-24 flex-shrink-0 mt-0.5">
                        {field}:
                      </span>
                      <div className="flex-1 min-w-0">
                        <FieldValue
                          field={field}
                          value={log[field]}
                          onAddFilter={onAddFilter}
                          searchTerms={searchTerms}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons row */}
              <div className="mt-2 flex items-center gap-4">
                {/* Show Full Message button for truncated logs */}
                {log.message_truncated && log.id && onLoadFullMessage && (
                  <button
                    onClick={() => onLoadFullMessage(log.id!)}
                    className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 flex items-center gap-1 font-medium"
                  >
                    <Maximize2 className="w-3 h-3" />
                    Show full message
                  </button>
                )}
                {/* View Context button */}
                {log.id && onViewContext && (
                  <button
                    onClick={() => onViewContext(log.id!)}
                    className="text-xs text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 flex items-center gap-1 font-medium"
                  >
                    <Layers className="w-3 h-3" />
                    View context
                  </button>
                )}
                {/* AI Error Diagnosis button for error logs (severity <= 3) */}
                {severity <= 3 && !aiDiagnosis.data && (
                  <button
                    onClick={handleAiDiagnosis}
                    disabled={aiDiagnosis.loading}
                    className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 font-medium disabled:opacity-50"
                  >
                    {aiDiagnosis.loading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Analyze with AI
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* AI Diagnosis Results */}
              {aiDiagnosis.error && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{aiDiagnosis.error}</span>
                  </div>
                </div>
              )}

              {aiDiagnosis.data && (
                <div className="mt-3 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                      <Sparkles className="w-4 h-4" />
                      <span className="font-semibold text-sm">AI Error Analysis</span>
                      {aiDiagnosis.data.model && (
                        <span className="text-xs text-purple-500 dark:text-purple-500">
                          ({aiDiagnosis.data.model})
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setAiDiagnosis({ loading: false, data: null, error: null })}
                      className="p-1 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded"
                      title="Dismiss"
                    >
                      <X className="w-3 h-3 text-purple-500" />
                    </button>
                  </div>

                  {/* Summary */}
                  <div>
                    <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase mb-1">Summary</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{aiDiagnosis.data.diagnosis.summary}</p>
                  </div>

                  {/* Root Cause */}
                  <div>
                    <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase mb-1">Root Cause</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{aiDiagnosis.data.diagnosis.root_cause}</p>
                  </div>

                  {/* Severity Assessment */}
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase">Severity:</h4>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{aiDiagnosis.data.diagnosis.severity_assessment}</span>
                    <span className="text-xs text-purple-500">
                      ({Math.round(aiDiagnosis.data.diagnosis.confidence * 100)}% confidence)
                    </span>
                  </div>

                  {/* Suggested Fixes */}
                  {aiDiagnosis.data.diagnosis.suggested_fixes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase mb-1">Suggested Fixes</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {aiDiagnosis.data.diagnosis.suggested_fixes.map((fix, i) => (
                          <li key={i} className="text-sm text-slate-700 dark:text-slate-300">{fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Related Patterns */}
                  {aiDiagnosis.data.diagnosis.related_patterns.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase mb-1">Related Patterns</h4>
                      <div className="flex flex-wrap gap-1">
                        {aiDiagnosis.data.diagnosis.related_patterns.map((pattern, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded text-xs">
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Questions */}
                  {aiDiagnosis.data.diagnosis.follow_up_questions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase mb-1">Questions to Investigate</h4>
                      <ul className="list-decimal list-inside space-y-1">
                        {aiDiagnosis.data.diagnosis.follow_up_questions.map((q, i) => (
                          <li key={i} className="text-sm text-slate-600 dark:text-slate-400">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Structured Data Fields (parsed from JSON) */}
              {structuredFields.length > 0 && (
                <>
                  <div className="border-t border-slate-200 dark:border-nog-700 pt-2 mt-2">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">
                      Custom Fields
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {structuredFields.map((field) => (
                      <div key={field} className="flex items-start gap-2 bg-amber-50/50 dark:bg-amber-900/20 rounded px-2 py-1">
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 min-w-[100px] flex-shrink-0 mt-0.5">
                          {field}:
                        </span>
                        <div className="flex-1 min-w-0">
                          <FieldValue
                            field={field}
                            value={parsedStructuredData[field]}
                            onAddFilter={onAddFilter}
                            searchTerms={searchTerms}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Additional Fields */}
              {additionalFields.length > 0 && (
                <>
                  <div className="border-t border-slate-200 dark:border-nog-700 pt-2 mt-2">
                    <span className="text-xs font-semibold text-slate-400 dark:text-nog-500 uppercase">
                      Additional Fields
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {additionalFields.map((field) => (
                      <div key={field} className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-nog-400 w-24 flex-shrink-0 mt-0.5">
                          {field}:
                        </span>
                        <div className="flex-1 min-w-0">
                          <FieldValue
                            field={field}
                            value={log[field]}
                            onAddFilter={onAddFilter}
                            searchTerms={searchTerms}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Main LogViewer component
export default function LogViewer({
  logs,
  onAddFilter,
  searchTerms,
  isLoading = false,
}: LogViewerProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(50);
  const annotationContext = useSourceAnnotationsOptional();

  // State for full message modal
  const [fullMessageModal, setFullMessageModal] = useState<{
    isOpen: boolean;
    logId: string | null;
    content: string | null;
    loading: boolean;
  }>({ isOpen: false, logId: null, content: null, loading: false });

  // State for context modal
  const [contextModal, setContextModal] = useState<{
    isOpen: boolean;
    logId: string | null;
    data: LogContextResponse | null;
    loading: boolean;
    contextSize: number;
  }>({ isOpen: false, logId: null, data: null, loading: false, contextSize: 5 });

  // Load full message handler
  const loadFullMessage = useCallback(async (logId: string) => {
    setFullMessageModal({ isOpen: true, logId, content: null, loading: true });
    try {
      const data = await getFullMessage(logId);
      setFullMessageModal(prev => ({ ...prev, content: data.fullMessage, loading: false }));
    } catch (err) {
      console.error('Failed to load full message:', err);
      setFullMessageModal(prev => ({ ...prev, content: 'Failed to load full message', loading: false }));
    }
  }, []);

  // View context handler
  const viewContext = useCallback(async (logId: string, size?: number) => {
    const contextSize = size ?? contextModal.contextSize;
    setContextModal(prev => ({ ...prev, isOpen: true, logId, data: null, loading: true, contextSize }));
    try {
      const data = await getLogContext(logId, { before: contextSize, after: contextSize });
      setContextModal(prev => ({ ...prev, data, loading: false }));
    } catch (err) {
      console.error('Failed to load log context:', err);
      setContextModal(prev => ({ ...prev, loading: false }));
    }
  }, [contextModal.contextSize]);

  // Copy to clipboard helper
  const copyToClipboard = async (text: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Load annotations for visible logs
  useEffect(() => {
    if (!annotationContext || logs.length === 0) return;

    // Collect unique field:value pairs from visible logs for annotatable fields
    const items = new Set<string>();
    const logsToCheck = logs.slice(0, Math.min(100, logs.length)); // Check first 100 logs

    logsToCheck.forEach(log => {
      ANNOTATABLE_FIELDS.forEach(field => {
        const value = log[field];
        if (value !== undefined && value !== null) {
          items.add(`${field}:${String(value)}`);
        }
      });
    });

    // Convert to array of {field, value} objects
    const itemsArray = Array.from(items).map(item => {
      const [field, ...valueParts] = item.split(':');
      return { field, value: valueParts.join(':') };
    });

    if (itemsArray.length > 0) {
      annotationContext.loadAnnotations(itemsArray);
    }
  }, [logs, annotationContext]);

  const handleToggleExpand = useCallback((index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Visible logs for simple virtualization
  const visibleLogs = useMemo(() => {
    return logs.slice(visibleStart, visibleEnd);
  }, [logs, visibleStart, visibleEnd]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const itemHeight = 60; // average collapsed height
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 10);
    const end = Math.min(logs.length, start + 60);

    if (start !== visibleStart || end !== visibleEnd) {
      setVisibleStart(start);
      setVisibleEnd(end);
    }
  }, [logs.length, visibleStart, visibleEnd]);

  // Empty state
  if (!isLoading && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-nog-100 dark:bg-nog-800 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Logs Found</h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-md">
          No log entries match your search criteria. Try adjusting your filters or time range.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading logs...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-nog-50 dark:bg-nog-900 border-b border-slate-200 dark:border-nog-700">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-slate-700 dark:text-nog-300">
            {logs.length.toLocaleString()} {logs.length === 1 ? 'log' : 'logs'}
          </span>
          {expandedRows.size > 0 && (
            <span className="text-xs text-slate-500 dark:text-nog-400">
              {expandedRows.size} expanded
            </span>
          )}
        </div>
        {expandedRows.size > 0 && (
          <button
            onClick={() => setExpandedRows(new Set())}
            className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
          >
            Collapse All
          </button>
        )}
      </div>

      {/* Log List with Simple Virtualization */}
      <div className="flex-1 bg-white dark:bg-nog-800 overflow-auto scrollbar-thin" onScroll={handleScroll}>
        {/* Spacer for scrolling virtualization */}
        <div style={{ height: `${visibleStart * 60}px` }} />

        {/* Visible rows */}
        {visibleLogs.map((log, i) => {
          const realIndex = visibleStart + i;
          return (
            <LogRow
              key={realIndex}
              log={log}
              index={realIndex}
              style={{}}
              isExpanded={expandedRows.has(realIndex)}
              onToggleExpand={handleToggleExpand}
              onAddFilter={onAddFilter}
              onLoadFullMessage={loadFullMessage}
              onViewContext={viewContext}
              searchTerms={searchTerms}
            />
          );
        })}

        {/* Bottom spacer */}
        <div style={{ height: `${Math.max(0, (logs.length - visibleEnd) * 60)}px` }} />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-nog-50 dark:bg-nog-900 border-t border-slate-200 dark:border-nog-700 text-xs text-slate-500 dark:text-nog-400">
        <span>Click any row to expand. Hover over field values for quick actions.</span>
      </div>

      {/* Full Message Modal */}
      {fullMessageModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-nog-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-nog-700">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Full Message</h3>
              <button
                onClick={() => setFullMessageModal({ isOpen: false, logId: null, content: null, loading: false })}
                className="p-1 hover:bg-slate-100 dark:hover:bg-nog-700 rounded transition-colors"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-nog-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {fullMessageModal.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                </div>
              ) : (
                <pre className="text-sm font-mono whitespace-pre-wrap break-words text-slate-700 dark:text-nog-200">
                  {fullMessageModal.content}
                </pre>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-nog-700 flex justify-end gap-2">
              <button
                onClick={() => copyToClipboard(fullMessageModal.content)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-nog-300 hover:bg-slate-100 dark:hover:bg-nog-700 rounded transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={() => setFullMessageModal({ isOpen: false, logId: null, content: null, loading: false })}
                className="px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Context Modal */}
      {contextModal.isOpen && (
        <LogContextModal
          data={contextModal.data}
          loading={contextModal.loading}
          contextSize={contextModal.contextSize}
          onClose={() => setContextModal({ isOpen: false, logId: null, data: null, loading: false, contextSize: 5 })}
          onChangeSize={(size) => contextModal.logId && viewContext(contextModal.logId, size)}
        />
      )}
    </div>
  );
}

// Log Context Modal Component
interface LogContextModalProps {
  data: LogContextResponse | null;
  loading: boolean;
  contextSize: number;
  onClose: () => void;
  onChangeSize: (size: number) => void;
}

function LogContextModal({ data, loading, contextSize, onClose, onChangeSize }: LogContextModalProps) {
  const { formatDate } = useDateFormat();
  const contextSizeOptions = [5, 10, 25];

  const renderLogEntry = (log: Record<string, unknown>, isTarget: boolean = false) => {
    const severity = typeof log.severity === 'number' ? log.severity : 6;
    const severityConfig = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG[6];

    return (
      <div
        className={`px-4 py-2 border-b border-slate-100 dark:border-nog-700 ${
          isTarget
            ? 'bg-amber-50 dark:bg-amber-900/30 border-l-4 border-l-amber-500'
            : 'hover:bg-nog-50 dark:hover:bg-nog-800'
        }`}
      >
        <div className="flex items-start gap-3 text-sm">
          <span className="text-slate-500 dark:text-nog-400 font-mono text-xs whitespace-nowrap flex-shrink-0 w-36">
            {log.timestamp ? formatDate(log.timestamp as string) : '—'}
          </span>

          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 flex-shrink-0 ${severityConfig.color}`}>
            {severityConfig.name}
          </span>

          {log.app_name ? (
            <span className="text-amber-600 dark:text-amber-400 font-mono text-xs flex-shrink-0">
              {String(log.app_name)}
            </span>
          ) : null}

          <span className="text-slate-700 dark:text-nog-200 font-mono text-xs truncate flex-1">
            {String(log.message ?? '—')}
          </span>

          {isTarget && (
            <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold flex-shrink-0">
              ← Target
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-nog-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] flex flex-col mx-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-nog-700">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              Log Context
            </h3>
            {data && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {data.hostname} • {data.beforeCount} before, {data.afterCount} after
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Context:</span>
              <select
                value={contextSize}
                onChange={(e) => onChangeSize(parseInt(e.target.value, 10))}
                className="text-sm px-2 py-1 border border-slate-200 dark:border-nog-700 rounded bg-white dark:bg-nog-700 text-slate-700 dark:text-slate-300"
              >
                {contextSizeOptions.map(size => (
                  <option key={size} value={size}>±{size} logs</option>
                ))}
              </select>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 dark:hover:bg-nog-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-slate-500 dark:text-nog-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
          ) : data ? (
            <div className="divide-y divide-slate-100 dark:divide-nog-700">
              {/* Logs before */}
              {data.before.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-slate-50 dark:bg-nog-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    {data.before.length} logs before
                  </div>
                  {data.before.map((log, i) => (
                    <div key={`before-${i}`}>{renderLogEntry(log)}</div>
                  ))}
                </div>
              )}

              {/* Target log */}
              <div>
                <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/50 text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase">
                  Target Log
                </div>
                {renderLogEntry(data.target, true)}
              </div>

              {/* Logs after */}
              {data.after.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-slate-50 dark:bg-nog-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    {data.after.length} logs after
                  </div>
                  {data.after.map((log, i) => (
                    <div key={`after-${i}`}>{renderLogEntry(log)}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-slate-500">
              No context data available
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-nog-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

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
} from 'lucide-react';
import { AnnotatedValue, useSourceAnnotationsOptional } from './SourceAnnotations';
import { useDateFormat } from '../contexts/DateFormatContext';
import { getFullMessage } from '../api/client';

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
  const annotationContext = useSourceAnnotationsOptional();
  const { formatDate } = useDateFormat();

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
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <span className={`font-mono text-sm ${hasAnnotation ? 'cursor-help' : ''}`}>
        {valueElement}
      </span>

      {/* Quick Actions Popup */}
      {showActions && onAddFilter && field !== 'timestamp' && (
        <div className="absolute left-0 top-full mt-1 z-10 bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-lg shadow-lg p-1 flex gap-1 whitespace-nowrap animate-fade-in">
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
  searchTerms,
}) => {
  const { formatDate } = useDateFormat();
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const severity = typeof log.severity === 'number' ? log.severity : 6;
  const severityConfig = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG[6];

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

              {/* Show Full Message button for truncated logs */}
              {log.message_truncated && log.id && onLoadFullMessage && (
                <button
                  onClick={() => onLoadFullMessage(log.id!)}
                  className="mt-2 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 flex items-center gap-1 font-medium"
                >
                  <Maximize2 className="w-3 h-3" />
                  Show full message
                </button>
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
    </div>
  );
}

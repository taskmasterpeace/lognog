import { useState, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// Types
export interface LogEntry {
  timestamp: string;
  hostname?: string;
  app_name?: string;
  severity?: number;
  message?: string;
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
  5: { name: 'Notice', color: 'text-blue-700 bg-blue-100 ring-blue-600/30', bgColor: 'bg-blue-50/50' },
  6: { name: 'Info', color: 'text-sky-700 bg-sky-100 ring-sky-600/30', bgColor: 'bg-sky-50/50' },
  7: { name: 'Debug', color: 'text-slate-700 bg-slate-100 ring-slate-600/30', bgColor: 'bg-slate-50/50' },
};

// Helper function to format timestamp
const formatTimestamp = (timestamp: string): string => {
  try {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return timestamp;
  }
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
              <mark key={`${term}-${i}`} className="bg-yellow-200 text-slate-900 px-0.5 rounded">
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

const FieldValue: React.FC<FieldValueProps> = ({ field, value, onAddFilter, searchTerms }) => {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

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

  return (
    <div
      className="group relative inline-block"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <span className="font-mono text-sm">
        {field === 'severity' && typeof value === 'number' ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${SEVERITY_CONFIG[value as keyof typeof SEVERITY_CONFIG]?.color || 'text-slate-700 bg-slate-100 ring-slate-600/30'}`}>
            {SEVERITY_CONFIG[value as keyof typeof SEVERITY_CONFIG]?.name || value}
          </span>
        ) : field === 'timestamp' ? (
          <span className="text-slate-600 flex items-center gap-2">
            <span>{formatTimestamp(valueStr)}</span>
            <span className="text-xs text-slate-400">({getRelativeTime(valueStr)})</span>
          </span>
        ) : (
          highlightText(valueStr, searchTerms)
        )}
      </span>

      {/* Quick Actions Popup */}
      {showActions && onAddFilter && field !== 'timestamp' && (
        <div className="absolute left-0 top-full mt-1 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1 flex gap-1 whitespace-nowrap animate-fade-in">
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
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded transition-colors"
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
  searchTerms?: string[];
}

const LogRow: React.FC<LogRowProps> = ({
  log,
  index,
  style,
  isExpanded,
  onToggleExpand,
  onAddFilter,
  searchTerms,
}) => {
  const severity = typeof log.severity === 'number' ? log.severity : 6;
  const severityConfig = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG[6];

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
      className={`border-b border-slate-200 dark:border-slate-700 transition-colors ${
        isExpanded ? severityConfig.bgColor : 'hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <div className="flex items-start gap-2 px-4 py-2">
        {/* Expand/Collapse Button */}
        <button
          onClick={() => onToggleExpand(index)}
          className="mt-1 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          )}
        </button>

        {/* Log Content */}
        <div className="flex-1 min-w-0">
          {/* Collapsed View - Single Line */}
          {!isExpanded && (
            <div className="flex items-start gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap flex-shrink-0 w-32">
                {log.timestamp ? formatTimestamp(log.timestamp) : '—'}
              </span>

              {log.severity !== undefined && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 flex-shrink-0 ${severityConfig.color}`}>
                  {severityConfig.name}
                </span>
              )}

              {log.hostname && (
                <span className="text-sky-600 font-mono text-xs flex-shrink-0">
                  {log.hostname}
                </span>
              )}

              {log.app_name && (
                <span className="text-purple-600 font-mono text-xs flex-shrink-0">
                  {log.app_name}
                </span>
              )}

              <span className="text-slate-700 font-mono text-xs truncate">
                {log.message ? highlightText(log.message, searchTerms) : '—'}
              </span>
            </div>
          )}

          {/* Expanded View - All Fields */}
          {isExpanded && (
            <div className="space-y-2">
              {/* Primary Fields */}
              <div className="grid grid-cols-1 gap-2">
                {primaryFields.map((field) => {
                  if (log[field] === undefined) return null;
                  return (
                    <div key={field} className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase w-24 flex-shrink-0 mt-0.5">
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

              {/* Structured Data Fields (parsed from JSON) */}
              {structuredFields.length > 0 && (
                <>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                      Custom Fields
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {structuredFields.map((field) => (
                      <div key={field} className="flex items-start gap-2 bg-emerald-50/50 dark:bg-emerald-900/20 rounded px-2 py-1">
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 min-w-[100px] flex-shrink-0 mt-0.5">
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
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">
                      Additional Fields
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {additionalFields.map((field) => (
                      <div key={field} className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-24 flex-shrink-0 mt-0.5">
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
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Logs Found</h3>
        <p className="text-slate-500 max-w-md">
          No log entries match your search criteria. Try adjusting your filters or time range.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin mb-4" />
        <p className="text-slate-600">Loading logs...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {logs.length.toLocaleString()} {logs.length === 1 ? 'log' : 'logs'}
          </span>
          {expandedRows.size > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {expandedRows.size} expanded
            </span>
          )}
        </div>
        {expandedRows.size > 0 && (
          <button
            onClick={() => setExpandedRows(new Set())}
            className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
          >
            Collapse All
          </button>
        )}
      </div>

      {/* Log List with Simple Virtualization */}
      <div className="flex-1 bg-white dark:bg-slate-800 overflow-auto scrollbar-thin" onScroll={handleScroll}>
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
              searchTerms={searchTerms}
            />
          );
        })}

        {/* Bottom spacer */}
        <div style={{ height: `${Math.max(0, (logs.length - visibleEnd) * 60)}px` }} />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        <span>Click any row to expand. Hover over field values for quick actions.</span>
      </div>
    </div>
  );
}

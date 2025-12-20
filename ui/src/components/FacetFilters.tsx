import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facet {
  field: string;
  values: FacetValue[];
}

interface FacetFiltersProps {
  facets: Facet[];
  selectedFilters: Record<string, string[]>;
  onFilterChange: (field: string, values: string[]) => void;
}

export default function FacetFilters({ facets, selectedFilters, onFilterChange }: FacetFiltersProps) {
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());

  const togglePanel = (field: string) => {
    setCollapsedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const toggleValue = (field: string, value: string) => {
    const current = selectedFilters[field] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];

    onFilterChange(field, next);
  };

  const clearAll = () => {
    Object.keys(selectedFilters).forEach((field) => {
      onFilterChange(field, []);
    });
  };

  const getTotalSelectedCount = () => {
    return Object.values(selectedFilters).reduce((sum, values) => sum + values.length, 0);
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      severity: 'Severity',
      hostname: 'Host',
      app_name: 'App Name',
      source_ip: 'Source IP',
      facility: 'Facility',
    };
    return labels[field] || field;
  };

  const getSeverityLabel = (value: string): string => {
    const severityNames = ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Info', 'Debug'];
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0 && num <= 7 ? severityNames[num] : value;
  };

  const getSeverityColor = (value: string): string => {
    const num = parseInt(value, 10);
    const colors = [
      'text-red-700 bg-red-50 border-red-200',      // Emergency
      'text-orange-700 bg-orange-50 border-orange-200', // Alert
      'text-amber-700 bg-amber-50 border-amber-200',    // Critical
      'text-yellow-700 bg-yellow-50 border-yellow-200', // Error
      'text-lime-700 bg-lime-50 border-lime-200',       // Warning
      'text-green-700 bg-green-50 border-green-200',    // Notice
      'text-emerald-700 bg-emerald-50 border-emerald-200', // Info
      'text-cyan-700 bg-cyan-50 border-cyan-200',       // Debug
    ];
    return !isNaN(num) && num >= 0 && num <= 7 ? colors[num] : 'text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700';
  };

  const totalSelected = getTotalSelectedCount();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Filters
          </h3>
          {totalSelected > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition-all duration-200 hover:scale-105 active:scale-95 animate-fade-in"
            >
              <X className="w-3 h-3" />
              Clear All
            </button>
          )}
        </div>
        {totalSelected > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 animate-fade-in">
            {totalSelected} filter{totalSelected !== 1 ? 's' : ''} active
          </p>
        )}
      </div>

      {/* Facet Panels */}
      <div className="flex-1 overflow-y-auto">
        {facets.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Run a search to see filters
          </div>
        ) : (
          facets.map((facet) => {
            const isCollapsed = collapsedPanels.has(facet.field);
            const selectedValues = selectedFilters[facet.field] || [];
            const selectedCount = selectedValues.length;

            return (
              <div key={facet.field} className="border-b border-slate-200 dark:border-slate-700">
                {/* Panel Header */}
                <button
                  onClick={() => togglePanel(facet.field)}
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-150 group"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-all duration-200" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-all duration-200" />
                    )}
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {getFieldLabel(facet.field)}
                    </span>
                  </div>
                  {selectedCount > 0 && (
                    <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-medium rounded-full animate-scale-in">
                      {selectedCount}
                    </span>
                  )}
                </button>

                {/* Panel Content */}
                {!isCollapsed && (
                  <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-900/30 animate-slide-up">
                    {facet.values.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">No values</p>
                    ) : (
                      <div className="space-y-1">
                        {facet.values.map((item) => {
                          const isSelected = selectedValues.includes(item.value);
                          const displayValue = facet.field === 'severity'
                            ? getSeverityLabel(item.value)
                            : item.value;

                          return (
                            <label
                              key={item.value}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all duration-150 hover:scale-[1.02] ${
                                isSelected
                                  ? 'bg-sky-100 dark:bg-sky-900/20 hover:bg-sky-200 dark:hover:bg-sky-900/30'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleValue(facet.field, item.value)}
                                className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 focus:ring-offset-0 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                {facet.field === 'severity' ? (
                                  <span
                                    className={`text-xs font-medium px-2 py-0.5 rounded border truncate ${getSeverityColor(
                                      item.value
                                    )}`}
                                  >
                                    {displayValue}
                                  </span>
                                ) : (
                                  <span className="text-sm text-slate-700 truncate" title={displayValue}>
                                    {displayValue}
                                  </span>
                                )}
                                <span className="text-xs text-slate-500 font-medium tabular-nums flex-shrink-0">
                                  {item.count.toLocaleString()}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      {facets.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500">
            Showing top {facets.reduce((max, f) => Math.max(max, f.values.length), 0)} values per field
          </p>
        </div>
      )}
    </div>
  );
}

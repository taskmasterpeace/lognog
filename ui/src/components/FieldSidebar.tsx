import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Pin, Search, Loader2 } from 'lucide-react';
import { discoverFields, getFieldPreferences, pinField, DiscoveredField } from '../api/client';
import FieldBrowserModal from './FieldBrowserModal';

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facet {
  field: string;
  values: FacetValue[];
  isPinned?: boolean;
  source?: 'core' | 'discovered';
}

interface FieldSidebarProps {
  results: Record<string, unknown>[];
  selectedFilters: Record<string, string[]>;
  onFilterChange: (field: string, values: string[]) => void;
  timeRange?: string;
}

export default function FieldSidebar({
  results,
  selectedFilters,
  onFilterChange,
  timeRange = '-24h',
}: FieldSidebarProps) {
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [pinnedFields, setPinnedFields] = useState<string[]>(['severity', 'hostname', 'app_name', 'index_name']);
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveredField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Pending filter selections (batched mode)
  const [pendingFilters, setPendingFilters] = useState<Record<string, string[]>>({});

  // Fetch discovered fields and preferences
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [fieldsResult, prefsResult] = await Promise.all([
          discoverFields({ earliest: timeRange, limit: 20 }),
          getFieldPreferences(),
        ]);
        setDiscoveredFields(fieldsResult.discovered);
        setPinnedFields(prefsResult.pinned);
        setIsAuthenticated(prefsResult.authenticated);
      } catch (err) {
        console.error('Failed to fetch field data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [timeRange]);

  // Calculate facet values from results
  const calculateFacetValues = useCallback((field: string): FacetValue[] => {
    if (!results || results.length === 0) return [];

    const valueCounts = new Map<string, number>();

    results.forEach((row) => {
      let value: unknown;

      // Check if it's a core field
      if (field in row && field !== 'structured_data') {
        value = row[field];
      } else {
        // Try to get from structured_data
        try {
          const sd = JSON.parse((row.structured_data as string) || '{}');
          value = sd[field];
        } catch {
          // Ignore parse errors
        }
      }

      if (value !== undefined && value !== null && value !== '') {
        const key = String(value);
        valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
      }
    });

    return Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));
  }, [results]);

  // Build facets for pinned and discovered fields
  const { pinnedFacets, discoveredFacets } = useMemo(() => {
    const pinned: Facet[] = pinnedFields.map((field) => ({
      field,
      values: calculateFacetValues(field),
      isPinned: true,
      source: 'core' as const,
    }));

    // Get discovered fields that aren't already pinned
    const discovered: Facet[] = discoveredFields
      .filter((f) => !pinnedFields.includes(f.name))
      .slice(0, 5)
      .map((f) => ({
        field: f.name,
        values: calculateFacetValues(f.name),
        isPinned: false,
        source: 'discovered' as const,
      }));

    return { pinnedFacets: pinned, discoveredFacets: discovered };
  }, [pinnedFields, discoveredFields, calculateFacetValues]);

  // Sync pendingFilters with selectedFilters when selectedFilters changes
  useEffect(() => {
    setPendingFilters(selectedFilters);
  }, [selectedFilters]);

  // Calculate if there are pending changes
  const hasPendingChanges = useMemo(() => {
    const pendingKeys = Object.keys(pendingFilters);
    const selectedKeys = Object.keys(selectedFilters);

    // Check if keys are different
    if (pendingKeys.length !== selectedKeys.length) return true;
    if (!pendingKeys.every((k) => selectedKeys.includes(k))) return true;

    // Check if values are different
    for (const key of pendingKeys) {
      const pending = pendingFilters[key] || [];
      const selected = selectedFilters[key] || [];
      if (pending.length !== selected.length) return true;
      if (!pending.every((v) => selected.includes(v))) return true;
    }
    return false;
  }, [pendingFilters, selectedFilters]);

  // Count total pending changes
  const pendingChangeCount = useMemo(() => {
    let count = 0;
    const allKeys = new Set([...Object.keys(pendingFilters), ...Object.keys(selectedFilters)]);
    for (const key of allKeys) {
      const pending = pendingFilters[key] || [];
      const selected = selectedFilters[key] || [];
      // Count values that differ
      pending.forEach((v) => {
        if (!selected.includes(v)) count++;
      });
      selected.forEach((v) => {
        if (!pending.includes(v)) count++;
      });
    }
    return count;
  }, [pendingFilters, selectedFilters]);

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

  // Toggle value in pending filters (batched mode)
  const toggleValue = (field: string, value: string) => {
    setPendingFilters((prev) => {
      const current = prev[field] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      // Clean up empty arrays
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: next };
    });
  };

  // Apply all pending changes
  const applyFilters = () => {
    // Apply all pending filters
    Object.keys(pendingFilters).forEach((field) => {
      onFilterChange(field, pendingFilters[field] || []);
    });
    // Also clear any fields that were deselected entirely
    Object.keys(selectedFilters).forEach((field) => {
      if (!pendingFilters[field]) {
        onFilterChange(field, []);
      }
    });
  };

  // Reset pending changes
  const resetPending = () => {
    setPendingFilters(selectedFilters);
  };

  const handlePinToggle = async (field: string, shouldPin: boolean) => {
    try {
      await pinField(field, shouldPin);
      if (shouldPin) {
        setPinnedFields((prev) => [...prev, field]);
      } else {
        setPinnedFields((prev) => prev.filter((f) => f !== field));
      }
    } catch (err) {
      console.error('Failed to update pin status:', err);
    }
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      severity: 'Severity',
      hostname: 'Host',
      app_name: 'App Name',
      index_name: 'Index',
      source_ip: 'Source IP',
      facility: 'Facility',
      message: 'Message',
      timestamp: 'Timestamp',
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
      'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
      'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800',
      'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
      'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950 dark:border-yellow-800',
      'text-lime-700 bg-lime-50 border-lime-200 dark:text-lime-400 dark:bg-lime-950 dark:border-lime-800',
      'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800',
      'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
      'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
    ];
    return !isNaN(num) && num >= 0 && num <= 7
      ? colors[num]
      : 'text-slate-700 bg-slate-50 border-slate-200 dark:text-nog-300 dark:bg-nog-800 dark:border-nog-700';
  };

  const renderFacet = (facet: Facet, showPinButton: boolean = false) => {
    const isCollapsed = collapsedPanels.has(facet.field);
    const pendingValues = pendingFilters[facet.field] || [];
    const appliedValues = selectedFilters[facet.field] || [];
    const pendingCount = pendingValues.length;
    const hasFieldChanges = JSON.stringify(pendingValues.sort()) !== JSON.stringify(appliedValues.sort());

    // Calculate total count for percentage display
    const fieldTotal = facet.values.reduce((sum, v) => sum + v.count, 0);

    return (
      <div key={facet.field} className="border-b border-slate-200 dark:border-nog-700">
        {/* Panel Header */}
        <div className="flex items-center">
          <button
            onClick={() => togglePanel(facet.field)}
            className="flex-1 px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-nog-700 transition-all duration-150 group"
          >
            <div className="flex items-center gap-2">
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-nog-300 transition-all duration-200" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-nog-300 transition-all duration-200" />
              )}
              <span className="text-sm font-semibold text-slate-700 dark:text-nog-300">
                {getFieldLabel(facet.field)}
              </span>
            </div>
            {(pendingCount > 0 || hasFieldChanges) && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                hasFieldChanges
                  ? 'bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}>
                {pendingCount}{hasFieldChanges ? '*' : ''}
              </span>
            )}
          </button>
          {showPinButton && isAuthenticated && (
            <button
              onClick={() => handlePinToggle(facet.field, !facet.isPinned)}
              className="px-2 py-2 hover:bg-slate-100 dark:hover:bg-nog-700 transition-colors"
              title={facet.isPinned ? 'Unpin field' : 'Pin field'}
            >
              <Pin
                className={`w-4 h-4 ${
                  facet.isPinned
                    ? 'text-amber-500 fill-amber-500'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-nog-300'
                }`}
              />
            </button>
          )}
        </div>

        {/* Panel Content */}
        {!isCollapsed && (
          <div className="px-4 py-2 bg-slate-50/50 dark:bg-nog-900/30">
            {facet.values.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No values</p>
            ) : (
              <div className="space-y-1">
                {facet.values.map((item) => {
                  const isPending = pendingValues.includes(item.value);
                  const wasApplied = appliedValues.includes(item.value);
                  const isChanged = isPending !== wasApplied;
                  const displayValue =
                    facet.field === 'severity' ? getSeverityLabel(item.value) : item.value;

                  // Calculate percentage with edge case handling
                  const rawPercent = fieldTotal > 0 ? (item.count / fieldTotal) * 100 : 0;
                  const percent = Math.min(100, Math.max(0, rawPercent)); // Clamp 0-100
                  const percentDisplay =
                    isNaN(percent) ? '' :
                    percent > 0 && percent < 0.1 ? '<0.1%' :
                    `${percent.toFixed(1)}%`;

                  return (
                    <label
                      key={item.value}
                      className={`relative flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all duration-150 hover:scale-[1.02] overflow-hidden ${
                        isPending
                          ? isChanged
                            ? 'bg-amber-200 dark:bg-amber-900/30 hover:bg-amber-300 dark:hover:bg-amber-900/40 ring-1 ring-amber-400 dark:ring-amber-700'
                            : 'bg-amber-100 dark:bg-amber-900/20 hover:bg-amber-200 dark:hover:bg-amber-900/30'
                          : isChanged
                            ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800'
                            : 'hover:bg-slate-100 dark:hover:bg-nog-700'
                      }`}
                    >
                      {/* Percentage bar background */}
                      {percent > 0 && (
                        <div
                          className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${
                            isPending
                              ? isChanged
                                ? 'bg-amber-300/60 dark:bg-amber-800/40'
                                : 'bg-amber-200/60 dark:bg-amber-800/30'
                              : 'bg-amber-100/50 dark:bg-amber-900/20'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      )}
                      <input
                        type="checkbox"
                        checked={isPending}
                        onChange={() => toggleValue(facet.field, item.value)}
                        className={`relative z-10 w-4 h-4 border-slate-300 rounded focus:ring-offset-0 cursor-pointer ${
                          isChanged ? 'text-amber-700 focus:ring-amber-600' : 'text-amber-600 focus:ring-amber-500'
                        }`}
                      />
                      <div className="relative z-10 flex-1 min-w-0 flex items-center justify-between gap-2">
                        {facet.field === 'severity' ? (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded border truncate ${getSeverityColor(
                              item.value
                            )}`}
                          >
                            {displayValue}
                          </span>
                        ) : (
                          <span
                            className="text-sm text-slate-700 dark:text-nog-300 truncate"
                            title={displayValue}
                          >
                            {displayValue}
                          </span>
                        )}
                        <span className="text-xs text-slate-500 font-medium tabular-nums flex-shrink-0 whitespace-nowrap">
                          {item.count.toLocaleString()}
                          {percentDisplay && (
                            <span className="text-slate-400 dark:text-nog-500 ml-1">
                              ({percentDisplay})
                            </span>
                          )}
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
  };

  const totalSelected = Object.values(selectedFilters).reduce(
    (sum, values) => sum + values.length,
    0
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-nog-800 border-r border-slate-200 dark:border-nog-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-nog-700 bg-slate-50 dark:bg-nog-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-nog-300 uppercase tracking-wide">
            Fields
          </h3>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        {totalSelected > 0 && (
          <p className="text-xs text-slate-500 dark:text-nog-400 mt-1">
            {totalSelected} filter{totalSelected !== 1 ? 's' : ''} active
          </p>
        )}
      </div>

      {/* Apply/Reset Buttons (sticky top when there are pending changes) */}
      {hasPendingChanges && (
        <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex gap-2">
            <button
              onClick={resetPending}
              className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              Reset
            </button>
            <button
              onClick={applyFilters}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors"
            >
              Apply ({pendingChangeCount})
            </button>
          </div>
        </div>
      )}

      {/* Field Panels */}
      <div className="flex-1 overflow-y-auto">
        {/* Pinned Fields Section */}
        {pinnedFacets.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-slate-100 dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700">
              <div className="flex items-center gap-2">
                <Pin className="w-3 h-3 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Pinned Fields
                </span>
              </div>
            </div>
            {pinnedFacets.map((facet) => renderFacet(facet, true))}
          </div>
        )}

        {/* Discovered Fields Section */}
        {discoveredFacets.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-slate-100 dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700">
              <div className="flex items-center gap-2">
                <Search className="w-3 h-3 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-nog-400 uppercase tracking-wide">
                  Discovered Fields
                </span>
              </div>
            </div>
            {discoveredFacets.map((facet) => renderFacet(facet, true))}
          </div>
        )}

        {/* No Fields Message */}
        {pinnedFacets.length === 0 && discoveredFacets.length === 0 && !isLoading && (
          <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-nog-400">
            Run a search to see fields
          </div>
        )}
      </div>

      {/* Apply/Reset Buttons (sticky footer when there are pending changes) */}
      {hasPendingChanges && (
        <div className="px-4 py-3 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex gap-2">
            <button
              onClick={resetPending}
              className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              Reset
            </button>
            <button
              onClick={applyFilters}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors"
            >
              Apply ({pendingChangeCount})
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-nog-700 bg-slate-50 dark:bg-nog-900">
        <button
          onClick={() => setShowBrowser(true)}
          className="w-full px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
        >
          Browse All Fields...
        </button>
      </div>

      {/* Field Browser Modal */}
      <FieldBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        pinnedFields={pinnedFields}
        discoveredFields={discoveredFields}
        onPinToggle={handlePinToggle}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Pin, Search, Loader2, VolumeX, Volume2, Database, BarChart3, Hash, Percent, TrendingUp, TrendingDown } from 'lucide-react';
import { discoverFields, getFieldPreferences, pinField, getFieldValues, DiscoveredField } from '../api/client';
import { useMute } from '../contexts/MuteContext';
import FieldBrowserModal from './FieldBrowserModal';

// Stats for a field
interface FieldStats {
  totalValues: number;        // Total count of values in results
  uniqueValues: number;       // Number of unique values
  coverage: number;           // Percentage of results with this field (0-100)
  isNumeric: boolean;         // Whether values are numeric
  min?: number;              // Minimum value (for numeric fields)
  max?: number;              // Maximum value (for numeric fields)
  avg?: number;              // Average value (for numeric fields)
}

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

// Fields that can be muted
const MUTABLE_FIELDS = ['app_name', 'index_name', 'hostname'];

export default function FieldSidebar({
  results,
  selectedFilters,
  onFilterChange,
  timeRange = '-24h',
}: FieldSidebarProps) {
  const { isMuted, toggleMute, getMutedCount, mutedValues, removeMute } = useMute();
  const [showMutedPopover, setShowMutedPopover] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set());
  const [pinnedFields, setPinnedFields] = useState<string[]>(['severity', 'index_name', 'hostname', 'app_name']);
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveredField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // All available index values from the database (not just in current results)
  const [allIndexes, setAllIndexes] = useState<{ value: string; count: number }[]>([]);

  // Pending filter selections (batched mode)
  const [pendingFilters, setPendingFilters] = useState<Record<string, string[]>>({});

  // Fetch discovered fields, preferences, and all available indexes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [fieldsResult, prefsResult, indexResult] = await Promise.all([
          discoverFields({ earliest: timeRange, limit: 20 }),
          getFieldPreferences(),
          getFieldValues('index_name', 100).catch(() => []), // Get all indexes from DB
        ]);
        setDiscoveredFields(fieldsResult.discovered);
        setPinnedFields(prefsResult.pinned);
        setIsAuthenticated(prefsResult.authenticated);
        setAllIndexes(indexResult);
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

  // Calculate field statistics from results
  const calculateFieldStats = useCallback((field: string): FieldStats => {
    if (!results || results.length === 0) {
      return { totalValues: 0, uniqueValues: 0, coverage: 0, isNumeric: false };
    }

    const values: unknown[] = [];
    let presentCount = 0;
    const uniqueSet = new Set<string>();

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
        values.push(value);
        presentCount++;
        uniqueSet.add(String(value));
      }
    });

    const stats: FieldStats = {
      totalValues: values.length,
      uniqueValues: uniqueSet.size,
      coverage: (presentCount / results.length) * 100,
      isNumeric: false,
    };

    // Check if values are numeric
    const numericValues = values
      .map((v) => parseFloat(String(v)))
      .filter((n) => !isNaN(n));

    if (numericValues.length > 0 && numericValues.length === values.length) {
      stats.isNumeric = true;
      stats.min = Math.min(...numericValues);
      stats.max = Math.max(...numericValues);
      stats.avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    }

    return stats;
  }, [results]);

  // Build facets for pinned and discovered fields
  const { pinnedFacets, discoveredFacets } = useMemo(() => {
    const pinned: Facet[] = pinnedFields.map((field) => {
      let values = calculateFacetValues(field);

      // For index_name, merge with all available indexes to show ones not in results
      if (field === 'index_name' && allIndexes.length > 0) {
        const inResultsSet = new Set(values.map(v => v.value));
        // Add indexes that exist in DB but not in current results
        const notInResults = allIndexes
          .filter(idx => !inResultsSet.has(idx.value))
          .map(idx => ({ value: idx.value, count: 0 })); // 0 count = not in current results
        values = [...values, ...notInResults];
      }

      return {
        field,
        values,
        isPinned: true,
        source: 'core' as const,
      };
    });

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
  }, [pinnedFields, discoveredFields, calculateFacetValues, allIndexes]);

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
      : 'text-slate-700 bg-nog-50 border-slate-200 dark:text-nog-300 dark:bg-nog-800 dark:border-nog-700';
  };

  const renderFacet = (facet: Facet, showPinButton: boolean = false) => {
    const isCollapsed = collapsedPanels.has(facet.field);
    const pendingValues = pendingFilters[facet.field] || [];
    const appliedValues = selectedFilters[facet.field] || [];
    const pendingCount = pendingValues.length;
    const hasFieldChanges = JSON.stringify(pendingValues.sort()) !== JSON.stringify(appliedValues.sort());

    // Calculate total count for percentage display
    const fieldTotal = facet.values.reduce((sum, v) => sum + v.count, 0);

    // Calculate field statistics
    const fieldStats = calculateFieldStats(facet.field);

    return (
      <div key={facet.field} className="border-b border-slate-200 dark:border-nog-700">
        {/* Panel Header */}
        <div className="flex items-center">
          <button
            onClick={() => togglePanel(facet.field)}
            className="flex-1 px-4 py-2.5 flex items-center justify-between hover:bg-nog-50 dark:hover:bg-nog-700 transition-all duration-150 group"
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
              className="px-2 py-2 hover:bg-nog-100 dark:hover:bg-nog-700 transition-colors"
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
          <div className="px-4 py-2 bg-nog-50/50 dark:bg-nog-900/30">
            {/* Quick Stats */}
            {fieldStats.totalValues > 0 && (
              <div className="mb-2 pb-2 border-b border-slate-200 dark:border-nog-700">
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <div className="flex items-center gap-1 text-slate-500 dark:text-nog-400" title="Number of unique values">
                    <Hash className="w-3 h-3" />
                    <span className="font-medium text-slate-700 dark:text-nog-300">{fieldStats.uniqueValues}</span>
                    <span className="hidden sm:inline">unique</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-500 dark:text-nog-400" title="Coverage: percentage of results with this field">
                    <Percent className="w-3 h-3" />
                    <span className="font-medium text-slate-700 dark:text-nog-300">{fieldStats.coverage.toFixed(0)}%</span>
                    <span className="hidden sm:inline">coverage</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-500 dark:text-nog-400" title="Total values in results">
                    <BarChart3 className="w-3 h-3" />
                    <span className="font-medium text-slate-700 dark:text-nog-300">{fieldStats.totalValues.toLocaleString()}</span>
                  </div>
                </div>
                {/* Numeric stats row */}
                {fieldStats.isNumeric && fieldStats.min !== undefined && fieldStats.max !== undefined && (
                  <div className="grid grid-cols-3 gap-1 mt-1 text-xs">
                    <div className="flex items-center gap-1 text-slate-500 dark:text-nog-400" title="Minimum value">
                      <TrendingDown className="w-3 h-3 text-blue-500" />
                      <span className="font-medium text-slate-700 dark:text-nog-300">{fieldStats.min.toLocaleString()}</span>
                      <span className="hidden sm:inline">min</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-nog-400" title="Average value">
                      <BarChart3 className="w-3 h-3 text-green-500" />
                      <span className="font-medium text-slate-700 dark:text-nog-300">{fieldStats.avg?.toFixed(1)}</span>
                      <span className="hidden sm:inline">avg</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-nog-400" title="Maximum value">
                      <TrendingUp className="w-3 h-3 text-red-500" />
                      <span className="font-medium text-slate-700 dark:text-nog-300">{fieldStats.max.toLocaleString()}</span>
                      <span className="hidden sm:inline">max</span>
                    </div>
                  </div>
                )}
              </div>
            )}
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
                  const canMute = MUTABLE_FIELDS.includes(facet.field);
                  const valueMuted = canMute && isMuted(facet.field, item.value);

                  // Calculate percentage with edge case handling
                  const rawPercent = fieldTotal > 0 ? (item.count / fieldTotal) * 100 : 0;
                  const percent = Math.min(100, Math.max(0, rawPercent)); // Clamp 0-100
                  const percentDisplay =
                    isNaN(percent) ? '' :
                    percent > 0 && percent < 0.1 ? '<0.1%' :
                    `${percent.toFixed(1)}%`;
                  // Check if this value exists in DB but not in current results
                  const notInResults = item.count === 0 && facet.field === 'index_name';

                  return (
                    <div key={item.value} className="flex items-center gap-1">
                      <label
                        className={`relative flex-1 flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all duration-150 hover:scale-[1.02] overflow-hidden ${
                          valueMuted
                            ? 'opacity-50'
                            : notInResults
                              ? 'bg-slate-100 dark:bg-nog-700/50 hover:bg-slate-200 dark:hover:bg-nog-700'
                              : isPending
                                ? isChanged
                                  ? 'bg-amber-200 dark:bg-amber-900/30 hover:bg-amber-300 dark:hover:bg-amber-900/40 ring-1 ring-amber-400 dark:ring-amber-700'
                                  : 'bg-amber-100 dark:bg-amber-900/20 hover:bg-amber-200 dark:hover:bg-amber-900/30'
                                : isChanged
                                  ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800'
                                  : 'hover:bg-nog-100 dark:hover:bg-nog-700'
                        }`}
                      >
                        {/* Percentage bar background */}
                        {percent > 0 && !valueMuted && (
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
                              className={`text-sm truncate ${valueMuted ? 'line-through text-slate-400 dark:text-nog-500' : 'text-slate-700 dark:text-nog-300'}`}
                              title={displayValue}
                            >
                              {displayValue}
                            </span>
                          )}
                          <span className="text-xs text-slate-500 font-medium tabular-nums flex-shrink-0 whitespace-nowrap flex items-center gap-1">
                            {notInResults ? (
                              <>
                                <Database className="w-3 h-3 text-slate-400" />
                                <span className="text-slate-400 dark:text-nog-500 italic">not in results</span>
                              </>
                            ) : (
                              <>
                                {item.count.toLocaleString()}
                                {percentDisplay && (
                                  <span className="text-slate-400 dark:text-nog-500 ml-1">
                                    ({percentDisplay})
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      </label>
                      {/* Mute button for mutable fields */}
                      {canMute && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMute(facet.field, item.value);
                          }}
                          className={`relative z-10 p-1 rounded transition-colors ${
                            valueMuted
                              ? 'text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                              : 'text-slate-400 dark:text-nog-400 hover:text-slate-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700'
                          }`}
                          title={valueMuted ? 'Unmute (show in search results)' : 'Mute (hide from search results)'}
                        >
                          {valueMuted ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
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
      <div className="px-4 py-3 border-b border-slate-200 dark:border-nog-700 bg-nog-50 dark:bg-nog-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-nog-300 uppercase tracking-wide">
            Fields
          </h3>
          <div className="flex items-center gap-2">
            {getMutedCount() > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowMutedPopover(!showMutedPopover)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors cursor-pointer"
                  title="Click to manage muted values"
                >
                  <VolumeX className="w-3 h-3" />
                  {getMutedCount()} muted
                </button>
                {showMutedPopover && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-600 rounded-lg shadow-lg z-50">
                    <div className="p-3 border-b border-slate-200 dark:border-nog-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-nog-200">Muted Values</h4>
                      <p className="text-xs text-slate-500 dark:text-nog-400 mt-1">Click to unmute and show in results</p>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {Object.entries(mutedValues).map(([field, values]) =>
                        values.length > 0 && (
                          <div key={field} className="mb-2">
                            <div className="text-xs font-medium text-slate-500 dark:text-nog-400 px-2 py-1 uppercase">
                              {field.replace('_', ' ')}
                            </div>
                            {values.map((value: string) => (
                              <button
                                key={value}
                                onClick={() => {
                                  removeMute(field, value);
                                  if (getMutedCount() <= 1) setShowMutedPopover(false);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left text-slate-700 dark:text-nog-300 hover:bg-nog-100 dark:hover:bg-nog-700 rounded transition-colors"
                              >
                                <VolumeX className="w-4 h-4 text-orange-500" />
                                <span className="truncate flex-1">{value}</span>
                                <span className="text-xs text-slate-400 dark:text-nog-500">click to unmute</span>
                              </button>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
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
              className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-md transition-colors"
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
            <div className="px-4 py-2 bg-nog-100 dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700">
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
            <div className="px-4 py-2 bg-nog-100 dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700">
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
              className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-md transition-colors"
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
      <div className="px-4 py-3 border-t border-slate-200 dark:border-nog-700 bg-nog-50 dark:bg-nog-900">
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

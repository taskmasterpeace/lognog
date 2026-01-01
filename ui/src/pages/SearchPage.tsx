import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Play,
  AlertCircle,
  Loader2,
  Sparkles,
  X,
  Bookmark,
  Code2,
  Table2,
  MessageSquare,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  FileJson,
  PanelLeftClose,
  PanelLeft,
  Download,
  History,
  Copy,
  Check,
  Bell,
  FileText,
} from 'lucide-react';
import { executeSearch, getSavedSearches, createSavedSearch, aiSearch, getAISuggestions } from '../api/client';
import LogViewer from '../components/LogViewer';
import TimePicker from '../components/TimePicker';
import FieldSidebar from '../components/FieldSidebar';
import { Tooltip, TooltipWithCode } from '../components/ui/Tooltip';
import { InfoIcon } from '../components/ui/InfoTip';

const SEVERITY_NAMES = ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Info', 'Debug'];

const EXAMPLE_QUERIES = [
  { name: 'All Logs', query: 'search *', desc: 'Show all recent logs' },
  { name: 'Errors Only', query: 'search severity<=3', desc: 'Emergency, Alert, Critical, Error' },
  { name: 'By Host', query: 'search host=myserver', desc: 'Filter by hostname' },
  { name: 'Count by Host', query: 'search * | stats count by hostname', desc: 'Aggregate logs per host' },
  { name: 'Top Apps', query: 'search * | stats count by app_name | sort desc | limit 10', desc: 'Most active applications' },
];

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('search *');
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('lognog_default_time_range') || '-24h';
  });
  const [timeRangeLatest, setTimeRangeLatest] = useState<string | undefined>(undefined);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSqlPreview, setShowSqlPreview] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [searchMode, setSearchMode] = useState<'dsl' | 'ai'>('dsl');
  const [aiQuestion, setAiQuestion] = useState('');
  const [viewMode, setViewMode] = useState<'log' | 'table' | 'json'>(() => {
    const saved = localStorage.getItem('lognog_default_view_mode') as 'log' | 'table' | 'json' | null;
    return saved && ['log', 'table', 'json'].includes(saved) ? saved : 'log';
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('lognog_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [queryHistory, setQueryHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('lognog_query_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  const historyDropdownRef = useRef<HTMLDivElement>(null);

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };

    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHistory]);

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('lognog_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);

  // Load preferences from API on mount
  useEffect(() => {
    const loadPreferences = async () => {
      const token = localStorage.getItem('lognog_access_token');
      if (!token) {
        setPreferencesLoaded(true);
        return;
      }

      try {
        const response = await fetch('/api/settings/preferences', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();

          // Apply preferences if not already manually set in this session
          if (!preferencesLoaded) {
            if (data.default_time_range) {
              setTimeRange(data.default_time_range);
              localStorage.setItem('lognog_default_time_range', data.default_time_range);
            }
            if (data.default_view_mode && ['log', 'table', 'json'].includes(data.default_view_mode)) {
              setViewMode(data.default_view_mode);
              localStorage.setItem('lognog_default_view_mode', data.default_view_mode);
            }
            if (typeof data.sidebar_open === 'boolean') {
              setSidebarOpen(data.sidebar_open);
              localStorage.setItem('lognog_sidebar_open', String(data.sidebar_open));
            }
          }
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      } finally {
        setPreferencesLoaded(true);
      }
    };

    loadPreferences();
  }, []);

  const { data: savedSearches } = useQuery({
    queryKey: ['savedSearches'],
    queryFn: getSavedSearches,
  });

  const { data: aiSuggestions } = useQuery({
    queryKey: ['aiSuggestions'],
    queryFn: getAISuggestions,
    enabled: searchMode === 'ai',
  });

  const searchMutation = useMutation({
    mutationFn: () => executeSearch(query, timeRange || undefined, timeRangeLatest),
  });

  const aiSearchMutation = useMutation({
    mutationFn: (question: string) => aiSearch(question, true),
    onSuccess: (data) => {
      // Update the DSL query field with the generated query
      setQuery(data.query);
    },
  });

  // Update page title with results count
  useEffect(() => {
    const count = searchMutation.data?.count ?? aiSearchMutation.data?.results?.length;
    if (count !== undefined) {
      document.title = `(${count.toLocaleString()}) Search - LogNog`;
    } else {
      document.title = 'Search - LogNog';
    }
    return () => {
      document.title = 'LogNog';
    };
  }, [searchMutation.data, aiSearchMutation.data]);

  const saveMutation = useMutation({
    mutationFn: () => createSavedSearch(saveName, query),
    onSuccess: () => {
      setShowSaveModal(false);
      setSaveName('');
    },
  });

  const handleSearch = useCallback(() => {
    // Add to query history (dedupe, limit to 10)
    if (query && query.trim() !== 'search *') {
      setQueryHistory(prev => {
        const updated = [query, ...prev.filter(q => q !== query)].slice(0, 10);
        try {
          localStorage.setItem('lognog_query_history', JSON.stringify(updated));
        } catch {
          // Gracefully handle localStorage errors (e.g., quota exceeded)
        }
        return updated;
      });
    }
    searchMutation.mutate();
  }, [query, searchMutation]);

  const handleAISearch = useCallback(() => {
    if (aiQuestion.trim()) {
      aiSearchMutation.mutate(aiQuestion);
    }
  }, [aiSearchMutation, aiQuestion]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (searchMode === 'ai') {
        handleAISearch();
      } else {
        handleSearch();
      }
    }
  }, [handleSearch, handleAISearch, searchMode]);

  // Extract search terms from query for highlighting
  const extractSearchTerms = useCallback((query: string): string[] => {
    const terms: string[] = [];
    // Extract quoted strings
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => terms.push(match.replace(/"/g, '')));
    }
    // Extract field values like field=value
    const fieldMatches = query.match(/\w+[=~](\w+)/g);
    if (fieldMatches) {
      fieldMatches.forEach(match => {
        const value = match.split(/[=~]/)[1];
        if (value && value.length > 2) terms.push(value);
      });
    }
    return terms;
  }, []);

  // Export results to CSV
  const exportToCSV = useCallback((data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          const val = row[h];
          const str = val === null || val === undefined ? '' : String(val);
          // Escape quotes and wrap in quotes if contains comma or newline
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lognog-export-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Copy results to clipboard as JSON
  const copyToClipboard = useCallback(async (data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return;

    try {
      const jsonContent = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonContent);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(data, null, 2);
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    }
  }, []);

  // Handle facet filter changes
  const handleFilterChange = useCallback((field: string, values: string[]) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [field]: values,
    }));

    // Build filter clause and update query
    const allFilters: string[] = [];
    Object.entries({ ...selectedFilters, [field]: values }).forEach(([f, vals]) => {
      if (vals.length > 0) {
        if (vals.length === 1) {
          allFilters.push(`${f}="${vals[0]}"`);
        } else {
          const orClauses = vals.map((v) => `${f}="${v}"`).join(' OR ');
          allFilters.push(`(${orClauses})`);
        }
      }
    });

    // Update query with filters
    let baseQuery = query;
    // Remove existing filter clauses (simplified approach)
    const pipeParts = baseQuery.split('|');
    const searchPart = pipeParts[0].trim();
    const restParts = pipeParts.slice(1);

    // Extract base search without filters
    let cleanSearch = searchPart.replace(/\s+(severity|hostname|app_name)[=!~]+[^\s]+/g, '').trim();

    // Add new filters
    if (allFilters.length > 0) {
      cleanSearch = `${cleanSearch} ${allFilters.join(' ')}`;
    }

    const newQuery = restParts.length > 0 ? `${cleanSearch} | ${restParts.join(' | ')}` : cleanSearch;
    setQuery(newQuery.trim());

    // Re-run search
    searchMutation.mutate();
  }, [query, selectedFilters, searchMutation]);

  const handleAddFilter = useCallback((field: string, value: string, exclude = false) => {
    const operator = exclude ? '!=' : '=';
    const newFilter = `${field}${operator}"${value}"`;

    // Add filter to existing query
    let newQuery = query;
    if (query.includes('|')) {
      // Insert before first pipe
      const parts = query.split('|');
      parts[0] = `${parts[0].trim()} ${newFilter}`;
      newQuery = parts.join(' |');
    } else {
      newQuery = `${query.trim()} ${newFilter}`;
    }

    setQuery(newQuery);
    // Re-run search
    searchMutation.mutate();
  }, [query, searchMutation]);

  // Parse active filters from query to show as chips
  const activeFilterChips = useMemo(() => {
    const chips: { field: string; value: string; operator: string }[] = [];
    const filterRegex = /(\w+)([=!~]+)"?([^"\s]+)"?/g;
    let match;

    const pipeParts = query.split('|');
    const searchPart = pipeParts[0];

    while ((match = filterRegex.exec(searchPart)) !== null) {
      const [, field, operator, value] = match;
      if (['severity', 'hostname', 'app_name', 'facility', 'source_ip'].includes(field)) {
        chips.push({ field, value, operator });
      }
    }

    return chips;
  }, [query]);

  const removeFilterChip = useCallback((field: string, value: string) => {
    // Remove specific filter from query
    const filterPattern = new RegExp(`\\s*${field}[=!~]+"?${value}"?\\s*`, 'g');
    let newQuery = query.replace(filterPattern, ' ').replace(/\s+/g, ' ').trim();
    setQuery(newQuery);

    // Update selected filters
    setSelectedFilters((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((v) => v !== value),
    }));

    // Re-run search
    searchMutation.mutate();
  }, [query, searchMutation]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 sm:p-6">
          {/* Title - responsive layout */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">Search & Explore</h1>
                <InfoIcon
                  content={
                    <div className="space-y-2">
                      <p className="font-semibold">Search Modes</p>
                      <p><strong>DSL Mode:</strong> Use powerful query syntax for advanced filtering and aggregation</p>
                      <p><strong>AI Mode:</strong> Ask questions in natural language and get instant results</p>
                    </div>
                  }
                  placement="right"
                />
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 hidden sm:block">
                {searchMode === 'ai'
                  ? 'Ask questions in plain English'
                  : 'Query your logs using LogNog Query Language'}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Mode Toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                <Tooltip
                  content="Use Domain-Specific Language for powerful queries with filtering, aggregation, and transformations"
                  placement="bottom"
                >
                  <button
                    onClick={() => setSearchMode('dsl')}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      searchMode === 'dsl'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Code2 className="w-4 h-4" />
                    <span className="hidden xs:inline">DSL</span>
                  </button>
                </Tooltip>
                <Tooltip
                  content="Ask questions in plain English and let AI convert them to optimized queries"
                  placement="bottom"
                >
                  <button
                    onClick={() => setSearchMode('ai')}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      searchMode === 'ai'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Wand2 className="w-4 h-4" />
                    <span className="hidden xs:inline">AI</span>
                  </button>
                </Tooltip>
              </div>
              <button
                onClick={() => setShowSaveModal(true)}
                className="btn-secondary"
              >
                <Bookmark className="w-4 h-4" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          </div>

          {/* Search Bar - responsive layout */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Search Input Row */}
            <div className="flex-1 flex gap-2">
              {searchMode === 'ai' ? (
                /* AI Search Input */
                <div className="flex-1 relative">
                  <MessageSquare className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-purple-400" />
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Show me all errors..."
                    className="input-search h-11 sm:h-12 pl-10 sm:pl-12 pr-10 sm:pr-24 border-purple-200 focus:border-purple-400 focus:ring-purple-200 text-sm sm:text-base"
                    autoFocus
                  />
                  <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {aiQuestion && (
                      <button
                        onClick={() => setAiQuestion('')}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        title="Clear"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <kbd className="hidden lg:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 bg-slate-100 rounded">
                      <span>Ctrl+Enter</span>
                    </kbd>
                  </div>
                </div>
              ) : (
                /* DSL Query Input */
                <div className="flex-1 relative">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-slate-400" />
                  <TooltipWithCode
                    content={
                      <div className="space-y-2">
                        <p className="font-semibold">DSL Query Syntax</p>
                        <p>Start with <code className="bg-gray-800 px-1.5 py-0.5 rounded">search</code> followed by filters, then use pipes (<code className="bg-gray-800 px-1.5 py-0.5 rounded">|</code>) for transformations</p>
                        <p className="text-xs mt-2 opacity-80">Examples:</p>
                      </div>
                    }
                    code={`search severity<=3
search host=web* app_name="nginx"
search * | stats count by hostname
search error | timechart span=1h count
search * | top 10 app_name`}
                    placement="bottom"
                  >
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="search host=* | stats count"
                      className="input-search h-11 sm:h-12 pl-10 sm:pl-12 pr-10 sm:pr-24 text-sm sm:text-base"
                      autoFocus
                    />
                  </TooltipWithCode>
                  <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {query && query !== 'search *' && (
                      <button
                        onClick={() => setQuery('search *')}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        title="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <kbd className="hidden lg:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 bg-slate-100 rounded">
                      <span>Ctrl+Enter</span>
                    </kbd>
                  </div>
                </div>
              )}

              {/* Query History Dropdown - visible on sm+ */}
              {searchMode === 'dsl' && queryHistory.length > 0 && (
                <div className="relative hidden sm:block" ref={historyDropdownRef}>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="btn-secondary h-11 sm:h-12 group"
                    title="Query history"
                  >
                    <History className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-all duration-200 group-hover:scale-110" />
                  </button>

                  {/* History Dropdown Menu */}
                  {showHistory && (
                    <div className="dropdown right-0 w-80 sm:w-96 animate-fade-in">
                      <div className="py-2">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Recent Queries
                          </p>
                        </div>
                        {queryHistory.map((historyQuery, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setQuery(historyQuery);
                              setShowHistory(false);
                            }}
                            className={`dropdown-item flex items-center gap-3 text-left transition-all duration-150 animate-fade-in text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700`}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            <History className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="font-mono text-sm truncate flex-1">{historyQuery}</span>
                          </button>
                        ))}
                        {queryHistory.length > 0 && (
                          <div className="border-t border-slate-100 dark:border-slate-700 mt-2 pt-2 px-4">
                            <button
                              onClick={() => {
                                setQueryHistory([]);
                                localStorage.removeItem('lognog_query_history');
                                setShowHistory(false);
                              }}
                              className="text-xs text-slate-500 hover:text-red-600 transition-colors"
                            >
                              Clear history
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Controls Row - Time Range and Search Button */}
            <div className="flex gap-2">
              {/* Time Range */}
              <TimePicker
                onRangeChange={(earliest, latest) => {
                  setTimeRange(earliest);
                  setTimeRangeLatest(latest);
                }}
                defaultRange={timeRange}
              />

              {/* Search Button */}
              {searchMode === 'ai' ? (
                <button
                  onClick={handleAISearch}
                  disabled={aiSearchMutation.isPending || !aiQuestion.trim()}
                  className="btn-primary h-11 sm:h-12 px-4 sm:px-6 bg-purple-600 hover:bg-purple-700 flex-shrink-0"
                >
                  {aiSearchMutation.isPending ? (
                    <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 sm:w-5 h-4 sm:h-5" />
                  )}
                  <span className="hidden sm:inline ml-2">Ask AI</span>
                </button>
              ) : (
                <button
                  onClick={handleSearch}
                  disabled={searchMutation.isPending}
                  className="btn-primary h-11 sm:h-12 px-4 sm:px-6 flex-shrink-0"
                >
                  {searchMutation.isPending ? (
                    <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 animate-spin" />
                  ) : (
                    <Play className="w-4 sm:w-5 h-4 sm:h-5" />
                  )}
                  <span className="hidden sm:inline ml-2">Search</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Searches / Saved - hide on very small screens */}
          <div className="mt-3 sm:mt-4 flex items-center gap-2 sm:gap-4 overflow-x-auto pb-2 -mb-2 scrollbar-hide">
            {searchMode === 'ai' ? (
              /* AI Suggestions */
              <>
                <span className="text-xs font-semibold text-purple-400 uppercase whitespace-nowrap hidden sm:inline">Try asking:</span>
                {aiSuggestions?.suggestions.slice(0, 3).map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAiQuestion(suggestion.text)}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors whitespace-nowrap flex-shrink-0"
                    title={suggestion.description}
                  >
                    <Wand2 className="w-3 h-3" />
                    {suggestion.text.length > 20 ? suggestion.text.slice(0, 20) + '...' : suggestion.text}
                  </button>
                ))}
              </>
            ) : (
              /* DSL Quick Searches */
              <>
                <span className="text-xs font-semibold text-slate-400 uppercase whitespace-nowrap hidden sm:inline">Quick:</span>
                {EXAMPLE_QUERIES.slice(0, 4).map((ex) => (
                  <button
                    key={ex.name}
                    onClick={() => setQuery(ex.query)}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    {ex.name}
                  </button>
                ))}
                {savedSearches && savedSearches.length > 0 && (
                  <>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <span className="text-xs font-semibold text-slate-400 uppercase whitespace-nowrap hidden sm:inline">Saved:</span>
                    {savedSearches.slice(0, 2).map((search) => (
                      <button
                        key={search.id}
                        onClick={() => setQuery(search.query)}
                        className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-sky-50 text-sky-700 rounded-lg hover:bg-sky-100 transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        <Bookmark className="w-3 h-3" />
                        {search.name}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Field Discovery (hidden on mobile) */}
        {sidebarOpen && (
          <div className="hidden md:block w-64 flex-shrink-0 overflow-hidden border-r border-slate-200 dark:border-slate-700">
            <FieldSidebar
              results={(searchMutation.data?.results || aiSearchMutation.data?.results || []) as Record<string, unknown>[]}
              selectedFilters={selectedFilters}
              onFilterChange={handleFilterChange}
              timeRange={timeRange}
            />
          </div>
        )}

        {/* Results Area */}
        <div className="flex-1 overflow-auto p-3 sm:p-6">
        {/* Error State */}
        {(searchMutation.isError || aiSearchMutation.isError) && (
          <div className="card border-red-200 bg-red-50 p-4 mb-6 flex items-start gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-900">Search Error</p>
              <p className="text-sm text-red-700 mt-1">
                {String(searchMutation.error || aiSearchMutation.error)}
              </p>
            </div>
          </div>
        )}

        {/* AI Search Result Card */}
        {aiSearchMutation.data && (
          <div className="card border-purple-200 bg-purple-50 p-4 mb-6 animate-fade-in">
            <div className="flex items-start gap-3">
              <Wand2 className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-purple-900">AI Generated Query</p>
                  <div className="flex items-center gap-2">
                    {aiSearchMutation.data.confidence >= 0.8 ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        High Confidence ({Math.round(aiSearchMutation.data.confidence * 100)}%)
                      </span>
                    ) : aiSearchMutation.data.confidence >= 0.5 ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Medium ({Math.round(aiSearchMutation.data.confidence * 100)}%)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded-full">
                        <AlertCircle className="w-3 h-3" />
                        Low ({Math.round(aiSearchMutation.data.confidence * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-purple-700 mb-3">{aiSearchMutation.data.explanation}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white dark:bg-slate-800 rounded border border-purple-200 dark:border-purple-700 text-sm font-mono text-purple-900 dark:text-purple-200">
                    {aiSearchMutation.data.query}
                  </code>
                  <button
                    onClick={() => {
                      setQuery(aiSearchMutation.data!.query);
                      setSearchMode('dsl');
                    }}
                    className="btn-secondary text-sm"
                  >
                    <Code2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                {aiSearchMutation.data.error && (
                  <p className="text-sm text-red-600 mt-2">Execution error: {aiSearchMutation.data.error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Active Filter Chips */}
        {activeFilterChips.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase">Active Filters:</span>
            {activeFilterChips.map((chip, idx) => (
              <span
                key={`${chip.field}-${chip.value}-${idx}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-sm font-medium"
              >
                <span className="text-xs text-sky-500">{chip.field}</span>
                <span className="text-sky-800">{chip.operator === '!=' ? '≠' : '='}</span>
                <span>{chip.value}</span>
                <button
                  onClick={() => removeFilterChip(chip.field, chip.value)}
                  className="ml-1 hover:bg-sky-200 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setSelectedFilters({});
                setQuery('search *');
                searchMutation.mutate();
              }}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Results */}
        {(() => {
          const results = searchMutation.data?.results || aiSearchMutation.data?.results;
          const count = searchMutation.data?.count ?? aiSearchMutation.data?.results?.length ?? 0;
          const sql = searchMutation.data?.sql || aiSearchMutation.data?.sql;
          const hasSearched = searchMutation.data !== undefined || aiSearchMutation.data !== undefined;

          if (hasSearched && (!results || results.length === 0)) {
            return (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  No results found
                </h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">
                  Your search didn't match any logs. Try adjusting your query or time range.
                </p>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 max-w-md text-left">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Suggestions:</p>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Try a broader time range (e.g., "Last 7 days")</li>
                    <li>• Use wildcards: <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">host=web*</code></li>
                    <li>• Check field names: <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">hostname</code> vs <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">host</code></li>
                    <li>• Try <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">search *</code> to see all logs</li>
                  </ul>
                </div>
              </div>
            );
          }

          if (!results || results.length === 0) return null;

          const executionTime = searchMutation.data?.executionTime;

          return (
            <div className="animate-slide-up">
              {/* Result Stats - responsive */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="btn-ghost p-2 hidden md:flex"
                    title={sidebarOpen ? 'Hide filters' : 'Show filters'}
                  >
                    {sidebarOpen ? (
                      <PanelLeftClose className="w-5 h-5" />
                    ) : (
                      <PanelLeft className="w-5 h-5" />
                    )}
                  </button>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {count.toLocaleString()}
                    </span>
                    {' '}results
                    {executionTime !== undefined && (
                      <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                        {' '}in {executionTime.toLocaleString()}ms
                      </span>
                    )}
                  </p>
                </div>

                {/* Toolbar - scrollable on mobile */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-1 flex-shrink-0">
                    <button
                      onClick={() => setViewMode('log')}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'log'
                          ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                      title="Log View"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">Log</span>
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'table'
                          ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                      title="Table View"
                    >
                      <Table2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Table</span>
                    </button>
                    <button
                      onClick={() => setViewMode('json')}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'json'
                          ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                      title="JSON View"
                    >
                      <FileJson className="w-4 h-4" />
                      <span className="hidden sm:inline">JSON</span>
                    </button>
                  </div>

                  {sql && (
                    <button
                      onClick={() => setShowSqlPreview(!showSqlPreview)}
                      className={`btn-ghost text-xs flex-shrink-0 ${showSqlPreview ? 'bg-slate-100' : ''}`}
                      title="Show SQL"
                    >
                      <Code2 className="w-4 h-4" />
                      <span className="hidden sm:inline">{showSqlPreview ? 'Hide SQL' : 'SQL'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => copyToClipboard(results as Record<string, unknown>[])}
                    className="btn-ghost text-xs flex-shrink-0"
                    title="Copy as JSON"
                  >
                    {jsonCopied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">{jsonCopied ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={() => exportToCSV(results as Record<string, unknown>[])}
                    className="btn-ghost text-xs flex-shrink-0"
                    title="Export to CSV"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>

                  {/* Divider - hidden on mobile */}
                  <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-600 flex-shrink-0" />

                  {/* Create Alert Button */}
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        action: 'create',
                        query: query,
                        timeRange: timeRange,
                      });
                      navigate(`/alerts?${params.toString()}`);
                    }}
                    className="btn-ghost text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 flex-shrink-0"
                    title="Create an alert from this search"
                  >
                    <Bell className="w-4 h-4" />
                    <span className="hidden sm:inline">Alert</span>
                  </button>

                  {/* Create Report Button */}
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        action: 'create',
                        query: query,
                        timeRange: timeRange,
                      });
                      navigate(`/reports?${params.toString()}`);
                    }}
                    className="btn-ghost text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 flex-shrink-0"
                    title="Create a scheduled report from this search"
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Report</span>
                  </button>
                </div>
              </div>

              {/* SQL Preview */}
              {showSqlPreview && sql && (
                <div className="card p-4 mb-4 bg-slate-900 text-slate-100 animate-fade-in">
                  <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                    {sql}
                  </pre>
                </div>
              )}

              {/* Results View */}
              {viewMode === 'log' ? (
                <div className="card overflow-hidden" style={{ height: '600px' }}>
                  <LogViewer
                    logs={results as any[]}
                    onAddFilter={handleAddFilter}
                    searchTerms={extractSearchTerms(query)}
                    isLoading={false}
                  />
                </div>
              ) : viewMode === 'table' ? (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          {results[0] &&
                            Object.keys(results[0]).map((key) => (
                              <th key={key}>{key}</th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((row, i) => (
                          <tr key={i}>
                            {Object.entries(row).map(([key, value], j) => (
                              <td key={j}>
                                {key === 'severity' ? (
                                  <span className={`badge severity-${value}`}>
                                    {SEVERITY_NAMES[Number(value)] || String(value)}
                                  </span>
                                ) : key === 'timestamp' ? (
                                  <span className="text-slate-600 whitespace-nowrap">
                                    {new Date(String(value)).toLocaleString()}
                                  </span>
                                ) : key === 'message' ? (
                                  <span className="font-mono text-xs text-slate-700 max-w-md truncate block">
                                    {String(value)}
                                  </span>
                                ) : key === 'hostname' || key === 'app_name' ? (
                                  <span className="code">{String(value)}</span>
                                ) : (
                                  String(value)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* JSON View */
                <div className="card overflow-hidden bg-slate-900">
                  <div className="overflow-auto p-4" style={{ maxHeight: '600px' }}>
                    <pre className="text-sm font-mono text-slate-100 whitespace-pre-wrap">
                      {JSON.stringify(results, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Empty State */}
        {!searchMutation.data && !aiSearchMutation.data && !searchMutation.isPending && !aiSearchMutation.isPending && !searchMutation.isError && !aiSearchMutation.isError && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              searchMode === 'ai' ? 'bg-purple-100' : 'bg-slate-100'
            }`}>
              {searchMode === 'ai' ? (
                <Wand2 className="w-8 h-8 text-purple-400" />
              ) : (
                <Table2 className="w-8 h-8 text-slate-400" />
              )}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {searchMode === 'ai' ? 'Ask a Question' : 'Ready to Search'}
            </h3>
            <p className="text-slate-500 text-center max-w-md mb-6">
              {searchMode === 'ai' ? (
                <>Type a question in plain English and AI will translate it to a query</>
              ) : (
                <>Enter a query above and press Search or use <kbd className="code">Ctrl+Enter</kbd></>
              )}
            </p>

            {/* Example Queries / AI Suggestions */}
            {searchMode === 'ai' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-w-2xl w-full px-4 sm:px-0">
                {aiSuggestions?.suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setAiQuestion(suggestion.text);
                      aiSearchMutation.mutate(suggestion.text);
                    }}
                    className="card-hover p-3 sm:p-4 text-left border-purple-200 hover:border-purple-300"
                  >
                    <div className="flex items-start gap-2">
                      <Wand2 className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm sm:text-base truncate">{suggestion.text}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{suggestion.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 max-w-3xl w-full px-4 sm:px-0">
                {EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex.name}
                    onClick={() => {
                      setQuery(ex.query);
                      searchMutation.mutate();
                    }}
                    className="card-hover p-3 sm:p-4 text-left"
                  >
                    <p className="font-medium text-slate-900 text-sm sm:text-base">{ex.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{ex.desc}</p>
                    <code className="text-xs text-sky-600 mt-2 block truncate">{ex.query}</code>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {(searchMutation.isPending || aiSearchMutation.isPending) && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className={`w-8 h-8 animate-spin mb-4 ${
              searchMode === 'ai' ? 'text-purple-500' : 'text-sky-500'
            }`} />
            <p className="text-slate-600">
              {searchMode === 'ai' ? 'AI is translating your question...' : 'Searching logs...'}
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Save Search</h3>
                <button onClick={() => setShowSaveModal(false)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Search"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Query
                </label>
                <code className="block p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-mono">
                  {query}
                </code>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowSaveModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!saveName.trim() || saveMutation.isPending}
                className="btn-primary"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Search
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

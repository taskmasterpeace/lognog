import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  Clock,
  X,
  Play,
  RefreshCw,
  Tag,
  Copy,
  Bell,
  LayoutDashboard,
  FileBarChart,
  Edit,
  Database,
  CheckCircle,
  XCircle,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  getSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  runSavedSearch,
  duplicateSavedSearch,
  getSavedSearchTags,
  getDashboards,
  createAlertFromSavedSearch,
  createPanelFromSavedSearch,
  createReportFromSavedSearch,
  SavedSearch,
  SavedSearchFilters,
  SavedSearchCreateRequest,
  SavedSearchUpdateRequest,
  SavedSearchRunResult,
  Dashboard,
} from '../api/client';

const SCHEDULE_OPTIONS = [
  { label: 'No schedule', value: '', desc: 'Run manually only' },
  { label: 'Every 5 minutes', value: '*/5 * * * *', desc: 'Runs every 5 minutes' },
  { label: 'Every 15 minutes', value: '*/15 * * * *', desc: 'Runs every 15 minutes' },
  { label: 'Every hour', value: '0 * * * *', desc: 'Runs at the start of every hour' },
  { label: 'Every 6 hours', value: '0 */6 * * *', desc: 'Runs every 6 hours' },
  { label: 'Daily at midnight', value: '0 0 * * *', desc: 'Runs daily at 00:00' },
];

const TIME_RANGE_OPTIONS = [
  { label: 'Last 5 minutes', value: '-5m' },
  { label: 'Last 15 minutes', value: '-15m' },
  { label: 'Last hour', value: '-1h' },
  { label: 'Last 4 hours', value: '-4h' },
  { label: 'Last 24 hours', value: '-24h' },
  { label: 'Last 7 days', value: '-7d' },
];

const CACHE_TTL_OPTIONS = [
  { label: '5 minutes', value: 300 },
  { label: '15 minutes', value: 900 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '24 hours', value: 86400 },
];

export default function SavedSearchesPage() {
  const [filters, setFilters] = useState<SavedSearchFilters>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showCreateAlertModal, setShowCreateAlertModal] = useState(false);
  const [showAddToDashboardModal, setShowAddToDashboardModal] = useState(false);
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [selectedSearch, setSelectedSearch] = useState<SavedSearch | null>(null);
  const [runResults, setRunResults] = useState<SavedSearchRunResult | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expandedFilters, setExpandedFilters] = useState(false);

  // Form state for create/edit
  const [formData, setFormData] = useState<SavedSearchCreateRequest>({
    name: '',
    query: 'search *',
    description: '',
    time_range: '-24h',
    schedule: '',
    schedule_enabled: false,
    cache_ttl_seconds: 3600,
    is_shared: false,
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  // Alert form state
  const [alertThreshold, setAlertThreshold] = useState(0);
  const [alertSeverity, setAlertSeverity] = useState('medium');

  // Dashboard form state
  const [selectedDashboardId, setSelectedDashboardId] = useState('');
  const [panelVisualization, setPanelVisualization] = useState('table');

  // Report form state
  const [reportSchedule, setReportSchedule] = useState('0 0 * * *');
  const [reportRecipients, setReportRecipients] = useState('');

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Queries
  const { data: searchesData, isLoading, error } = useQuery({
    queryKey: ['savedSearches', filters, searchFilter, selectedTags],
    queryFn: () => getSavedSearches({
      ...filters,
      search: searchFilter || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    }),
  });

  const { data: tagsData } = useQuery({
    queryKey: ['savedSearchTags'],
    queryFn: getSavedSearchTags,
  });

  const { data: dashboards } = useQuery<Dashboard[]>({
    queryKey: ['dashboards'],
    queryFn: () => getDashboards(),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedSearches'] });
      queryClient.invalidateQueries({ queryKey: ['savedSearchTags'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SavedSearchUpdateRequest }) =>
      updateSavedSearch(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedSearches'] });
      queryClient.invalidateQueries({ queryKey: ['savedSearchTags'] });
      setShowEditModal(false);
      setSelectedSearch(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedSearches'] });
    },
  });

  const runMutation = useMutation({
    mutationFn: ({ id, forceRefresh }: { id: string; forceRefresh: boolean }) =>
      runSavedSearch(id, forceRefresh),
    onSuccess: (data) => {
      setRunResults(data);
      setShowResultsModal(true);
      queryClient.invalidateQueries({ queryKey: ['savedSearches'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: duplicateSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedSearches'] });
    },
  });

  const createAlertMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: Parameters<typeof createAlertFromSavedSearch>[1] }) =>
      createAlertFromSavedSearch(id, config),
    onSuccess: () => {
      setShowCreateAlertModal(false);
      setSelectedSearch(null);
      navigate('/alerts');
    },
  });

  const createPanelMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: Parameters<typeof createPanelFromSavedSearch>[1] }) =>
      createPanelFromSavedSearch(id, config),
    onSuccess: (data) => {
      setShowAddToDashboardModal(false);
      setSelectedSearch(null);
      navigate(`/dashboards/${data.dashboard_id}`);
    },
  });

  const createReportMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: Parameters<typeof createReportFromSavedSearch>[1] }) =>
      createReportFromSavedSearch(id, config),
    onSuccess: () => {
      setShowCreateReportModal(false);
      setSelectedSearch(null);
      navigate('/reports');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      query: 'search *',
      description: '',
      time_range: '-24h',
      schedule: '',
      schedule_enabled: false,
      cache_ttl_seconds: 3600,
      is_shared: false,
      tags: [],
    });
    setTagInput('');
  };

  const handleEditClick = (search: SavedSearch) => {
    setSelectedSearch(search);
    setFormData({
      name: search.name,
      query: search.query,
      description: search.description || '',
      time_range: search.time_range,
      schedule: search.schedule || '',
      schedule_enabled: search.schedule_enabled === 1,
      cache_ttl_seconds: search.cache_ttl_seconds,
      is_shared: search.is_shared === 1,
      tags: search.tags || [],
    });
    setShowEditModal(true);
  };

  const handleAddTag = () => {
    if (tagInput && !formData.tags?.includes(tagInput)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(t => t !== tag) || [],
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getScheduleLabel = (cron: string) => {
    const option = SCHEDULE_OPTIONS.find(o => o.value === cron);
    return option?.label || cron;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading saved searches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6">
          <p className="font-semibold text-red-900 dark:text-red-200">Failed to load saved searches</p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">{String(error)}</p>
        </div>
      </div>
    );
  }

  const searches = searchesData?.searches || [];
  const allTags = tagsData?.tags || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Saved Searches</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Save, schedule, and reuse your search queries
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Saved Search
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, query, or description..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilters(f => ({ ...f, owner: f.owner === 'mine' ? undefined : 'mine' }))}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.owner === 'mine'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              My Searches
            </button>
            <button
              onClick={() => setFilters(f => ({ ...f, shared: f.shared ? undefined : true }))}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.shared
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Shared
            </button>
            <button
              onClick={() => setFilters(f => ({ ...f, scheduled: f.scheduled ? undefined : true }))}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.scheduled
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <Clock className="w-3 h-3 inline mr-1" />
              Scheduled
            </button>
          </div>

          {allTags.length > 0 && (
            <button
              onClick={() => setExpandedFilters(!expandedFilters)}
              className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900"
            >
              <Filter className="w-4 h-4" />
              Tags
              {expandedFilters ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Tag filter expansion */}
        {expandedFilters && allTags.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    setSelectedTags(prev =>
                      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                    );
                  }}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Tag className="w-3 h-3 inline mr-1" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search List */}
      {searches.length === 0 ? (
        <div className="card p-12 text-center">
          <Database className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No saved searches yet
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Create your first saved search to store and reuse your queries
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Saved Search
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {searches.map(search => (
            <div
              key={search.id}
              className="card p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                      {search.name}
                    </h3>
                    {search.schedule_enabled === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {getScheduleLabel(search.schedule || '')}
                      </span>
                    )}
                    {search.is_shared === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        Shared
                      </span>
                    )}
                  </div>

                  {search.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                      {search.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded max-w-md truncate">
                      {search.query}
                    </code>
                    <span>Time: {search.time_range}</span>
                    <span>v{search.version}</span>
                    {search.run_count > 0 && (
                      <span>Runs: {search.run_count}</span>
                    )}
                  </div>

                  {/* Tags */}
                  {search.tags && search.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {search.tags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Cache status */}
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    {search.cached_at ? (
                      <span className={`flex items-center gap-1 ${
                        search.is_cache_valid
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-orange-600 dark:text-orange-400'
                      }`}>
                        {search.is_cache_valid ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {search.cached_count} results cached {formatRelativeTime(search.cached_at)}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not yet run</span>
                    )}
                    {search.last_error && (
                      <span className="text-red-600 dark:text-red-400 truncate max-w-xs">
                        Error: {search.last_error}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedSearch(search);
                      runMutation.mutate({ id: search.id, forceRefresh: false });
                    }}
                    disabled={runMutation.isPending}
                    className="btn-secondary text-sm py-1.5"
                    title="Run search"
                  >
                    {runMutation.isPending && selectedSearch?.id === search.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>

                  <div className="relative group">
                    <button className="btn-secondary text-sm py-1.5">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 min-w-[180px] hidden group-hover:block z-10">
                      <button
                        onClick={() => {
                          setSelectedSearch(search);
                          runMutation.mutate({ id: search.id, forceRefresh: true });
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Force Refresh
                      </button>
                      <button
                        onClick={() => handleEditClick(search)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => duplicateMutation.mutate(search.id)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      <hr className="my-1 border-slate-200 dark:border-slate-700" />
                      <button
                        onClick={() => {
                          setSelectedSearch(search);
                          setShowCreateAlertModal(true);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <Bell className="w-4 h-4" />
                        Create Alert
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSearch(search);
                          setShowAddToDashboardModal(true);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        Add to Dashboard
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSearch(search);
                          setShowCreateReportModal(true);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <FileBarChart className="w-4 h-4" />
                        Create Report
                      </button>
                      <hr className="my-1 border-slate-200 dark:border-slate-700" />
                      <button
                        onClick={() => {
                          if (confirm('Delete this saved search?')) {
                            deleteMutation.mutate(search.id);
                          }
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {showEditModal ? 'Edit Saved Search' : 'Create Saved Search'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedSearch(null);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder="My Search"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Query *
                </label>
                <textarea
                  value={formData.query}
                  onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                  className="input w-full font-mono text-sm"
                  rows={3}
                  placeholder="search * | stats count by hostname"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input w-full"
                  rows={2}
                  placeholder="What does this search do?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Default Time Range
                  </label>
                  <select
                    value={formData.time_range}
                    onChange={(e) => setFormData({ ...formData, time_range: e.target.value })}
                    className="input w-full"
                  >
                    {TIME_RANGE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cache TTL
                  </label>
                  <select
                    value={formData.cache_ttl_seconds}
                    onChange={(e) => setFormData({ ...formData, cache_ttl_seconds: Number(e.target.value) })}
                    className="input w-full"
                  >
                    {CACHE_TTL_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Schedule (Optional)
                </label>
                <div className="flex items-center gap-4">
                  <select
                    value={formData.schedule}
                    onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                    className="input flex-1"
                  >
                    {SCHEDULE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.schedule_enabled}
                      onChange={(e) => setFormData({ ...formData, schedule_enabled: e.target.checked })}
                      className="rounded border-slate-300"
                      disabled={!formData.schedule}
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Enabled</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tags
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="input flex-1"
                    placeholder="Add a tag..."
                  />
                  <button onClick={handleAddTag} className="btn-secondary">
                    Add
                  </button>
                </div>
                {formData.tags && formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded-full text-sm bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 flex items-center gap-1"
                      >
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_shared}
                    onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Share with all users
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedSearch(null);
                  resetForm();
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showEditModal && selectedSearch) {
                    updateMutation.mutate({ id: selectedSearch.id, data: formData });
                  } else {
                    createMutation.mutate(formData);
                  }
                }}
                disabled={!formData.name || !formData.query || createMutation.isPending || updateMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : showEditModal ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && runResults && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Search Results
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {runResults.count} results
                  {runResults.cached && ` (cached)`}
                  {runResults.execution_time_ms > 0 && ` in ${runResults.execution_time_ms}ms`}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowResultsModal(false);
                  setRunResults(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {runResults.results.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No results found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        {Object.keys(runResults.results[0]).map(key => (
                          <th
                            key={key}
                            className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {runResults.results.slice(0, 100).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {Object.values(row).map((val, valIdx) => (
                            <td
                              key={valIdx}
                              className="px-4 py-2 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap"
                            >
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {runResults.results.length > 100 && (
                    <p className="text-center text-slate-500 py-4">
                      Showing 100 of {runResults.results.length} results
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowResultsModal(false);
                  setRunResults(null);
                }}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Alert Modal */}
      {showCreateAlertModal && selectedSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Create Alert from Search
              </h2>
              <button
                onClick={() => {
                  setShowCreateAlertModal(false);
                  setSelectedSearch(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Creating alert from: <strong>{selectedSearch.name}</strong>
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Trigger when results
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">greater than</span>
                  <input
                    type="number"
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(Number(e.target.value))}
                    className="input w-24"
                    min={0}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Severity
                </label>
                <select
                  value={alertSeverity}
                  onChange={(e) => setAlertSeverity(e.target.value)}
                  className="input w-full"
                >
                  <option value="info">Info</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowCreateAlertModal(false);
                  setSelectedSearch(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  createAlertMutation.mutate({
                    id: selectedSearch.id,
                    config: {
                      trigger_threshold: alertThreshold,
                      severity: alertSeverity,
                    },
                  });
                }}
                disabled={createAlertMutation.isPending}
                className="btn-primary"
              >
                {createAlertMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Dashboard Modal */}
      {showAddToDashboardModal && selectedSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Add to Dashboard
              </h2>
              <button
                onClick={() => {
                  setShowAddToDashboardModal(false);
                  setSelectedSearch(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Adding: <strong>{selectedSearch.name}</strong>
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Dashboard *
                </label>
                <select
                  value={selectedDashboardId}
                  onChange={(e) => setSelectedDashboardId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select a dashboard...</option>
                  {dashboards?.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Visualization
                </label>
                <select
                  value={panelVisualization}
                  onChange={(e) => setPanelVisualization(e.target.value)}
                  className="input w-full"
                >
                  <option value="table">Table</option>
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="pie">Pie Chart</option>
                  <option value="stat">Single Stat</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowAddToDashboardModal(false);
                  setSelectedSearch(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  createPanelMutation.mutate({
                    id: selectedSearch.id,
                    config: {
                      dashboard_id: selectedDashboardId,
                      visualization: panelVisualization,
                    },
                  });
                }}
                disabled={!selectedDashboardId || createPanelMutation.isPending}
                className="btn-primary"
              >
                {createPanelMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : 'Add Panel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Report Modal */}
      {showCreateReportModal && selectedSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Create Scheduled Report
              </h2>
              <button
                onClick={() => {
                  setShowCreateReportModal(false);
                  setSelectedSearch(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Creating report from: <strong>{selectedSearch.name}</strong>
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Schedule
                </label>
                <select
                  value={reportSchedule}
                  onChange={(e) => setReportSchedule(e.target.value)}
                  className="input w-full"
                >
                  {SCHEDULE_OPTIONS.filter(o => o.value).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Recipients (comma-separated emails)
                </label>
                <input
                  type="text"
                  value={reportRecipients}
                  onChange={(e) => setReportRecipients(e.target.value)}
                  className="input w-full"
                  placeholder="user@example.com, admin@example.com"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowCreateReportModal(false);
                  setSelectedSearch(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  createReportMutation.mutate({
                    id: selectedSearch.id,
                    config: {
                      schedule: reportSchedule,
                      recipients: reportRecipients,
                    },
                  });
                }}
                disabled={!reportSchedule || !reportRecipients || createReportMutation.isPending}
                className="btn-primary"
              >
                {createReportMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : 'Create Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

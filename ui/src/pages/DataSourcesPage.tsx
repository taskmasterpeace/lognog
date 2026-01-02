import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Database,
  Shield,
  Globe,
  Server,
  Code,
  X,
  Copy,
  Check,
  Search,
  Info,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Plus,
  Activity,
  Clock,
  ExternalLink,
  Loader2,
  Settings,
  Lightbulb,
  Terminal,
  Layers,
} from 'lucide-react';
import { getTemplatesByCategory, getTemplateStats, getActiveSources, SourceTemplate } from '../api/client';
import AddDataSourceWizard from '../components/AddDataSourceWizard';

type TabId = 'active' | 'templates' | 'config';

const CATEGORY_ICONS = {
  database: Database,
  security: Shield,
  web: Globe,
  system: Server,
  application: Code,
};

const CATEGORY_COLORS = {
  database: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
  security: 'text-red-500 bg-red-100 dark:bg-red-900/30',
  web: 'text-green-500 bg-green-100 dark:bg-green-900/30',
  system: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
  application: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30',
};

// Helper to get status color based on last_seen time
function getStatusInfo(lastSeen: string): { color: string; label: string; dotClass: string } {
  const now = new Date();
  const last = new Date(lastSeen);
  const diffMinutes = (now.getTime() - last.getTime()) / (1000 * 60);

  if (diffMinutes < 15) {
    return { color: 'text-green-500', label: 'Active', dotClass: 'bg-green-500' };
  } else if (diffMinutes < 60) {
    return { color: 'text-yellow-500', label: 'Recent', dotClass: 'bg-yellow-500' };
  } else if (diffMinutes < 60 * 24) {
    return { color: 'text-orange-500', label: 'Inactive', dotClass: 'bg-orange-500' };
  } else {
    return { color: 'text-slate-400', label: 'Stale', dotClass: 'bg-slate-400' };
  }
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function DataSourcesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get('tab');
    return (tab as TabId) || 'active';
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<SourceTemplate | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [showIndexTip, setShowIndexTip] = useState(() => {
    return localStorage.getItem('lognog_hide_index_tip') !== 'true';
  });

  const dismissIndexTip = (permanent: boolean) => {
    setShowIndexTip(false);
    if (permanent) {
      localStorage.setItem('lognog_hide_index_tip', 'true');
    }
  };

  // Sync tab with URL
  useEffect(() => {
    const tab = searchParams.get('tab') as TabId | null;
    if (tab && ['active', 'templates', 'config'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const { data: templatesByCategory, isLoading } = useQuery({
    queryKey: ['templates', 'by-category'],
    queryFn: getTemplatesByCategory,
  });

  const { data: stats } = useQuery({
    queryKey: ['templates', 'stats'],
    queryFn: getTemplateStats,
  });

  const { data: activeSources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['active-sources'],
    queryFn: getActiveSources,
    refetchInterval: 60000, // Refresh every minute
  });

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const openTemplateSetup = (template: SourceTemplate) => {
    setSelectedTemplate(template);
    setShowSetupModal(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const categories = templatesByCategory
    ? Object.keys(templatesByCategory).filter(
        (cat) => (templatesByCategory as Record<string, SourceTemplate[]>)[cat].length > 0
      )
    : [];

  const allTemplates = templatesByCategory
    ? Object.values(templatesByCategory as Record<string, SourceTemplate[]>).flat()
    : [];

  const filteredTemplates =
    selectedCategory === 'all'
      ? allTemplates
      : (templatesByCategory as Record<string, SourceTemplate[]>)?.[selectedCategory] || [];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Database className="w-7 h-7 text-sky-500" />
                Data Sources
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Monitor active sources and configure new log ingestion
              </p>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium shadow-sm transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Data Source
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 -mb-px">
            <button
              onClick={() => handleTabChange('active')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'active'
                  ? 'bg-slate-50 dark:bg-slate-900 text-sky-600 dark:text-sky-400 border-sky-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              Active Sources
              {activeSources && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === 'active'
                    ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                }`}>
                  {activeSources.sources.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('templates')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'templates'
                  ? 'bg-slate-50 dark:bg-slate-900 text-sky-600 dark:text-sky-400 border-sky-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Database className="w-4 h-4" />
              Source Templates
              {stats && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === 'templates'
                    ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                }`}>
                  {stats.total}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('config')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'config'
                  ? 'bg-slate-50 dark:bg-slate-900 text-sky-600 dark:text-sky-400 border-sky-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Settings className="w-4 h-4" />
              Source Config
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Active Sources Tab */}
        {activeTab === 'active' && (
          <div>
            {/* Index Management Tip Banner */}
            {showIndexTip && (
              <div className="mb-6 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-sky-100 dark:bg-sky-800 rounded-lg">
                    <Lightbulb className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sky-900 dark:text-sky-100 mb-1">
                      Organize your logs with indexes
                    </h3>
                    <p className="text-sm text-sky-700 dark:text-sky-300 mb-3">
                      Logs are grouped into indexes (like folders). When sending logs via HTTP API, use the{' '}
                      <code className="px-1.5 py-0.5 bg-sky-100 dark:bg-sky-800 rounded font-mono text-xs">X-Index</code>{' '}
                      header to specify a custom index name. You can also normalize field names across sources using{' '}
                      <Link to="/data-models" className="underline hover:text-sky-900 dark:hover:text-sky-100">
                        Data Models (CIM)
                      </Link>.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs bg-slate-800 text-slate-100 px-3 py-1.5 rounded font-mono">
                        curl -H "X-Index: my-app" -H "X-API-Key: ..." /api/ingest/http
                      </code>
                      <Link
                        to="/docs"
                        className="text-sm text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                      >
                        Learn more <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => dismissIndexTip(false)}
                      className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-800 rounded text-sky-600 dark:text-sky-400"
                      title="Dismiss for now"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => dismissIndexTip(true)}
                      className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-800 rounded text-sky-600 dark:text-sky-400 text-xs"
                      title="Don't show again"
                    >
                      <span className="sr-only">Don't show again</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Index Summary Cards */}
            {activeSources && activeSources.by_index.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                {activeSources.by_index.map((idx) => (
                  <button
                    key={idx.index_name}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(`search index=${idx.index_name}`)}`)}
                    className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-600 transition-colors flex items-center gap-3"
                  >
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {idx.index_name || 'main'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {idx.count.toLocaleString()} logs
                    </div>
                    <div className="text-xs text-slate-400">
                      {idx.sources} sources
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Active Sources Table */}
            {sourcesLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
              </div>
            ) : activeSources && activeSources.sources.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Source
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Index
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Protocol
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Logs (7d)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Errors
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Last Seen
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {activeSources.sources.map((source, idx) => {
                      const status = getStatusInfo(source.last_seen);
                      return (
                        <tr
                          key={`${source.app_name}-${source.index_name}-${idx}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${status.dotClass}`} />
                              <span className={`text-xs font-medium ${status.color}`}>
                                {status.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {source.app_name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {source.hostname}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                              {source.index_name || 'main'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {source.protocol || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {source.log_count.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {source.error_count > 0 ? (
                              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                {source.error_count.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1 text-sm text-slate-500 dark:text-slate-400">
                              <Clock className="w-3 h-3" />
                              {formatRelativeTime(source.last_seen)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                navigate(
                                  `/search?q=${encodeURIComponent(
                                    `search index=${source.index_name || 'main'} app_name="${source.app_name}"`
                                  )}`
                                )
                              }
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-600 rounded transition-colors"
                              title="View logs"
                            >
                              <ExternalLink className="w-4 h-4 text-slate-400 hover:text-sky-500" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 text-center">
                  <Activity className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    No log sources detected yet
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Here are 3 ways to start sending logs to LogNog
                  </p>
                </div>

                {/* Getting Started Options */}
                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
                  {/* Option 1: Syslog */}
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <Server className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">Syslog</h4>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      Point any syslog-compatible device to LogNog.
                    </p>
                    <code className="block text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 p-2 rounded font-mono mb-2">
                      Port: UDP/TCP 514
                    </code>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Logs go to index: <strong>main</strong>
                    </p>
                  </div>

                  {/* Option 2: HTTP API */}
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                        <Terminal className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">HTTP API</h4>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      Send JSON logs with custom index names.
                    </p>
                    <code className="block text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 p-2 rounded font-mono mb-2 break-all">
                      POST /api/ingest/http
                      <br />
                      X-Index: my-app
                    </code>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Set index via <strong>X-Index</strong> header
                    </p>
                  </div>

                  {/* Option 3: Agent */}
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">LogNog In Agent</h4>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      Install on Windows/Linux to collect logs and events.
                    </p>
                    <code className="block text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 p-2 rounded font-mono mb-2">
                      LogNogIn.exe init
                    </code>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Logs go to index: <strong>agent</strong>
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Need help? Check out our{' '}
                    <Link to="/docs" className="text-sky-600 dark:text-sky-400 hover:underline">
                      documentation
                    </Link>{' '}
                    or ask{' '}
                    <span className="text-sky-600 dark:text-sky-400">NogChat</span> (bottom right).
                  </p>
                  <button
                    onClick={() => handleTabChange('templates')}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    Browse Templates
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div>
            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Total Templates</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Built-in</div>
                  <div className="text-2xl font-bold text-sky-500 mt-1">{stats.built_in}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Custom</div>
                  <div className="text-2xl font-bold text-purple-500 mt-1">{stats.custom}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Categories</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {Object.keys(stats.by_category).filter((k) => stats.by_category[k] > 0).length}
                  </div>
                </div>
              </div>
            )}

            {/* Category Filter */}
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-sky-500 text-white'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                All Templates ({allTemplates.length})
              </button>
              {categories.map((category) => {
                const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];
                const count = (templatesByCategory as Record<string, SourceTemplate[]>)[category]?.length || 0;
                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      selectedCategory === category
                        ? 'bg-sky-500 text-white'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {category.charAt(0).toUpperCase() + category.slice(1)} ({count})
                  </button>
                );
              })}
            </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => {
                const Icon = CATEGORY_ICONS[template.category];
                const colorClass = CATEGORY_COLORS[template.category];

                return (
                  <div
                    key={template.id}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => openTemplateSetup(template)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${colorClass}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      {template.built_in ? (
                        <span className="px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                          Built-in
                        </span>
                      ) : null}
                    </div>

                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{template.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{template.description}</p>

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded capitalize">{template.category}</span>
                      {template.field_extractions && template.field_extractions.length > 0 && (
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                          {template.field_extractions.length} fields
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                  No templates found
                </h3>
                <p className="text-slate-500 dark:text-slate-400">
                  Try selecting a different category or browse all templates
                </p>
              </div>
            )}
          </div>
        )}

        {/* Source Config Tab (Placeholder) */}
        {activeTab === 'config' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
            <Settings className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Source Configuration
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
              Create custom source definitions, configure index routing, set app_name overrides, and manage field extractions per source.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4" />
              Coming soon
            </div>
          </div>
        )}
      </div>

      {/* Setup Modal */}
      {showSetupModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = CATEGORY_ICONS[selectedTemplate.category];
                  const colorClass = CATEGORY_COLORS[selectedTemplate.category];
                  return (
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  );
                })()}
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedTemplate.description}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSetupModal(false);
                  setSelectedTemplate(null);
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Setup Instructions */}
              {selectedTemplate.setup_instructions && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Info className="w-5 h-5 text-sky-500" />
                    Setup Instructions
                  </div>
                  <div className="prose dark:prose-invert max-w-none bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                    <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {selectedTemplate.setup_instructions}
                    </pre>
                  </div>
                </div>
              )}

              {/* Agent Configuration Example */}
              {selectedTemplate.agent_config_example && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      <FileCode className="w-5 h-5 text-purple-500" />
                      LogNog In Agent Configuration
                    </div>
                    <button
                      onClick={() => handleCopy(selectedTemplate.agent_config_example!, 'agent')}
                      className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded flex items-center gap-2"
                    >
                      {copiedSection === 'agent' ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-slate-100 font-mono">{selectedTemplate.agent_config_example}</pre>
                  </div>
                </div>
              )}

              {/* Syslog Configuration Example */}
              {selectedTemplate.syslog_config_example && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      <Server className="w-5 h-5 text-green-500" />
                      Syslog Configuration
                    </div>
                    <button
                      onClick={() => handleCopy(selectedTemplate.syslog_config_example!, 'syslog')}
                      className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded flex items-center gap-2"
                    >
                      {copiedSection === 'syslog' ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-slate-100 font-mono">{selectedTemplate.syslog_config_example}</pre>
                  </div>
                </div>
              )}

              {/* Field Extractions */}
              {selectedTemplate.field_extractions && selectedTemplate.field_extractions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Database className="w-5 h-5 text-blue-500" />
                    Field Extractions ({selectedTemplate.field_extractions.length})
                  </div>
                  <div className="space-y-2">
                    {selectedTemplate.field_extractions.map((extraction, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {extraction.field_name}
                            </code>
                            {extraction.required && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                                Required
                              </span>
                            )}
                            <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                              {extraction.pattern_type}
                            </span>
                          </div>
                        </div>
                        {extraction.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{extraction.description}</p>
                        )}
                        <code className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded">
                          {extraction.pattern}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Log */}
              {selectedTemplate.sample_log && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <FileCode className="w-5 h-5 text-orange-500" />
                    Sample Log Line
                  </div>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                      {selectedTemplate.sample_log}
                    </pre>
                  </div>
                </div>
              )}

              {/* Sample Query */}
              {selectedTemplate.sample_query && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Search className="w-5 h-5 text-sky-500" />
                    Example Query
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-4">
                    <code className="text-sm font-mono text-sky-900 dark:text-sky-100">
                      {selectedTemplate.sample_query}
                    </code>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                {selectedTemplate.built_in ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    This is a built-in template
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    Custom template
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setShowSetupModal(false);
                  setSelectedTemplate(null);
                }}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Data Source Wizard */}
      <AddDataSourceWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={() => {
          // Optionally refresh or show a success message
        }}
      />
    </div>
  );
}

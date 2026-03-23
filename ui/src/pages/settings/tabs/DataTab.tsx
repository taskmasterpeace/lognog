import { useState, useEffect } from 'react';
import { authFetch } from '../../../contexts/AuthContext';
import { Database, Check, AlertCircle, Loader2, Zap, Trash2, Download, RefreshCw } from 'lucide-react';

const DataTab = () => {
  // Demo data generation
  const [generatingData, setGeneratingData] = useState(false);
  const [demoDataCount, setDemoDataCount] = useState('500');
  const [demoDataTimeRange, setDemoDataTimeRange] = useState('-1h');
  const [demoDataTypes, setDemoDataTypes] = useState<string[]>(['syslog', 'nginx', 'auth', 'app', 'firewall', 'database']);
  const [demoDataResult, setDemoDataResult] = useState<string | null>(null);

  // Demo data stats
  const [demoStats, setDemoStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Clear data
  const [clearingData, setClearingData] = useState(false);
  const [clearDataResult, setClearDataResult] = useState<string | null>(null);

  // Export data
  const [exportingData, setExportingData] = useState(false);

  // Error
  const [error, setError] = useState<string | null>(null);

  // Log management (delete by criteria)
  const [logStats, setLogStats] = useState<Array<{
    index_name: string;
    app_name: string;
    count: number;
    oldest: string;
    newest: string;
  }>>([]);
  const [logStatsLoading, setLogStatsLoading] = useState(false);
  const [deleteFilter, setDeleteFilter] = useState<{
    index_name: string;
    app_name: string;
    app_scope: string;
    older_than_days: string;
  }>({ index_name: '', app_name: '', app_scope: '', older_than_days: '' });
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadDemoStats();
    loadLogStats();
  }, []);

  const loadDemoStats = async () => {
    setLoadingStats(true);
    try {
      const response = await authFetch('/demo/stats');
      const data = await response.json();
      if (response.ok) {
        setDemoStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load demo stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleGenerateDemoData = async () => {
    setGeneratingData(true);
    setDemoDataResult(null);
    setClearDataResult(null);
    setError(null);

    try {
      const response = await authFetch('/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: parseInt(demoDataCount) || 500,
          timeRange: {
            start: demoDataTimeRange,
            end: 'now',
          },
          types: demoDataTypes,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setDemoDataResult(`Successfully generated ${data.generated} log entries!`);
        loadDemoStats(); // Refresh stats
      } else {
        setError(data.error || 'Failed to generate demo data');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setGeneratingData(false);
    }
  };

  const handleClearDemoData = async () => {
    if (!confirm('Are you sure you want to clear ALL log data? This action cannot be undone.')) {
      return;
    }

    setClearingData(true);
    setDemoDataResult(null);
    setClearDataResult(null);
    setError(null);

    try {
      const response = await authFetch('/demo/clear?confirm=yes', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setClearDataResult('Successfully cleared all log data');
        loadDemoStats(); // Refresh stats
      } else {
        setError(data.error || 'Failed to clear data');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setClearingData(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    setError(null);

    try {
      const response = await authFetch('/demo/export?limit=1000&earliest=-24h&latest=now');

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lognog-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to export data');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setExportingData(false);
    }
  };

  const toggleDemoType = (type: string) => {
    setDemoDataTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const loadLogStats = async () => {
    setLogStatsLoading(true);
    try {
      const response = await authFetch('/settings/logs/stats');
      if (response.ok) {
        const data = await response.json();
        setLogStats(data.stats || []);
      }
    } catch (err) {
      console.error('Failed to load log stats:', err);
    } finally {
      setLogStatsLoading(false);
    }
  };

  const handleDeleteLogs = async () => {
    // Validate at least one filter is set
    const hasFilter = deleteFilter.index_name || deleteFilter.app_name ||
                      deleteFilter.app_scope || deleteFilter.older_than_days;
    if (!hasFilter) {
      setDeleteResult({ success: false, message: 'Please specify at least one filter' });
      return;
    }

    // Confirm deletion
    const filterDesc = Object.entries(deleteFilter)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}="${v}"`)
      .join(', ');
    if (!confirm(`Delete logs matching: ${filterDesc}?\n\nThis cannot be undone.`)) {
      return;
    }

    setDeletingLogs(true);
    setDeleteResult(null);
    try {
      const response = await authFetch('/settings/logs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deleteFilter),
      });
      const data = await response.json();
      if (response.ok) {
        setDeleteResult({ success: true, message: data.message + (data.note ? ` (${data.note})` : '') });
        // Refresh stats
        setTimeout(() => {
          loadLogStats();
          loadDemoStats();
        }, 1000);
      } else {
        setDeleteResult({ success: false, message: data.error || 'Delete failed' });
      }
    } catch (err) {
      setDeleteResult({ success: false, message: 'Network error' });
    } finally {
      setDeletingLogs(false);
    }
  };

  const handleQuickDelete = (index_name: string, app_name: string) => {
    setDeleteFilter({ index_name, app_name, app_scope: '', older_than_days: '' });
  };

  return (
    <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
        <Database className="w-5 h-5" />
        Data Management
      </h2>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Generate realistic test data for demos, screenshots, and testing. Export and import log data as JSON.
      </p>

      {/* Success/Error messages */}
      {demoDataResult && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2 text-green-700 dark:text-green-300 text-sm">
          <Check className="w-4 h-4" />
          {demoDataResult}
        </div>
      )}
      {clearDataResult && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
          <Check className="w-4 h-4" />
          {clearDataResult}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Current Stats */}
      {demoStats && (
        <div className="mb-6 p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Current Database Stats
            </h3>
            <button
              onClick={loadDemoStats}
              disabled={loadingStats}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              title="Refresh stats"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Total Logs:</span>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {demoStats.total.toLocaleString()}
              </div>
            </div>
            {demoStats.oldest && (
              <div>
                <span className="text-slate-500 dark:text-slate-400">Time Range:</span>
                <div className="font-mono text-xs text-slate-900 dark:text-slate-100">
                  {new Date(demoStats.oldest).toLocaleDateString()} - {new Date(demoStats.newest).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate Demo Data */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Generate Demo Data
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Number of Logs
              </label>
              <input
                type="number"
                value={demoDataCount}
                onChange={(e) => setDemoDataCount(e.target.value)}
                min="10"
                max="10000"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Time Range
              </label>
              <select
                value={demoDataTimeRange}
                onChange={(e) => setDemoDataTimeRange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
              >
                <option value="-1h">Last Hour</option>
                <option value="-6h">Last 6 Hours</option>
                <option value="-24h">Last 24 Hours</option>
                <option value="-7d">Last Week</option>
                <option value="-30d">Last Month</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Log Types
            </label>
            <div className="flex flex-wrap gap-2">
              {['syslog', 'nginx', 'auth', 'app', 'firewall', 'database'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleDemoType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    demoDataTypes.includes(type)
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-nog-100 text-slate-600 dark:bg-nog-700 dark:text-slate-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerateDemoData}
            disabled={generatingData || demoDataTypes.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {generatingData ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Generate Demo Data
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Generates realistic logs from various sources including web servers, databases, firewalls, and more.
          Includes security events, errors, warnings, and info messages distributed across your selected time range.
        </p>
      </div>

      {/* Export/Import Controls */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Data Export & Clear
        </h3>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportData}
            disabled={exportingData}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {exportingData ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Data (JSON)
              </>
            )}
          </button>

          <button
            onClick={handleClearDemoData}
            disabled={clearingData}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {clearingData ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Clear All Data
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Export downloads the last 24 hours of data (max 1000 logs) as JSON. Clear removes all logs from the database (requires confirmation).
        </p>
      </div>

      {/* Log Management - Delete by Criteria */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Delete Logs by Criteria
          </h3>
          <button
            onClick={loadLogStats}
            disabled={logStatsLoading}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="Refresh stats"
          >
            <RefreshCw className={`w-4 h-4 ${logStatsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Delete result message */}
        {deleteResult && (
          <div className={`mb-4 p-3 rounded-lg border flex items-center gap-2 text-sm ${
            deleteResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            {deleteResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {deleteResult.message}
          </div>
        )}

        {/* Log stats table */}
        {logStats.length > 0 && (
          <div className="mb-4 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-nog-50 dark:bg-nog-900/50 sticky top-0">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-3 py-2">Index</th>
                  <th className="px-3 py-2">App</th>
                  <th className="px-3 py-2 text-right">Count</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {logStats.map((stat, idx) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100">
                      {stat.index_name || '(default)'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {stat.app_name || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {stat.count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleQuickDelete(stat.index_name, stat.app_name)}
                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        title="Select for deletion"
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delete filters */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Index Name
            </label>
            <input
              type="text"
              value={deleteFilter.index_name}
              onChange={(e) => setDeleteFilter(f => ({ ...f, index_name: e.target.value }))}
              placeholder="e.g., lognog-internal"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              App Name
            </label>
            <input
              type="text"
              value={deleteFilter.app_name}
              onChange={(e) => setDeleteFilter(f => ({ ...f, app_name: e.target.value }))}
              placeholder="e.g., lognog-internal"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              App Scope
            </label>
            <input
              type="text"
              value={deleteFilter.app_scope}
              onChange={(e) => setDeleteFilter(f => ({ ...f, app_scope: e.target.value }))}
              placeholder="e.g., lognog"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Older Than (days)
            </label>
            <input
              type="number"
              value={deleteFilter.older_than_days}
              onChange={(e) => setDeleteFilter(f => ({ ...f, older_than_days: e.target.value }))}
              placeholder="e.g., 7"
              min="1"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <button
          onClick={handleDeleteLogs}
          disabled={deletingLogs || (!deleteFilter.index_name && !deleteFilter.app_name && !deleteFilter.app_scope && !deleteFilter.older_than_days)}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {deletingLogs ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Delete Matching Logs
            </>
          )}
        </button>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Delete logs by index, app name, app scope, or age. At least one filter is required.
          In ClickHouse, deletions are async and may take a moment to complete.
        </p>
      </div>
    </section>
  );
};

export default DataTab;

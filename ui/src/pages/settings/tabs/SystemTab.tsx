import { useState, useEffect } from 'react';
import { authFetch } from '../../../contexts/AuthContext';
import {
  Cpu,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { InfoTip } from '../../../components/ui/InfoTip';

export default function SystemTab() {
  const [systemStats, setSystemStats] = useState<any>(null);
  const [systemLoading, setSystemLoading] = useState(false);

  const [internalLogging, setInternalLogging] = useState<{
    enabled: boolean;
    level: string;
    categories: string[];
    available_levels: string[];
    available_categories: string[];
  } | null>(null);
  const [internalLoggingLoading, setInternalLoggingLoading] = useState(false);
  const [internalLoggingSaving, setInternalLoggingSaving] = useState(false);

  useEffect(() => {
    loadSystemStats();
    loadInternalLogging();
  }, []);

  const loadSystemStats = async () => {
    setSystemLoading(true);
    try {
      const response = await authFetch('/settings/system/stats');
      if (response.ok) {
        setSystemStats(await response.json());
      }
    } catch (err) {
      console.error('Failed to load system stats:', err);
    } finally {
      setSystemLoading(false);
    }
  };

  const loadInternalLogging = async () => {
    setInternalLoggingLoading(true);
    try {
      const response = await authFetch('/settings/internal-logging');
      if (response.ok) {
        setInternalLogging(await response.json());
      }
    } catch (err) {
      console.error('Failed to load internal logging settings:', err);
    } finally {
      setInternalLoggingLoading(false);
    }
  };

  const saveInternalLogging = async (updates: { enabled?: boolean; level?: string; categories?: string[] }) => {
    setInternalLoggingSaving(true);
    try {
      const response = await authFetch('/settings/internal-logging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        await loadInternalLogging(); // Reload to get updated state
      }
    } catch (err) {
      console.error('Failed to save internal logging settings:', err);
    } finally {
      setInternalLoggingSaving(false);
    }
  };

  return (
    <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          System Information
        </h2>
        <button
          onClick={loadSystemStats}
          disabled={systemLoading}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh stats"
        >
          <RefreshCw className={`w-4 h-4 ${systemLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {systemLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : systemStats ? (
        <div className="space-y-6">
          {/* System Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg">
              <span className="text-sm text-slate-500 dark:text-slate-400">API Version</span>
              <div className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {systemStats.api_version}
              </div>
            </div>
            <div className="p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg">
              <span className="text-sm text-slate-500 dark:text-slate-400">Node.js Version</span>
              <div className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                {systemStats.node_version}
              </div>
            </div>
            <div className="p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg">
              <span className="text-sm text-slate-500 dark:text-slate-400">Uptime</span>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {Math.floor(systemStats.uptime_seconds / 3600)}h {Math.floor((systemStats.uptime_seconds % 3600) / 60)}m
              </div>
            </div>
            <div className="p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg">
              <span className="text-sm text-slate-500 dark:text-slate-400">Memory Usage</span>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {systemStats.memory_usage_mb} MB
              </div>
            </div>
          </div>

          {/* Configuration Info */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Configuration
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">Data Retention</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">90 days</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">Rate Limit</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">1000 req/min</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-600 dark:text-slate-400">Max Batch Size</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">10,000 logs</span>
              </div>
            </div>
          </div>

          {/* Internal Logging Settings */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              Internal Logging
              <InfoTip content="LogNog can log its own operational events for self-monitoring. These logs appear under index 'lognog-internal'." />
            </h3>

            {internalLoggingLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : internalLogging ? (
              <div className="space-y-4">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-slate-700 dark:text-slate-300">Self-Monitoring</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Log LogNog's own events to the database
                    </p>
                  </div>
                  <button
                    onClick={() => saveInternalLogging({ enabled: !internalLogging.enabled })}
                    disabled={internalLoggingSaving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      internalLogging.enabled
                        ? 'bg-amber-500'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        internalLogging.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {internalLogging.enabled && (
                  <>
                    {/* Log Level */}
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-slate-700 dark:text-slate-300">Minimum Level</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Only log events at this severity or higher
                        </p>
                      </div>
                      <select
                        value={internalLogging.level}
                        onChange={(e) => saveInternalLogging({ level: e.target.value })}
                        disabled={internalLoggingSaving}
                        className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100 text-sm"
                      >
                        {internalLogging.available_levels.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Categories */}
                    <div className="py-2">
                      <div className="mb-2">
                        <span className="text-slate-700 dark:text-slate-300">Categories</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Which event types to log
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {internalLogging.available_categories.map((cat) => {
                          const isSelected = internalLogging.categories.includes(cat);
                          return (
                            <button
                              key={cat}
                              onClick={() => {
                                const newCategories = isSelected
                                  ? internalLogging.categories.filter((c) => c !== cat)
                                  : [...internalLogging.categories, cat];
                                saveInternalLogging({ categories: newCategories });
                              }}
                              disabled={internalLoggingSaving}
                              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                isSelected
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:border-amber-300 dark:hover:border-amber-700'
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {internalLoggingSaving && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Failed to load internal logging settings
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          Failed to load system information
        </div>
      )}
    </section>
  );
}

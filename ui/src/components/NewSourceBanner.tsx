import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Database, X, ExternalLink, ChevronRight } from 'lucide-react';
import { getActiveSources } from '../api/client';

interface NewSourceInfo {
  index_name: string;
  count: number;
}

const STORAGE_KEY = 'lognog_known_indexes';
const DISMISSED_KEY = 'lognog_new_source_dismissed';

export default function NewSourceBanner() {
  const [newSources, setNewSources] = useState<NewSourceInfo[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if dismissed this session
    if (sessionStorage.getItem(DISMISSED_KEY) === 'true') {
      setDismissed(true);
      setLoading(false);
      return;
    }

    const checkForNewSources = async () => {
      try {
        const data = await getActiveSources();
        const currentIndexes = data.by_index.map((idx) => idx.index_name || 'main');

        // Get known indexes from localStorage
        const knownIndexesStr = localStorage.getItem(STORAGE_KEY);
        const knownIndexes: string[] = knownIndexesStr ? JSON.parse(knownIndexesStr) : [];

        // Find new indexes
        const newIndexes = data.by_index.filter(
          (idx) => !knownIndexes.includes(idx.index_name || 'main')
        );

        if (newIndexes.length > 0) {
          setNewSources(
            newIndexes.map((idx) => ({
              index_name: idx.index_name || 'main',
              count: idx.count,
            }))
          );
        }

        // If this is the first time (no known indexes), save current ones without showing banner
        if (knownIndexes.length === 0 && currentIndexes.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(currentIndexes));
          setNewSources([]); // Don't show banner on first load
        }
      } catch (error) {
        console.error('Failed to check for new sources:', error);
      } finally {
        setLoading(false);
      }
    };

    checkForNewSources();
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  };

  const handleDontShowAgain = () => {
    // Add all current new sources to known indexes
    const knownIndexesStr = localStorage.getItem(STORAGE_KEY);
    const knownIndexes: string[] = knownIndexesStr ? JSON.parse(knownIndexesStr) : [];
    const updatedKnown = [...new Set([...knownIndexes, ...newSources.map((s) => s.index_name)])];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedKnown));
    setDismissed(true);
  };

  // Don't render if loading, dismissed, or no new sources
  if (loading || dismissed || newSources.length === 0) {
    return null;
  }

  const totalLogs = newSources.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
            <Database className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="font-medium text-amber-900 dark:text-amber-100">
              New logs detected!
            </div>
            <div className="text-sm text-amber-700 dark:text-amber-300">
              {newSources.length === 1 ? (
                <>
                  Index <strong>"{newSources[0].index_name}"</strong> has{' '}
                  {newSources[0].count.toLocaleString()} logs
                </>
              ) : (
                <>
                  {newSources.length} new indexes with {totalLogs.toLocaleString()} total logs
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/data-sources"
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View in Data Sources
            <ChevronRight className="w-4 h-4" />
          </Link>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-800 rounded text-amber-600 dark:text-amber-400"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded details for multiple sources */}
      {newSources.length > 1 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {newSources.map((source) => (
              <Link
                key={source.index_name}
                to={`/search?q=${encodeURIComponent(`search index=${source.index_name}`)}`}
                className="px-3 py-1.5 bg-white dark:bg-nog-800 border border-amber-200 dark:border-amber-700 rounded-lg text-sm hover:border-amber-400 dark:hover:border-amber-500 transition-colors flex items-center gap-2"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {source.index_name}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {source.count.toLocaleString()} logs
                </span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Footer with don't show again option */}
      <div className="px-4 py-2 bg-amber-100/50 dark:bg-amber-900/30 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Configure index routing and field normalization in{' '}
          <Link to="/data-sources" className="underline hover:text-amber-900 dark:hover:text-amber-100">
            Data Sources
          </Link>
        </p>
        <button
          onClick={handleDontShowAgain}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
        >
          Don't show for these indexes
        </button>
      </div>
    </div>
  );
}

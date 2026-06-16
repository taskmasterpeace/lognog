import { useState, useMemo } from 'react';
import { X, Search, Pin, Database, Sparkles } from 'lucide-react';
import { DiscoveredField } from '../api/client';

interface FieldBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedFields: string[];
  discoveredFields: DiscoveredField[];
  onPinToggle: (field: string, shouldPin: boolean) => void;
  isAuthenticated: boolean;
}

type FieldFilter = 'all' | 'core' | 'discovered' | 'pinned';

// Core fields that always exist
const coreFieldsList: DiscoveredField[] = [
  { name: 'timestamp', type: 'datetime', source: 'core' },
  { name: 'hostname', type: 'string', source: 'core' },
  { name: 'app_name', type: 'string', source: 'core' },
  { name: 'severity', type: 'number', source: 'core' },
  { name: 'message', type: 'string', source: 'core' },
  { name: 'index_name', type: 'string', source: 'core' },
  { name: 'facility', type: 'number', source: 'core' },
  { name: 'source_ip', type: 'string', source: 'core' },
  { name: 'protocol', type: 'string', source: 'core' },
];

export default function FieldBrowserModal({
  isOpen,
  onClose,
  pinnedFields,
  discoveredFields,
  onPinToggle,
  isAuthenticated,
}: FieldBrowserModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FieldFilter>('all');

  // Combine and filter fields
  const allFields = useMemo(() => {
    const fields: (DiscoveredField & { isPinned: boolean })[] = [];

    // Add core fields
    coreFieldsList.forEach((f) => {
      fields.push({ ...f, isPinned: pinnedFields.includes(f.name) });
    });

    // Add discovered fields (avoiding duplicates)
    discoveredFields.forEach((f) => {
      if (!coreFieldsList.some((cf) => cf.name === f.name)) {
        fields.push({ ...f, isPinned: pinnedFields.includes(f.name) });
      }
    });

    return fields;
  }, [pinnedFields, discoveredFields]);

  // Apply filters
  const filteredFields = useMemo(() => {
    let fields = allFields;

    // Apply type filter
    switch (filter) {
      case 'core':
        fields = fields.filter((f) => f.source === 'core');
        break;
      case 'discovered':
        fields = fields.filter((f) => f.source === 'discovered');
        break;
      case 'pinned':
        fields = fields.filter((f) => f.isPinned);
        break;
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      fields = fields.filter((f) => f.name.toLowerCase().includes(query));
    }

    // Sort: pinned first, then alphabetically
    return fields.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [allFields, filter, searchQuery]);

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'string':
        return 'bg-honey-100 text-honey-700 dark:bg-honey-900/30 dark:text-honey-400';
      case 'number':
        return 'bg-honey-100 text-honey-700 dark:bg-honey-900/30 dark:text-honey-400';
      case 'datetime':
        return 'bg-honey-100 text-honey-700 dark:bg-honey-900/30 dark:text-honey-400';
      case 'boolean':
        return 'bg-honey-100 text-honey-700 dark:bg-honey-900/30 dark:text-honey-400';
      default:
        return 'bg-nog-100 text-nog-700 dark:bg-nog-800 dark:text-nog-400';
    }
  };

  const getSourceIcon = (source: 'core' | 'discovered') => {
    if (source === 'core') {
      return <Database className="w-4 h-4 text-nog-400" />;
    }
    return <Sparkles className="w-4 h-4 text-honey-400" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white dark:bg-nog-800 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-nog-200 dark:border-nog-700">
            <h2 className="text-lg font-semibold text-nog-900 dark:text-nog-100">
              Field Browser
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-nog-100 dark:hover:bg-nog-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-nog-500" />
            </button>
          </div>

          {/* Search and Filters */}
          <div className="px-6 py-4 border-b border-nog-200 dark:border-nog-700 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-nog-400" />
              <input
                type="text"
                placeholder="Search fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-nog-100 dark:bg-nog-900 border-0 rounded-lg text-sm text-nog-900 dark:text-nog-100 placeholder-nog-400 focus:ring-2 focus:ring-honey-500"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              {(['all', 'core', 'discovered', 'pinned'] as FieldFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    filter === f
                      ? 'bg-honey-100 text-honey-700 dark:bg-honey-900/30 dark:text-honey-400'
                      : 'text-nog-600 dark:text-nog-400 hover:bg-nog-100 dark:hover:bg-nog-700'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Field List */}
          <div className="max-h-[400px] overflow-y-auto">
            {filteredFields.length === 0 ? (
              <div className="px-6 py-12 text-center text-nog-500 dark:text-nog-400">
                No fields match your search
              </div>
            ) : (
              <div className="divide-y divide-nog-100 dark:divide-nog-700">
                {filteredFields.map((field) => (
                  <div
                    key={field.name}
                    className="flex items-center justify-between px-6 py-3 hover:bg-nog-50 dark:hover:bg-nog-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Pin indicator */}
                      {field.isPinned && (
                        <Pin className="w-4 h-4 text-honey-500 fill-honey-500 flex-shrink-0" />
                      )}

                      {/* Source icon */}
                      <div className="flex-shrink-0">{getSourceIcon(field.source)}</div>

                      {/* Field name */}
                      <span className="text-sm font-medium text-nog-900 dark:text-nog-100">
                        {field.name}
                      </span>

                      {/* Type badge */}
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${getTypeColor(
                          field.type
                        )}`}
                      >
                        {field.type}
                      </span>

                      {/* Occurrences */}
                      {field.occurrences !== undefined && (
                        <span className="text-xs text-nog-500 dark:text-nog-400">
                          {field.occurrences.toLocaleString()} occurrences
                        </span>
                      )}
                    </div>

                    {/* Pin/Unpin button */}
                    {isAuthenticated && (
                      <button
                        onClick={() => onPinToggle(field.name, !field.isPinned)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          field.isPinned
                            ? 'bg-honey-100 text-honey-700 hover:bg-honey-200 dark:bg-honey-900/30 dark:text-honey-400 dark:hover:bg-honey-900/50'
                            : 'bg-nog-100 text-nog-600 hover:bg-nog-200 dark:bg-nog-700 dark:text-nog-300 dark:hover:bg-nog-600'
                        }`}
                      >
                        {field.isPinned ? 'Unpin' : 'Pin'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-nog-200 dark:border-nog-700 bg-nog-50 dark:bg-nog-900 rounded-b-xl">
            <span className="text-sm text-nog-500 dark:text-nog-400">
              Showing {filteredFields.length} of {allFields.length} fields
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-nog-900 bg-honey-600 hover:bg-honey-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>

          {/* Auth notice */}
          {!isAuthenticated && (
            <div className="absolute bottom-16 left-6 right-6 px-4 py-3 bg-honey-50 dark:bg-honey-900/20 border border-honey-200 dark:border-honey-800 rounded-lg">
              <p className="text-sm text-honey-700 dark:text-honey-400">
                Log in to save your pinned field preferences
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

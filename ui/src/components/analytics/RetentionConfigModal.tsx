import { useState } from 'react';
import { X, Clock, AlertTriangle, Loader2 } from 'lucide-react';

interface RetentionConfigModalProps {
  indexName: string;
  currentRetention: number;
  onSave: (days: number) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function RetentionConfigModal({
  indexName,
  currentRetention,
  onSave,
  onClose,
  isLoading = false,
}: RetentionConfigModalProps) {
  const [retentionDays, setRetentionDays] = useState(currentRetention);

  const presets = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '60 days', value: 60 },
    { label: '90 days', value: 90 },
    { label: '180 days', value: 180 },
    { label: '365 days', value: 365 },
  ];

  const handleSave = () => {
    if (retentionDays >= 1 && retentionDays <= 365) {
      onSave(retentionDays);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Configure Retention
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{indexName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-6">
          {/* Preset buttons */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Quick Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setRetentionDays(preset.value)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    retentionDays === preset.value
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-amber-300 dark:hover:border-amber-500'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom slider */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Custom Retention Period
            </label>
            <div className="space-y-3">
              <input
                type="range"
                min="1"
                max="365"
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">1 day</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setRetentionDays(Math.min(365, Math.max(1, val)));
                    }}
                    className="w-20 px-2 py-1 text-center text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400">days</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">365 days</span>
              </div>
            </div>
          </div>

          {/* Warning for short retention */}
          {retentionDays <= 7 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Short retention period
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  Data older than {retentionDays} day{retentionDays > 1 ? 's' : ''} will be permanently deleted.
                  Make sure this is intended.
                </p>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-sm text-slate-600 dark:text-slate-400">
            <p>
              Logs older than the retention period will be automatically deleted during cleanup.
              The default retention is 90 days.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl">
          <button
            onClick={() => setRetentionDays(90)}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          >
            Reset to default (90 days)
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

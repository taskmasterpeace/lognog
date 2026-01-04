import { useState } from 'react';
import { X, Link2, Copy, Check, Eye, EyeOff, Calendar, Shield } from 'lucide-react';

interface ShareSettings {
  is_public: boolean;
  public_token?: string;
  public_password?: string;
  public_expires_at?: string;
}

interface DashboardShareModalProps {
  dashboardId: string;
  dashboardName: string;
  settings: ShareSettings;
  onSave: (settings: ShareSettings) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function DashboardShareModal({
  dashboardName,
  settings,
  onSave,
  onCancel,
  saving = false,
}: DashboardShareModalProps) {
  const [isPublic, setIsPublic] = useState(settings.is_public);
  const [password, setPassword] = useState(settings.public_password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState(settings.public_expires_at || '');
  const [copied, setCopied] = useState(false);

  const publicUrl = settings.public_token
    ? `${window.location.origin}/public/dashboard/${settings.public_token}`
    : null;

  const handleCopyLink = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = () => {
    onSave({
      is_public: isPublic,
      public_password: password || undefined,
      public_expires_at: expiresAt || undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Share "{dashboardName}"
              </h3>
            </div>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          {/* Public Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Enable public sharing
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Anyone with the link can view this dashboard
              </p>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isPublic ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isPublic ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {isPublic && (
            <>
              {/* Public URL */}
              {publicUrl && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Public Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={publicUrl}
                      readOnly
                      className="input flex-1 font-mono text-sm bg-slate-50 dark:bg-slate-800"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="btn-secondary"
                      title="Copy link"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Password Protection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Password Protection (optional)
                  </div>
                </label>
                <div className="flex gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave empty for no password"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn-secondary"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Expiration Date (optional)
                  </div>
                </label>
                {/* Quick presets */}
                <div className="flex gap-2 mb-2">
                  {[
                    { label: '1 day', days: 1 },
                    { label: '7 days', days: 7 },
                    { label: '30 days', days: 30 },
                    { label: 'Never', days: 0 },
                  ].map(({ label, days }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (days === 0) {
                          setExpiresAt('');
                        } else {
                          const date = new Date();
                          date.setDate(date.getDate() + days);
                          setExpiresAt(date.toISOString().slice(0, 16));
                        }
                      }}
                      className="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="input"
                />
                {expiresAt && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Expires {new Date(expiresAt).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>

              {/* Warning */}
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> Public dashboards can be viewed by anyone with the link.
                  Data shown will be live and reflect current logs.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardShareModal;

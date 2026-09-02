import { useState } from 'react';
import { X, Link2, Copy, Check, Eye, EyeOff, Calendar, Shield, Trash2 } from 'lucide-react';

interface ShareSettings {
  is_public: boolean;
  public_token?: string;
  /** Set by the server; the password hash itself is never sent to the client. */
  has_password?: boolean;
  /** Plain-text password to set; '' clears it; undefined leaves it unchanged. */
  public_password?: string;
  /** ISO-8601 UTC; '' clears; undefined leaves unchanged. */
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

// <input type="datetime-local"> speaks local wall-clock time; the API stores UTC ISO.
function isoToLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

export function DashboardShareModal({
  dashboardName,
  settings,
  onSave,
  onCancel,
  saving = false,
}: DashboardShareModalProps) {
  const [isPublic, setIsPublic] = useState(settings.is_public);
  const [password, setPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState(isoToLocalInput(settings.public_expires_at));
  const [copied, setCopied] = useState(false);

  const hasStoredPassword = !!settings.has_password && !removePassword;

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
    // Password: new value sets it, "remove" clears it, otherwise keep as-is.
    let public_password: string | undefined;
    if (password) public_password = password;
    else if (removePassword) public_password = '';

    onSave({
      is_public: isPublic,
      public_password,
      // Always explicit so "Never" actually clears a previously set expiry.
      public_expires_at: localInputToIso(expiresAt),
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-honey-500" />
              <h3 className="text-lg font-semibold text-nog-900 dark:text-nog-100">
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
          <div className="flex items-center justify-between p-3 bg-nog-50 dark:bg-nog-800 rounded-lg">
            <div>
              <p className="font-medium text-nog-900 dark:text-nog-100">
                Enable public sharing
              </p>
              <p className="text-sm text-nog-500 dark:text-nog-400">
                Anyone with the link can view this dashboard
              </p>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isPublic ? 'bg-honey-500' : 'bg-nog-300 dark:bg-nog-600'
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
              {publicUrl ? (
                <div>
                  <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
                    Public Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={publicUrl}
                      readOnly
                      className="input flex-1 font-mono text-sm bg-nog-50 dark:bg-nog-800"
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
              ) : (
                <p className="text-sm text-nog-500 dark:text-nog-400">
                  The public link is created when you save.
                </p>
              )}

              {/* Password Protection */}
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Password Protection (optional)
                  </div>
                </label>
                <div className="flex gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (e.target.value) setRemovePassword(false); }}
                    placeholder={hasStoredPassword ? 'Password set — type to replace' : 'Leave empty for no password'}
                    className="input flex-1"
                    autoComplete="new-password"
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
                  {hasStoredPassword && (
                    <button
                      type="button"
                      onClick={() => { setRemovePassword(true); setPassword(''); }}
                      className="btn-secondary"
                      title="Remove password"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {removePassword && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Password will be removed when you save.
                  </p>
                )}
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1.5">
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
                          setExpiresAt(isoToLocalInput(date.toISOString()));
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded hover:bg-nog-200 dark:hover:bg-nog-600 text-nog-700 dark:text-nog-300 ${
                        days === 0 && !expiresAt ? 'bg-honey-100 dark:bg-honey-900/40' : 'bg-nog-100 dark:bg-nog-700'
                      }`}
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
                  <p className="mt-1 text-xs text-nog-500 dark:text-nog-400">
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
              <div className="p-3 bg-honey-50 dark:bg-honey-900/20 border border-honey-200 dark:border-honey-800 rounded-lg">
                <p className="text-sm text-honey-800 dark:text-honey-200">
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

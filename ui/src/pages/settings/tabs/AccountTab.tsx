import { useState, useEffect } from 'react';
import { useAuth, authFetch, ApiKey } from '../../../contexts/AuthContext';
import { User, Key, Plus, Trash2, Copy, Check, AlertCircle, Loader2, Shield, Clock, XCircle, Lock } from 'lucide-react';
import { InfoTip } from '../../../components/ui/InfoTip';

export default function AccountTab() {
  const { user, logout, getApiKeys, createApiKey, revokeApiKey } = useAuth();

  // API keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // New key form
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState<string>('');
  const [creatingKey, setCreatingKey] = useState(false);

  // Newly created key (shown once)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPrefix, setCopiedPrefix] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await getApiKeys();
      setApiKeys(keys);
    } catch (err) {
      setError('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setPasswordChanging(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      const response = await authFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        setPasswordError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setPasswordError('Failed to connect to server');
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    setCreatingKey(true);
    setError(null);

    try {
      const expiresInDays = newKeyExpiry ? parseInt(newKeyExpiry) : undefined;
      const result = await createApiKey(newKeyName, newKeyPermissions, expiresInDays);
      setNewlyCreatedKey(result.apiKey);
      setApiKeys([result.keyData, ...apiKeys]);
      setShowNewKeyForm(false);
      setNewKeyName('');
      setNewKeyExpiry('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await revokeApiKey(keyId);
      setApiKeys(apiKeys.map((k) => (k.id === keyId ? { ...k, is_active: 0 } : k)));
    } catch (err) {
      setError('Failed to revoke API key');
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPrefixToClipboard = async (prefix: string) => {
    await navigator.clipboard.writeText(prefix);
    setCopiedPrefix(prefix);
    setTimeout(() => setCopiedPrefix(null), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const togglePermission = (perm: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  return (
    <>
      {/* User Profile Section */}
      <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
          <User className="w-5 h-5" />
          Profile
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-slate-500 dark:text-slate-400">Username</label>
            <p className="font-medium text-slate-900 dark:text-slate-100">{user?.username}</p>
          </div>
          <div>
            <label className="text-sm text-slate-500 dark:text-slate-400">Email</label>
            <p className="font-medium text-slate-900 dark:text-slate-100">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm text-slate-500 dark:text-slate-400">Role</label>
            <p className="font-medium text-slate-900 dark:text-slate-100 capitalize flex items-center gap-2">
              <Shield className={`w-4 h-4 ${user?.role === 'admin' ? 'text-amber-500' : 'text-slate-400'}`} />
              {user?.role}
            </p>
          </div>
          <div>
            <label className="text-sm text-slate-500 dark:text-slate-400">Last Login</label>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {formatDate(user?.last_login || null)}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={logout}
            className="px-4 py-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Password Change Section */}
      <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5" />
          Change Password
        </h2>

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2 text-green-700 dark:text-green-300 text-sm">
            <Check className="w-4 h-4" />
            Password changed successfully
          </div>
        )}

        {passwordError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle className="w-4 h-4" />
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Current Password
            </label>
            <input
              type="password"
              name="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Minimum 8 characters
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={passwordChanging || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {passwordChanging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Changing...
              </>
            ) : (
              'Change Password'
            )}
          </button>
        </form>
      </section>

      {/* API Keys Section */}
      <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </h2>
          <button
            onClick={() => setShowNewKeyForm(true)}
            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            New Key
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          API keys allow external applications (like LogNog In agents) to authenticate with your account.
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Newly created key warning */}
        {newlyCreatedKey && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
              Save your API key now!
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
              This is the only time you'll see this key. Store it securely.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-white dark:bg-nog-900 rounded border border-amber-300 dark:border-amber-700 text-sm font-mono break-all">
                {newlyCreatedKey}
              </code>
              <button
                onClick={() => copyToClipboard(newlyCreatedKey)}
                className="p-2 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <button
              onClick={() => setNewlyCreatedKey(null)}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
            >
              I've saved the key
            </button>
          </div>
        )}

        {/* New key form */}
        {showNewKeyForm && (
          <div className="mb-6 p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-4">
              Create New API Key
            </h3>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Key Name
                  <InfoTip
                    content="Descriptive name to identify this API key (e.g., production server, testing environment)"
                    placement="right"
                  />
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., LogNog In Agent - Server 1"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Permissions
                  <InfoTip
                    content={
                      <div className="space-y-1">
                        <p><strong>read:</strong> View logs and search data</p>
                        <p><strong>write:</strong> Ingest logs and create data</p>
                        <p><strong>admin:</strong> Full access including settings and user management</p>
                      </div>
                    }
                    placement="right"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {['read', 'write', 'admin'].map((perm) => (
                    <button
                      key={perm}
                      type="button"
                      onClick={() => togglePermission(perm)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        newKeyPermissions.includes(perm)
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-nog-100 text-slate-600 dark:bg-nog-700 dark:text-slate-400'
                      }`}
                    >
                      {perm}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expires In (days, optional)
                  <InfoTip
                    content="Set an expiration time for automatic key rotation. Leave empty for keys that never expire."
                    placement="right"
                  />
                </label>
                <input
                  type="number"
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(e.target.value)}
                  placeholder="Leave empty for no expiry"
                  min="1"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creatingKey ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Key'
                  )}
                </button>
                <button
                  onClick={() => setShowNewKeyForm(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* API Keys list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            No API keys yet. Create one to connect LogNog In agents.
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`p-3 sm:p-4 rounded-lg border ${
                  key.is_active
                    ? 'bg-white dark:bg-nog-900 border-slate-200 dark:border-slate-700'
                    : 'bg-nog-50 dark:bg-nog-900/50 border-slate-200 dark:border-slate-700 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {key.name}
                      </h4>
                      {!key.is_active && (
                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Revoked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                        {key.key_prefix}...
                      </code>
                      <button
                        onClick={() => copyPrefixToClipboard(key.key_prefix)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-nog-100 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Copy prefix"
                      >
                        {copiedPrefix === key.key_prefix ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {key.is_active && (
                    <button
                      onClick={() => handleRevokeKey(key.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Shield className="w-4 h-4" />
                    {JSON.parse(key.permissions).join(', ')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Last used: {formatDate(key.last_used)}
                  </span>
                  {key.expires_at && (
                    <span className="flex items-center gap-1">
                      Expires: {formatDate(key.expires_at)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

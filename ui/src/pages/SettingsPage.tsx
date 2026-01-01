import { useState, useEffect } from 'react';
import { useAuth, ApiKey } from '../contexts/AuthContext';
import {
  User,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Shield,
  Clock,
  XCircle,
  Database,
  Zap,
  Globe,
  MapPin,
  Download,
  RefreshCw,
  Bell,
} from 'lucide-react';
import { InfoTip } from '../components/ui/InfoTip';
import NotificationChannelsSection from '../components/NotificationChannelsSection';

// Tab configuration
const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'geoip', label: 'GeoIP', icon: Globe },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SettingsPage() {
  const { user, logout, getApiKeys, createApiKey, revokeApiKey } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // GeoIP status
  const [geoipStatus, setGeoipStatus] = useState<any>(null);
  const [geoipLoading, setGeoipLoading] = useState(true);
  const [geoipTestIp, setGeoipTestIp] = useState('8.8.8.8');
  const [geoipTestResult, setGeoipTestResult] = useState<any>(null);
  const [geoipTesting, setGeoipTesting] = useState(false);

  // Load API keys and GeoIP status
  useEffect(() => {
    loadApiKeys();
    loadGeoipStatus();
    loadDemoStats();
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

  const loadDemoStats = async () => {
    setLoadingStats(true);
    try {
      const token = localStorage.getItem('lognog_access_token');
      const response = await fetch('/api/demo/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
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
      const token = localStorage.getItem('lognog_access_token');
      const response = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
      const token = localStorage.getItem('lognog_access_token');
      const response = await fetch('/api/demo/clear?confirm=yes', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
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
      const token = localStorage.getItem('lognog_access_token');
      const response = await fetch('/api/demo/export?limit=1000&earliest=-24h&latest=now', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

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

  const loadGeoipStatus = async () => {
    try {
      const token = localStorage.getItem('lognog_access_token');
      const response = await fetch('/api/geoip/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setGeoipStatus(data);
    } catch (err) {
      console.error('Failed to load GeoIP status:', err);
    } finally {
      setGeoipLoading(false);
    }
  };

  const handleGeoipTest = async () => {
    setGeoipTesting(true);
    setGeoipTestResult(null);

    try {
      const token = localStorage.getItem('lognog_access_token');
      const response = await fetch(`/api/geoip/lookup/${geoipTestIp}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setGeoipTestResult(data);
    } catch (err) {
      setGeoipTestResult({ error: 'Failed to lookup IP' });
    } finally {
      setGeoipTesting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // ========== TAB CONTENT COMPONENTS ==========

  const AccountTab = () => (
    <>
      {/* User Profile Section */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-6">
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

      {/* API Keys Section */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </h2>
          <button
            onClick={() => setShowNewKeyForm(true)}
            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors w-full sm:w-auto"
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
              <code className="flex-1 p-3 bg-white dark:bg-slate-900 rounded border border-amber-300 dark:border-amber-700 text-sm font-mono break-all">
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
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
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
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
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
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
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
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 opacity-60'
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
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
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

  const NotificationsTab = () => (
    <NotificationChannelsSection />
  );

  const DataTab = () => (
    <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
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
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
          <Check className="w-4 h-4" />
          {clearDataResult}
        </div>
      )}

      {/* Current Stats */}
      {demoStats && (
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
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
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Time Range
              </label>
              <select
                value={demoDataTimeRange}
                onChange={(e) => setDemoDataTimeRange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
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
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
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
    </section>
  );

  const GeoIPTab = () => (
    <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5" />
        GeoIP Lookup
      </h2>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Geographic IP lookup using MaxMind GeoLite2 databases. Determine country, city, and ASN for IP addresses in your logs.
      </p>

      {geoipLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : geoipStatus?.enabled ? (
        <div className="space-y-4">
          {/* Status */}
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
              <Check className="w-5 h-5" />
              <span className="font-semibold">GeoIP Enabled</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {geoipStatus.city_db_available && (
                <div>
                  <span className="text-slate-600 dark:text-slate-400">City Database:</span>
                  <div className="text-slate-900 dark:text-slate-100 font-mono text-xs mt-1">
                    {formatBytes(geoipStatus.city_db_size)}
                    <br />
                    {new Date(geoipStatus.city_db_modified).toLocaleDateString()}
                  </div>
                </div>
              )}
              {geoipStatus.asn_db_available && (
                <div>
                  <span className="text-slate-600 dark:text-slate-400">ASN Database:</span>
                  <div className="text-slate-900 dark:text-slate-100 font-mono text-xs mt-1">
                    {formatBytes(geoipStatus.asn_db_size)}
                    <br />
                    {new Date(geoipStatus.asn_db_modified).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test Lookup */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Test Lookup
            </h3>
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={geoipTestIp}
                  onChange={(e) => setGeoipTestIp(e.target.value)}
                  placeholder="8.8.8.8"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <button
                onClick={handleGeoipTest}
                disabled={geoipTesting || !geoipTestIp}
                className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {geoipTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Looking up...
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4" />
                    Lookup
                  </>
                )}
              </button>
            </div>

            {/* Test Result */}
            {geoipTestResult && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                {geoipTestResult.error ? (
                  <div className="text-red-600 dark:text-red-400 text-sm">
                    {geoipTestResult.error}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {geoipTestResult.country_name && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Country:</span>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {geoipTestResult.country_name} ({geoipTestResult.country_code})
                        </div>
                      </div>
                    )}
                    {geoipTestResult.city && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">City:</span>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {geoipTestResult.city}
                        </div>
                      </div>
                    )}
                    {geoipTestResult.latitude && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Coordinates:</span>
                        <div className="font-medium text-slate-900 dark:text-slate-100 font-mono text-xs">
                          {geoipTestResult.latitude.toFixed(4)}, {geoipTestResult.longitude.toFixed(4)}
                        </div>
                      </div>
                    )}
                    {geoipTestResult.timezone && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Timezone:</span>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {geoipTestResult.timezone}
                        </div>
                      </div>
                    )}
                    {geoipTestResult.asn && (
                      <div className="col-span-2">
                        <span className="text-slate-500 dark:text-slate-400">ASN:</span>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          AS{geoipTestResult.asn} - {geoipTestResult.as_org}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                GeoIP Not Configured
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                MaxMind GeoLite2 databases are not installed. Follow the setup guide to enable GeoIP lookups.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2 text-sm">
              Quick Setup (Docker)
            </h4>
            <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>1. Register for a free MaxMind account at <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">maxmind.com/geolite2/signup</code></li>
              <li>2. Generate a license key in your account dashboard</li>
              <li>3. Run the download script:
                <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-900 rounded text-xs font-mono overflow-x-auto">
                  docker exec -it lognog-api /bin/sh{'\n'}
                  MAXMIND_ACCOUNT_ID=your_id \{'\n'}
                  MAXMIND_LICENSE_KEY=your_key \{'\n'}
                  /app/scripts/download-geoip.sh
                </pre>
              </li>
              <li>4. Restart the API: <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">docker-compose restart api</code></li>
            </ol>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
              See <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">api/scripts/GEOIP-SETUP.md</code> for detailed instructions.
            </p>
          </div>
        </div>
      )}
    </section>
  );

  // ========== MAIN RENDER ==========

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
        Settings
      </h1>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-1 overflow-x-auto pb-px -mb-px" aria-label="Settings tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'geoip' && <GeoIPTab />}
      </div>
    </div>
  );
}

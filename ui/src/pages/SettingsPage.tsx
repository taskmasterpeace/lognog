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
} from 'lucide-react';

export default function SettingsPage() {
  const { user, logout, getApiKeys, createApiKey, revokeApiKey } = useAuth();
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

  // Test data generation
  const [generatingData, setGeneratingData] = useState(false);
  const [testDataCount, setTestDataCount] = useState('500');
  const [testDataResult, setTestDataResult] = useState<string | null>(null);

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const togglePermission = (perm: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleGenerateTestData = async () => {
    setGeneratingData(true);
    setTestDataResult(null);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/ingest/generate-test-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ count: parseInt(testDataCount) || 500 }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestDataResult(`Successfully generated ${data.generated} log entries!`);
      } else {
        setError(data.error || 'Failed to generate test data');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setGeneratingData(false);
    }
  };

  const loadGeoipStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token');
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
      const token = localStorage.getItem('auth_token');
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">
        Settings
      </h1>

      {/* User Profile Section */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
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
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </h2>
          <button
            onClick={() => setShowNewKeyForm(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Key Name
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Permissions
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expires In (days, optional)
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
                className={`p-4 rounded-lg border ${
                  key.is_active
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">
                        {key.name}
                      </h4>
                      {!key.is_active && (
                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Revoked
                        </span>
                      )}
                    </div>
                    <code className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                      {key.key_prefix}...
                    </code>
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

      {/* GeoIP Section */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mt-8">
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

      {/* Developer Tools Section */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mt-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
          <Database className="w-5 h-5" />
          Developer Tools
        </h2>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Generate realistic test data for demos, screenshots, and testing purposes.
        </p>

        {/* Success message */}
        {testDataResult && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2 text-green-700 dark:text-green-300 text-sm">
            <Check className="w-4 h-4" />
            {testDataResult}
          </div>
        )}

        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Number of Logs
            </label>
            <input
              type="number"
              value={testDataCount}
              onChange={(e) => setTestDataCount(e.target.value)}
              min="10"
              max="1000"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            onClick={handleGenerateTestData}
            disabled={generatingData}
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
                Generate Test Data
              </>
            )}
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Generates realistic logs from various sources including web servers, databases, firewalls, and more.
          Includes security events, errors, warnings, and info messages.
        </p>
      </section>
    </div>
  );
}

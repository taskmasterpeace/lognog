import { useState, useEffect } from 'react';
import { authFetch } from '../../../contexts/AuthContext';
import {
  Globe,
  Check,
  AlertCircle,
  Loader2,
  MapPin,
} from 'lucide-react';

export default function GeoIPTab() {
  const [geoipStatus, setGeoipStatus] = useState<any>(null);
  const [geoipLoading, setGeoipLoading] = useState(true);
  const [geoipTestIp, setGeoipTestIp] = useState('8.8.8.8');
  const [geoipTestResult, setGeoipTestResult] = useState<any>(null);
  const [geoipTesting, setGeoipTesting] = useState(false);

  useEffect(() => {
    loadGeoipStatus();
  }, []);

  const loadGeoipStatus = async () => {
    try {
      const response = await authFetch('/geoip/status');
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
      const response = await authFetch(`/geoip/lookup/${geoipTestIp}`);
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
    <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-nog-200 dark:border-nog-700 p-6">
      <h2 className="text-lg font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5" />
        GeoIP Lookup
      </h2>

      <p className="text-sm text-nog-500 dark:text-nog-400 mb-6">
        Geographic IP lookup using MaxMind GeoLite2 databases. Determine country, city, and ASN for IP addresses in your logs.
      </p>

      {geoipLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-nog-400" />
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
                  <span className="text-nog-600 dark:text-nog-400">City Database:</span>
                  <div className="text-nog-900 dark:text-nog-100 font-mono text-xs mt-1">
                    {formatBytes(geoipStatus.city_db_size)}
                    <br />
                    {new Date(geoipStatus.city_db_modified).toLocaleDateString()}
                  </div>
                </div>
              )}
              {geoipStatus.asn_db_available && (
                <div>
                  <span className="text-nog-600 dark:text-nog-400">ASN Database:</span>
                  <div className="text-nog-900 dark:text-nog-100 font-mono text-xs mt-1">
                    {formatBytes(geoipStatus.asn_db_size)}
                    <br />
                    {new Date(geoipStatus.asn_db_modified).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test Lookup */}
          <div className="border-t border-nog-200 dark:border-nog-700 pt-4">
            <h3 className="text-sm font-semibold text-nog-900 dark:text-nog-100 mb-3">
              Test Lookup
            </h3>
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={geoipTestIp}
                  onChange={(e) => setGeoipTestIp(e.target.value)}
                  placeholder="8.8.8.8"
                  className="input font-mono"
                />
              </div>
              <button
                onClick={handleGeoipTest}
                disabled={geoipTesting || !geoipTestIp}
                className="flex items-center gap-2 px-4 py-2 bg-honey-500 hover:bg-honey-600 text-nog-900 font-medium rounded-lg transition-colors disabled:opacity-50"
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
              <div className="mt-4 p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg border border-nog-200 dark:border-nog-700">
                {geoipTestResult.error ? (
                  <div className="text-red-600 dark:text-red-400 text-sm">
                    {geoipTestResult.error}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {geoipTestResult.country_name && (
                      <div>
                        <span className="text-nog-500 dark:text-nog-400">Country:</span>
                        <div className="font-medium text-nog-900 dark:text-nog-100">
                          {geoipTestResult.country_name} ({geoipTestResult.country_code})
                        </div>
                      </div>
                    )}
                    {geoipTestResult.city && (
                      <div>
                        <span className="text-nog-500 dark:text-nog-400">City:</span>
                        <div className="font-medium text-nog-900 dark:text-nog-100">
                          {geoipTestResult.city}
                        </div>
                      </div>
                    )}
                    {geoipTestResult.latitude && (
                      <div>
                        <span className="text-nog-500 dark:text-nog-400">Coordinates:</span>
                        <div className="font-medium text-nog-900 dark:text-nog-100 font-mono text-xs">
                          {geoipTestResult.latitude.toFixed(4)}, {geoipTestResult.longitude.toFixed(4)}
                        </div>
                      </div>
                    )}
                    {geoipTestResult.timezone && (
                      <div>
                        <span className="text-nog-500 dark:text-nog-400">Timezone:</span>
                        <div className="font-medium text-nog-900 dark:text-nog-100">
                          {geoipTestResult.timezone}
                        </div>
                      </div>
                    )}
                    {geoipTestResult.asn && (
                      <div className="col-span-2">
                        <span className="text-nog-500 dark:text-nog-400">ASN:</span>
                        <div className="font-medium text-nog-900 dark:text-nog-100">
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
        <div className="p-6 bg-nog-50 dark:bg-nog-900/50 rounded-lg border border-nog-200 dark:border-nog-700">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-honey-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">
                GeoIP Not Configured
              </h3>
              <p className="text-sm text-nog-600 dark:text-nog-400 mb-4">
                MaxMind GeoLite2 databases are not installed. Follow the setup guide to enable GeoIP lookups.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-nog-800 rounded-lg p-4 border border-nog-200 dark:border-nog-700">
            <h4 className="font-medium text-nog-900 dark:text-nog-100 mb-2 text-sm">
              Quick Setup (Docker)
            </h4>
            <ol className="space-y-2 text-sm text-nog-600 dark:text-nog-400">
              <li>1. Register for a free MaxMind account at <code className="text-xs bg-nog-100 dark:bg-nog-700 px-1 rounded">maxmind.com/geolite2/signup</code></li>
              <li>2. Generate a license key in your account dashboard</li>
              <li>3. Run the download script:
                <pre className="mt-2 p-3 bg-nog-100 dark:bg-nog-900 rounded text-xs font-mono overflow-x-auto">
                  docker exec -it lognog-api /bin/sh{'\n'}
                  MAXMIND_ACCOUNT_ID=your_id \{'\n'}
                  MAXMIND_LICENSE_KEY=your_key \{'\n'}
                  /app/scripts/download-geoip.sh
                </pre>
              </li>
              <li>4. Restart the API: <code className="text-xs bg-nog-100 dark:bg-nog-700 px-1 rounded">docker-compose restart api</code></li>
            </ol>
            <p className="mt-3 text-xs text-nog-500 dark:text-nog-500">
              See <code className="bg-nog-100 dark:bg-nog-700 px-1 rounded">api/scripts/GEOIP-SETUP.md</code> for detailed instructions.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

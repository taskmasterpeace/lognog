import { useState, useEffect } from 'react';
import { authFetch } from '../../../contexts/AuthContext';
import { useDateFormat } from '../../../contexts/DateFormatContext';
import { Palette, Sun, Moon, Monitor, Loader2, Check } from 'lucide-react';

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  default_time_range: string;
  sidebar_open: boolean;
  default_view_mode: 'log' | 'table' | 'json';
  query_history_limit: number;
  date_format: '12-hour' | '24-hour' | 'day-of-week' | 'iso' | 'short';
  timezone: string;
}

export default function PreferencesTab() {
  const { setDateFormat, setTimezone: setContextTimezone, resolvedTimezone } = useDateFormat();

  const [preferences, setPreferences] = useState<UserPreferences>({
    theme: 'system',
    default_time_range: '-24h',
    sidebar_open: true,
    default_view_mode: 'log',
    query_history_limit: 10,
    date_format: '12-hour',
    timezone: 'browser',
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setPrefsLoading(true);
    try {
      const response = await authFetch('/settings/preferences');
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
        // Sync date format with context
        if (data.date_format) {
          setDateFormat(data.date_format);
        }
        // Sync timezone with context
        if (data.timezone) {
          setContextTimezone(data.timezone);
        }
      } else if (response.status === 401) {
        console.warn('Session expired while loading preferences');
      }
    } catch (err) {
      // Only log network errors, don't crash
      if (err instanceof Error && !err.message.includes('fetch')) {
        console.error('Failed to load preferences:', err);
      }
    } finally {
      setPrefsLoading(false);
    }
  };

  const savePreferences = async (updates: Partial<UserPreferences>) => {
    setPrefsSaving(true);
    setPrefsSuccess(false);
    try {
      const response = await authFetch('/settings/preferences', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
        setPrefsSuccess(true);
        setTimeout(() => setPrefsSuccess(false), 2000);

        // Apply theme immediately
        if (updates.theme) {
          applyTheme(updates.theme);
        }

        // Apply date format immediately
        if (updates.date_format) {
          setDateFormat(updates.date_format);
        }

        // Apply timezone immediately
        if (updates.timezone) {
          setContextTimezone(updates.timezone);
        }
      }
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setPrefsSaving(false);
    }
  };

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
    localStorage.setItem('lognog_theme', theme);
  };

  return (
    <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Preferences
        </h2>
        {prefsSuccess && (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            Saved
          </span>
        )}
      </div>

      {prefsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Theme Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Theme
            </label>
            <div className="flex gap-3">
              {[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => savePreferences({ theme: value as UserPreferences['theme'] })}
                  disabled={prefsSaving}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    preferences.theme === value
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${
                    preferences.theme === value
                      ? 'text-amber-500'
                      : 'text-slate-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    preferences.theme === value
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Default Time Range */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Default Time Range
            </label>
            <select
              value={preferences.default_time_range}
              onChange={(e) => savePreferences({ default_time_range: e.target.value })}
              disabled={prefsSaving}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            >
              <option value="-15m">Last 15 minutes</option>
              <option value="-1h">Last hour</option>
              <option value="-4h">Last 4 hours</option>
              <option value="-24h">Last 24 hours</option>
              <option value="-7d">Last 7 days</option>
              <option value="-30d">Last 30 days</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Default time range for search queries
            </p>
          </div>

          {/* Date Format */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Date & Time Format
            </label>
            <select
              value={preferences.date_format}
              onChange={(e) => savePreferences({ date_format: e.target.value as UserPreferences['date_format'] })}
              disabled={prefsSaving}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            >
              <option value="12-hour">12-hour (Dec 28, 2025 2:30 PM)</option>
              <option value="24-hour">24-hour (Dec 28, 2025 14:30)</option>
              <option value="day-of-week">With day (Sat, Dec 28, 2025 2:30 PM)</option>
              <option value="iso">ISO (2025-12-28 14:30:00)</option>
              <option value="short">Short (12/28/25 2:30 PM)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              How timestamps are displayed throughout the app
            </p>
          </div>

          {/* Display Timezone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Display Timezone
            </label>
            <select
              value={preferences.timezone || 'browser'}
              onChange={(e) => savePreferences({ timezone: e.target.value })}
              disabled={prefsSaving}
              className="w-full max-w-xs px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            >
              <option value="browser">Browser Default ({resolvedTimezone})</option>
              <optgroup label="Americas">
                <option value="America/New_York">New York (ET)</option>
                <option value="America/Chicago">Chicago (CT)</option>
                <option value="America/Denver">Denver (MT)</option>
                <option value="America/Los_Angeles">Los Angeles (PT)</option>
                <option value="America/Anchorage">Anchorage (AKT)</option>
                <option value="America/Sao_Paulo">Sao Paulo (BRT)</option>
              </optgroup>
              <optgroup label="Europe">
                <option value="Europe/London">London (GMT/BST)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Europe/Berlin">Berlin (CET)</option>
                <option value="Europe/Moscow">Moscow (MSK)</option>
              </optgroup>
              <optgroup label="Asia/Pacific">
                <option value="Asia/Dubai">Dubai (GST)</option>
                <option value="Asia/Kolkata">India (IST)</option>
                <option value="Asia/Singapore">Singapore (SGT)</option>
                <option value="Asia/Shanghai">China (CST)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Australia/Sydney">Sydney (AEST)</option>
                <option value="Pacific/Auckland">Auckland (NZST)</option>
              </optgroup>
              <optgroup label="Other">
                <option value="UTC">UTC</option>
              </optgroup>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Controls how timestamps are displayed. Log data is stored in UTC.
            </p>
          </div>

          {/* Default View Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Default View Mode
            </label>
            <div className="flex gap-2">
              {[
                { value: 'log', label: 'Log View' },
                { value: 'table', label: 'Table View' },
                { value: 'json', label: 'JSON View' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => savePreferences({ default_view_mode: value as UserPreferences['default_view_mode'] })}
                  disabled={prefsSaving}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    preferences.default_view_mode === value
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-nog-100 text-slate-600 dark:bg-nog-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar Default State */}
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Field Sidebar Open by Default
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Show the fields sidebar when opening the search page
              </p>
            </div>
            <button
              onClick={() => savePreferences({ sidebar_open: !preferences.sidebar_open })}
              disabled={prefsSaving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                preferences.sidebar_open
                  ? 'bg-amber-500'
                  : 'bg-slate-300 dark:bg-nog-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  preferences.sidebar_open ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Query History Limit */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Query History Limit
            </label>
            <input
              type="number"
              value={preferences.query_history_limit}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (value >= 1 && value <= 100) {
                  savePreferences({ query_history_limit: value });
                }
              }}
              min="1"
              max="100"
              className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-nog-800 text-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Number of recent queries to remember (1-100)
            </p>
          </div>

          {/* Welcome Wizard Reset */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Welcome Wizard
            </label>
            <button
              onClick={() => {
                localStorage.removeItem('lognog_wizard_dont_show');
                window.location.reload();
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Show Welcome Wizard Again
            </button>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Reset the welcome wizard to see it on next page load
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

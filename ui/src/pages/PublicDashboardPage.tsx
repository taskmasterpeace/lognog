import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { AreaChart, BarChart, PieChart, HeatmapChart, GaugeChart, WordCloudChart, CHART_PALETTE } from '../components/charts';
import type { HeatmapData } from '../components/charts';

const CHART_COLORS = CHART_PALETTE;

interface DashboardPanel {
  id: string;
  title: string;
  query: string;
  visualization: string;
  options?: Record<string, any>;
  position: { x: number; y: number; w: number; h: number };
}

interface PublicDashboard {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  accent_color?: string;
  header_color?: string;
  panels: DashboardPanel[];
}

interface PanelState {
  data: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
}

export default function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [panelData, setPanelData] = useState<Record<string, PanelState>>({});

  const fetchDashboard = async (pwd?: string) => {
    setLoading(true);
    setError(null);

    try {
      // Password goes in a header, not the query string, so it doesn't leak
      // into access logs / browser history.
      const response = await fetch(`/api/dashboards/public/${token}`, {
        headers: pwd ? { 'X-Dashboard-Password': pwd } : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.needs_password) {
          setNeedsPassword(true);
          setLoading(false);
          return;
        }
        throw new Error(data.error || 'Failed to load dashboard');
      }

      setDashboard(data);
      setNeedsPassword(false);

      // Load panel data via the public, token-scoped endpoint (anonymous
      // viewers can't call the authenticated /search/query).
      for (const panel of data.panels) {
        loadPanelData(panel, pwd);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadPanelData = async (panel: DashboardPanel, pwd?: string) => {
    setPanelData((prev) => ({ ...prev, [panel.id]: { data: [], loading: true, error: null } }));

    try {
      const response = await fetch(`/api/dashboards/public/${token}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panelId: panel.id,
          earliest: '-24h',
          latest: 'now',
          password: pwd,
        }),
      });
      if (!response.ok) {
        // Surface the failure instead of rendering "No data" — a viewer can't
        // tell an outage from an empty result otherwise.
        let message = `Query failed (${response.status})`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch { /* non-JSON error body */ }
        setPanelData((prev) => ({ ...prev, [panel.id]: { data: [], loading: false, error: message } }));
        return;
      }
      const result = await response.json();
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { data: result.results || [], loading: false, error: null },
      }));
    } catch (err) {
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { data: [], loading: false, error: err instanceof Error ? err.message : 'Query failed' },
      }));
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboard();
    }
  }, [token]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDashboard(password);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-nog-50 dark:bg-nog-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-honey-500 animate-spin mx-auto mb-4" />
          <p className="text-nog-600 dark:text-nog-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-nog-50 dark:bg-nog-900 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8">
          <div className="text-center mb-6">
            <Lock className="w-12 h-12 text-honey-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-nog-900 dark:text-nog-100">
              Password Protected
            </h1>
            <p className="text-nog-500 dark:text-nog-400 mt-2">
              This dashboard requires a password to view
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="input w-full mb-4"
              autoFocus
            />
            <button type="submit" className="btn-primary w-full">
              View Dashboard
            </button>
          </form>
          {error && (
            <p className="text-red-500 text-sm mt-4 text-center">{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-nog-50 dark:bg-nog-900 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-2">
            Dashboard Unavailable
          </h1>
          <p className="text-nog-500 dark:text-nog-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  const accentColor = dashboard.accent_color || '#C8862B';

  return (
    <div className="min-h-screen bg-nog-50 dark:bg-nog-900">
      {/* Header */}
      <header
        className="border-b border-nog-200 dark:border-nog-700 px-6 py-4"
        style={{ backgroundColor: dashboard.header_color || undefined }}
      >
        <div className="flex items-center gap-4">
          {dashboard.logo_url && (
            <img src={dashboard.logo_url} alt="" className="h-8" />
          )}
          <div>
            <h1 className="text-xl font-bold text-nog-900 dark:text-nog-100">
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p className="text-sm text-nog-500 dark:text-nog-400">
                {dashboard.description}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Panels */}
      <div className="p-6">
        <div className="grid grid-cols-12 gap-4">
          {dashboard.panels.map((panel) => {
            const state = panelData[panel.id];
            // Defensive: older API builds returned flat position_x/width columns.
            const pos = panel.position ?? { x: 0, y: 0, w: 6, h: 4 };
            const span = Math.min(12, Math.max(1, Number(pos.w) || 6));
            const height = Math.max(2, Number(pos.h) || 4) * 80;

            return (
              <div
                key={panel.id}
                className="card"
                style={{ gridColumn: `span ${span} / span ${span}` }}
              >
                <div className="p-4 border-b border-nog-100 dark:border-nog-700">
                  <h3 className="font-semibold text-nog-900 dark:text-nog-100">
                    {panel.title}
                  </h3>
                </div>
                <div className="p-4" style={{ height }}>
                  {!state || state.loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin text-nog-400" />
                    </div>
                  ) : state.error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-2">
                      <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
                      <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
                    </div>
                  ) : (
                    <PanelVisualization
                      type={panel.visualization}
                      options={panel.options || {}}
                      data={state.data}
                      accentColor={accentColor}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-sm text-nog-400">
        Powered by LogNog
      </footer>
    </div>
  );
}

/**
 * Column detection shared with the authenticated DashboardViewPage: ClickHouse
 * returns aggregates as strings, so pick the value column by whether its
 * values parse as numbers rather than by `typeof`.
 */
function detectColumns(results: Record<string, unknown>[]) {
  const keys = Object.keys(results[0] || {});
  const isNumericColumn = (k: string) =>
    results.some((r) => r[k] !== null && r[k] !== '' && Number.isFinite(Number(r[k])));
  const numericKeys = keys.filter(isNumericColumn);
  const valueKey =
    keys.find((k) => /^(count|count_all|total|value|sum|avg|min|max)$/i.test(k) && isNumericColumn(k)) ||
    numericKeys[0] ||
    keys[keys.length - 1];
  const labelKey = keys.find((k) => k !== valueKey) || keys[0];
  const seriesKeys = numericKeys.filter((k) => k !== labelKey).length > 0
    ? numericKeys.filter((k) => k !== labelKey)
    : [valueKey];
  return { keys, numericKeys, valueKey, labelKey, seriesKeys };
}

function PanelVisualization({
  type,
  options,
  data,
  accentColor,
}: {
  type: string;
  options: Record<string, any>;
  data: Record<string, unknown>[];
  accentColor: string;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-nog-400">
        No data
      </div>
    );
  }

  const { keys, valueKey, labelKey, seriesKeys } = detectColumns(data);

  const renderTable = () => (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nog-200 dark:border-nog-700">
            {keys.slice(0, 6).map((key) => (
              <th key={key} className="text-left p-2 font-medium text-nog-600 dark:text-nog-400">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 25).map((row, i) => (
            <tr key={i} className="border-b border-nog-100 dark:border-nog-800">
              {keys.slice(0, 6).map((key) => (
                <td key={key} className="p-2 text-nog-900 dark:text-nog-100">
                  {String(row[key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  switch (type) {
    case 'table':
      return renderTable();

    case 'single':
    case 'stat': {
      const raw = data[0]?.[valueKey] ?? 0;
      const num = Number(raw);
      const statValue = Number.isFinite(num) ? num : raw;
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold" style={{ color: accentColor }}>
            {typeof statValue === 'number' ? statValue.toLocaleString() : String(statValue)}
          </p>
          {data.length === 1 && labelKey !== valueKey && data[0][labelKey] != null && (
            <p className="text-xs text-nog-500 mt-1 truncate max-w-full">{String(data[0][labelKey])}</p>
          )}
        </div>
      );
    }

    case 'bar':
      return (
        <BarChart
          data={data.slice(0, 15).map((d) => ({ category: String(d[labelKey] ?? ''), value: Number(d[valueKey]) || 0 }))}
          height={200}
          horizontal={true}
          barColor={accentColor}
          showValues={false}
        />
      );

    case 'pie':
      return (
        <PieChart
          data={data.slice(0, 8).map((d, i) => ({ name: String(d[labelKey] ?? `Item ${i + 1}`), value: Number(d[valueKey]) || 0 }))}
          height={200}
          donut={true}
          colors={CHART_COLORS}
        />
      );

    case 'area':
    case 'line':
      return (
        <AreaChart
          data={data}
          series={seriesKeys.map((k, i) => ({ name: k, dataKey: k, color: i === 0 ? accentColor : CHART_COLORS[i % CHART_COLORS.length] }))}
          xAxisKey={labelKey}
          height={200}
          xAxisFormatter={(v) => {
            if (String(v).match(/\d{4}-\d{2}-\d{2}/)) {
              return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return String(v).slice(0, 10);
          }}
        />
      );

    case 'heatmap': {
      const timeKey = keys.find((k) => /(^|_)(time|timestamp|bucket|date)/i.test(k));
      if (!keys.includes('hour') && !keys.includes('day') && !timeKey) {
        return renderTable();
      }
      const heatmapData: HeatmapData[] = data.map((item) => {
        const t = timeKey && item[timeKey] != null ? new Date(String(item[timeKey])) : null;
        const hour = item.hour != null && Number.isFinite(Number(item.hour))
          ? Number(item.hour)
          : t && !isNaN(t.getTime()) ? t.getHours() : 0;
        const day = item.day != null && Number.isFinite(Number(item.day))
          ? Number(item.day)
          : t && !isNaN(t.getTime()) ? t.getDay() : 0;
        const value = Number(item[valueKey]) || Number(item.count) || Number(item.value) || 0;
        return { hour, day, value };
      });
      return <HeatmapChart data={heatmapData} height={240} />;
    }

    case 'gauge': {
      const gaugeValue = data[0]
        ? Number(Object.values(data[0]).find((v) => v !== null && v !== '' && !isNaN(Number(v))) || 0)
        : 0;
      const max = options.max ?? Math.max(gaugeValue * 1.2, 100);
      const thresholds = options.thresholds
        ? { low: options.thresholds.low, medium: options.thresholds.medium, high: options.thresholds.high ?? max }
        : { low: max * 0.33, medium: max * 0.66, high: max };
      return (
        <div className="h-full w-full flex flex-col items-center justify-center">
          <GaugeChart value={gaugeValue} min={0} max={max} height={200} thresholds={thresholds} unit={options.unit || ''} title={options.subtitle} />
        </div>
      );
    }

    case 'wordcloud': {
      const wordCloudData = data.map((row) => ({
        name: String(row[labelKey] ?? ''),
        value: Number(row[valueKey]) || 1,
      })).filter((item) => item.name);
      return <WordCloudChart data={wordCloudData} height={240} />;
    }

    default:
      // Scatter/funnel/treemap have no lightweight public renderer yet; a table
      // is far more useful to a viewer than "Unsupported visualization".
      return renderTable();
  }
}

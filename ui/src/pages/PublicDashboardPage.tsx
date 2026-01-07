import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { AreaChart, BarChart, PieChart, HeatmapChart, GaugeChart, WordCloudChart } from '../components/charts';
import { executeSearch } from '../api/client';

const CHART_COLORS = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

interface DashboardPanel {
  id: string;
  title: string;
  query: string;
  visualization: string;
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

export default function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [panelData, setPanelData] = useState<Record<string, { data: any[]; loading: boolean }>>({});

  const fetchDashboard = async (pwd?: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = pwd
        ? `/api/dashboards/public/${token}?password=${encodeURIComponent(pwd)}`
        : `/api/dashboards/public/${token}`;

      const response = await fetch(url);
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

      // Load panel data
      for (const panel of data.panels) {
        loadPanelData(panel);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadPanelData = async (panel: DashboardPanel) => {
    setPanelData((prev) => ({ ...prev, [panel.id]: { data: [], loading: true } }));

    try {
      const result = await executeSearch(panel.query, '-24h', 'now');
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { data: result.results || [], loading: false },
      }));
    } catch {
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { data: [], loading: false },
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
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-nog-50 dark:bg-nog-900 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8">
          <div className="text-center mb-6">
            <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Password Protected
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Dashboard Unavailable
          </h1>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  const accentColor = dashboard.accent_color || '#f59e0b';

  return (
    <div className="min-h-screen bg-nog-50 dark:bg-nog-900">
      {/* Header */}
      <header
        className="border-b border-slate-200 dark:border-slate-700 px-6 py-4"
        style={{ backgroundColor: dashboard.header_color || undefined }}
      >
        <div className="flex items-center gap-4">
          {dashboard.logo_url && (
            <img src={dashboard.logo_url} alt="" className="h-8" />
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
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
            const data = panelData[panel.id];
            const pos = panel.position;

            return (
              <div
                key={panel.id}
                className="card"
                style={{
                  gridColumn: `span ${pos.w}`,
                }}
              >
                <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    {panel.title}
                  </h3>
                </div>
                <div className="p-4" style={{ height: pos.h * 80 }}>
                  {data?.loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <PanelVisualization
                      type={panel.visualization}
                      data={data?.data || []}
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
      <footer className="text-center py-4 text-sm text-slate-400">
        Powered by LogNog
      </footer>
    </div>
  );
}

function PanelVisualization({
  type,
  data,
  accentColor,
}: {
  type: string;
  data: any[];
  accentColor: string;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No data
      </div>
    );
  }

  switch (type) {
    case 'table':
      return (
        <div className="overflow-auto h-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {Object.keys(data[0]).slice(0, 5).map((key) => (
                  <th key={key} className="text-left p-2 font-medium text-slate-600 dark:text-slate-400">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 10).map((row, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  {Object.keys(row).slice(0, 5).map((key) => (
                    <td key={key} className="p-2 text-slate-900 dark:text-slate-100">
                      {String(row[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'stat':
      const statValue = data[0]?.[Object.keys(data[0])[0]] ?? 0;
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-4xl font-bold" style={{ color: accentColor }}>
            {typeof statValue === 'number' ? statValue.toLocaleString() : String(statValue)}
          </p>
        </div>
      );

    case 'bar': {
      const categoryKey = Object.keys(data[0])[0];
      const valueKey = Object.keys(data[0])[1] || 'count';
      return (
        <BarChart
          data={data.slice(0, 10).map((d) => ({ category: String(d[categoryKey]), value: Number(d[valueKey]) || 0 }))}
          height={200}
          barColor={accentColor}
          showValues={false}
        />
      );
    }

    case 'pie': {
      const nameKey = Object.keys(data[0])[0];
      const valueKey = Object.keys(data[0])[1] || 'count';
      return (
        <PieChart
          data={data.slice(0, 8).map((d) => ({ name: String(d[nameKey]), value: Number(d[valueKey]) || 0 }))}
          height={200}
          colors={CHART_COLORS}
        />
      );
    }

    case 'line': {
      const xKey = Object.keys(data[0])[0];
      const yKey = Object.keys(data[0])[1] || 'count';
      return (
        <AreaChart
          data={data}
          series={[{ name: yKey, dataKey: yKey, color: accentColor }]}
          xAxisKey={xKey}
          height={200}
        />
      );
    }

    case 'heatmap':
      return <HeatmapChart data={data} />;

    case 'gauge': {
      const gaugeValue = data[0]?.[Object.keys(data[0])[0]] ?? 0;
      return (
        <GaugeChart
          value={typeof gaugeValue === 'number' ? gaugeValue : parseFloat(String(gaugeValue)) || 0}
          min={0}
          max={100}
          thresholds={{ low: 33, medium: 66, high: 100 }}
        />
      );
    }

    case 'wordcloud': {
      const wordCloudData = data.map(row => {
        const values = Object.values(row);
        return {
          name: String(values[0] || ''),
          value: Number(values[1]) || 1,
        };
      }).filter(item => item.name);
      return <WordCloudChart data={wordCloudData} height={240} />;
    }

    default:
      return (
        <div className="flex items-center justify-center h-full text-slate-400">
          Unsupported visualization: {type}
        </div>
      );
  }
}

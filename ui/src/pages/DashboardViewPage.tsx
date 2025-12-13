import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
  Edit3,
  X,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart,
  Table2,
  Hash,
  Clock,
  ChevronDown,
  Grid3X3,
  Gauge,
  Play,
  Pause,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import {
  getDashboard,
  executeSearch,
  createDashboardPanel,
  updateDashboardPanel,
  deleteDashboardPanel,
  DashboardPanel,
} from '../api/client';
import { HeatmapChart, HeatmapData } from '../components/charts/HeatmapChart';
import { GaugeChart } from '../components/charts/GaugeChart';

const CHART_COLORS = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

const VISUALIZATION_OPTIONS = [
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { value: 'pie', label: 'Pie Chart', icon: PieChartIcon },
  { value: 'line', label: 'Area Chart', icon: LineChart },
  { value: 'stat', label: 'Single Stat', icon: Hash },
  { value: 'heatmap', label: 'Heatmap', icon: Grid3X3 },
  { value: 'gauge', label: 'Gauge', icon: Gauge },
];

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
];

const TIME_PRESETS = [
  { label: 'Last 15 minutes', value: '-15m' },
  { label: 'Last hour', value: '-1h' },
  { label: 'Last 4 hours', value: '-4h' },
  { label: 'Last 24 hours', value: '-24h' },
  { label: 'Last 7 days', value: '-7d' },
];

interface PanelData {
  results: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
}

function PanelVisualization({
  panel,
  data,
  onRefresh,
}: {
  panel: DashboardPanel;
  data: PanelData;
  onRefresh: () => void;
}) {
  if (data.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
        <p className="text-sm text-red-600">{data.error}</p>
        <button onClick={onRefresh} className="mt-2 text-xs text-sky-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data.results || data.results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No data
      </div>
    );
  }

  const results = data.results;
  const keys = Object.keys(results[0] || {});
  const valueKey = keys.find(k => typeof results[0][k] === 'number') || keys[keys.length - 1];
  const labelKey = keys.find(k => k !== valueKey) || keys[0];

  switch (panel.visualization) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={results} layout="vertical" barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              dataKey={labelKey}
              type="category"
              stroke="#94a3b8"
              fontSize={11}
              width={80}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
              }}
            />
            <Bar dataKey={valueKey} fill="#0ea5e9" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );

    case 'pie':
      const pieData = results.map((item, i) => ({
        name: String(item[labelKey] || `Item ${i + 1}`),
        value: Number(item[valueKey]) || 0,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
      return (
        <div className="flex h-full">
          <ResponsiveContainer width="60%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius="50%"
                outerRadius="80%"
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 flex flex-col justify-center gap-1 pr-2 overflow-y-auto">
            {pieData.slice(0, 6).map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.fill }} />
                <span className="truncate text-slate-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'line':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={results}>
            <defs>
              <linearGradient id={`color-${panel.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey={labelKey}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) => {
                if (String(v).match(/\d{4}-\d{2}-\d{2}/)) {
                  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                return String(v).slice(0, 10);
              }}
            />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke="#0ea5e9"
              strokeWidth={2}
              fill={`url(#color-${panel.id})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      );

    case 'stat':
      const statValue = results[0] ? Object.values(results[0])[0] : 0;
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold text-slate-900">
            {typeof statValue === 'number' ? statValue.toLocaleString() : String(statValue)}
          </p>
        </div>
      );

    case 'heatmap':
      // Convert results to heatmap format (expects hour, day, value fields or similar)
      const heatmapData: HeatmapData[] = results.map((item, i) => {
        // Try to extract hour and day from timestamp or use index-based fallback
        const hour = typeof item.hour === 'number' ? item.hour :
                    typeof item.timestamp === 'string' ? new Date(item.timestamp).getHours() : i % 24;
        const day = typeof item.day === 'number' ? item.day :
                   typeof item.timestamp === 'string' ? new Date(item.timestamp).getDay() : Math.floor(i / 24) % 7;
        const value = Number(item[valueKey]) || Number(item.count) || Number(item.value) || 0;
        return { hour, day, value };
      });
      return (
        <div className="h-full w-full">
          <HeatmapChart data={heatmapData} height={240} />
        </div>
      );

    case 'gauge':
      // Use the first numeric value as the gauge value
      const gaugeValue = results[0] ? Number(Object.values(results[0]).find(v => typeof v === 'number') || 0) : 0;
      // Try to determine max from data or use 100 as default
      const maxGaugeValue = Math.max(gaugeValue * 1.2, 100);
      return (
        <div className="h-full w-full flex items-center justify-center">
          <GaugeChart
            value={gaugeValue}
            max={maxGaugeValue}
            height={200}
            thresholds={{ low: maxGaugeValue * 0.33, medium: maxGaugeValue * 0.66, high: maxGaugeValue }}
          />
        </div>
      );

    case 'table':
    default:
      return (
        <div className="h-full overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                {keys.map((key) => (
                  <th key={key} className="text-left p-2 border-b border-slate-200 font-medium text-slate-600">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 100).map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {keys.map((key) => (
                    <td key={key} className="p-2 border-b border-slate-100 text-slate-700">
                      {String(row[key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function PanelCard({
  panel,
  data,
  onEdit,
  onDelete,
  onRefresh,
}: {
  panel: DashboardPanel;
  data: PanelData;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const vizOption = VISUALIZATION_OPTIONS.find(v => v.value === panel.visualization) || VISUALIZATION_OPTIONS[0];
  const VizIcon = vizOption.icon;

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <VizIcon className="w-4 h-4 text-slate-400" />
          <h3 className="font-medium text-slate-900 truncate">{panel.title}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onRefresh} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 min-h-0">
        <PanelVisualization panel={panel} data={data} onRefresh={onRefresh} />
      </div>
    </div>
  );
}

interface PanelEditorProps {
  panel?: DashboardPanel;
  onSave: (data: { title: string; query: string; visualization: string }) => void;
  onCancel: () => void;
  saving: boolean;
}

function PanelEditor({ panel, onSave, onCancel, saving }: PanelEditorProps) {
  const [title, setTitle] = useState(panel?.title || '');
  const [query, setQuery] = useState(panel?.query || 'search * | stats count by hostname');
  const [visualization, setVisualization] = useState(panel?.visualization || 'bar');

  const handleSubmit = () => {
    if (title && query) {
      onSave({ title, query, visualization });
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              {panel ? 'Edit Panel' : 'Add Panel'}
            </h3>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Panel title"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Query</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search * | stats count by hostname"
              rows={3}
              className="input font-mono text-sm resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              Use aggregation queries (stats count by ...) for charts, or table commands for tables
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Visualization</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {VISUALIZATION_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setVisualization(option.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                      visualization === option.value
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title || !query || saving}
            className="btn-primary"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {panel ? 'Save Changes' : 'Add Panel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardViewPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [timeRange, setTimeRange] = useState('-24h');
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [showAutoRefreshDropdown, setShowAutoRefreshDropdown] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const [showPanelEditor, setShowPanelEditor] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DashboardPanel | undefined>();
  const [panelData, setPanelData] = useState<Record<string, PanelData>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(id!),
    enabled: !!id,
  });

  const createPanelMutation = useMutation({
    mutationFn: (data: { title: string; query: string; visualization: string }) =>
      createDashboardPanel(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPanelEditor(false);
    },
  });

  const updatePanelMutation = useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: { title: string; query: string; visualization: string } }) =>
      updateDashboardPanel(id!, panelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPanelEditor(false);
      setEditingPanel(undefined);
    },
  });

  const deletePanelMutation = useMutation({
    mutationFn: (panelId: string) => deleteDashboardPanel(id!, panelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  const fetchPanelData = useCallback(async (panel: DashboardPanel) => {
    setPanelData((prev) => ({
      ...prev,
      [panel.id]: { results: prev[panel.id]?.results || [], loading: true, error: null },
    }));

    try {
      const result = await executeSearch(panel.query, timeRange);
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { results: result.results, loading: false, error: null },
      }));
    } catch (err) {
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { results: [], loading: false, error: String(err) },
      }));
    }
  }, [timeRange]);

  useEffect(() => {
    if (dashboard?.panels) {
      dashboard.panels.forEach((panel) => {
        fetchPanelData(panel);
      });
    }
  }, [dashboard?.panels, timeRange, refreshKey, fetchPanelData]);

  const handleRefreshAll = () => {
    setRefreshKey((k) => k + 1);
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      const interval = setInterval(() => {
        setRefreshKey((k) => k + 1);
      }, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval]);

  const handleEditPanel = (panel: DashboardPanel) => {
    setEditingPanel(panel);
    setShowPanelEditor(true);
  };

  const handleSavePanel = (data: { title: string; query: string; visualization: string }) => {
    if (editingPanel) {
      updatePanelMutation.mutate({ panelId: editingPanel.id, data });
    } else {
      createPanelMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-sky-500 animate-spin mb-4" />
        <p className="text-slate-600">Loading dashboard...</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-8">
        <div className="card border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-900">Failed to load dashboard</p>
          <p className="text-sm text-red-700 mt-1">{String(error)}</p>
          <Link to="/dashboards" className="mt-4 inline-block text-sm text-sky-600 hover:underline">
            Back to Dashboards
          </Link>
        </div>
      </div>
    );
  }

  const selectedPreset = TIME_PRESETS.find(p => p.value === timeRange) || TIME_PRESETS[3];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/dashboards" className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{dashboard.name}</h1>
                {dashboard.description && (
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{dashboard.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Time Range Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                  className="btn-secondary"
                >
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>{selectedPreset.label}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {showTimeDropdown && (
                  <div className="dropdown right-0 w-48 animate-fade-in">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => {
                          setTimeRange(preset.value);
                          setShowTimeDropdown(false);
                        }}
                        className={`dropdown-item ${
                          timeRange === preset.value ? 'bg-sky-50 text-sky-600 font-medium' : ''
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Auto-Refresh Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowAutoRefreshDropdown(!showAutoRefreshDropdown)}
                  className={`btn-secondary ${autoRefreshInterval > 0 ? 'text-green-600 border-green-300' : ''}`}
                >
                  {autoRefreshInterval > 0 ? (
                    <Play className="w-4 h-4 text-green-500" />
                  ) : (
                    <Pause className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="hidden sm:inline">
                    {AUTO_REFRESH_OPTIONS.find(o => o.value === autoRefreshInterval)?.label || 'Auto-refresh'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {showAutoRefreshDropdown && (
                  <div className="dropdown right-0 w-36 animate-fade-in">
                    {AUTO_REFRESH_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setAutoRefreshInterval(option.value);
                          setShowAutoRefreshDropdown(false);
                        }}
                        className={`dropdown-item ${
                          autoRefreshInterval === option.value ? 'bg-sky-50 text-sky-600 font-medium' : ''
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleRefreshAll} className="btn-secondary">
                <RefreshCw className={`w-4 h-4 ${autoRefreshInterval > 0 ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={() => {
                  setEditingPanel(undefined);
                  setShowPanelEditor(true);
                }}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Add Panel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Panels Grid */}
      <div className="flex-1 p-4 overflow-auto">
        {dashboard.panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No panels yet</h3>
            <p className="text-slate-500 text-center max-w-md mb-6">
              Add panels to visualize your log data with charts, tables, and stats
            </p>
            <button
              onClick={() => {
                setEditingPanel(undefined);
                setShowPanelEditor(true);
              }}
              className="btn-primary"
            >
              <Plus className="w-5 h-5" />
              Add Your First Panel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.panels.map((panel) => (
              <div key={panel.id} className="h-80 group">
                <PanelCard
                  panel={panel}
                  data={panelData[panel.id] || { results: [], loading: true, error: null }}
                  onEdit={() => handleEditPanel(panel)}
                  onDelete={() => deletePanelMutation.mutate(panel.id)}
                  onRefresh={() => fetchPanelData(panel)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel Editor Modal */}
      {showPanelEditor && (
        <PanelEditor
          panel={editingPanel}
          onSave={handleSavePanel}
          onCancel={() => {
            setShowPanelEditor(false);
            setEditingPanel(undefined);
          }}
          saving={createPanelMutation.isPending || updatePanelMutation.isPending}
        />
      )}
    </div>
  );
}

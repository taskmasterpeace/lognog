import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
  ChevronDown,
  Grid3X3,
  Gauge,
  Play,
  Pause,
  Palette,
  Share2,
  Settings,
  Move,
  Download,
  Sparkles,
  Variable,
  Copy,
  Cloud,
  Maximize2,
  Minimize2,
  Circle,
  GitMerge,
  LayoutGrid,
  Folder,
} from 'lucide-react';
import { AreaChart, BarChart, PieChart, ScatterChart, FunnelChart, TreemapChart } from '../components/charts';
import {
  getDashboard,
  executeSearch,
  createDashboardPanel,
  updateDashboardPanel,
  deleteDashboardPanel,
  updateDashboardLayout,
  getDashboardVariables,
  exportDashboard,
  duplicateDashboard,
  createDashboardPage,
  updateDashboardPage,
  deleteDashboardPage,
  DashboardPanel,
  DashboardPage,
  DashboardVariable as APIDashboardVariable,
} from '../api/client';
import { HeatmapChart, HeatmapData } from '../components/charts/HeatmapChart';
import { GaugeChart } from '../components/charts/GaugeChart';
import { WordCloudChart } from '../components/charts/WordCloudChart';
import TimePickerEnhanced from '../components/TimePickerEnhanced';
import {
  DashboardGrid,
  DashboardHeader,
  DashboardBrandingModal,
  DashboardShareModal,
  DashboardVariablesBar,
  VariableEditorModal,
  PaginatedTable,
  useDrilldown,
  AIInsightsPanel,
  type PanelLayout,
  type DashboardVariable,
} from '../components/dashboard';
import { InfoTip } from '../components/ui/InfoTip';
import { Tooltip as FloatingTooltip } from '../components/ui/Tooltip';
import PanelCopyModal from '../components/PanelCopyModal';
import PanelProvenanceModal from '../components/PanelProvenanceModal';

const CHART_COLORS = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

const VISUALIZATION_OPTIONS = [
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { value: 'pie', label: 'Pie Chart', icon: PieChartIcon },
  { value: 'line', label: 'Area Chart', icon: LineChart },
  { value: 'stat', label: 'Single Stat', icon: Hash },
  { value: 'heatmap', label: 'Heatmap', icon: Grid3X3 },
  { value: 'gauge', label: 'Gauge', icon: Gauge },
  { value: 'wordcloud', label: 'Word Cloud', icon: Cloud },
  { value: 'scatter', label: 'Scatter Plot', icon: Circle },
  { value: 'funnel', label: 'Funnel Chart', icon: GitMerge },
  { value: 'treemap', label: 'Treemap', icon: LayoutGrid },
];

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
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
  onDrilldown,
}: {
  panel: DashboardPanel;
  data: PanelData;
  onRefresh: () => void;
  onDrilldown?: (field: string, value: string) => void;
}) {
  if (data.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
        <p className="text-sm text-red-600">{data.error}</p>
        <button onClick={onRefresh} className="mt-2 text-xs text-amber-600 hover:underline">
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

  const handleChartClick = (chartData: Record<string, unknown>) => {
    if (onDrilldown && labelKey && chartData[labelKey]) {
      onDrilldown(labelKey, String(chartData[labelKey]));
    }
  };

  switch (panel.visualization) {
    case 'bar':
      return (
        <BarChart
          data={results.map((item) => ({
            category: String(item[labelKey] || ''),
            value: Number(item[valueKey]) || 0,
          }))}
          height={200}
          horizontal={true}
          barColor="#f59e0b"
          showValues={false}
          onBarClick={(category) => {
            const item = results.find((r) => String(r[labelKey]) === category);
            if (item) handleChartClick(item);
          }}
        />
      );

    case 'pie': {
      const pieData = results.map((item, i) => ({
        name: String(item[labelKey] || `Item ${i + 1}`),
        value: Number(item[valueKey]) || 0,
      }));
      return (
        <div className="flex h-full">
          <div className="w-3/5">
            <PieChart
              data={pieData}
              height={200}
              donut={true}
              showLegend={false}
              colors={CHART_COLORS}
              onItemClick={(name) => {
                const index = pieData.findIndex((p) => p.name === name);
                const item = results[index];
                if (item && onDrilldown) handleChartClick(item);
              }}
            />
          </div>
          <div className="flex-1 flex flex-col justify-center gap-1 pr-2 overflow-y-auto">
            {pieData.slice(0, 6).map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="truncate text-slate-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'line':
      return (
        <AreaChart
          data={results}
          series={[{ name: valueKey, dataKey: valueKey, color: '#f59e0b' }]}
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

    case 'stat':
      const statValue = results[0] ? Object.values(results[0])[0] : 0;
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold text-slate-900 dark:text-slate-100">
            {typeof statValue === 'number' ? statValue.toLocaleString() : String(statValue)}
          </p>
        </div>
      );

    case 'heatmap':
      const heatmapData: HeatmapData[] = results.map((item, i) => {
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
      const gaugeValue = results[0] ? Number(Object.values(results[0]).find(v => typeof v === 'number') || 0) : 0;
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

    case 'wordcloud':
      // Transform data for word cloud: first column = name, second column = value
      const wordCloudData = results.map(row => {
        const values = Object.values(row);
        return {
          name: String(values[0] || ''),
          value: Number(values[1]) || 1,
        };
      }).filter(item => item.name);
      return (
        <div className="h-full w-full">
          <WordCloudChart
            data={wordCloudData}
            height={240}
            onWordClick={(word) => {
              if (onDrilldown && keys.length > 0) {
                onDrilldown(keys[0], word);
              }
            }}
          />
        </div>
      );

    case 'scatter': {
      // Scatter plot: needs x, y values. Look for numeric columns
      const numericKeys = keys.filter(k => typeof results[0][k] === 'number');
      const xKey = numericKeys[0] || keys[0];
      const yKey = numericKeys[1] || numericKeys[0] || keys[1] || keys[0];
      const nameKey = keys.find(k => !numericKeys.includes(k)) || keys[0];

      const scatterData = results.map(row => ({
        x: Number(row[xKey]) || 0,
        y: Number(row[yKey]) || 0,
        name: String(row[nameKey] || ''),
      }));

      return (
        <div className="h-full w-full">
          <ScatterChart
            data={scatterData}
            height={220}
            xAxisLabel={xKey}
            yAxisLabel={yKey}
            onPointClick={(point) => {
              if (onDrilldown && nameKey && point.name) {
                onDrilldown(nameKey, point.name);
              }
            }}
          />
        </div>
      );
    }

    case 'funnel': {
      // Funnel: first column = stage name, second column = value
      const funnelData = results.map(row => ({
        name: String(row[labelKey] || ''),
        value: Number(row[valueKey]) || 0,
      })).filter(item => item.name);

      return (
        <div className="h-full w-full">
          <FunnelChart
            data={funnelData}
            height={220}
            onStageClick={(name) => {
              if (onDrilldown && labelKey) {
                onDrilldown(labelKey, name);
              }
            }}
          />
        </div>
      );
    }

    case 'treemap': {
      // Treemap: first column = name, second column = value
      const treemapData = results.map(row => ({
        name: String(row[labelKey] || ''),
        value: Number(row[valueKey]) || 0,
      })).filter(item => item.name && item.value > 0);

      return (
        <div className="h-full w-full">
          <TreemapChart
            data={treemapData}
            height={220}
            onNodeClick={(node) => {
              if (onDrilldown && labelKey) {
                onDrilldown(labelKey, node.name);
              }
            }}
          />
        </div>
      );
    }

    case 'table':
    default:
      return (
        <PaginatedTable
          data={results}
          pageSize={10}
          onRowClick={(row) => {
            if (onDrilldown && keys.length > 0) {
              const firstKey = keys[0];
              if (row[firstKey]) {
                onDrilldown(firstKey, String(row[firstKey]));
              }
            }
          }}
        />
      );
  }
}

function PanelCard({
  panel,
  data,
  onEdit,
  onDelete,
  onDuplicate,
  onRefresh,
  onDrilldown,
  onFullscreen,
  onViewOrigin,
  editMode,
}: {
  panel: DashboardPanel;
  data: PanelData;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onDrilldown?: (field: string, value: string) => void;
  onFullscreen?: () => void;
  onViewOrigin?: () => void;
  editMode?: boolean;
}) {
  const vizOption = VISUALIZATION_OPTIONS.find(v => v.value === panel.visualization) || VISUALIZATION_OPTIONS[0];
  const VizIcon = vizOption.icon;

  return (
    <div className="card flex flex-col h-full group">
      <div className={`flex items-center justify-between p-3 border-b border-slate-100 dark:border-nog-700 ${editMode ? 'panel-drag-handle cursor-move' : ''}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {editMode && <Move className="w-4 h-4 text-slate-400 dark:text-nog-400 flex-shrink-0" />}
          <VizIcon className="w-4 h-4 text-slate-400 dark:text-nog-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-slate-900 dark:text-nog-100 truncate">{panel.title}</h3>
            {panel.description && (
              <p className="text-xs text-slate-500 dark:text-nog-400 truncate" title={panel.description}>
                {panel.description}
              </p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 ${editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          {onFullscreen && (
            <button onClick={onFullscreen} className="p-1.5 text-slate-400 dark:text-nog-400 hover:text-slate-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded" title="Fullscreen">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onViewOrigin && (
            <button onClick={onViewOrigin} className="p-1.5 text-slate-400 dark:text-nog-400 hover:text-slate-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded" title="View Origin">
              <GitMerge className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onRefresh} className="p-1.5 text-slate-400 dark:text-nog-400 hover:text-slate-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEdit} className="p-1.5 text-slate-400 dark:text-nog-400 hover:text-slate-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded" title="Edit">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDuplicate} className="p-1.5 text-slate-400 dark:text-nog-400 hover:text-slate-600 dark:hover:text-nog-200 hover:bg-nog-100 dark:hover:bg-nog-700 rounded" title="Duplicate">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-slate-400 dark:text-nog-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 min-h-0">
        <PanelVisualization panel={panel} data={data} onRefresh={onRefresh} onDrilldown={onDrilldown} />
      </div>
    </div>
  );
}

// Page Editor Modal for creating/editing dashboard pages
function PageEditorModal({
  page,
  onSave,
  onCancel,
}: {
  page: DashboardPage | null;
  onSave: (name: string, icon?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(page?.name || '');
  const [icon, setIcon] = useState(page?.icon || '');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-nog-100">
              {page ? 'Edit Page' : 'Add Page'}
            </h3>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="modal-body space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-nog-200 mb-1.5 block">
              Page Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., User Acquisition, Revenue, API Health"
              className="input"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-nog-200 mb-1.5 block">
              Icon (optional emoji)
            </label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g., 📈 or 💰"
              className="input"
              maxLength={4}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onSave(name, icon || undefined)}
            disabled={!name.trim()}
            className="btn-primary"
          >
            {page ? 'Save' : 'Create Page'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PanelEditorProps {
  panel?: DashboardPanel;
  onSave: (data: { title: string; query: string; visualization: string; description?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}

function PanelEditor({ panel, onSave, onCancel, saving }: PanelEditorProps) {
  const [title, setTitle] = useState(panel?.title || '');
  const [description, setDescription] = useState(panel?.description || '');
  const [query, setQuery] = useState(panel?.query || 'search * | stats count by hostname');
  const [visualization, setVisualization] = useState(panel?.visualization || 'bar');

  const handleSubmit = () => {
    if (title && query) {
      onSave({ title, query, visualization, description: description || undefined });
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {panel ? 'Edit Panel' : 'Add Panel'}
            </h3>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Title
              <InfoTip
                content="Display name for this panel shown in the dashboard"
                placement="right"
              />
            </label>
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
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-nog-200 mb-1.5">
              Description
              <InfoTip
                content="Optional description shown below the panel title"
                placement="right"
              />
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this panel shows"
              className="input"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Query
              <InfoTip
                content={
                  <div className="space-y-1">
                    <p>DSL query to fetch data for this panel. Use aggregation queries for charts.</p>
                    <p className="text-xs opacity-80 mt-2">Tip: Use <code className="bg-gray-800 px-1 rounded">$variable$</code> syntax to reference dashboard variables</p>
                  </div>
                }
                code="search * | stats count by hostname
search error | timechart span=1h count"
                placement="right"
              />
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search * | stats count by hostname"
              rows={3}
              className="input font-mono text-sm resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              Use $variable$ syntax to reference dashboard variables. Use aggregation queries for charts.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Visualization
              <InfoTip
                content={
                  <div className="space-y-1 text-xs">
                    <p><strong>Table:</strong> Display raw results in a tabular format</p>
                    <p><strong>Bar Chart:</strong> Compare values across categories</p>
                    <p><strong>Pie Chart:</strong> Show proportions of a whole</p>
                    <p><strong>Area Chart:</strong> Display trends over time</p>
                    <p><strong>Single Stat:</strong> Show one key metric prominently</p>
                    <p><strong>Heatmap:</strong> Visualize patterns in 2D data</p>
                    <p><strong>Gauge:</strong> Display a metric with min/max range</p>
                    <p><strong>Word Cloud:</strong> Visualize word frequency from aggregated data</p>
                  </div>
                }
                placement="right"
              />
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {VISUALIZATION_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <FloatingTooltip
                    key={option.value}
                    content={option.label}
                    placement="top"
                  >
                    <button
                      onClick={() => setVisualization(option.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        visualization === option.value
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{option.label}</span>
                    </button>
                  </FloatingTooltip>
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
  const navigate = useNavigate();
  const { drilldown } = useDrilldown();

  const [timeRange, setTimeRange] = useState('-24h');
  // const [showTimeDropdown, setShowTimeDropdown] = useState(false); // Now handled by TimePickerEnhanced
  const [showAutoRefreshDropdown, setShowAutoRefreshDropdown] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const [showPanelEditor, setShowPanelEditor] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DashboardPanel | undefined>();
  const [panelData, setPanelData] = useState<Record<string, PanelData>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isRefreshPaused, setIsRefreshPaused] = useState(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // New state for enhanced features
  const [editMode, setEditMode] = useState(false);
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVariableEditor, setShowVariableEditor] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [showPageEditor, setShowPageEditor] = useState(false);
  const [editingPage, setEditingPage] = useState<DashboardPage | null>(null);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const dashboardGridRef = useRef<HTMLDivElement>(null);
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [showPanelCopyModal, setShowPanelCopyModal] = useState(false);
  const [provenancePanel, setProvenancePanel] = useState<{ id: string; title: string } | null>(null);

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(id!),
    enabled: !!id,
  });

  const { data: variables = [] } = useQuery({
    queryKey: ['dashboard-variables', id],
    queryFn: () => getDashboardVariables(id!),
    enabled: !!id,
  });

  // Convert API variables to component format
  const dashboardVariables: DashboardVariable[] = useMemo(() => {
    return variables.map((v: APIDashboardVariable) => ({
      id: v.id || v.name,
      name: v.name,
      label: v.label || v.name,
      type: v.type as DashboardVariable['type'],
      default_value: v.default_value,
      query: v.query,
      options: v.type === 'custom' && v.default_value ? v.default_value.split(',') : undefined,
      multi_select: v.multi_select ?? false,
      include_all: v.include_all ?? false,
    }));
  }, [variables]);

  // Initialize variable values from defaults
  useEffect(() => {
    const defaults: Record<string, string> = {};
    dashboardVariables.forEach((v) => {
      if (v.default_value && !variableValues[v.name]) {
        defaults[v.name] = v.default_value;
      }
    });
    if (Object.keys(defaults).length > 0) {
      setVariableValues((prev) => ({ ...prev, ...defaults }));
    }
  }, [dashboardVariables]);

  // Function to substitute variables in query
  const substituteVariables = useCallback((query: string): string => {
    let result = query;
    Object.entries(variableValues).forEach(([name, value]) => {
      result = result.replace(new RegExp(`\\$${name}\\$`, 'g'), value);
    });
    return result;
  }, [variableValues]);

  const createPanelMutation = useMutation({
    mutationFn: (data: { title: string; query: string; visualization: string }) =>
      createDashboardPanel(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPanelEditor(false);
    },
  });

  const updatePanelMutation = useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: { title: string; query: string; visualization: string; description?: string } }) =>
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

  const duplicatePanelMutation = useMutation({
    mutationFn: (panel: DashboardPanel) =>
      createDashboardPanel(id!, {
        title: `${panel.title} (Copy)`,
        query: panel.query,
        visualization: panel.visualization,
        position: {
          x: (panel.position_x ?? 0) + 1,
          y: panel.position_y ?? 0,
          width: panel.width ?? 4,
          height: panel.height ?? 4,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  const updateLayoutMutation = useMutation({
    mutationFn: (layout: Array<{ panelId: string; x: number; y: number; w: number; h: number }>) =>
      updateDashboardLayout(id!, layout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateDashboard(id!),
    onSuccess: (newDashboard) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      navigate(`/dashboards/${newDashboard.id}`);
    },
  });

  // Page mutations
  const createPageMutation = useMutation({
    mutationFn: ({ name, icon }: { name: string; icon?: string }) =>
      createDashboardPage(id!, name, { icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPageEditor(false);
      setEditingPage(null);
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: ({ pageId, updates }: { pageId: string; updates: { name?: string; icon?: string } }) =>
      updateDashboardPage(id!, pageId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setShowPageEditor(false);
      setEditingPage(null);
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: (pageId: string) => deleteDashboardPage(id!, pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      setSelectedPageId(null);
    },
  });

  const fetchPanelData = useCallback(async (panel: DashboardPanel) => {
    setPanelData((prev) => ({
      ...prev,
      [panel.id]: { results: prev[panel.id]?.results || [], loading: true, error: null },
    }));

    try {
      const queryWithVars = substituteVariables(panel.query);
      const result = await executeSearch(queryWithVars, timeRange);
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
  }, [timeRange, substituteVariables]);

  useEffect(() => {
    if (dashboard?.panels) {
      dashboard.panels.forEach((panel) => {
        fetchPanelData(panel);
      });
    }
  }, [dashboard?.panels, timeRange, refreshKey, fetchPanelData, variableValues]);

  const handleRefreshAll = () => {
    setRefreshKey((k) => k + 1);
  };

  // Auto-refresh effect with countdown
  useEffect(() => {
    // Clear any existing countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (autoRefreshInterval > 0 && !isRefreshPaused) {
      // Initialize countdown
      const totalSeconds = Math.floor(autoRefreshInterval / 1000);
      setCountdownSeconds(totalSeconds);

      // Countdown ticker - runs every second
      countdownIntervalRef.current = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            // Time to refresh
            setRefreshKey((k) => k + 1);
            return totalSeconds; // Reset countdown
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    } else {
      setCountdownSeconds(0);
    }
  }, [autoRefreshInterval, isRefreshPaused]);

  // Pause auto-refresh on user interaction with dashboard
  const handleDashboardInteraction = useCallback(() => {
    if (autoRefreshInterval > 0 && !isRefreshPaused) {
      setIsRefreshPaused(true);
      // Resume after 30 seconds of no interaction
      setTimeout(() => {
        setIsRefreshPaused(false);
      }, 30000);
    }
  }, [autoRefreshInterval, isRefreshPaused]);

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

  const handleLayoutChange = (newLayout: PanelLayout[]) => {
    if (!editMode) return;

    const layoutUpdate = newLayout.map((item) => ({
      panelId: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));

    updateLayoutMutation.mutate(layoutUpdate);
  };

  const handleDrilldown = (field: string, value: string) => {
    drilldown({ field, value, timeRange });
  };

  const handleExport = async () => {
    if (!id) return;
    try {
      const exportData = await exportDashboard(id);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dashboard?.name || 'dashboard'}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleExportPdf = async () => {
    if (!dashboardGridRef.current || !dashboard) return;

    setIsExportingPdf(true);

    try {
      // Wait for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const element = dashboardGridRef.current;

      // Capture the dashboard as canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: document.documentElement.classList.contains('dark') ? '#1a1b26' : '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Calculate PDF dimensions (A4 landscape or portrait based on aspect ratio)
      const aspectRatio = imgWidth / imgHeight;
      const isLandscape = aspectRatio > 1;

      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Add header with dashboard name and export date
      const headerHeight = 15;
      pdf.setFontSize(18);
      pdf.setTextColor(40);
      pdf.text(dashboard.name, 10, 12);

      pdf.setFontSize(10);
      pdf.setTextColor(120);
      pdf.text(`Exported: ${new Date().toLocaleString()}`, 10, 18);
      pdf.text(`Time Range: ${timeRange}`, pageWidth - 50, 18);

      // Draw a separator line
      pdf.setDrawColor(200);
      pdf.line(10, headerHeight + 5, pageWidth - 10, headerHeight + 5);

      // Calculate image dimensions to fit page
      const availableHeight = pageHeight - headerHeight - 20; // 20mm for margins
      const availableWidth = pageWidth - 20; // 10mm margin on each side

      let finalWidth = availableWidth;
      let finalHeight = (imgHeight / imgWidth) * finalWidth;

      if (finalHeight > availableHeight) {
        finalHeight = availableHeight;
        finalWidth = (imgWidth / imgHeight) * finalHeight;
      }

      // Center the image
      const xOffset = (pageWidth - finalWidth) / 2;
      const yOffset = headerHeight + 10;

      // Add the dashboard image
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

      // Add footer with page number
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`Generated by LogNog`, 10, pageHeight - 5);
      pdf.text(`Page 1 of 1`, pageWidth - 25, pageHeight - 5);

      // Save the PDF
      pdf.save(`${dashboard.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Convert panels to layout format (filtered by selected page)
  const panelLayouts: PanelLayout[] = useMemo(() => {
    if (!dashboard?.panels) return [];
    const filteredPanels = dashboard.panels.filter(
      panel => !selectedPageId || panel.page_id === selectedPageId
    );
    return filteredPanels.map((panel, index) => ({
      id: panel.id,
      x: panel.position_x ?? (index % 3) * 4,
      y: panel.position_y ?? Math.floor(index / 3) * 4,
      w: panel.width ?? 4,
      h: panel.height ?? 4,
    }));
  }, [dashboard?.panels, selectedPageId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
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
          <Link to="/dashboards" className="mt-4 inline-block text-sm text-amber-600 hover:underline">
            Back to Dashboards
          </Link>
        </div>
      </div>
    );
  }

  // selectedPreset moved to TimePickerEnhanced component

  return (
    <div className="min-h-full bg-nog-50 dark:bg-nog-900 flex flex-col">
      {/* Header */}
      <DashboardHeader
        name={dashboard.name}
        description={dashboard.description}
        logoUrl={dashboard.logo_url}
        accentColor={dashboard.accent_color}
        headerColor={dashboard.header_color}
        backLink="/dashboards"
        actions={
          <div className="flex items-center gap-2">
            {/* Variables */}
            {dashboardVariables.length > 0 && (
              <button
                onClick={() => setShowVariableEditor(true)}
                className="btn-secondary"
                title="Edit Variables"
              >
                <Variable className="w-4 h-4" />
              </button>
            )}

            {/* Time Range Selector - Enhanced */}
            <TimePickerEnhanced
              onRangeChange={(earliest, _latest) => {
                setTimeRange(earliest);
              }}
              defaultRange={timeRange}
            />

            {/* Auto-Refresh Selector with Countdown */}
            <div className="relative">
              <button
                onClick={() => setShowAutoRefreshDropdown(!showAutoRefreshDropdown)}
                className={`btn-secondary ${autoRefreshInterval > 0 ? (isRefreshPaused ? 'text-amber-600 border-amber-300' : 'text-green-600 border-green-300') : ''}`}
              >
                {autoRefreshInterval > 0 ? (
                  isRefreshPaused ? (
                    <Pause className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Play className="w-4 h-4 text-green-500" />
                  )
                ) : (
                  <Pause className="w-4 h-4 text-slate-400" />
                )}
                <span className="hidden sm:inline">
                  {autoRefreshInterval > 0 && countdownSeconds > 0 ? (
                    <span className="tabular-nums">
                      {isRefreshPaused ? 'Paused' : `${countdownSeconds}s`}
                    </span>
                  ) : (
                    AUTO_REFRESH_OPTIONS.find(o => o.value === autoRefreshInterval)?.label || 'Auto-refresh'
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {showAutoRefreshDropdown && (
                <div className="dropdown right-0 w-44 animate-fade-in">
                  {AUTO_REFRESH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setAutoRefreshInterval(option.value);
                        setIsRefreshPaused(false);
                        setShowAutoRefreshDropdown(false);
                      }}
                      className={`dropdown-item ${
                        autoRefreshInterval === option.value ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 font-medium' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {autoRefreshInterval > 0 && (
                    <>
                      <div className="border-t border-slate-100 dark:border-nog-700 my-1" />
                      <button
                        onClick={() => {
                          setIsRefreshPaused(!isRefreshPaused);
                          setShowAutoRefreshDropdown(false);
                        }}
                        className="dropdown-item"
                      >
                        {isRefreshPaused ? (
                          <>
                            <Play className="w-4 h-4 text-green-500" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="w-4 h-4 text-amber-500" />
                            Pause
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleRefreshAll} className="btn-secondary">
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Share button - prominent */}
            <button
              onClick={() => setShowShareModal(true)}
              className="btn-secondary text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/30"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Actions dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                className="btn-secondary"
              >
                <Settings className="w-4 h-4" />
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {showActionsDropdown && (
                <div className="dropdown right-0 w-48 animate-fade-in">
                  <button
                    onClick={() => { setEditMode(!editMode); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Move className="w-4 h-4" />
                    {editMode ? 'Exit Edit Mode' : 'Edit Layout'}
                  </button>
                  <button
                    onClick={() => { setShowBrandingModal(true); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Palette className="w-4 h-4" />
                    Branding
                  </button>
                  <button
                    onClick={() => { setShowShareModal(true); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  <button
                    onClick={() => { handleExport(); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Download className="w-4 h-4" />
                    Export JSON
                  </button>
                  <button
                    onClick={() => { handleExportPdf(); setShowActionsDropdown(false); }}
                    disabled={isExportingPdf}
                    className="dropdown-item"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExportingPdf ? 'Generating PDF...' : 'Export PDF'}
                  </button>
                  <button
                    onClick={() => { duplicateMutation.mutate(); setShowActionsDropdown(false); }}
                    disabled={duplicateMutation.isPending}
                    className="dropdown-item"
                  >
                    <Copy className="w-4 h-4" />
                    {duplicateMutation.isPending ? 'Duplicating...' : 'Duplicate'}
                  </button>
                  <button
                    onClick={() => { setShowAIInsights(!showAIInsights); setShowActionsDropdown(false); }}
                    className="dropdown-item"
                  >
                    <Sparkles className="w-4 h-4" />
                    {showAIInsights ? 'Hide AI Insights' : 'AI Insights'}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowPanelCopyModal(true)}
              className="btn-secondary"
              title="Copy existing panel from another dashboard"
            >
              <Folder className="w-4 h-4" />
              <span className="hidden sm:inline">Copy Panel</span>
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
        }
      />

      {/* Variables Bar */}
      {dashboardVariables.length > 0 && (
        <DashboardVariablesBar
          variables={dashboardVariables}
          values={variableValues}
          onChange={setVariableValues}
        />
      )}

      {/* Page Tabs */}
      {(dashboard.pages && dashboard.pages.length > 0 || editMode) && (
        <div className="bg-white dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700 px-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedPageId(null)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                selectedPageId === null
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-600 dark:text-nog-300 hover:text-slate-900 dark:hover:text-nog-100'
              }`}
            >
              All Panels
            </button>
            {dashboard.pages?.map((page) => (
              <div key={page.id} className="relative group flex items-center">
                <button
                  onClick={() => setSelectedPageId(page.id)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    selectedPageId === page.id
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-slate-600 dark:text-nog-300 hover:text-slate-900 dark:hover:text-nog-100'
                  }`}
                >
                  {page.icon && <span className="mr-1.5">{page.icon}</span>}
                  {page.name}
                </button>
                {editMode && (
                  <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPage(page);
                        setShowPageEditor(true);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-nog-200"
                      title="Edit Page"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete page "${page.name}"?`)) {
                          deletePageMutation.mutate(page.id);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {editMode && (
              <button
                onClick={() => {
                  setEditingPage(null);
                  setShowPageEditor(true);
                }}
                className="px-3 py-2.5 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-nog-200"
                title="Add Page"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit Mode Banner */}
      {editMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800">
            <Move className="w-4 h-4" />
            <span className="text-sm font-medium">Edit Mode: Drag panels to rearrange, resize from corners</span>
          </div>
          <button
            onClick={() => setEditMode(false)}
            className="text-sm text-amber-600 hover:text-amber-800 font-medium"
          >
            Done Editing
          </button>
        </div>
      )}

      {/* AI Insights Panel */}
      {showAIInsights && (
        <div className="p-4 border-b border-slate-200 bg-white">
          <AIInsightsPanel dashboardId={id!} timeRange={timeRange} />
        </div>
      )}

      {/* Panels Grid */}
      <div ref={dashboardGridRef} className="flex-1 p-4 overflow-auto" onClick={handleDashboardInteraction} onScroll={handleDashboardInteraction}>
        {dashboard.panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="w-16 h-16 bg-nog-100 dark:bg-nog-800 rounded-full flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No panels yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-6">
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
          <DashboardGrid
            layouts={panelLayouts}
            editMode={editMode}
            onLayoutChange={handleLayoutChange}
          >
            {dashboard.panels
              .filter(panel => !selectedPageId || panel.page_id === selectedPageId)
              .map((panel) => (
              <div key={panel.id} className="group">
                <PanelCard
                  panel={panel}
                  data={panelData[panel.id] || { results: [], loading: true, error: null }}
                  onEdit={() => handleEditPanel(panel)}
                  onDelete={() => deletePanelMutation.mutate(panel.id)}
                  onDuplicate={() => duplicatePanelMutation.mutate(panel)}
                  onRefresh={() => fetchPanelData(panel)}
                  onDrilldown={handleDrilldown}
                  onFullscreen={() => setFullscreenPanel(panel.id)}
                  onViewOrigin={() => setProvenancePanel({ id: panel.id, title: panel.title })}
                  editMode={editMode}
                />
              </div>
            ))}
          </DashboardGrid>
        )}
      </div>

      {/* Annotations - TODO: Implement annotations feature */}
      {/* {id && (
        <DashboardAnnotations
          annotations={[]}
          editMode={isEditing}
        />
      )} */}

      {/* Page Editor Modal */}
      {showPageEditor && (
        <PageEditorModal
          page={editingPage}
          onSave={(name: string, icon?: string) => {
            if (editingPage) {
              updatePageMutation.mutate({ pageId: editingPage.id, updates: { name, icon } });
            } else {
              createPageMutation.mutate({ name, icon });
            }
          }}
          onCancel={() => {
            setShowPageEditor(false);
            setEditingPage(null);
          }}
        />
      )}

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

      {/* Branding Modal */}
      {showBrandingModal && (
        <DashboardBrandingModal
          branding={{
            logo_url: dashboard.logo_url,
            accent_color: dashboard.accent_color,
            header_color: dashboard.header_color,
            description: dashboard.description,
          }}
          onCancel={() => setShowBrandingModal(false)}
          onSave={async (branding) => {
            await fetch(`/api/dashboards/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(branding),
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
            setShowBrandingModal(false);
          }}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <DashboardShareModal
          dashboardId={id!}
          dashboardName={dashboard.name}
          settings={{
            is_public: !!dashboard.is_public,
            public_token: dashboard.public_token,
          }}
          onCancel={() => setShowShareModal(false)}
          onSave={async (settings) => {
            await fetch(`/api/dashboards/${id}/share`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settings),
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
            setShowShareModal(false);
          }}
        />
      )}

      {/* Variable Editor Modal */}
      {showVariableEditor && (
        <VariableEditorModal
          onCancel={() => setShowVariableEditor(false)}
          onSave={async (data) => {
            await fetch(`/api/dashboards/${id}/variables`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard-variables', id] });
            setShowVariableEditor(false);
          }}
        />
      )}

      {/* Fullscreen Panel Modal */}
      {fullscreenPanel && (() => {
        const panel = dashboard?.panels.find(p => p.id === fullscreenPanel);
        if (!panel) return null;
        const data = panelData[panel.id] || { results: [], loading: true, error: null };
        const vizOption = VISUALIZATION_OPTIONS.find(v => v.value === panel.visualization) || VISUALIZATION_OPTIONS[0];
        const VizIcon = vizOption.icon;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setFullscreenPanel(null)}>
            <div className="bg-white dark:bg-nog-800 rounded-xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-nog-700">
                <div className="flex items-center gap-3">
                  <VizIcon className="w-5 h-5 text-slate-400 dark:text-nog-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100">{panel.title}</h2>
                    {panel.description && (
                      <p className="text-sm text-slate-500 dark:text-nog-400">{panel.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchPanelData(panel)}
                    className="btn-ghost p-2"
                    title="Refresh"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setFullscreenPanel(null)}
                    className="btn-ghost p-2"
                    title="Exit fullscreen"
                  >
                    <Minimize2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 p-4 min-h-0 overflow-auto">
                <PanelVisualization
                  panel={panel}
                  data={data}
                  onRefresh={() => fetchPanelData(panel)}
                  onDrilldown={handleDrilldown}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Panel Copy Modal */}
      {showPanelCopyModal && (
        <PanelCopyModal
          onClose={() => setShowPanelCopyModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
            setShowPanelCopyModal(false);
          }}
        />
      )}

      {/* Panel Provenance Modal */}
      {provenancePanel && (
        <PanelProvenanceModal
          dashboardId={id!}
          panelId={provenancePanel.id}
          panelTitle={provenancePanel.title}
          onClose={() => setProvenancePanel(null)}
        />
      )}
    </div>
  );
}

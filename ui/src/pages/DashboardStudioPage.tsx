import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Plus,
  Save,
  Trash2,
  Wand2,
  LayoutDashboard,
  GripVertical,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react';
import { executeSearch, createDashboard, createDashboardPanel, getDashboards } from '../api/client';
import type { Dashboard } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  PanelChart,
  suggestVisualizations,
  vizLabel,
  analyzeResults,
  type PanelVizType,
} from '../components/dashboard/PanelChart';

const ALL_VIZ: PanelVizType[] = ['table', 'stat', 'line', 'area', 'bar', 'pie', 'gauge', 'heatmap', 'wordcloud'];

const STARTERS: { label: string; query: string }[] = [
  { label: 'Events over time', query: 'search * | timechart span=1h count' },
  { label: 'Top hosts', query: 'search * | stats count by hostname | sort -count | head 10' },
  { label: 'Errors by app', query: 'search severity<=3 | stats count by app_name | sort -count' },
  { label: 'Total event count', query: 'search * | stats count' },
];

interface StagedPanel {
  id: string;
  title: string;
  query: string;
  visualization: string;
}

let panelCounter = 0;

export default function DashboardStudioPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  const [query, setQuery] = useState('search * | timechart span=1h count');
  const [timeRange] = useState('-24h');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [viz, setViz] = useState<string>('table');
  const [panelTitle, setPanelTitle] = useState('');
  const [staged, setStaged] = useState<StagedPanel[]>([]);
  const [saving, setSaving] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [existing, setExisting] = useState<Dashboard[]>([]);
  const [targetDashboard, setTargetDashboard] = useState<string>('__new__');
  const dragIndex = useRef<number | null>(null);

  const suggestions = useMemo(() => suggestVisualizations(results), [results]);
  const recommended = suggestions[0];

  const runQuery = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await executeSearch(query, timeRange, 'now');
      const rows = res.results || [];
      setResults(rows);
      setHasRun(true);
      // Auto-pick the recommended visualization from the result shape.
      const best = suggestVisualizations(rows)[0];
      setViz(best);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, timeRange]);

  const smartTitle = useCallback(() => {
    if (panelTitle.trim()) return panelTitle.trim();
    // Derive a readable title from the query's stats/timechart clause.
    const byMatch = query.match(/\bby\s+([a-zA-Z0-9_.]+)/);
    if (/timechart/i.test(query)) return byMatch ? `Count over time by ${byMatch[1]}` : 'Count over time';
    if (/stats\s+count/i.test(query)) return byMatch ? `Count by ${byMatch[1]}` : 'Total count';
    return query.replace(/^search\s+/i, '').slice(0, 40) || 'Panel';
  }, [panelTitle, query]);

  const addPanel = useCallback(() => {
    if (!hasRun) return;
    setStaged((prev) => [
      ...prev,
      { id: `stg-${++panelCounter}`, title: smartTitle(), query, visualization: viz },
    ]);
    setPanelTitle('');
    toast.success('Panel added', 'Added to the canvas on the right');
  }, [hasRun, smartTitle, query, viz, toast]);

  const removePanel = (id: string) => setStaged((prev) => prev.filter((p) => p.id !== id));

  const editPanel = (p: StagedPanel) => {
    setQuery(p.query);
    setViz(p.visualization);
    setPanelTitle(p.title);
    void runQueryFor(p.query);
  };

  const runQueryFor = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await executeSearch(q, timeRange, 'now');
      setResults(res.results || []);
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const onDragStart = (i: number) => (dragIndex.current = i);
  const onDrop = (i: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === i) return;
    setStaged((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
  };

  const openSave = async () => {
    if (staged.length === 0) {
      toast.error('Nothing to save', 'Add at least one panel to the canvas first');
      return;
    }
    try {
      setExisting(await getDashboards());
    } catch {
      /* non-fatal */
    }
    setDashboardName('');
    setTargetDashboard('__new__');
    setSaving(true);
  };

  const doSave = async () => {
    try {
      let dashboardId: string;
      if (targetDashboard === '__new__') {
        if (!dashboardName.trim()) {
          toast.error('Name required', 'Give the dashboard a name');
          return;
        }
        const d = await createDashboard(dashboardName.trim());
        dashboardId = d.id;
      } else {
        dashboardId = targetDashboard;
      }

      // Lay panels out two-per-row on the 12-col grid.
      let x = 0;
      let y = 0;
      for (const p of staged) {
        await createDashboardPanel(dashboardId, {
          title: p.title,
          query: p.query,
          visualization: p.visualization,
          position: { x, y, width: 6, height: 4 },
        });
        x += 6;
        if (x >= 12) {
          x = 0;
          y += 4;
        }
      }

      toast.success('Dashboard saved', `${staged.length} panel(s) created`);
      setSaving(false);
      navigate(`/dashboards/${dashboardId}`);
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : 'Could not save dashboard');
    }
  };

  const fieldSummary = useMemo(() => {
    if (results.length === 0) return null;
    return analyzeResults(results);
  }, [results]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-nog-200 dark:border-nog-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-nog bg-honey-100 dark:bg-honey-900/30 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-honey-600 dark:text-honey-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-nog-900 dark:text-nog-100 tracking-tight">Dashboard Studio</h1>
            <p className="text-xs text-nog-500">Search → preview → drop onto the canvas. No config files.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-nog-500">{staged.length} panel{staged.length === 1 ? '' : 's'} staged</span>
          <button onClick={openSave} className="btn-primary flex items-center gap-2" disabled={staged.length === 0}>
            <Save className="w-4 h-4" /> Save dashboard
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* LEFT: build + preview */}
        <div className="w-3/5 flex flex-col border-r border-nog-200 dark:border-nog-700 min-h-0">
          <div className="p-4 space-y-3">
            {/* Query editor */}
            <div className="flex gap-2">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void runQuery();
                  }
                }}
                rows={2}
                spellCheck={false}
                placeholder="search * | stats count by hostname | sort -count"
                className="flex-1 font-mono text-sm px-3 py-2 rounded-nog border border-nog-300 dark:border-nog-600 bg-white dark:bg-nog-800 text-nog-900 dark:text-nog-100 resize-none focus:outline-none focus:ring-2 focus:ring-honey-400"
              />
              <button onClick={() => void runQuery()} className="btn-primary flex items-center gap-2 self-stretch px-4" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run
              </button>
            </div>

            {/* Starters */}
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setQuery(s.query);
                    setTimeout(() => void runQuery(), 0);
                  }}
                  className="text-xs px-2 py-1 rounded-full border border-nog-300 dark:border-nog-600 text-nog-600 dark:text-nog-300 hover:border-honey-400 hover:text-honey-600 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Viz switcher */}
          {hasRun && !error && results.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-nog-500 mr-1">Visualize as</span>
              {ALL_VIZ.map((v) => {
                const isRecommended = v === recommended;
                const active = v === viz;
                return (
                  <button
                    key={v}
                    onClick={() => setViz(v)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                      active
                        ? 'bg-honey-500 border-honey-500 text-white'
                        : 'border-nog-300 dark:border-nog-600 text-nog-600 dark:text-nog-300 hover:border-honey-400'
                    }`}
                    title={isRecommended ? 'Recommended for this data' : undefined}
                  >
                    {isRecommended && <Sparkles className="w-3 h-3" />}
                    {vizLabel(v)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Preview */}
          <div className="flex-1 min-h-0 p-4 pt-2">
            <div className="h-full rounded-nog border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-nog-200 dark:border-nog-700">
                <input
                  value={panelTitle}
                  onChange={(e) => setPanelTitle(e.target.value)}
                  placeholder={hasRun ? smartTitle() : 'Panel title'}
                  className="text-sm font-medium bg-transparent text-nog-800 dark:text-nog-200 focus:outline-none flex-1"
                />
                <button
                  onClick={addPanel}
                  disabled={!hasRun || results.length === 0}
                  className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to canvas
                </button>
              </div>
              <div className="flex-1 min-h-0 p-3">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-nog-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="h-full flex items-center justify-center text-red-500 text-sm text-center px-4">{error}</div>
                ) : !hasRun ? (
                  <div className="h-full flex flex-col items-center justify-center text-nog-400 gap-2">
                    <Wand2 className="w-8 h-8" />
                    <p className="text-sm">Run a query to preview a panel</p>
                  </div>
                ) : (
                  <PanelChart visualization={viz} results={results} darkMode={isDarkMode} height={260} />
                )}
              </div>
              {fieldSummary && (
                <div className="px-3 py-1.5 border-t border-nog-200 dark:border-nog-700 text-[11px] text-nog-500 truncate">
                  {results.length} rows · fields: {fieldSummary.keys.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: canvas */}
        <div className="w-2/5 flex flex-col min-h-0 bg-nog-50 dark:bg-nog-900/40">
          <div className="px-4 py-3 border-b border-nog-200 dark:border-nog-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-nog-800 dark:text-nog-200">Canvas</h2>
            <span className="text-xs text-nog-500">drag to reorder</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
            {staged.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-nog-400 gap-2 text-center px-6">
                <LayoutDashboard className="w-10 h-10" />
                <p className="text-sm">Panels you add appear here.</p>
                <p className="text-xs">Build a query, pick a chart, hit “Add to canvas”.</p>
              </div>
            ) : (
              staged.map((p, i) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  className="rounded-nog border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 p-2 flex items-start gap-2 group"
                >
                  <GripVertical className="w-4 h-4 text-nog-300 mt-1 cursor-grab flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => editPanel(p)}
                        className="text-sm font-medium text-nog-800 dark:text-nog-200 truncate hover:text-honey-600 text-left"
                        title="Load back into the editor"
                      >
                        {p.title}
                      </button>
                      <button onClick={() => removePanel(p.id)} className="text-nog-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-honey-100 dark:bg-honey-900/30 text-honey-700 dark:text-honey-400">
                        {vizLabel(p.visualization)}
                      </span>
                      <code className="text-[11px] text-nog-500 truncate">{p.query}</code>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Save modal */}
      {saving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSaving(false)}>
          <div className="bg-white dark:bg-nog-800 rounded-nog shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-nog-900 dark:text-nog-100">Save dashboard</h3>
              <button onClick={() => setSaving(false)} className="text-nog-400 hover:text-nog-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm text-nog-600 dark:text-nog-300">Destination</label>
              <select
                value={targetDashboard}
                onChange={(e) => setTargetDashboard(e.target.value)}
                className="w-full px-3 py-2 rounded-nog border border-nog-300 dark:border-nog-600 bg-white dark:bg-nog-800 text-nog-900 dark:text-nog-100"
              >
                <option value="__new__">➕ New dashboard</option>
                {existing.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {targetDashboard === '__new__' && (
                <input
                  autoFocus
                  value={dashboardName}
                  onChange={(e) => setDashboardName(e.target.value)}
                  placeholder="Dashboard name"
                  className="w-full px-3 py-2 rounded-nog border border-nog-300 dark:border-nog-600 bg-white dark:bg-nog-800 text-nog-900 dark:text-nog-100"
                />
              )}
              <p className="text-xs text-nog-500">{staged.length} panel(s) will be created.</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setSaving(false)} className="btn-secondary">Cancel</button>
              <button onClick={doSave} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Lightbulb, Loader2, Settings } from 'lucide-react';

interface Insight {
  type: 'anomaly' | 'trend' | 'suggestion';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  action?: {
    label: string;
    query?: string;
  };
}

interface AIInsightsPanelProps {
  dashboardId: string;
  timeRange: string;
  enabled?: boolean;
  onConfigureAI?: () => void;
}

export function AIInsightsPanel({
  dashboardId,
  timeRange,
  enabled = true,
  onConfigureAI,
}: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);

  const fetchInsights = async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      // Check if Ollama is available
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId, timeRange }),
      });

      if (response.status === 503) {
        setOllamaAvailable(false);
        // Show placeholder insights
        setInsights([
          {
            type: 'suggestion',
            severity: 'info',
            title: 'AI Insights Unavailable',
            description: 'Connect Ollama to enable AI-powered insights. Run "ollama serve" and configure the connection in settings.',
            action: { label: 'Configure AI' },
          },
        ]);
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch insights');

      const data = await response.json();
      setOllamaAvailable(true);
      setInsights(data.insights || []);
    } catch (err) {
      // Fallback to demo insights when API unavailable
      setOllamaAvailable(false);
      setInsights(getDemoInsights());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [dashboardId, timeRange, enabled]);

  if (!enabled) return null;

  const getInsightIcon = (type: Insight['type'], severity: Insight['severity']) => {
    switch (type) {
      case 'anomaly':
        return <AlertTriangle className={`w-4 h-4 ${
          severity === 'critical' ? 'text-red-500' :
          severity === 'warning' ? 'text-amber-500' : 'text-amber-500'
        }`} />;
      case 'trend':
        return severity === 'warning'
          ? <TrendingDown className="w-4 h-4 text-amber-500" />
          : <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'suggestion':
        return <Lightbulb className="w-4 h-4 text-amber-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">AI Insights</h3>
          {ollamaAvailable === false && (
            <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
              Demo Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchInsights}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded transition-colors"
            title="Refresh insights"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onConfigureAI && (
            <button
              onClick={onConfigureAI}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded transition-colors"
              title="Configure AI"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && insights.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-4 text-red-600 dark:text-red-400">
            <p>{error}</p>
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-4 text-slate-500 dark:text-slate-400">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No insights available for this time range</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  insight.severity === 'critical'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : insight.severity === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-nog-50 dark:bg-nog-700/50 border-slate-200 dark:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getInsightIcon(insight.type, insight.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {insight.title}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      {insight.description}
                    </p>
                    {insight.action && (
                      <button
                        onClick={() => {
                          if (insight.action?.label === 'Configure AI' && onConfigureAI) {
                            onConfigureAI();
                          } else if (insight.action?.query) {
                            window.location.href = `/search?query=${encodeURIComponent(insight.action.query)}`;
                          }
                        }}
                        className="mt-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {insight.action.label} →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getDemoInsights(): Insight[] {
  return [
    {
      type: 'anomaly',
      severity: 'warning',
      title: 'Unusual spike in error logs',
      description: 'Error rate increased 3x compared to the 24-hour average around 3:00 AM.',
      action: { label: 'Investigate', query: 'search severity>=error | timechart count' },
    },
    {
      type: 'trend',
      severity: 'info',
      title: 'Login activity trending up',
      description: 'Successful logins have increased 25% over the past week.',
      action: { label: 'View trend', query: 'search message~"login" | stats count by day' },
    },
    {
      type: 'suggestion',
      severity: 'info',
      title: 'Consider adding an alert',
      description: 'Multiple hosts showing repeated connection timeouts. Setting up an alert could help catch issues early.',
      action: { label: 'Create alert' },
    },
  ];
}

export default AIInsightsPanel;

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  LayoutDashboard,
  Trash2,
  Loader2,
  Calendar,
  Grid3X3,
  X,
  Sparkles,
  Copy,
  Wand2,
  Filter,
} from 'lucide-react';
import { getDashboards, createDashboard, deleteDashboard, duplicateDashboard, Dashboard } from '../api/client';
import DashboardBuilderWizard from '../components/DashboardBuilderWizard';
import AppScopeFilter from '../components/AppScopeFilter';
import { useDateFormat } from '../contexts/DateFormatContext';

const TEMPLATES = [
  {
    name: 'System Overview',
    description: 'Monitor system health, log volume, and errors across all hosts',
    icon: '🖥️',
    color: 'from-amber-500 to-amber-500',
  },
  {
    name: 'Network Traffic',
    description: 'Firewall logs, connection states, and traffic patterns',
    icon: '🌐',
    color: 'from-amber-500 to-pink-500',
  },
  {
    name: 'Security Events',
    description: 'Authentication failures, security alerts, and access logs',
    icon: '🛡️',
    color: 'from-red-500 to-orange-500',
  },
  {
    name: 'Application Logs',
    description: 'Application performance, errors, and usage metrics',
    icon: '📱',
    color: 'from-green-500 to-amber-500',
  },
];

export default function DashboardsPage() {
  const { formatDatePart } = useDateFormat();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [newDashboardDescription, setNewDashboardDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [appScope, setAppScope] = useState<string>('all');

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ['dashboards', appScope],
    queryFn: () => getDashboards(appScope === 'all' ? undefined : appScope),
  });

  const createMutation = useMutation({
    mutationFn: () => createDashboard(newDashboardName, newDashboardDescription, appScope === 'all' ? 'default' : appScope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setShowCreateModal(false);
      setNewDashboardName('');
      setNewDashboardDescription('');
      setSelectedTemplate(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: duplicateDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template.name);
    setNewDashboardName(template.name);
    setNewDashboardDescription(template.description);
    setShowCreateModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-600">Loading dashboards...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-900">Failed to load dashboards</p>
          <p className="text-sm text-red-700 mt-1">{String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboards</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 hidden sm:block">Create and manage log visualization dashboards</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <AppScopeFilter value={appScope} onChange={setAppScope} />
              </div>
              <button
                onClick={() => setShowWizard(true)}
                className="btn-primary flex-1 sm:flex-initial justify-center"
              >
                <Wand2 className="w-5 h-5" />
                <span>Build from Index</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-secondary flex-1 sm:flex-initial justify-center"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Blank</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
        {/* User Dashboards */}
        {dashboards && dashboards.length > 0 && (
          <section>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Your Dashboards</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {dashboards.map((dashboard: Dashboard) => (
                <div key={dashboard.id} className="card-hover group">
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                          <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">{dashboard.name}</h3>
                          {dashboard.description && (
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{dashboard.description}</p>
                          )}
                        </div>
                      </div>
                      {/* Action buttons - visible on mobile, hover on desktop */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => duplicateMutation.mutate(dashboard.id)}
                          disabled={duplicateMutation.isPending}
                          className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-all disabled:opacity-50"
                          title="Duplicate dashboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete dashboard "${dashboard.name}"? This cannot be undone.`)) {
                              deleteMutation.mutate(dashboard.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                          title="Delete dashboard"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-3 sm:gap-4 text-xs text-slate-500 dark:text-slate-400">
                        {dashboard.app_scope && dashboard.app_scope !== 'default' && (
                          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium">
                            {dashboard.app_scope}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                          {formatDatePart(dashboard.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Grid3X3 className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                          {dashboard.panel_count || 0} panels
                        </span>
                      </div>
                      <Link to={`/dashboards/${dashboard.id}`} className="text-xs sm:text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400">
                        Open →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {(!dashboards || dashboards.length === 0) && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No dashboards yet</h3>
            <p className="text-slate-500 mb-6">Create your first dashboard to start visualizing logs</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus className="w-5 h-5" />
              Create Dashboard
            </button>
          </div>
        )}

        {/* Templates */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Starter Templates</h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            Quick-start with pre-configured dashboards for common use cases
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEMPLATES.map((template) => (
              <button
                key={template.name}
                onClick={() => handleTemplateSelect(template)}
                className="card-hover text-left group"
              >
                <div className="p-5">
                  <div className={`w-12 h-12 bg-gradient-to-br ${template.color} rounded-xl flex items-center justify-center text-2xl mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                    {template.icon}
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{template.name}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{template.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Tips */}
        <section className="card p-6 bg-gradient-to-r from-amber-50 to-amber-50 border-amber-100">
          <h3 className="font-semibold text-amber-900 mb-3">Dashboard Tips</h3>
          <ul className="space-y-2 text-sm text-amber-800">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">•</span>
              Use time filters to focus on relevant data and improve performance
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">•</span>
              Create saved searches first, then add them as dashboard panels
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">•</span>
              Use stats commands for aggregated views instead of raw log tables
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">•</span>
              Check the Documentation page for query language reference
            </li>
          </ul>
        </section>
      </div>

      {/* Create Dashboard Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {selectedTemplate ? `Create ${selectedTemplate}` : 'New Dashboard'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Configure your dashboard settings
                  </p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="modal-body space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Dashboard Name
                </label>
                <input
                  type="text"
                  value={newDashboardName}
                  onChange={(e) => setNewDashboardName(e.target.value)}
                  placeholder="My Dashboard"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newDashboardDescription}
                  onChange={(e) => setNewDashboardDescription(e.target.value)}
                  placeholder="What does this dashboard monitor?"
                  rows={3}
                  className="input resize-none"
                />
              </div>

              {selectedTemplate && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-800">
                    <strong>Template:</strong> This will create an empty dashboard.
                    Add panels manually using queries from the Documentation.
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newDashboardName.trim() || createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Builder Wizard */}
      <DashboardBuilderWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={(dashboardId) => {
          queryClient.invalidateQueries({ queryKey: ['dashboards'] });
          navigate(`/dashboards/${dashboardId}`);
        }}
      />
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Copy, Loader2, ChevronDown, Search } from 'lucide-react';
import {
  getProjects,
  getProjectDashboards,
  getAllPanels,
  copyPanelToDashboard,
  Project,
  ProjectDashboard,
} from '../api/client';

interface PanelCopyModalProps {
  onClose: () => void;
  onSuccess?: (dashboardId: string, panelId: string) => void;
}

export function PanelCopyModal({ onClose, onSuccess }: PanelCopyModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<ProjectDashboard | null>(null);
  const [selectedPanels, setSelectedPanels] = useState<Set<string>>(new Set());
  const [customTitle, setCustomTitle] = useState('');
  const [copying, setCopying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch projects
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  // Fetch dashboards for selected project
  const { data: dashboards = [], isLoading: loadingDashboards } = useQuery({
    queryKey: ['project-dashboards', selectedProject?.id],
    queryFn: () => getProjectDashboards(selectedProject!.id),
    enabled: !!selectedProject,
  });

  // Fetch all panels
  const { data: allPanels = [], isLoading: loadingPanels } = useQuery({
    queryKey: ['all-panels'],
    queryFn: getAllPanels,
    enabled: step === 3,
  });

  // Filter panels by dashboard and search term
  const filteredPanels = allPanels.filter((panel) => {
    if (selectedDashboard && panel.dashboard_id !== selectedDashboard.dashboard_id) {
      return false;
    }
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        panel.title.toLowerCase().includes(search) ||
        panel.dashboard_name.toLowerCase().includes(search) ||
        panel.query.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const handleCopy = async () => {
    if (!selectedDashboard || selectedPanels.size === 0) return;

    setCopying(true);
    try {
      for (const panelId of selectedPanels) {
        await copyPanelToDashboard(
          selectedDashboard.dashboard_id,
          panelId,
          customTitle || undefined
        );
      }
      if (onSuccess) {
        onSuccess(selectedDashboard.dashboard_id, Array.from(selectedPanels)[0]);
      }
      onClose();
    } catch (error) {
      console.error('Failed to copy panels:', error);
      alert('Failed to copy panels. Please try again.');
    } finally {
      setCopying(false);
    }
  };

  const togglePanel = (panelId: string) => {
    const newSet = new Set(selectedPanels);
    if (newSet.has(panelId)) {
      newSet.delete(panelId);
    } else {
      newSet.add(panelId);
    }
    setSelectedPanels(newSet);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Copy className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Copy Existing Panel
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Step {step} of 3: {step === 1 ? 'Select Project' : step === 2 ? 'Select Dashboard' : 'Select Panels'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          {/* Step 1: Select Project */}
          {step === 1 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Select a project
              </label>
              {loadingProjects ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => {
                        setSelectedProject(project);
                        setStep(2);
                      }}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                        selectedProject?.id === project.id
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-600 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {project.logo_url && (
                          <img
                            src={project.logo_url}
                            alt={project.name}
                            className="w-10 h-10 rounded object-contain bg-white dark:bg-slate-800"
                          />
                        )}
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {project.name}
                          </div>
                          {project.description && (
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              {project.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Dashboard */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Select a dashboard from {selectedProject?.name}
                </label>
                <button
                  onClick={() => {
                    setStep(1);
                    setSelectedDashboard(null);
                  }}
                  className="text-xs text-amber-600 hover:underline"
                >
                  Change project
                </button>
              </div>
              {loadingDashboards ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dashboards.map((dashboard) => (
                    <button
                      key={dashboard.dashboard_id}
                      onClick={() => {
                        setSelectedDashboard(dashboard);
                        setStep(3);
                      }}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                        selectedDashboard?.dashboard_id === dashboard.dashboard_id
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-600 hover:border-amber-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {dashboard.dashboard_name}
                      </div>
                      {dashboard.description && (
                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {dashboard.description}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 mt-2">
                        {dashboard.panel_count || 0} panels
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Panels */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Select panels to copy
                </label>
                <button
                  onClick={() => {
                    setStep(2);
                    setSelectedPanels(new Set());
                  }}
                  className="text-xs text-amber-600 hover:underline"
                >
                  Change dashboard
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search panels..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                />
              </div>

              {/* Panels List */}
              {loadingPanels ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredPanels.map((panel) => (
                    <label
                      key={panel.id}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedPanels.has(panel.id)
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-600 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          checked={selectedPanels.has(panel.id)}
                          onChange={() => togglePanel(panel.id)}
                          className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {panel.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          From: {panel.dashboard_name}
                          {panel.project_name && ` • ${panel.project_name}`}
                        </div>
                        <div className="text-xs text-slate-400 mt-2 font-mono truncate">
                          {panel.query}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Type: {panel.visualization}
                        </div>
                      </div>
                    </label>
                  ))}
                  {filteredPanels.length === 0 && (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No panels found
                    </div>
                  )}
                </div>
              )}

              {/* Custom title */}
              {selectedPanels.size === 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Custom title (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave empty to use original title"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="input"
                  />
                </div>
              )}

              {selectedPanels.size > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    {selectedPanels.size} panel{selectedPanels.size > 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={
                (step === 1 && !selectedProject) ||
                (step === 2 && !selectedDashboard)
              }
              className="btn-primary"
            >
              Next
              <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
            </button>
          ) : (
            <button
              onClick={handleCopy}
              disabled={selectedPanels.size === 0 || copying}
              className="btn-primary"
            >
              {copying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Copying...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Panel{selectedPanels.size > 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PanelCopyModal;

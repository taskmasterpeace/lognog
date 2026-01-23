import { useQuery } from '@tanstack/react-query';
import { X, GitMerge, Loader2, ExternalLink } from 'lucide-react';
import { getPanelProvenance } from '../api/client';

interface PanelProvenanceModalProps {
  dashboardId: string;
  panelId: string;
  panelTitle: string;
  onClose: () => void;
}

export function PanelProvenanceModal({
  dashboardId,
  panelId,
  panelTitle,
  onClose,
}: PanelProvenanceModalProps) {
  const { data: provenance, isLoading, error } = useQuery({
    queryKey: ['panel-provenance', dashboardId, panelId],
    queryFn: () => getPanelProvenance(dashboardId, panelId),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Panel Origin
              </h3>
            </div>
            <button onClick={onClose} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">
                Failed to load provenance information
              </p>
            </div>
          )}

          {provenance && (
            <div className="space-y-4">
              {/* Current Panel */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Current Panel
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {panelTitle}
                </div>
              </div>

              {/* Origin Info */}
              {provenance.source_panel_id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-px h-8 bg-slate-300 dark:bg-slate-600 ml-2" />
                  </div>

                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                      Copied From
                    </div>

                    {provenance.source_project_name && (
                      <div className="text-sm text-slate-600 dark:text-slate-300 mb-1">
                        <span className="font-medium">Project:</span>{' '}
                        {provenance.source_project_name}
                      </div>
                    )}

                    <div className="text-sm text-slate-600 dark:text-slate-300 mb-1">
                      <span className="font-medium">Dashboard:</span>{' '}
                      {provenance.source_dashboard_name}
                    </div>

                    {provenance.copied_at && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Copied on {new Date(provenance.copied_at).toLocaleString()}
                      </div>
                    )}

                    {provenance.source_dashboard_id && (
                      <a
                        href={`/dashboards/${provenance.source_dashboard_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 mt-3"
                      >
                        View original dashboard
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    This panel was created directly in this dashboard (not copied).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelProvenanceModal;

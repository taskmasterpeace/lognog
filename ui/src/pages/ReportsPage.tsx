import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Plus,
  Download,
  Trash2,
  Loader2,
  Calendar,
  Mail,
  Clock,
  X,
  Play,
  Pause,
  AlertCircle,
  FileCode,
  Eye,
  Maximize2,
  Minimize2,
  Printer,
  Filter,
} from 'lucide-react';
import {
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  generateReport,
  ScheduledReport,
} from '../api/client';
import AppScopeFilter from '../components/AppScopeFilter';

const SCHEDULE_OPTIONS = [
  { label: 'Every hour', value: '0 * * * *', desc: 'Runs at the start of every hour' },
  { label: 'Every 6 hours', value: '0 */6 * * *', desc: 'Runs every 6 hours' },
  { label: 'Daily at midnight', value: '0 0 * * *', desc: 'Runs daily at 00:00' },
  { label: 'Daily at 8 AM', value: '0 8 * * *', desc: 'Runs daily at 08:00' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1', desc: 'Runs every Monday at midnight' },
  { label: 'Monthly', value: '0 0 1 * *', desc: 'Runs on the 1st of every month' },
];

const TIME_PRESETS = [
  { label: 'Last hour', value: '-1h' },
  { label: 'Last 24 hours', value: '-24h' },
  { label: 'Last 7 days', value: '-7d' },
  { label: 'Last 30 days', value: '-30d' },
];

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportQuery, setReportQuery] = useState('search * | stats count by hostname');
  const [reportSchedule, setReportSchedule] = useState('0 0 * * *');
  const [reportRecipients, setReportRecipients] = useState('');
  const [appScope, setAppScope] = useState<string>('all');

  const [generateQuery, setGenerateQuery] = useState('search * | stats count by hostname');
  const [generateTitle, setGenerateTitle] = useState('Log Report');
  const [generateTimeRange, setGenerateTimeRange] = useState('-24h');
  const [generating, setGenerating] = useState(false);
  const [reportPreview, setReportPreview] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const queryClient = useQueryClient();

  // Handle URL params for "Create from Search" flow
  useEffect(() => {
    const action = searchParams.get('action');
    const queryParam = searchParams.get('query');
    const timeRangeParam = searchParams.get('timeRange');

    if (action === 'create' && queryParam) {
      // Pre-populate the generate report form
      setGenerateQuery(queryParam);
      setGenerateTitle('Report from Search');
      if (timeRangeParam) {
        setGenerateTimeRange(timeRangeParam);
      }

      // Open the generate modal
      setShowGenerateModal(true);

      // Clear URL params to prevent re-triggering
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: reports, isLoading, error } = useQuery({
    queryKey: ['scheduledReports', appScope],
    queryFn: () => getScheduledReports(appScope === 'all' ? undefined : appScope),
  });

  const createMutation = useMutation({
    mutationFn: () => createScheduledReport(reportName, reportQuery, reportSchedule, reportRecipients, 'html', appScope === 'all' ? 'default' : appScope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateScheduledReport(id, { enabled: enabled ? 1 : 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
    },
  });

  const resetForm = () => {
    setReportName('');
    setReportQuery('search * | stats count by hostname');
    setReportSchedule('0 0 * * *');
    setReportRecipients('');
  };

  const handleGenerateReport = async (mode: 'download' | 'preview') => {
    setGenerating(true);
    try {
      const blob = await generateReport(generateQuery, 'html', generateTitle, generateTimeRange);
      if (blob instanceof Blob) {
        if (mode === 'download') {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${generateTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setShowGenerateModal(false);
        } else {
          // Preview mode - read the blob as text
          const html = await blob.text();
          setReportPreview(html);
          setShowGenerateModal(false);
          setShowPreviewModal(true);
        }
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrintReport = () => {
    if (!reportPreview) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportPreview);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleDownloadCurrentReport = () => {
    if (!reportPreview) return;
    const blob = new Blob([reportPreview], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generateTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getScheduleLabel = (cron: string) => {
    const option = SCHEDULE_OPTIONS.find(o => o.value === cron);
    return option?.label || cron;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading reports...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-900">Failed to load reports</p>
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
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 hidden sm:block">Generate and schedule log reports</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <AppScopeFilter value={appScope} onChange={setAppScope} />
              </div>
              <button onClick={() => setShowGenerateModal(true)} className="btn-secondary flex-1 sm:flex-none justify-center">
                <Download className="w-4 h-4" />
                <span className="sm:inline">Export</span>
              </button>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary flex-1 sm:flex-none justify-center">
                <Plus className="w-4 h-4" />
                <span className="sm:inline">Schedule</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Quick Export Section */}
        <section className="card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <FileCode className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 text-sm sm:text-base">Generate & View Reports</h2>
              <p className="text-xs sm:text-sm text-slate-500 mb-3">
                Create reports from any query. Preview in browser, print to PDF, or download as HTML.
              </p>
              <button onClick={() => setShowGenerateModal(true)} className="btn-primary w-full sm:w-auto justify-center">
                <Eye className="w-4 h-4" />
                Generate Report
              </button>
            </div>
          </div>
        </section>

        {/* Last Generated Report */}
        {reportPreview && (
          <section className="card p-4 sm:p-6 border-amber-200 bg-amber-50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Last Generated Report</h3>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">{generateTitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-12 sm:ml-0">
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="btn-secondary text-sm"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">View</span>
                </button>
                <button
                  onClick={handleDownloadCurrentReport}
                  className="btn-ghost p-2"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePrintReport}
                  className="btn-ghost p-2"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Scheduled Reports */}
        <section>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Scheduled Reports</h2>

          {reports && reports.length > 0 ? (
            <div className="space-y-3">
              {reports.map((report: ScheduledReport) => (
                <div key={report.id} className="card p-3 sm:p-4 group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        report.enabled ? 'bg-amber-100' : 'bg-slate-100'
                      }`}>
                        <FileText className={`w-4 h-4 sm:w-5 sm:h-5 ${
                          report.enabled ? 'text-amber-600' : 'text-slate-400'
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">{report.name}</h3>
                        <code className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 sm:px-2 py-0.5 rounded mt-1 inline-block max-w-full truncate">
                          {report.query}
                        </code>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-[10px] sm:text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            {getScheduleLabel(report.schedule)}
                          </span>
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                            <span className="truncate">{report.recipients}</span>
                          </span>
                          {report.last_run && (
                            <span className="flex items-center gap-1 hidden sm:flex">
                              <Calendar className="w-3.5 h-3.5" />
                              Last: {new Date(report.last_run).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleMutation.mutate({ id: report.id, enabled: !report.enabled })}
                        className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                          report.enabled
                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                            : 'text-slate-400 bg-slate-100 hover:bg-slate-200'
                        }`}
                        title={report.enabled ? 'Pause schedule' : 'Enable schedule'}
                      >
                        {report.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(report.id)}
                        className="p-1.5 sm:p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-6 sm:p-8 text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 text-sm sm:text-base">No scheduled reports</h3>
              <p className="text-xs sm:text-sm text-slate-500 mb-4">
                Schedule reports to be generated and emailed automatically
              </p>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary w-full sm:w-auto justify-center">
                <Plus className="w-4 h-4" />
                Create Scheduled Report
              </button>
            </div>
          )}
        </section>

        {/* Info Section */}
        <section className="card p-4 sm:p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100">
          <div className="flex items-start gap-2 sm:gap-3">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1 text-sm sm:text-base">Email Delivery</h3>
              <p className="text-xs sm:text-sm text-amber-800">
                Scheduled reports require SMTP configuration. Set these environment variables:
              </p>
              <code className="block mt-2 text-[10px] sm:text-xs bg-amber-100 text-amber-900 p-2 rounded font-mono overflow-x-auto">
                SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
              </code>
            </div>
          </div>
        </section>
      </div>

      {/* Create Schedule Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal animate-slide-up w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Schedule Report</h3>
                <button onClick={() => setShowCreateModal(false)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="modal-body space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Report Name</label>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="Daily Error Summary"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Query</label>
                <textarea
                  value={reportQuery}
                  onChange={(e) => setReportQuery(e.target.value)}
                  placeholder="search severity<=3 | stats count by hostname"
                  rows={2}
                  className="input font-mono text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Schedule</label>
                <select
                  value={reportSchedule}
                  onChange={(e) => setReportSchedule(e.target.value)}
                  className="input"
                >
                  {SCHEDULE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Recipients</label>
                <input
                  type="text"
                  value={reportRecipients}
                  onChange={(e) => setReportRecipients(e.target.value)}
                  placeholder="admin@example.com, team@example.com"
                  className="input"
                />
                <p className="text-xs text-slate-500 mt-1">Comma-separated email addresses</p>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!reportName || !reportQuery || !reportRecipients || createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Report Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal animate-slide-up w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Generate Report</h3>
                <button onClick={() => setShowGenerateModal(false)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="modal-body space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Report Title</label>
                <input
                  type="text"
                  value={generateTitle}
                  onChange={(e) => setGenerateTitle(e.target.value)}
                  placeholder="Log Report"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Query</label>
                <textarea
                  value={generateQuery}
                  onChange={(e) => setGenerateQuery(e.target.value)}
                  placeholder="search * | stats count by hostname"
                  rows={3}
                  className="input font-mono text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Time Range</label>
                <div className="flex flex-wrap gap-2">
                  {TIME_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setGenerateTimeRange(preset.value)}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg border transition-colors ${
                        generateTimeRange === preset.value
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer flex-wrap gap-2">
              <button onClick={() => setShowGenerateModal(false)} className="btn-secondary flex-1 sm:flex-none justify-center">
                Cancel
              </button>
              <button
                onClick={() => handleGenerateReport('preview')}
                disabled={!generateQuery || generating}
                className="btn-secondary flex-1 sm:flex-none justify-center"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                <span className="hidden sm:inline">Preview</span>
              </button>
              <button
                onClick={() => handleGenerateReport('download')}
                disabled={!generateQuery || generating}
                className="btn-primary flex-1 sm:flex-none justify-center"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline">Download</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Preview Modal */}
      {showPreviewModal && reportPreview && (
        <div className="modal-overlay" onClick={() => !previewFullscreen && setShowPreviewModal(false)}>
          <div
            className={`bg-white dark:bg-slate-800 rounded-xl shadow-2xl flex flex-col animate-slide-up ${
              previewFullscreen
                ? 'fixed inset-4 m-0 max-w-none max-h-none'
                : 'max-w-5xl w-full max-h-[90vh] m-4'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Report Preview</h3>
                <p className="text-sm text-slate-500">{generateTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintReport}
                  className="btn-ghost"
                  title="Print Report"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDownloadCurrentReport}
                  className="btn-ghost"
                  title="Download HTML"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreviewFullscreen(!previewFullscreen)}
                  className="btn-ghost"
                  title={previewFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {previewFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewFullscreen(false);
                  }}
                  className="btn-ghost"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-4">
              <iframe
                srcDoc={reportPreview}
                className="w-full h-full min-h-[500px] bg-white rounded-lg shadow-inner border border-slate-200"
                title="Report Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

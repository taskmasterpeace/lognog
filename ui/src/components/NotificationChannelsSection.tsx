import { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Send,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  getNotificationChannels,
  getNotificationServices,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
  testAppriseUrl,
  getNotificationStatus,
  NotificationChannel,
  NotificationService,
} from '../api/client';

// Service icons mapping
const SERVICE_ICONS: Record<string, string> = {
  slack: 'https://cdn.simpleicons.org/slack/4A154B',
  discord: 'https://cdn.simpleicons.org/discord/5865F2',
  telegram: 'https://cdn.simpleicons.org/telegram/26A5E4',
  msteams: 'https://cdn.simpleicons.org/microsoftteams/6264A7',
  pagerduty: 'https://cdn.simpleicons.org/pagerduty/06AC38',
  email: 'https://cdn.simpleicons.org/maildotru/005FF9',
  webhook: 'https://cdn.simpleicons.org/webhook/C73A63',
};

export default function NotificationChannelsSection() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [services, setServices] = useState<NotificationService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appriseStatus, setAppriseStatus] = useState<{ available: boolean; message: string } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formService, setFormService] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [channelsData, servicesData, statusData] = await Promise.all([
        getNotificationChannels(),
        getNotificationServices(),
        getNotificationStatus(),
      ]);
      setChannels(channelsData);
      setServices(servicesData);
      setAppriseStatus(statusData);
    } catch (err) {
      setError('Failed to load notification channels');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingChannel(null);
    setFormName('');
    setFormService('slack');
    setFormUrl('');
    setFormDescription('');
    setFormEnabled(true);
    setShowModal(true);
  };

  const openEditModal = (channel: NotificationChannel) => {
    setEditingChannel(channel);
    setFormName(channel.name);
    setFormService(channel.service);
    setFormUrl(channel.apprise_url);
    setFormDescription(channel.description || '');
    setFormEnabled(channel.enabled === 1);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) return;

    setSaving(true);
    setError(null);

    try {
      if (editingChannel) {
        const updated = await updateNotificationChannel(editingChannel.id, {
          name: formName,
          service: formService,
          apprise_url: formUrl,
          description: formDescription || undefined,
          enabled: formEnabled,
        });
        setChannels(channels.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await createNotificationChannel({
          name: formName,
          service: formService,
          apprise_url: formUrl,
          description: formDescription || undefined,
          enabled: formEnabled,
        });
        setChannels([...channels, created]);
      }
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification channel?')) return;

    try {
      await deleteNotificationChannel(id);
      setChannels(channels.filter(c => c.id !== id));
    } catch (err) {
      setError('Failed to delete channel');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);

    try {
      const result = await testNotificationChannel(id);
      setTestResult({ id, success: result.success, message: result.message });
      // Refresh channels to get updated last_test
      loadData();
    } catch (err) {
      setTestResult({ id, success: false, message: 'Failed to send test' });
    } finally {
      setTestingId(null);
    }
  };

  const handleTestUrl = async () => {
    if (!formUrl.trim()) return;

    setTestingId('form');
    setTestResult(null);

    try {
      const result = await testAppriseUrl(formUrl, 'LogNog Test', 'Testing notification channel configuration');
      setTestResult({ id: 'form', success: result.success, message: result.message });
    } catch (err) {
      setTestResult({ id: 'form', success: false, message: 'Failed to send test' });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (channel: NotificationChannel) => {
    try {
      const updated = await updateNotificationChannel(channel.id, {
        enabled: channel.enabled !== 1,
      });
      setChannels(channels.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      setError('Failed to toggle channel');
    }
  };

  const getServiceName = (serviceId: string): string => {
    const service = services.find(s => s.id === serviceId);
    return service?.name || serviceId;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification Channels
        </h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Channel
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Configure notification channels for alert actions. Supports Slack, Discord, Telegram, PagerDuty, and 100+ more services via Apprise.
      </p>

      {/* Apprise Status */}
      {appriseStatus && (
        <div className={`mb-6 p-3 rounded-lg border ${
          appriseStatus.available
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-center gap-2">
            {appriseStatus.available ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
            <span className={`text-sm font-medium ${
              appriseStatus.available
                ? 'text-green-700 dark:text-green-300'
                : 'text-amber-700 dark:text-amber-300'
            }`}>
              {appriseStatus.message}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Channels List */}
      {channels.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notification channels configured yet.</p>
          <p className="text-xs mt-1">Add a channel to start receiving alert notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className={`p-4 rounded-lg border ${
                channel.enabled
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {/* Service Icon */}
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    {SERVICE_ICONS[channel.service] ? (
                      <img
                        src={SERVICE_ICONS[channel.service]}
                        alt={channel.service}
                        className="w-6 h-6"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Bell className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">
                        {channel.name}
                      </h4>
                      {channel.last_test_success === 1 && (
                        <span title="Last test successful">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        </span>
                      )}
                      {channel.last_test_success === 0 && (
                        <span title="Last test failed">
                          <XCircle className="w-4 h-4 text-red-500" />
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {getServiceName(channel.service)}
                      {channel.description && ` - ${channel.description}`}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-mono">
                      {channel.apprise_url_masked || channel.apprise_url}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Test button */}
                  <button
                    onClick={() => handleTest(channel.id)}
                    disabled={testingId === channel.id || !channel.enabled}
                    className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title="Send test notification"
                  >
                    {testingId === channel.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(channel)}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"
                    title={channel.enabled ? 'Disable' : 'Enable'}
                  >
                    {channel.enabled ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEditModal(channel)}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(channel.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Test result */}
              {testResult?.id === channel.id && (
                <div className={`mt-3 p-2 rounded text-sm ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                }`}>
                  {testResult.success ? <Check className="w-4 h-4 inline mr-1" /> : <X className="w-4 h-4 inline mr-1" />}
                  {testResult.message}
                </div>
              )}

              {/* Last test info */}
              {channel.last_test && (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Last tested: {formatDate(channel.last_test)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingChannel ? 'Edit Notification Channel' : 'Add Notification Channel'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Channel Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Channel Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., slack-ops-alerts"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Service */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Service
                </label>
                <select
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                {formService && services.find(s => s.id === formService) && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {services.find(s => s.id === formService)?.description}
                    <a
                      href={services.find(s => s.id === formService)?.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-sky-500 hover:text-sky-600 inline-flex items-center gap-1"
                    >
                      Docs <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                )}
              </div>

              {/* Apprise URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Apprise URL *
                </label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder={services.find(s => s.id === formService)?.urlPattern || 'service://...'}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-sm"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Format: {services.find(s => s.id === formService)?.urlPattern || 'See service documentation'}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g., #ops-alerts channel"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Enabled */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormEnabled(!formEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    formEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    formEnabled ? 'translate-x-5' : ''
                  }`} />
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {formEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {/* Test URL button */}
              {formUrl && (
                <div className="pt-2">
                  <button
                    onClick={handleTestUrl}
                    disabled={testingId === 'form'}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {testingId === 'form' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Test URL
                      </>
                    )}
                  </button>

                  {testResult?.id === 'form' && (
                    <div className={`mt-2 p-2 rounded text-sm ${
                      testResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    }`}>
                      {testResult.success ? <Check className="w-4 h-4 inline mr-1" /> : <X className="w-4 h-4 inline mr-1" />}
                      {testResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formUrl.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {editingChannel ? 'Save Changes' : 'Create Channel'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellOff,
  Plus,
  Trash2,
  Loader2,
  X,
  AlertCircle,
  Server,
  Globe,
  Clock,
} from 'lucide-react';
import {
  getSilences,
  createSilence,
  deleteSilence,
  getAlerts,
  AlertSilence,
  Alert,
} from '../api/client';

const DURATION_OPTIONS = [
  { label: '1 hour', value: '1h' },
  { label: '4 hours', value: '4h' },
  { label: '24 hours', value: '24h' },
  { label: '1 week', value: '1w' },
  { label: 'Indefinite', value: 'indefinite' },
];

export default function SilencesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: silences, isLoading } = useQuery({
    queryKey: ['silences'],
    queryFn: () => getSilences(true), // Active only
  });

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => getAlerts(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSilence,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['silences'] });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this silence?')) {
      deleteMutation.mutate(id);
    }
  };

  const formatDuration = (endsAt?: string) => {
    if (!endsAt) return 'Indefinite';
    const end = new Date(endsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return 'Expired';
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'global':
        return <Globe className="h-5 w-5 text-amber-500" />;
      case 'host':
        return <Server className="h-5 w-5 text-amber-500" />;
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      default:
        return <BellOff className="h-5 w-5" />;
    }
  };

  const getLevelBadge = (level: string) => {
    const colors = {
      global: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      host: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      alert: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
    );
  };

  const getTargetDisplay = (silence: AlertSilence) => {
    if (silence.level === 'global') return 'All alerts';
    if (silence.level === 'host') return `Host: ${silence.target_id}`;
    if (silence.level === 'alert' && alerts) {
      const alert = alerts.find((a) => a.id === silence.target_id);
      return alert ? `Alert: ${alert.name}` : `Alert: ${silence.target_id}`;
    }
    return silence.target_id || 'Unknown';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BellOff className="h-7 w-7" />
            Alert Silences
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage alert silencing at global, host, or alert level
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
        >
          <Plus className="h-4 w-4" />
          Create Silence
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      )}

      {!isLoading && silences && silences.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-12 text-center">
          <BellOff className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No active silences</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Create a silence to temporarily disable alerts
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" />
            Create Silence
          </button>
        </div>
      )}

      {!isLoading && silences && silences.length > 0 && (
        <div className="space-y-4">
          {silences.map((silence) => (
            <div
              key={silence.id}
              className="bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-md transition-shadow p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="mt-1">{getLevelIcon(silence.level)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getLevelBadge(silence.level)}
                      <span className="text-lg font-medium text-slate-900 dark:text-slate-100">
                        {getTargetDisplay(silence)}
                      </span>
                    </div>
                    {silence.reason && (
                      <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">{silence.reason}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatDuration(silence.ends_at)}
                      </div>
                      {silence.created_by && (
                        <div>Created by: {silence.created_by}</div>
                      )}
                      <div>
                        Started: {new Date(silence.starts_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(silence.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Remove silence"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateSilenceModal
          onClose={() => setShowCreateModal(false)}
          alerts={alerts || []}
        />
      )}
    </div>
  );
}

interface CreateSilenceModalProps {
  onClose: () => void;
  alerts: Alert[];
}

function CreateSilenceModal({ onClose, alerts }: CreateSilenceModalProps) {
  const [level, setLevel] = useState<'global' | 'host' | 'alert'>('alert');
  const [targetId, setTargetId] = useState('');
  const [duration, setDuration] = useState('4h');
  const [reason, setReason] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createSilence,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['silences'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    createMutation.mutate({
      level,
      target_id: level === 'global' ? undefined : targetId,
      duration,
      reason: reason || undefined,
      created_by: createdBy || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Create Silence</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Silence Level
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLevel('global');
                    setTargetId('');
                  }}
                  className={`p-4 border-2 rounded-lg text-center transition-all ${
                    level === 'global'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <Globe className={`h-6 w-6 mx-auto mb-2 ${level === 'global' ? 'text-amber-500' : 'text-slate-400'}`} />
                  <div className="font-medium text-slate-900 dark:text-slate-100">Global</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">All alerts</div>
                </button>
                <button
                  type="button"
                  onClick={() => setLevel('host')}
                  className={`p-4 border-2 rounded-lg text-center transition-all ${
                    level === 'host'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <Server className={`h-6 w-6 mx-auto mb-2 ${level === 'host' ? 'text-amber-500' : 'text-slate-400'}`} />
                  <div className="font-medium text-slate-900 dark:text-slate-100">Host</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Specific host</div>
                </button>
                <button
                  type="button"
                  onClick={() => setLevel('alert')}
                  className={`p-4 border-2 rounded-lg text-center transition-all ${
                    level === 'alert'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <AlertCircle className={`h-6 w-6 mx-auto mb-2 ${level === 'alert' ? 'text-orange-500' : 'text-slate-400'}`} />
                  <div className="font-medium text-slate-900 dark:text-slate-100">Alert</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Specific alert</div>
                </button>
              </div>
            </div>

            {level === 'host' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Hostname
                </label>
                <input
                  type="text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="e.g., server1, 192.168.1.100"
                  required
                />
              </div>
            )}

            {level === 'alert' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Alert
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                >
                  <option value="">Select an alert...</option>
                  {alerts.map((alert) => (
                    <option key={alert.id} value={alert.id}>
                      {alert.name} ({alert.severity})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
                placeholder="Why are you silencing these alerts?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Created By (optional)
              </label>
              <input
                type="text"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="Your name or username"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || (level !== 'global' && !targetId)}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Silence'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  X,
  Bell,
  AlertCircle,
  AlertTriangle,
  Info,
  Zap,
  CheckCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import {
  LoginNotification,
  dismissLoginNotification,
  dismissAllLoginNotifications,
} from '../api/client';

interface LoginNotificationsModalProps {
  notifications: LoginNotification[];
  onClose: () => void;
  onNotificationsDismissed: () => void;
}

const SEVERITY_CONFIG = {
  info: { icon: Info, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-800' },
  low: { icon: AlertCircle, color: 'text-slate-500', bg: 'bg-nog-100 dark:bg-nog-700', border: 'border-slate-200 dark:border-slate-700' },
  medium: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-200 dark:border-yellow-800' },
  high: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-800' },
  critical: { icon: Zap, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-800' },
};

export default function LoginNotificationsModal({
  notifications,
  onClose,
  onNotificationsDismissed,
}: LoginNotificationsModalProps) {
  const [localNotifications, setLocalNotifications] = useState(notifications);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const dismissOneMutation = useMutation({
    mutationFn: (id: string) => dismissLoginNotification(id),
    onMutate: (id) => {
      setDismissingIds((prev) => new Set(prev).add(id));
    },
    onSuccess: (_, id) => {
      setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
      setDismissingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      // If all notifications are dismissed, close the modal
      if (localNotifications.length === 1) {
        onNotificationsDismissed();
        onClose();
      }
    },
    onError: (_, id) => {
      setDismissingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    },
  });

  const dismissAllMutation = useMutation({
    mutationFn: dismissAllLoginNotifications,
    onSuccess: () => {
      setLocalNotifications([]);
      onNotificationsDismissed();
      onClose();
    },
  });

  const getSeverityConfig = (severity: string) => {
    return SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (localNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-nog-800 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Alert Notifications
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {localNotifications.length} notification{localNotifications.length !== 1 ? 's' : ''} while you were away
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {localNotifications.map((notification) => {
            const severityConfig = getSeverityConfig(notification.severity);
            const SeverityIcon = severityConfig.icon;
            const isDismissing = dismissingIds.has(notification.id);

            return (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border ${severityConfig.bg} ${severityConfig.border} ${
                  isDismissing ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-lg bg-white dark:bg-nog-800`}>
                    <SeverityIcon className={`w-4 h-4 ${severityConfig.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {notification.title}
                      </h3>
                      <button
                        onClick={() => dismissOneMutation.mutate(notification.id)}
                        disabled={isDismissing}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors flex-shrink-0"
                        title="Dismiss"
                      >
                        <XCircle className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                      </button>
                    </div>
                    {notification.message && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {notification.message}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>Alert: {notification.alert_name}</span>
                      <span>{formatTimeAgo(notification.created_at)}</span>
                      {notification.alert_id && (
                        <a
                          href={`/alerts?highlight=${notification.alert_id}`}
                          className="flex items-center gap-1 text-amber-500 hover:text-amber-600"
                          onClick={(e) => {
                            e.preventDefault();
                            // Navigate to alerts page with this alert highlighted
                            window.location.href = `/alerts?highlight=${notification.alert_id}`;
                          }}
                        >
                          View Alert <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-nog-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Close
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => dismissAllMutation.mutate()}
              disabled={dismissAllMutation.isPending}
              className="px-4 py-2 bg-nog-100 hover:bg-slate-200 dark:bg-nog-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              Dismiss All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

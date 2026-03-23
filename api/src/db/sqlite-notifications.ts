import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';
import type { AlertSeverity } from './sqlite.js';

export interface AgentNotification {
  id: string;
  hostname?: string;
  alert_id?: string;
  alert_name: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string;
  delivered: number;
  delivered_at?: string;
}

export function createAgentNotification(
  alertName: string,
  title: string,
  message: string,
  options: {
    hostname?: string;
    alert_id?: string;
    severity?: AlertSeverity;
    expires_at?: string;
  } = {}
): AgentNotification {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO agent_notifications (
      id, hostname, alert_id, alert_name, severity, title, message, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    options.hostname || null,
    options.alert_id || null,
    alertName,
    options.severity || 'medium',
    title,
    message,
    options.expires_at || null
  );

  return getAgentNotification(id)!;
}

export function getAgentNotification(id: string): AgentNotification | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM agent_notifications WHERE id = ?').get(id) as AgentNotification | undefined;
}

export function getPendingNotifications(hostname?: string): AgentNotification[] {
  const database = getSQLiteDB();

  // Get undelivered, non-expired notifications
  // Matches specific hostname OR notifications with no hostname (broadcast)
  if (hostname) {
    return database.prepare(`
      SELECT * FROM agent_notifications
      WHERE delivered = 0
      AND (hostname IS NULL OR hostname = ?)
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at ASC
    `).all(hostname) as AgentNotification[];
  }

  return database.prepare(`
    SELECT * FROM agent_notifications
    WHERE delivered = 0
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at ASC
  `).all() as AgentNotification[];
}

export function markNotificationDelivered(id: string, hostname?: string): boolean {
  const database = getSQLiteDB();

  // For broadcast notifications (hostname IS NULL), we create a delivery record
  // For targeted notifications, just mark as delivered
  const notification = getAgentNotification(id);
  if (!notification) return false;

  if (notification.hostname === null && hostname) {
    // Broadcast notification - we could track per-host delivery
    // For simplicity, mark as delivered for now
  }

  const result = database.prepare(`
    UPDATE agent_notifications
    SET delivered = 1, delivered_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return result.changes > 0;
}

export function deleteExpiredNotifications(): number {
  const database = getSQLiteDB();
  const result = database.prepare(`
    DELETE FROM agent_notifications
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `).run();
  return result.changes;
}

// Login Notifications (show alerts to users on login)
export interface LoginNotification {
  id: string;
  user_id?: string;
  alert_id?: string;
  alert_name: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string;
  dismissed: number;
  dismissed_at?: string;
}

export function createLoginNotification(
  alertName: string,
  title: string,
  message: string,
  options: {
    user_id?: string | null;
    alert_id?: string;
    severity?: AlertSeverity;
    expires_at?: string | null;
  } = {}
): LoginNotification {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO login_notifications (
      id, user_id, alert_id, alert_name, severity, title, message, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    options.user_id || null,
    options.alert_id || null,
    alertName,
    options.severity || 'medium',
    title,
    message,
    options.expires_at || null
  );

  return getLoginNotification(id)!;
}

export function getLoginNotification(id: string): LoginNotification | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM login_notifications WHERE id = ?').get(id) as LoginNotification | undefined;
}

export function getLoginNotifications(userId: string): LoginNotification[] {
  const database = getSQLiteDB();

  // Get undismissed, non-expired notifications
  // Matches specific user OR notifications with no user_id (all users)
  return database.prepare(`
    SELECT * FROM login_notifications
    WHERE dismissed = 0
    AND (user_id IS NULL OR user_id = ?)
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
  `).all(userId) as LoginNotification[];
}

export function dismissLoginNotification(id: string, userId: string): boolean {
  const database = getSQLiteDB();

  // Only allow dismissing if the notification is for this user or all users
  const result = database.prepare(`
    UPDATE login_notifications
    SET dismissed = 1, dismissed_at = datetime('now')
    WHERE id = ?
    AND (user_id IS NULL OR user_id = ?)
  `).run(id, userId);

  return result.changes > 0;
}

export function dismissAllLoginNotifications(userId: string): number {
  const database = getSQLiteDB();

  const result = database.prepare(`
    UPDATE login_notifications
    SET dismissed = 1, dismissed_at = datetime('now')
    WHERE dismissed = 0
    AND (user_id IS NULL OR user_id = ?)
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).run(userId);

  return result.changes;
}

export function deleteExpiredLoginNotifications(): number {
  const database = getSQLiteDB();
  const result = database.prepare(`
    DELETE FROM login_notifications
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `).run();
  return result.changes;
}

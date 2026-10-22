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

/**
 * Who is reading agent pop-ups: one API key (or one signed-in user) on one
 * host name. Delivery is recorded per reader, so one machine clearing a
 * pop-up never hides it from another machine or another key, and a key can
 * only clear pop-ups for itself.
 */
export interface NotificationReader {
  /** 'key:<api key id>' or 'user:<user id>'. */
  reader: string;
  hostname?: string;
}

// Expiry times are stored as ISO strings ("...T...Z"); compare them as times,
// not as text against datetime('now') ("YYYY-MM-DD HH:MM:SS").
const NOT_EXPIRED = "(expires_at IS NULL OR datetime(expires_at) > datetime('now'))";

let lastExpiredSweep = 0;
function sweepExpiredNotifications(): void {
  const now = Date.now();
  if (now - lastExpiredSweep < 60 * 60 * 1000) return;
  lastExpiredSweep = now;
  try {
    deleteExpiredNotifications();
  } catch {
    // A failed sweep only means old rows stay a little longer.
  }
}

/**
 * Pop-ups this reader has not shown yet: not expired, meant for every host
 * or for this reader's host, and not already cleared by this reader on this
 * host. A pop-up marked delivered before per-reader delivery existed stays
 * delivered for everyone (no old pop-ups come back after an upgrade).
 */
export function getPendingNotifications(who: NotificationReader): AgentNotification[] {
  const database = getSQLiteDB();
  sweepExpiredNotifications();
  const hostname = who.hostname ?? '';
  return database.prepare(`
    SELECT n.* FROM agent_notifications n
    WHERE ${NOT_EXPIRED.replace(/expires_at/g, 'n.expires_at')}
    AND (n.hostname IS NULL OR n.hostname = ?)
    AND NOT EXISTS (
      SELECT 1 FROM agent_notification_deliveries d
      WHERE d.notification_id = n.id AND d.reader = ? AND d.hostname = ?
    )
    -- Shown before per-reader delivery existed (no delivery rows): done.
    AND NOT (n.delivered = 1 AND NOT EXISTS (
      SELECT 1 FROM agent_notification_deliveries d2 WHERE d2.notification_id = n.id
    ))
    ORDER BY n.created_at ASC
  `).all(hostname, who.reader, hostname) as AgentNotification[];
}

/**
 * Mark a pop-up as shown for this reader on this host only. Returns false
 * (the route answers 404) when the pop-up does not exist, has expired, or is
 * meant for a different host: a reader can only clear what it could fetch.
 */
export function markNotificationDelivered(id: string, who: NotificationReader): boolean {
  const database = getSQLiteDB();
  const hostname = who.hostname ?? '';
  const notification = database.prepare(`
    SELECT * FROM agent_notifications WHERE id = ? AND ${NOT_EXPIRED}
  `).get(id) as AgentNotification | undefined;
  if (!notification) return false;
  if (notification.hostname && notification.hostname !== hostname) return false;

  database.prepare(`
    INSERT OR IGNORE INTO agent_notification_deliveries (notification_id, reader, hostname)
    VALUES (?, ?, ?)
  `).run(id, who.reader, hostname);
  // 'delivered' now means "shown on at least one machine" (kept for anything
  // that reads it); who still has it pending is decided per reader above.
  database.prepare(`
    UPDATE agent_notifications
    SET delivered = 1, delivered_at = COALESCE(delivered_at, datetime('now'))
    WHERE id = ?
  `).run(id);
  return true;
}

export function deleteExpiredNotifications(): number {
  const database = getSQLiteDB();
  database.prepare(`
    DELETE FROM agent_notification_deliveries WHERE notification_id IN (
      SELECT id FROM agent_notifications
      WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')
    )
  `).run();
  const result = database.prepare(`
    DELETE FROM agent_notifications
    WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')
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

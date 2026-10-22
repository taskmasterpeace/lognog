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
  // A clock that jumped back (now before the last sweep) sweeps again rather
  // than waiting until the clock catches up, which could be days.
  if (now >= lastExpiredSweep && now - lastExpiredSweep < 60 * 60 * 1000) return;
  lastExpiredSweep = now;
  try {
    deleteExpiredNotifications();
  } catch (err) {
    // A failed sweep only means old rows stay a little longer; say so.
    console.error(`[notifications] could not remove expired pop-ups: ${err instanceof Error ? err.name : 'unknown error'}`);
  }
}

/**
 * How many host names one reader (one API key or one signed-in user) can
 * have a clear recorded on for one pop-up. Each clear is a row, kept until
 * the pop-up expires; a key that sends made-up host names could otherwise add
 * rows without limit. Past this many, a clear is answered but not recorded:
 * the pop-up stays pending for that host (nothing is hidden), and the desktop
 * agent shows a pop-up once per run, so it clears it again without showing it
 * again. Made-up names can't hide a pop-up from a real host: they only use up
 * rows, and that host's pop-up still comes.
 */
export const MAX_POPUP_HOSTS_PER_READER = 1000;

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
 * Mark a pop-up as shown for this reader on this host only. Returns
 * { found: false } (the route answers 404) when the pop-up does not exist,
 * has expired, or is meant for a different host: a reader can only clear what
 * it could fetch. `recorded` says whether this host's clear is kept (false
 * once the reader has clears on MAX_POPUP_HOSTS_PER_READER other hosts).
 */
export function markNotificationDelivered(id: string, who: NotificationReader): { found: boolean; recorded: boolean } {
  const database = getSQLiteDB();
  const hostname = who.hostname ?? '';
  const notification = database.prepare(`
    SELECT * FROM agent_notifications WHERE id = ? AND ${NOT_EXPIRED}
  `).get(id) as AgentNotification | undefined;
  if (!notification) return { found: false, recorded: false };
  if (notification.hostname && notification.hostname !== hostname) return { found: false, recorded: false };

  // At most MAX_POPUP_HOSTS_PER_READER rows per reader and pop-up: past that
  // the clear is not kept, and the pop-up stays pending for this host.
  database.prepare(`
    INSERT OR IGNORE INTO agent_notification_deliveries (notification_id, reader, hostname)
    SELECT ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM agent_notification_deliveries
      WHERE notification_id = ? AND reader = ?
    ) < ?
  `).run(id, who.reader, hostname, id, who.reader, MAX_POPUP_HOSTS_PER_READER);
  // 'delivered' now means "shown on at least one machine" (kept for anything
  // that reads it); who still has it pending is decided per reader above.
  database.prepare(`
    UPDATE agent_notifications
    SET delivered = 1, delivered_at = COALESCE(delivered_at, datetime('now'))
    WHERE id = ?
  `).run(id);
  const recorded = !!database.prepare(`
    SELECT 1 FROM agent_notification_deliveries WHERE notification_id = ? AND reader = ? AND hostname = ?
  `).get(id, who.reader, hostname);
  return { found: true, recorded };
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

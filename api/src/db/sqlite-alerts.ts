import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export type AlertTriggerType = 'number_of_results' | 'number_of_hosts' | 'custom_condition';
export type AlertTriggerCondition = 'greater_than' | 'less_than' | 'equal_to' | 'not_equal_to' | 'drops_by' | 'rises_by';
export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AlertScheduleType = 'cron' | 'realtime';

export interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'script' | 'apprise' | 'show_on_login';
  config: {
    // Email
    to?: string;
    subject?: string;
    body?: string;
    // Webhook
    url?: string;
    method?: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    payload?: string;
    // Script
    command?: string;
    // Apprise
    channel?: string;        // Pre-configured channel name (from notification_channels)
    apprise_urls?: string;   // Direct Apprise URLs (fallback if no channel)
    title?: string;          // Notification title template
    message?: string;        // Notification body template
    format?: 'text' | 'markdown' | 'html';
    // Show on login
    user_id?: string;        // Specific user, or null for all users
    expires_in?: string;     // Auto-expire after duration (e.g., "24h", "7d")
  };
}

export interface Alert {
  id: string;
  name: string;
  description?: string;
  search_query: string;
  trigger_type: AlertTriggerType;
  trigger_condition: AlertTriggerCondition;
  trigger_threshold: number;
  schedule_type: AlertScheduleType;
  cron_expression?: string;
  time_range: string;
  actions: string;  // JSON stringified AlertAction[]
  throttle_enabled: number;
  throttle_window_seconds: number;
  severity: AlertSeverity;
  enabled: number;
  last_run?: string;
  last_triggered?: string;
  trigger_count: number;
  app_scope?: string;
  playbook?: string;  // Markdown runbook/instructions for when alert fires
  created_at: string;
  updated_at: string;
}

export interface AlertHistory {
  id: string;
  alert_id: string;
  triggered_at: string;
  result_count: number;
  trigger_value?: string;
  severity: AlertSeverity;
  actions_executed?: string;  // JSON
  sample_results?: string;  // JSON
  acknowledged: number;
  acknowledged_by?: string;
  acknowledged_at?: string;
  notes?: string;
}

export function getAlerts(enabledOnly: boolean = false, appScope?: string): Alert[] {
  const database = getSQLiteDB();
  if (enabledOnly && appScope && appScope !== 'all') {
    return database.prepare('SELECT * FROM alerts WHERE enabled = 1 AND app_scope = ? ORDER BY name').all(appScope) as Alert[];
  }
  if (enabledOnly) {
    return database.prepare('SELECT * FROM alerts WHERE enabled = 1 ORDER BY name').all() as Alert[];
  }
  if (appScope && appScope !== 'all') {
    return database.prepare('SELECT * FROM alerts WHERE app_scope = ? ORDER BY name').all(appScope) as Alert[];
  }
  return database.prepare('SELECT * FROM alerts ORDER BY name').all() as Alert[];
}

export function getAlert(id: string): Alert | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as Alert | undefined;
}

export function createAlert(
  name: string,
  searchQuery: string,
  options: {
    description?: string;
    trigger_type?: AlertTriggerType;
    trigger_condition?: AlertTriggerCondition;
    trigger_threshold?: number;
    schedule_type?: AlertScheduleType;
    cron_expression?: string;
    time_range?: string;
    actions?: AlertAction[];
    throttle_enabled?: boolean;
    throttle_window_seconds?: number;
    severity?: AlertSeverity;
    enabled?: boolean;
    app_scope?: string;
    playbook?: string;
  } = {}
): Alert {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO alerts (
      id, name, description, search_query,
      trigger_type, trigger_condition, trigger_threshold,
      schedule_type, cron_expression, time_range,
      actions, throttle_enabled, throttle_window_seconds,
      severity, enabled, app_scope, playbook
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    options.description || null,
    searchQuery,
    options.trigger_type || 'number_of_results',
    options.trigger_condition || 'greater_than',
    options.trigger_threshold ?? 0,
    options.schedule_type || 'cron',
    options.cron_expression || '*/5 * * * *',
    options.time_range || '-5m',
    JSON.stringify(options.actions || []),
    options.throttle_enabled ? 1 : 0,
    options.throttle_window_seconds || 300,
    options.severity || 'medium',
    options.enabled !== false ? 1 : 0,
    options.app_scope || 'default',
    options.playbook || null
  );

  return getAlert(id)!;
}

export function updateAlert(
  id: string,
  updates: {
    name?: string;
    description?: string;
    search_query?: string;
    trigger_type?: AlertTriggerType;
    trigger_condition?: AlertTriggerCondition;
    trigger_threshold?: number;
    schedule_type?: AlertScheduleType;
    cron_expression?: string;
    time_range?: string;
    actions?: AlertAction[];
    throttle_enabled?: boolean;
    throttle_window_seconds?: number;
    severity?: AlertSeverity;
    enabled?: boolean;
    last_run?: string;
    last_triggered?: string;
    trigger_count?: number;
    app_scope?: string;
    playbook?: string;
  }
): Alert | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.search_query !== undefined) {
    fields.push('search_query = ?');
    values.push(updates.search_query);
  }
  if (updates.trigger_type !== undefined) {
    fields.push('trigger_type = ?');
    values.push(updates.trigger_type);
  }
  if (updates.trigger_condition !== undefined) {
    fields.push('trigger_condition = ?');
    values.push(updates.trigger_condition);
  }
  if (updates.trigger_threshold !== undefined) {
    fields.push('trigger_threshold = ?');
    values.push(updates.trigger_threshold);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.cron_expression !== undefined) {
    fields.push('cron_expression = ?');
    values.push(updates.cron_expression);
  }
  if (updates.time_range !== undefined) {
    fields.push('time_range = ?');
    values.push(updates.time_range);
  }
  if (updates.actions !== undefined) {
    fields.push('actions = ?');
    values.push(JSON.stringify(updates.actions));
  }
  if (updates.throttle_enabled !== undefined) {
    fields.push('throttle_enabled = ?');
    values.push(updates.throttle_enabled ? 1 : 0);
  }
  if (updates.throttle_window_seconds !== undefined) {
    fields.push('throttle_window_seconds = ?');
    values.push(updates.throttle_window_seconds);
  }
  if (updates.severity !== undefined) {
    fields.push('severity = ?');
    values.push(updates.severity);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.last_run !== undefined) {
    fields.push('last_run = ?');
    values.push(updates.last_run);
  }
  if (updates.last_triggered !== undefined) {
    fields.push('last_triggered = ?');
    values.push(updates.last_triggered);
  }
  if (updates.trigger_count !== undefined) {
    fields.push('trigger_count = ?');
    values.push(updates.trigger_count);
  }
  if (updates.app_scope !== undefined) {
    fields.push('app_scope = ?');
    values.push(updates.app_scope);
  }
  if (updates.playbook !== undefined) {
    fields.push('playbook = ?');
    values.push(updates.playbook);
  }

  if (fields.length === 0) {
    return getAlert(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE alerts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAlert(id);
}

export function deleteAlert(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM alerts WHERE id = ?').run(id);
  return result.changes > 0;
}

// Alert History
export function getAlertHistory(alertId?: string, limit: number = 100): AlertHistory[] {
  const database = getSQLiteDB();
  if (alertId) {
    return database.prepare(
      'SELECT * FROM alert_history WHERE alert_id = ? ORDER BY triggered_at DESC LIMIT ?'
    ).all(alertId, limit) as AlertHistory[];
  }
  return database.prepare(
    'SELECT * FROM alert_history ORDER BY triggered_at DESC LIMIT ?'
  ).all(limit) as AlertHistory[];
}

export function getAlertHistoryEntry(id: string): AlertHistory | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alert_history WHERE id = ?').get(id) as AlertHistory | undefined;
}

export function createAlertHistoryEntry(
  alertId: string,
  resultCount: number,
  severity: AlertSeverity,
  options: {
    trigger_value?: string;
    actions_executed?: Record<string, unknown>[];
    sample_results?: Record<string, unknown>[];
  } = {}
): AlertHistory {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO alert_history (
      id, alert_id, result_count, trigger_value, severity,
      actions_executed, sample_results
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    alertId,
    resultCount,
    options.trigger_value || null,
    severity,
    options.actions_executed ? JSON.stringify(options.actions_executed) : null,
    options.sample_results ? JSON.stringify(options.sample_results) : null
  );

  return getAlertHistoryEntry(id)!;
}

export function acknowledgeAlertHistory(
  id: string,
  acknowledgedBy: string,
  notes?: string
): AlertHistory | undefined {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE alert_history
    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now'), notes = ?
    WHERE id = ?
  `).run(acknowledgedBy, notes || null, id);
  return getAlertHistoryEntry(id);
}

export function getRecentAlertTrigger(alertId: string, windowSeconds: number): AlertHistory | undefined {
  const database = getSQLiteDB();
  return database.prepare(`
    SELECT * FROM alert_history
    WHERE alert_id = ?
    AND triggered_at > datetime('now', '-' || ? || ' seconds')
    ORDER BY triggered_at DESC
    LIMIT 1
  `).get(alertId, windowSeconds) as AlertHistory | undefined;
}

// Alert Silences
export type SilenceLevel = 'global' | 'host' | 'alert';

export interface AlertSilence {
  id: string;
  level: SilenceLevel;
  target_id?: string;
  reason?: string;
  created_by?: string;
  starts_at: string;
  ends_at?: string;
  created_at: string;
}

export function getAlertSilences(): AlertSilence[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alert_silences ORDER BY created_at DESC').all() as AlertSilence[];
}

export function getActiveSilences(): AlertSilence[] {
  const database = getSQLiteDB();
  return database.prepare(`
    SELECT * FROM alert_silences
    WHERE (ends_at IS NULL OR ends_at > datetime('now'))
    ORDER BY created_at DESC
  `).all() as AlertSilence[];
}

export function getAlertSilence(id: string): AlertSilence | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alert_silences WHERE id = ?').get(id) as AlertSilence | undefined;
}

export function createAlertSilence(
  level: SilenceLevel,
  options: {
    target_id?: string;
    reason?: string;
    created_by?: string;
    starts_at?: string;
    ends_at?: string;
  } = {}
): AlertSilence {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO alert_silences (
      id, level, target_id, reason, created_by, starts_at, ends_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    level,
    options.target_id || null,
    options.reason || null,
    options.created_by || null,
    options.starts_at || new Date().toISOString(),
    options.ends_at || null
  );

  return getAlertSilence(id)!;
}

export function deleteAlertSilence(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM alert_silences WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteExpiredSilences(): number {
  const database = getSQLiteDB();
  const result = database.prepare(`
    DELETE FROM alert_silences
    WHERE ends_at IS NOT NULL AND ends_at < datetime('now')
  `).run();
  return result.changes;
}

export function isAlertSilenced(alertId: string, hostname?: string): boolean {
  const database = getSQLiteDB();

  // Check for active silences (global, host-specific, or alert-specific)
  const silence = database.prepare(`
    SELECT * FROM alert_silences
    WHERE (ends_at IS NULL OR ends_at > datetime('now'))
    AND (
      level = 'global'
      OR (level = 'host' AND target_id = ?)
      OR (level = 'alert' AND target_id = ?)
    )
    LIMIT 1
  `).get(hostname || null, alertId) as AlertSilence | undefined;

  return !!silence;
}

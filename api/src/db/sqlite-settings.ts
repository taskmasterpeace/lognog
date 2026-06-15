import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

// ============ User Field Preferences ============

export interface UserFieldPreference {
  id: string;
  user_id: string;
  field_name: string;
  is_pinned: number;
  display_order: number;
  created_at: string;
}

export function getUserPinnedFields(userId: string): string[] {
  const database = getSQLiteDB();
  const prefs = database.prepare(
    'SELECT field_name FROM user_field_preferences WHERE user_id = ? AND is_pinned = 1 ORDER BY display_order'
  ).all(userId) as Array<{ field_name: string }>;
  return prefs.map(p => p.field_name);
}

export function getUserFieldPreferences(userId: string): UserFieldPreference[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM user_field_preferences WHERE user_id = ? ORDER BY display_order'
  ).all(userId) as UserFieldPreference[];
}

export function setFieldPinned(userId: string, fieldName: string, pinned: boolean): UserFieldPreference {
  const database = getSQLiteDB();

  // Get current max order if pinning
  let displayOrder = 0;
  if (pinned) {
    const maxOrder = database.prepare(
      'SELECT MAX(display_order) as max_order FROM user_field_preferences WHERE user_id = ? AND is_pinned = 1'
    ).get(userId) as { max_order: number | null };
    displayOrder = (maxOrder?.max_order ?? -1) + 1;
  }

  // Upsert the preference
  const existing = database.prepare(
    'SELECT id FROM user_field_preferences WHERE user_id = ? AND field_name = ?'
  ).get(userId, fieldName) as { id: string } | undefined;

  if (existing) {
    database.prepare(
      'UPDATE user_field_preferences SET is_pinned = ?, display_order = ? WHERE id = ?'
    ).run(pinned ? 1 : 0, displayOrder, existing.id);
    return database.prepare('SELECT * FROM user_field_preferences WHERE id = ?').get(existing.id) as UserFieldPreference;
  } else {
    const id = uuidv4();
    database.prepare(
      'INSERT INTO user_field_preferences (id, user_id, field_name, is_pinned, display_order) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userId, fieldName, pinned ? 1 : 0, displayOrder);
    return database.prepare('SELECT * FROM user_field_preferences WHERE id = ?').get(id) as UserFieldPreference;
  }
}

export function reorderPinnedFields(userId: string, fieldNames: string[]): void {
  const database = getSQLiteDB();

  const updateMany = database.transaction((fields: string[]) => {
    fields.forEach((fieldName, index) => {
      database.prepare(
        'UPDATE user_field_preferences SET display_order = ? WHERE user_id = ? AND field_name = ?'
      ).run(index, userId, fieldName);
    });
  });

  updateMany(fieldNames);
}

export function deleteFieldPreference(userId: string, fieldName: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare(
    'DELETE FROM user_field_preferences WHERE user_id = ? AND field_name = ?'
  ).run(userId, fieldName);
  return result.changes > 0;
}

// ============ Notification Channels (for Apprise integration) ============

export type NotificationService =
  | 'slack' | 'discord' | 'telegram' | 'msteams' | 'pagerduty' | 'opsgenie'
  | 'pushover' | 'ntfy' | 'email' | 'webhook' | 'gotify' | 'matrix'
  | 'rocket_chat' | 'zulip' | 'twilio' | 'sns' | 'custom';

export interface NotificationChannel {
  id: string;
  name: string;
  service: NotificationService;
  apprise_url: string;
  description?: string;
  enabled: number;
  last_test?: string;
  last_test_success?: number;
  created_at: string;
  updated_at: string;
}

export function getNotificationChannels(enabledOnly: boolean = false): NotificationChannel[] {
  const database = getSQLiteDB();
  if (enabledOnly) {
    return database.prepare('SELECT * FROM notification_channels WHERE enabled = 1 ORDER BY name').all() as NotificationChannel[];
  }
  return database.prepare('SELECT * FROM notification_channels ORDER BY name').all() as NotificationChannel[];
}

export function getNotificationChannel(id: string): NotificationChannel | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as NotificationChannel | undefined;
}

export function getNotificationChannelByName(name: string): NotificationChannel | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM notification_channels WHERE name = ?').get(name) as NotificationChannel | undefined;
}

export function createNotificationChannel(
  name: string,
  service: NotificationService,
  appriseUrl: string,
  options: {
    description?: string;
    enabled?: boolean;
  } = {}
): NotificationChannel {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO notification_channels (
      id, name, service, apprise_url, description, enabled
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    service,
    appriseUrl,
    options.description || null,
    options.enabled !== false ? 1 : 0
  );

  return getNotificationChannel(id)!;
}

export function updateNotificationChannel(
  id: string,
  updates: {
    name?: string;
    service?: NotificationService;
    apprise_url?: string;
    description?: string;
    enabled?: boolean;
    last_test?: string;
    last_test_success?: boolean;
  }
): NotificationChannel | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.service !== undefined) {
    fields.push('service = ?');
    values.push(updates.service);
  }
  if (updates.apprise_url !== undefined) {
    fields.push('apprise_url = ?');
    values.push(updates.apprise_url);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.last_test !== undefined) {
    fields.push('last_test = ?');
    values.push(updates.last_test);
  }
  if (updates.last_test_success !== undefined) {
    fields.push('last_test_success = ?');
    values.push(updates.last_test_success ? 1 : 0);
  }

  if (fields.length === 0) {
    return getNotificationChannel(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE notification_channels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getNotificationChannel(id);
}

export function deleteNotificationChannel(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateChannelTestResult(id: string, success: boolean): void {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE notification_channels
    SET last_test = datetime('now'), last_test_success = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(success ? 1 : 0, id);
}

// ============ User Preferences ============

export interface UserPreferences {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  default_time_range: string;
  sidebar_open: number;
  default_view_mode: 'log' | 'table' | 'json';
  query_history_limit: number;
  date_format: '12-hour' | '24-hour' | 'day-of-week' | 'iso' | 'short';
  timezone: string;
  muted_values: string;
  updated_at: string;
}

export interface MutedValues {
  app_name: string[];
  index_name: string[];
  hostname: string[];
}

export function getUserPreferences(userId: string): UserPreferences | null {
  const database = getSQLiteDB();
  const prefs = database.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreferences | undefined;
  return prefs || null;
}

export function upsertUserPreferences(userId: string, prefs: Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>): UserPreferences {
  const database = getSQLiteDB();
  const existing = getUserPreferences(userId);

  if (existing) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (prefs.theme !== undefined) { fields.push('theme = ?'); values.push(prefs.theme); }
    if (prefs.default_time_range !== undefined) { fields.push('default_time_range = ?'); values.push(prefs.default_time_range); }
    if (prefs.sidebar_open !== undefined) { fields.push('sidebar_open = ?'); values.push(prefs.sidebar_open); }
    if (prefs.default_view_mode !== undefined) { fields.push('default_view_mode = ?'); values.push(prefs.default_view_mode); }
    if (prefs.query_history_limit !== undefined) { fields.push('query_history_limit = ?'); values.push(prefs.query_history_limit); }
    if (prefs.date_format !== undefined) { fields.push('date_format = ?'); values.push(prefs.date_format); }
    if (prefs.timezone !== undefined) { fields.push('timezone = ?'); values.push(prefs.timezone); }
    if (prefs.muted_values !== undefined) { fields.push('muted_values = ?'); values.push(prefs.muted_values); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(userId);
      database.prepare(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
    }
  } else {
    database.prepare(`
      INSERT INTO user_preferences (user_id, theme, default_time_range, sidebar_open, default_view_mode, query_history_limit, date_format, timezone, muted_values)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      prefs.theme || 'system',
      prefs.default_time_range || '-24h',
      prefs.sidebar_open ?? 1,
      prefs.default_view_mode || 'log',
      prefs.query_history_limit ?? 10,
      prefs.date_format || '12-hour',
      prefs.timezone || 'browser',
      prefs.muted_values || '{}'
    );
  }

  return getUserPreferences(userId)!;
}

const DEFAULT_MUTED_VALUES: MutedValues = { app_name: [], index_name: [], hostname: [] };

export function getMutedValues(userId: string): MutedValues {
  const prefs = getUserPreferences(userId);
  if (!prefs?.muted_values) {
    return { ...DEFAULT_MUTED_VALUES };
  }
  try {
    const parsed = JSON.parse(prefs.muted_values);
    return {
      app_name: Array.isArray(parsed.app_name) ? parsed.app_name : [],
      index_name: Array.isArray(parsed.index_name) ? parsed.index_name : [],
      hostname: Array.isArray(parsed.hostname) ? parsed.hostname : [],
    };
  } catch {
    return { ...DEFAULT_MUTED_VALUES };
  }
}

export function setMutedValues(userId: string, mutedValues: MutedValues): MutedValues {
  const database = getSQLiteDB();
  const json = JSON.stringify(mutedValues);

  // Ensure user preferences exist
  const existing = getUserPreferences(userId);
  if (existing) {
    database.prepare(`
      UPDATE user_preferences
      SET muted_values = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(json, userId);
  } else {
    database.prepare(`
      INSERT INTO user_preferences (user_id, muted_values)
      VALUES (?, ?)
    `).run(userId, json);
  }

  return mutedValues;
}

// ============ System Settings ============

export function getSystemSetting(key: string): string | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllSystemSettings(): Record<string, string> {
  const database = getSQLiteDB();
  const rows = database.prepare('SELECT key, value FROM system_settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function setSystemSetting(key: string, value: string): void {
  const database = getSQLiteDB();
  database.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

export function setSystemSettings(settings: Record<string, string>): void {
  const database = getSQLiteDB();
  const stmt = database.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  const transaction = database.transaction((items: Array<[string, string]>) => {
    for (const [key, value] of items) {
      stmt.run(key, value);
    }
  });

  transaction(Object.entries(settings));
}

// ============ Onboarding ============

export interface OnboardingStatus {
  completed: boolean;
  completed_at: string | null;
}

export function getOnboardingStatus(userId: string): OnboardingStatus {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT onboarding_completed, onboarding_completed_at FROM users WHERE id = ?'
  ).get(userId) as { onboarding_completed: number | null; onboarding_completed_at: string | null } | undefined;

  return {
    completed: row?.onboarding_completed === 1,
    completed_at: row?.onboarding_completed_at || null,
  };
}

export function completeOnboarding(userId: string): OnboardingStatus {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE users SET onboarding_completed = 1, onboarding_completed_at = datetime('now') WHERE id = ?
  `).run(userId);

  return getOnboardingStatus(userId);
}

export function resetOnboarding(userId: string): OnboardingStatus {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE users SET onboarding_completed = 0, onboarding_completed_at = NULL WHERE id = ?
  `).run(userId);

  return getOnboardingStatus(userId);
}

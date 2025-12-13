import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database | null = null;

export function getSQLiteDB(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_PATH || './lognog.db';
    db = new Database(dbPath);
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  const database = getSQLiteDB();

  database.exec(`
    -- Saved searches
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Dashboards
    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      layout TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Dashboard panels
    CREATE TABLE IF NOT EXISTS dashboard_panels (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      title TEXT NOT NULL,
      query TEXT NOT NULL,
      visualization TEXT DEFAULT 'table',
      options TEXT DEFAULT '{}',
      position_x INTEGER DEFAULT 0,
      position_y INTEGER DEFAULT 0,
      width INTEGER DEFAULT 6,
      height INTEGER DEFAULT 4,
      FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );

    -- Scheduled reports
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      schedule TEXT NOT NULL,
      recipients TEXT NOT NULL,
      format TEXT DEFAULT 'html',
      enabled INTEGER DEFAULT 1,
      last_run TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Users (basic auth)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Field extractions (for custom field extraction patterns)
    CREATE TABLE IF NOT EXISTS field_extractions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Event types (for categorizing events)
    CREATE TABLE IF NOT EXISTS event_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      search_string TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Tags (for tagging field values)
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      tag_name TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lookups (for enrichment tables)
    CREATE TABLE IF NOT EXISTS lookups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      key_field TEXT NOT NULL,
      output_fields TEXT NOT NULL,
      data TEXT,
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Workflow actions (for right-click actions)
    CREATE TABLE IF NOT EXISTS workflow_actions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      field TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_value TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Alerts (Splunk-style alerting)
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      search_query TEXT NOT NULL,
      -- Trigger settings
      trigger_type TEXT NOT NULL DEFAULT 'number_of_results',  -- number_of_results, number_of_hosts, custom_condition
      trigger_condition TEXT NOT NULL DEFAULT 'greater_than',  -- greater_than, less_than, equal_to, not_equal_to, drops_by, rises_by
      trigger_threshold INTEGER NOT NULL DEFAULT 0,
      -- Scheduling
      schedule_type TEXT NOT NULL DEFAULT 'cron',  -- cron, realtime
      cron_expression TEXT DEFAULT '*/5 * * * *',  -- Every 5 minutes default
      time_range TEXT NOT NULL DEFAULT '-5m',  -- How far back to search
      -- Actions (JSON array)
      actions TEXT NOT NULL DEFAULT '[]',
      -- Throttling
      throttle_enabled INTEGER DEFAULT 0,
      throttle_window_seconds INTEGER DEFAULT 300,  -- 5 minutes default
      -- Severity
      severity TEXT NOT NULL DEFAULT 'medium',  -- info, low, medium, high, critical
      -- State
      enabled INTEGER DEFAULT 1,
      last_run TEXT,
      last_triggered TEXT,
      trigger_count INTEGER DEFAULT 0,
      -- Metadata
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Alert history (when alerts fired)
    CREATE TABLE IF NOT EXISTS alert_history (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
      result_count INTEGER NOT NULL,
      trigger_value TEXT,  -- The value that triggered the alert
      severity TEXT NOT NULL,
      actions_executed TEXT,  -- JSON of actions and their results
      sample_results TEXT,  -- Sample of results that triggered (JSON)
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      notes TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
    );

    -- Agent notifications (push alerts to agents)
    CREATE TABLE IF NOT EXISTS agent_notifications (
      id TEXT PRIMARY KEY,
      hostname TEXT,  -- Target hostname (NULL = all agents)
      alert_id TEXT,  -- Source alert that triggered this
      alert_name TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,  -- Optional expiration
      delivered INTEGER DEFAULT 0,
      delivered_at TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL
    );

    -- Source Templates (for onboarding different log types)
    CREATE TABLE IF NOT EXISTS source_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      description TEXT,
      setup_instructions TEXT,
      agent_config_example TEXT,
      syslog_config_example TEXT,
      field_extractions TEXT,
      default_index TEXT DEFAULT 'main',
      default_severity INTEGER DEFAULT 6,
      sample_log TEXT,
      sample_query TEXT,
      icon TEXT,
      dashboard_widgets TEXT,
      alert_templates TEXT,
      enabled INTEGER DEFAULT 1,
      built_in INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Alert silences (3-level silencing: global, host, alert)
    CREATE TABLE IF NOT EXISTS alert_silences (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,           -- 'global', 'host', 'alert'
      target_id TEXT,                -- hostname or alert_id (null for global)
      reason TEXT,
      created_by TEXT,
      starts_at TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at TEXT,                  -- null = indefinite
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_panels_dashboard ON dashboard_panels(dashboard_id);
    CREATE INDEX IF NOT EXISTS idx_searches_name ON saved_searches(name);
    CREATE INDEX IF NOT EXISTS idx_field_extractions_source ON field_extractions(source_type);
    CREATE INDEX IF NOT EXISTS idx_field_extractions_enabled ON field_extractions(enabled);
    CREATE INDEX IF NOT EXISTS idx_event_types_enabled ON event_types(enabled);
    CREATE INDEX IF NOT EXISTS idx_tags_field ON tags(field);
    CREATE INDEX IF NOT EXISTS idx_tags_tag_name ON tags(tag_name);
    CREATE INDEX IF NOT EXISTS idx_lookups_name ON lookups(name);
    CREATE INDEX IF NOT EXISTS idx_workflow_actions_field ON workflow_actions(field);
    CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled);
    CREATE INDEX IF NOT EXISTS idx_alerts_schedule ON alerts(schedule_type);
    CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id);
    CREATE INDEX IF NOT EXISTS idx_alert_history_triggered ON alert_history(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_agent_notifications_hostname ON agent_notifications(hostname);
    CREATE INDEX IF NOT EXISTS idx_agent_notifications_delivered ON agent_notifications(delivered);
    CREATE INDEX IF NOT EXISTS idx_source_templates_category ON source_templates(category);
    CREATE INDEX IF NOT EXISTS idx_source_templates_source_type ON source_templates(source_type);
    CREATE INDEX IF NOT EXISTS idx_alert_silences_level ON alert_silences(level);
    CREATE INDEX IF NOT EXISTS idx_alert_silences_target ON alert_silences(target_id);
    CREATE INDEX IF NOT EXISTS idx_alert_silences_ends_at ON alert_silences(ends_at);
  `);
}

// Saved Searches
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export function getSavedSearches(): SavedSearch[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM saved_searches ORDER BY updated_at DESC').all() as SavedSearch[];
}

export function getSavedSearch(id: string): SavedSearch | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id) as SavedSearch | undefined;
}

export function createSavedSearch(name: string, query: string, description?: string): SavedSearch {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO saved_searches (id, name, query, description) VALUES (?, ?, ?, ?)'
  ).run(id, name, query, description || null);
  return getSavedSearch(id)!;
}

export function updateSavedSearch(id: string, name: string, query: string, description?: string): SavedSearch | undefined {
  const database = getSQLiteDB();
  database.prepare(
    "UPDATE saved_searches SET name = ?, query = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, query, description || null, id);
  return getSavedSearch(id);
}

export function deleteSavedSearch(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
  return result.changes > 0;
}

// Dashboards
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  layout: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardPanel {
  id: string;
  dashboard_id: string;
  title: string;
  query: string;
  visualization: string;
  options: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export function getDashboards(): Dashboard[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboards ORDER BY updated_at DESC').all() as Dashboard[];
}

export function getDashboard(id: string): Dashboard | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as Dashboard | undefined;
}

export function getDashboardPanels(dashboardId: string): DashboardPanel[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_panels WHERE dashboard_id = ?').all(dashboardId) as DashboardPanel[];
}

export function createDashboard(name: string, description?: string): Dashboard {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO dashboards (id, name, description) VALUES (?, ?, ?)'
  ).run(id, name, description || null);
  return getDashboard(id)!;
}

export function createDashboardPanel(
  dashboardId: string,
  title: string,
  query: string,
  visualization: string = 'table',
  options: Record<string, unknown> = {},
  position: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 6, height: 4 }
): DashboardPanel {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO dashboard_panels (id, dashboard_id, title, query, visualization, options, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, dashboardId, title, query, visualization, JSON.stringify(options), position.x, position.y, position.width, position.height);
  return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel;
}

export function updateDashboardPanel(
  id: string,
  updates: {
    title?: string;
    query?: string;
    visualization?: string;
    options?: Record<string, unknown>;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }
): DashboardPanel | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.query !== undefined) {
    fields.push('query = ?');
    values.push(updates.query);
  }
  if (updates.visualization !== undefined) {
    fields.push('visualization = ?');
    values.push(updates.visualization);
  }
  if (updates.options !== undefined) {
    fields.push('options = ?');
    values.push(JSON.stringify(updates.options));
  }
  if (updates.position_x !== undefined) {
    fields.push('position_x = ?');
    values.push(updates.position_x);
  }
  if (updates.position_y !== undefined) {
    fields.push('position_y = ?');
    values.push(updates.position_y);
  }
  if (updates.width !== undefined) {
    fields.push('width = ?');
    values.push(updates.width);
  }
  if (updates.height !== undefined) {
    fields.push('height = ?');
    values.push(updates.height);
  }

  if (fields.length === 0) {
    return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel | undefined;
  }

  values.push(id);
  database.prepare(`UPDATE dashboard_panels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel | undefined;
}

export function deleteDashboardPanel(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboard_panels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteDashboard(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboards WHERE id = ?').run(id);
  return result.changes > 0;
}

// Field Extractions
export interface FieldExtraction {
  id: string;
  name: string;
  source_type: string;
  field_name: string;
  pattern: string;
  pattern_type: 'grok' | 'regex';
  priority: number;
  enabled: number;
  created_at: string;
}

export function getFieldExtractions(sourceType?: string): FieldExtraction[] {
  const database = getSQLiteDB();
  if (sourceType) {
    return database.prepare('SELECT * FROM field_extractions WHERE source_type = ? ORDER BY priority, created_at').all(sourceType) as FieldExtraction[];
  }
  return database.prepare('SELECT * FROM field_extractions ORDER BY priority, created_at').all() as FieldExtraction[];
}

export function getFieldExtraction(id: string): FieldExtraction | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM field_extractions WHERE id = ?').get(id) as FieldExtraction | undefined;
}

export function createFieldExtraction(
  name: string,
  sourceType: string,
  fieldName: string,
  pattern: string,
  patternType: 'grok' | 'regex',
  priority: number = 100,
  enabled: boolean = true
): FieldExtraction {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO field_extractions (id, name, source_type, field_name, pattern, pattern_type, priority, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, sourceType, fieldName, pattern, patternType, priority, enabled ? 1 : 0);
  return getFieldExtraction(id)!;
}

export function updateFieldExtraction(
  id: string,
  updates: {
    name?: string;
    source_type?: string;
    field_name?: string;
    pattern?: string;
    pattern_type?: 'grok' | 'regex';
    priority?: number;
    enabled?: boolean;
  }
): FieldExtraction | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.source_type !== undefined) {
    fields.push('source_type = ?');
    values.push(updates.source_type);
  }
  if (updates.field_name !== undefined) {
    fields.push('field_name = ?');
    values.push(updates.field_name);
  }
  if (updates.pattern !== undefined) {
    fields.push('pattern = ?');
    values.push(updates.pattern);
  }
  if (updates.pattern_type !== undefined) {
    fields.push('pattern_type = ?');
    values.push(updates.pattern_type);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getFieldExtraction(id);
  }

  values.push(id);
  database.prepare(`UPDATE field_extractions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getFieldExtraction(id);
}

export function deleteFieldExtraction(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM field_extractions WHERE id = ?').run(id);
  return result.changes > 0;
}

// Event Types
export interface EventType {
  id: string;
  name: string;
  search_string: string;
  description?: string;
  priority: number;
  enabled: number;
  created_at: string;
}

export function getEventTypes(): EventType[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM event_types ORDER BY priority, created_at').all() as EventType[];
}

export function getEventType(id: string): EventType | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM event_types WHERE id = ?').get(id) as EventType | undefined;
}

export function createEventType(
  name: string,
  searchString: string,
  description?: string,
  priority: number = 100,
  enabled: boolean = true
): EventType {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO event_types (id, name, search_string, description, priority, enabled) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, searchString, description || null, priority, enabled ? 1 : 0);
  return getEventType(id)!;
}

export function updateEventType(
  id: string,
  updates: {
    name?: string;
    search_string?: string;
    description?: string;
    priority?: number;
    enabled?: boolean;
  }
): EventType | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.search_string !== undefined) {
    fields.push('search_string = ?');
    values.push(updates.search_string);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getEventType(id);
  }

  values.push(id);
  database.prepare(`UPDATE event_types SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getEventType(id);
}

export function deleteEventType(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM event_types WHERE id = ?').run(id);
  return result.changes > 0;
}

// Tags
export interface Tag {
  id: string;
  tag_name: string;
  field: string;
  value: string;
  created_at: string;
}

export function getTags(field?: string): Tag[] {
  const database = getSQLiteDB();
  if (field) {
    return database.prepare('SELECT * FROM tags WHERE field = ? ORDER BY tag_name').all(field) as Tag[];
  }
  return database.prepare('SELECT * FROM tags ORDER BY tag_name, field').all() as Tag[];
}

export function getTag(id: string): Tag | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
}

export function getTagsByValue(field: string, value: string): Tag[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM tags WHERE field = ? AND value = ?').all(field, value) as Tag[];
}

export function createTag(tagName: string, field: string, value: string): Tag {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO tags (id, tag_name, field, value) VALUES (?, ?, ?, ?)'
  ).run(id, tagName, field, value);
  return getTag(id)!;
}

export function deleteTag(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM tags WHERE id = ?').run(id);
  return result.changes > 0;
}

// Lookups
export interface Lookup {
  id: string;
  name: string;
  type: 'csv' | 'manual';
  key_field: string;
  output_fields: string;
  data?: string;
  file_path?: string;
  created_at: string;
}

export function getLookups(): Lookup[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM lookups ORDER BY name').all() as Lookup[];
}

export function getLookup(id: string): Lookup | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM lookups WHERE id = ?').get(id) as Lookup | undefined;
}

export function getLookupByName(name: string): Lookup | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM lookups WHERE name = ?').get(name) as Lookup | undefined;
}

export function createLookup(
  name: string,
  type: 'csv' | 'manual',
  keyField: string,
  outputFields: string[],
  data?: Record<string, unknown>[],
  filePath?: string
): Lookup {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO lookups (id, name, type, key_field, output_fields, data, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    name,
    type,
    keyField,
    JSON.stringify(outputFields),
    data ? JSON.stringify(data) : null,
    filePath || null
  );
  return getLookup(id)!;
}

export function updateLookup(
  id: string,
  updates: {
    name?: string;
    type?: 'csv' | 'manual';
    key_field?: string;
    output_fields?: string[];
    data?: Record<string, unknown>[];
    file_path?: string;
  }
): Lookup | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.key_field !== undefined) {
    fields.push('key_field = ?');
    values.push(updates.key_field);
  }
  if (updates.output_fields !== undefined) {
    fields.push('output_fields = ?');
    values.push(JSON.stringify(updates.output_fields));
  }
  if (updates.data !== undefined) {
    fields.push('data = ?');
    values.push(JSON.stringify(updates.data));
  }
  if (updates.file_path !== undefined) {
    fields.push('file_path = ?');
    values.push(updates.file_path);
  }

  if (fields.length === 0) {
    return getLookup(id);
  }

  values.push(id);
  database.prepare(`UPDATE lookups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getLookup(id);
}

export function deleteLookup(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM lookups WHERE id = ?').run(id);
  return result.changes > 0;
}

// Workflow Actions
export interface WorkflowAction {
  id: string;
  name: string;
  label: string;
  field: string;
  action_type: 'link' | 'search' | 'script';
  action_value: string;
  enabled: number;
  created_at: string;
}

export function getWorkflowActions(field?: string): WorkflowAction[] {
  const database = getSQLiteDB();
  if (field) {
    return database.prepare('SELECT * FROM workflow_actions WHERE field = ? AND enabled = 1 ORDER BY name').all(field) as WorkflowAction[];
  }
  return database.prepare('SELECT * FROM workflow_actions ORDER BY name').all() as WorkflowAction[];
}

export function getWorkflowAction(id: string): WorkflowAction | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM workflow_actions WHERE id = ?').get(id) as WorkflowAction | undefined;
}

export function createWorkflowAction(
  name: string,
  label: string,
  field: string,
  actionType: 'link' | 'search' | 'script',
  actionValue: string,
  enabled: boolean = true
): WorkflowAction {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO workflow_actions (id, name, label, field, action_type, action_value, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, label, field, actionType, actionValue, enabled ? 1 : 0);
  return getWorkflowAction(id)!;
}

export function updateWorkflowAction(
  id: string,
  updates: {
    name?: string;
    label?: string;
    field?: string;
    action_type?: 'link' | 'search' | 'script';
    action_value?: string;
    enabled?: boolean;
  }
): WorkflowAction | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.label !== undefined) {
    fields.push('label = ?');
    values.push(updates.label);
  }
  if (updates.field !== undefined) {
    fields.push('field = ?');
    values.push(updates.field);
  }
  if (updates.action_type !== undefined) {
    fields.push('action_type = ?');
    values.push(updates.action_type);
  }
  if (updates.action_value !== undefined) {
    fields.push('action_value = ?');
    values.push(updates.action_value);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getWorkflowAction(id);
  }

  values.push(id);
  database.prepare(`UPDATE workflow_actions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getWorkflowAction(id);
}

export function deleteWorkflowAction(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM workflow_actions WHERE id = ?').run(id);
  return result.changes > 0;
}

// Alerts
export type AlertTriggerType = 'number_of_results' | 'number_of_hosts' | 'custom_condition';
export type AlertTriggerCondition = 'greater_than' | 'less_than' | 'equal_to' | 'not_equal_to' | 'drops_by' | 'rises_by';
export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AlertScheduleType = 'cron' | 'realtime';

export interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'script';
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

export function getAlerts(enabledOnly: boolean = false): Alert[] {
  const database = getSQLiteDB();
  if (enabledOnly) {
    return database.prepare('SELECT * FROM alerts WHERE enabled = 1 ORDER BY name').all() as Alert[];
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
      severity, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    options.enabled !== false ? 1 : 0
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

// Agent Notifications
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

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Source Templates
export type SourceCategory = 'database' | 'security' | 'web' | 'system' | 'application';

export interface FieldExtractionPattern {
  field_name: string;
  pattern: string;
  pattern_type: 'regex' | 'grok' | 'json_path';
  description?: string;
  required?: boolean;
}

export interface SourceTemplate {
  id: string;
  name: string;
  source_type: string;
  category: SourceCategory;
  description?: string;
  setup_instructions?: string;
  agent_config_example?: string;
  syslog_config_example?: string;
  field_extractions?: string;  // JSON stringified FieldExtractionPattern[]
  default_index: string;
  default_severity: number;
  sample_log?: string;
  sample_query?: string;
  icon?: string;
  dashboard_widgets?: string;  // JSON
  alert_templates?: string;  // JSON
  enabled: number;
  built_in: number;
  created_at: string;
  updated_at: string;
}

export function getSourceTemplates(category?: SourceCategory): SourceTemplate[] {
  const database = getSQLiteDB();
  if (category) {
    return database.prepare('SELECT * FROM source_templates WHERE category = ? AND enabled = 1 ORDER BY name').all(category) as SourceTemplate[];
  }
  return database.prepare('SELECT * FROM source_templates WHERE enabled = 1 ORDER BY category, name').all() as SourceTemplate[];
}

export function getSourceTemplate(id: string): SourceTemplate | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_templates WHERE id = ?').get(id) as SourceTemplate | undefined;
}

export function getSourceTemplateByType(sourceType: string): SourceTemplate | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_templates WHERE source_type = ?').get(sourceType) as SourceTemplate | undefined;
}

export function createSourceTemplate(
  name: string,
  sourceType: string,
  category: SourceCategory,
  options: {
    description?: string;
    setup_instructions?: string;
    agent_config_example?: string;
    syslog_config_example?: string;
    field_extractions?: FieldExtractionPattern[];
    default_index?: string;
    default_severity?: number;
    sample_log?: string;
    sample_query?: string;
    icon?: string;
    dashboard_widgets?: Record<string, unknown>[];
    alert_templates?: Record<string, unknown>[];
    enabled?: boolean;
    built_in?: boolean;
  } = {}
): SourceTemplate {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO source_templates (
      id, name, source_type, category, description,
      setup_instructions, agent_config_example, syslog_config_example,
      field_extractions, default_index, default_severity,
      sample_log, sample_query, icon,
      dashboard_widgets, alert_templates, enabled, built_in
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    sourceType,
    category,
    options.description || null,
    options.setup_instructions || null,
    options.agent_config_example || null,
    options.syslog_config_example || null,
    options.field_extractions ? JSON.stringify(options.field_extractions) : null,
    options.default_index || 'main',
    options.default_severity ?? 6,
    options.sample_log || null,
    options.sample_query || null,
    options.icon || null,
    options.dashboard_widgets ? JSON.stringify(options.dashboard_widgets) : null,
    options.alert_templates ? JSON.stringify(options.alert_templates) : null,
    options.enabled !== false ? 1 : 0,
    options.built_in !== false ? 1 : 0
  );

  return getSourceTemplate(id)!;
}

export function updateSourceTemplate(
  id: string,
  updates: {
    name?: string;
    source_type?: string;
    category?: SourceCategory;
    description?: string;
    setup_instructions?: string;
    agent_config_example?: string;
    syslog_config_example?: string;
    field_extractions?: FieldExtractionPattern[];
    default_index?: string;
    default_severity?: number;
    sample_log?: string;
    sample_query?: string;
    icon?: string;
    dashboard_widgets?: Record<string, unknown>[];
    alert_templates?: Record<string, unknown>[];
    enabled?: boolean;
  }
): SourceTemplate | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.source_type !== undefined) {
    fields.push('source_type = ?');
    values.push(updates.source_type);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.setup_instructions !== undefined) {
    fields.push('setup_instructions = ?');
    values.push(updates.setup_instructions);
  }
  if (updates.agent_config_example !== undefined) {
    fields.push('agent_config_example = ?');
    values.push(updates.agent_config_example);
  }
  if (updates.syslog_config_example !== undefined) {
    fields.push('syslog_config_example = ?');
    values.push(updates.syslog_config_example);
  }
  if (updates.field_extractions !== undefined) {
    fields.push('field_extractions = ?');
    values.push(JSON.stringify(updates.field_extractions));
  }
  if (updates.default_index !== undefined) {
    fields.push('default_index = ?');
    values.push(updates.default_index);
  }
  if (updates.default_severity !== undefined) {
    fields.push('default_severity = ?');
    values.push(updates.default_severity);
  }
  if (updates.sample_log !== undefined) {
    fields.push('sample_log = ?');
    values.push(updates.sample_log);
  }
  if (updates.sample_query !== undefined) {
    fields.push('sample_query = ?');
    values.push(updates.sample_query);
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon);
  }
  if (updates.dashboard_widgets !== undefined) {
    fields.push('dashboard_widgets = ?');
    values.push(JSON.stringify(updates.dashboard_widgets));
  }
  if (updates.alert_templates !== undefined) {
    fields.push('alert_templates = ?');
    values.push(JSON.stringify(updates.alert_templates));
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getSourceTemplate(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE source_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceTemplate(id);
}

export function deleteSourceTemplate(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_templates WHERE id = ? AND built_in = 0').run(id);
  return result.changes > 0;
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

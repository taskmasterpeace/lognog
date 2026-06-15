import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

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

// ============================================================================
// Source Configs CRUD
// ============================================================================

export interface SourceConfig {
  id: string;
  name: string;
  description?: string;
  hostname_pattern?: string;
  app_name_pattern?: string;
  source_type?: string;
  priority: number;
  template_id?: string;
  target_index?: string;
  parsing_mode: string;
  time_format?: string;
  time_field?: string;
  enabled: number;
  match_count: number;
  created_at: string;
  updated_at: string;
}

export interface SourceConfigExtraction {
  id: string;
  source_config_id: string;
  field_name: string;
  pattern: string;
  pattern_type: string;
  priority: number;
  enabled: number;
}

export interface SourceConfigTransform {
  id: string;
  source_config_id: string;
  transform_type: string;
  source_field?: string;
  target_field: string;
  config?: string;
  priority: number;
  enabled: number;
}

export interface SourceRoutingRule {
  id: string;
  name: string;
  conditions: string;
  match_mode: string;
  target_index: string;
  priority: number;
  enabled: number;
  match_count: number;
  created_at: string;
  updated_at: string;
}

// Get all source configs
export function getSourceConfigs(enabled?: boolean): SourceConfig[] {
  const database = getSQLiteDB();
  if (enabled !== undefined) {
    return database.prepare('SELECT * FROM source_configs WHERE enabled = ? ORDER BY priority ASC').all(enabled ? 1 : 0) as SourceConfig[];
  }
  return database.prepare('SELECT * FROM source_configs ORDER BY priority ASC').all() as SourceConfig[];
}

// Get single source config
export function getSourceConfig(id: string): SourceConfig | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_configs WHERE id = ?').get(id) as SourceConfig | undefined;
}

// Create source config
export function createSourceConfig(data: Omit<SourceConfig, 'id' | 'match_count' | 'created_at' | 'updated_at'>): SourceConfig {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_configs (id, name, description, hostname_pattern, app_name_pattern, source_type, priority, template_id, target_index, parsing_mode, time_format, time_field, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || null,
    data.hostname_pattern || null,
    data.app_name_pattern || null,
    data.source_type || null,
    data.priority ?? 100,
    data.template_id || null,
    data.target_index || null,
    data.parsing_mode || 'auto',
    data.time_format || null,
    data.time_field || null,
    data.enabled ?? 1
  );

  return getSourceConfig(id)!;
}

// Update source config
export function updateSourceConfig(id: string, data: Partial<Omit<SourceConfig, 'id' | 'created_at' | 'updated_at'>>): SourceConfig | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['name', 'description', 'hostname_pattern', 'app_name_pattern', 'source_type', 'priority', 'template_id', 'target_index', 'parsing_mode', 'time_format', 'time_field', 'enabled', 'match_count'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceConfig(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  database.prepare(`UPDATE source_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceConfig(id);
}

// Delete source config (cascades to extractions and transforms)
export function deleteSourceConfig(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_configs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Increment match count
export function incrementSourceConfigMatchCount(id: string): void {
  const database = getSQLiteDB();
  database.prepare('UPDATE source_configs SET match_count = match_count + 1 WHERE id = ?').run(id);
}

// ============================================================================
// Source Config Extractions CRUD
// ============================================================================

export function getSourceConfigExtractions(sourceConfigId: string): SourceConfigExtraction[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_extractions WHERE source_config_id = ? ORDER BY priority ASC').all(sourceConfigId) as SourceConfigExtraction[];
}

export function getSourceConfigExtraction(id: string): SourceConfigExtraction | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_extractions WHERE id = ?').get(id) as SourceConfigExtraction | undefined;
}

export function createSourceConfigExtraction(data: Omit<SourceConfigExtraction, 'id'>): SourceConfigExtraction {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_config_extractions (id, source_config_id, field_name, pattern, pattern_type, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.source_config_id, data.field_name, data.pattern, data.pattern_type || 'regex', data.priority ?? 100, data.enabled ?? 1);

  return getSourceConfigExtraction(id)!;
}

export function updateSourceConfigExtraction(id: string, data: Partial<Omit<SourceConfigExtraction, 'id' | 'source_config_id'>>): SourceConfigExtraction | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['field_name', 'pattern', 'pattern_type', 'priority', 'enabled'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceConfigExtraction(id);
  }

  values.push(id);
  database.prepare(`UPDATE source_config_extractions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceConfigExtraction(id);
}

export function deleteSourceConfigExtraction(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_config_extractions WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// Source Config Transforms CRUD
// ============================================================================

export function getSourceConfigTransforms(sourceConfigId: string): SourceConfigTransform[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_transforms WHERE source_config_id = ? ORDER BY priority ASC').all(sourceConfigId) as SourceConfigTransform[];
}

export function getSourceConfigTransform(id: string): SourceConfigTransform | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_transforms WHERE id = ?').get(id) as SourceConfigTransform | undefined;
}

export function createSourceConfigTransform(data: Omit<SourceConfigTransform, 'id'>): SourceConfigTransform {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_config_transforms (id, source_config_id, transform_type, source_field, target_field, config, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.source_config_id, data.transform_type, data.source_field || null, data.target_field, data.config || null, data.priority ?? 100, data.enabled ?? 1);

  return getSourceConfigTransform(id)!;
}

export function updateSourceConfigTransform(id: string, data: Partial<Omit<SourceConfigTransform, 'id' | 'source_config_id'>>): SourceConfigTransform | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['transform_type', 'source_field', 'target_field', 'config', 'priority', 'enabled'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceConfigTransform(id);
  }

  values.push(id);
  database.prepare(`UPDATE source_config_transforms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceConfigTransform(id);
}

export function deleteSourceConfigTransform(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_config_transforms WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// Source Routing Rules CRUD
// ============================================================================

export function getSourceRoutingRules(enabled?: boolean): SourceRoutingRule[] {
  const database = getSQLiteDB();
  if (enabled !== undefined) {
    return database.prepare('SELECT * FROM source_routing_rules WHERE enabled = ? ORDER BY priority ASC').all(enabled ? 1 : 0) as SourceRoutingRule[];
  }
  return database.prepare('SELECT * FROM source_routing_rules ORDER BY priority ASC').all() as SourceRoutingRule[];
}

export function getSourceRoutingRule(id: string): SourceRoutingRule | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_routing_rules WHERE id = ?').get(id) as SourceRoutingRule | undefined;
}

export function createSourceRoutingRule(data: Omit<SourceRoutingRule, 'id' | 'match_count' | 'created_at' | 'updated_at'>): SourceRoutingRule {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_routing_rules (id, name, conditions, match_mode, target_index, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.conditions, data.match_mode || 'all', data.target_index, data.priority ?? 100, data.enabled ?? 1);

  return getSourceRoutingRule(id)!;
}

export function updateSourceRoutingRule(id: string, data: Partial<Omit<SourceRoutingRule, 'id' | 'created_at' | 'updated_at'>>): SourceRoutingRule | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['name', 'conditions', 'match_mode', 'target_index', 'priority', 'enabled', 'match_count'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceRoutingRule(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  database.prepare(`UPDATE source_routing_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceRoutingRule(id);
}

export function deleteSourceRoutingRule(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_routing_rules WHERE id = ?').run(id);
  return result.changes > 0;
}

export function incrementRoutingRuleMatchCount(id: string): void {
  const database = getSQLiteDB();
  database.prepare('UPDATE source_routing_rules SET match_count = match_count + 1 WHERE id = ?').run(id);
}

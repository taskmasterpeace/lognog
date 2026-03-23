import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

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

// Source Annotations
export interface SourceAnnotation {
  id: string;
  field_name: string;
  field_value: string;
  title?: string;
  description?: string;
  details?: string;
  icon?: string;
  color?: string;
  lookup_id?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function getSourceAnnotations(fieldName?: string): SourceAnnotation[] {
  const database = getSQLiteDB();
  let query = 'SELECT * FROM source_annotations';
  const params: string[] = [];

  if (fieldName) {
    query += ' WHERE field_name = ?';
    params.push(fieldName);
  }

  query += ' ORDER BY field_name, field_value';

  const rows = database.prepare(query).all(...params) as Array<SourceAnnotation & { tags: string }>;
  return rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
  }));
}

export function getSourceAnnotation(fieldName: string, fieldValue: string): SourceAnnotation | undefined {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM source_annotations WHERE field_name = ? AND field_value = ?'
  ).get(fieldName, fieldValue) as (SourceAnnotation & { tags: string }) | undefined;

  if (!row) return undefined;

  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
  };
}

export function getSourceAnnotationById(id: string): SourceAnnotation | undefined {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM source_annotations WHERE id = ?'
  ).get(id) as (SourceAnnotation & { tags: string }) | undefined;

  if (!row) return undefined;

  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
  };
}

export function getSourceAnnotationsBatch(
  items: Array<{ field: string; value: string }>
): Map<string, SourceAnnotation> {
  const database = getSQLiteDB();
  const result = new Map<string, SourceAnnotation>();

  if (items.length === 0) return result;

  // Build a query with multiple OR conditions
  const conditions = items.map(() => '(field_name = ? AND field_value = ?)').join(' OR ');
  const params = items.flatMap(item => [item.field, item.value]);

  const rows = database.prepare(
    `SELECT * FROM source_annotations WHERE ${conditions}`
  ).all(...params) as Array<SourceAnnotation & { tags: string }>;

  for (const row of rows) {
    const key = `${row.field_name}:${row.field_value}`;
    result.set(key, {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
    });
  }

  return result;
}

export function createSourceAnnotation(data: {
  field_name: string;
  field_value: string;
  title?: string;
  description?: string;
  details?: string;
  icon?: string;
  color?: string;
  lookup_id?: string;
  tags?: string[];
}): SourceAnnotation {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO source_annotations
    (id, field_name, field_value, title, description, details, icon, color, lookup_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.field_name,
    data.field_value,
    data.title || null,
    data.description || null,
    data.details || null,
    data.icon || null,
    data.color || null,
    data.lookup_id || null,
    JSON.stringify(data.tags || [])
  );

  return getSourceAnnotationById(id)!;
}

export function updateSourceAnnotation(
  id: string,
  updates: {
    title?: string;
    description?: string;
    details?: string;
    icon?: string;
    color?: string;
    lookup_id?: string | null;
    tags?: string[];
  }
): SourceAnnotation | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title || null);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description || null);
  }
  if (updates.details !== undefined) {
    fields.push('details = ?');
    values.push(updates.details || null);
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon || null);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color || null);
  }
  if (updates.lookup_id !== undefined) {
    fields.push('lookup_id = ?');
    values.push(updates.lookup_id);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }

  if (fields.length === 0) {
    return getSourceAnnotationById(id);
  }

  fields.push('updated_at = datetime(\'now\')');
  values.push(id);

  database.prepare(
    `UPDATE source_annotations SET ${fields.join(', ')} WHERE id = ?`
  ).run(...values);

  return getSourceAnnotationById(id);
}

export function deleteSourceAnnotation(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_annotations WHERE id = ?').run(id);
  return result.changes > 0;
}

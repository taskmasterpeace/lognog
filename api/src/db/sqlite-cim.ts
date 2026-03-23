import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

// ============================================================================
// CIM Data Models
// ============================================================================

export interface CIMField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'ip' | 'array';
  description?: string;
  required?: boolean;
  aliases?: string[];  // Alternative field names that map to this
}

export interface DataModel {
  id: string;
  name: string;
  description: string | null;
  category: 'authentication' | 'network' | 'endpoint' | 'web' | 'custom';
  fields: CIMField[];
  constraints: string[];
  is_builtin: boolean;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface DataModelRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fields: string;
  constraints: string;
  is_builtin: number;
  enabled: number;
  created_at: string | null;
  updated_at: string | null;
}

function rowToDataModel(row: DataModelRow): DataModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as DataModel['category'],
    fields: JSON.parse(row.fields || '[]'),
    constraints: JSON.parse(row.constraints || '[]'),
    is_builtin: row.is_builtin === 1,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getDataModels(options?: {
  category?: string;
  enabled?: boolean;
}): DataModel[] {
  const database = getSQLiteDB();
  let query = 'SELECT * FROM data_models WHERE 1=1';
  const params: unknown[] = [];

  if (options?.category) {
    query += ' AND category = ?';
    params.push(options.category);
  }
  if (options?.enabled !== undefined) {
    query += ' AND enabled = ?';
    params.push(options.enabled ? 1 : 0);
  }

  query += ' ORDER BY is_builtin DESC, name ASC';

  const rows = database.prepare(query).all(...params) as DataModelRow[];
  return rows.map(rowToDataModel);
}

export function getDataModel(name: string): DataModel | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM data_models WHERE name = ?').get(name) as DataModelRow | undefined;
  return row ? rowToDataModel(row) : null;
}

export function getDataModelById(id: string): DataModel | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM data_models WHERE id = ?').get(id) as DataModelRow | undefined;
  return row ? rowToDataModel(row) : null;
}

export function createDataModel(model: Partial<DataModel>): DataModel {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO data_models (id, name, description, category, fields, constraints, is_builtin, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    model.name,
    model.description || null,
    model.category || 'custom',
    JSON.stringify(model.fields || []),
    JSON.stringify(model.constraints || []),
    model.is_builtin ? 1 : 0,
    model.enabled !== false ? 1 : 0,
    now,
    now
  );

  return getDataModelById(id)!;
}

export function updateDataModel(name: string, updates: Partial<DataModel>): DataModel | null {
  const database = getSQLiteDB();
  const existing = getDataModel(name);
  if (!existing) return null;

  // Prevent modifying built-in models (only allow enabling/disabling)
  if (existing.is_builtin && Object.keys(updates).some(k => k !== 'enabled')) {
    throw new Error('Cannot modify built-in data models');
  }

  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.category !== undefined) {
    setClauses.push('category = ?');
    params.push(updates.category);
  }
  if (updates.fields !== undefined) {
    setClauses.push('fields = ?');
    params.push(JSON.stringify(updates.fields));
  }
  if (updates.constraints !== undefined) {
    setClauses.push('constraints = ?');
    params.push(JSON.stringify(updates.constraints));
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  params.push(name);
  database.prepare(`UPDATE data_models SET ${setClauses.join(', ')} WHERE name = ?`).run(...params);

  return getDataModel(name);
}

export function deleteDataModel(name: string): boolean {
  const database = getSQLiteDB();
  const existing = getDataModel(name);
  if (!existing) return false;

  if (existing.is_builtin) {
    throw new Error('Cannot delete built-in data models');
  }

  const result = database.prepare('DELETE FROM data_models WHERE name = ?').run(name);
  return result.changes > 0;
}

// ============================================================================
// CIM Field Mappings
// ============================================================================

export interface FieldMapping {
  id: string;
  source_type: string;
  source_field: string;
  data_model: string;
  cim_field: string;
  transform: string | null;
  priority: number;
  enabled: boolean;
  created_at: string | null;
}

interface FieldMappingRow {
  id: string;
  source_type: string;
  source_field: string;
  data_model: string;
  cim_field: string;
  transform: string | null;
  priority: number;
  enabled: number;
  created_at: string | null;
}

function rowToFieldMapping(row: FieldMappingRow): FieldMapping {
  return {
    id: row.id,
    source_type: row.source_type,
    source_field: row.source_field,
    data_model: row.data_model,
    cim_field: row.cim_field,
    transform: row.transform,
    priority: row.priority,
    enabled: row.enabled === 1,
    created_at: row.created_at,
  };
}

export function getFieldMappings(options?: {
  source_type?: string;
  data_model?: string;
  enabled?: boolean;
}): FieldMapping[] {
  const database = getSQLiteDB();
  let query = 'SELECT * FROM field_mappings WHERE 1=1';
  const params: unknown[] = [];

  if (options?.source_type) {
    query += ' AND source_type = ?';
    params.push(options.source_type);
  }
  if (options?.data_model) {
    query += ' AND data_model = ?';
    params.push(options.data_model);
  }
  if (options?.enabled !== undefined) {
    query += ' AND enabled = ?';
    params.push(options.enabled ? 1 : 0);
  }

  query += ' ORDER BY priority ASC, source_type ASC';

  const rows = database.prepare(query).all(...params) as FieldMappingRow[];
  return rows.map(rowToFieldMapping);
}

export function getFieldMapping(id: string): FieldMapping | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM field_mappings WHERE id = ?').get(id) as FieldMappingRow | undefined;
  return row ? rowToFieldMapping(row) : null;
}

export function createFieldMapping(mapping: Partial<FieldMapping>): FieldMapping {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO field_mappings (id, source_type, source_field, data_model, cim_field, transform, priority, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    mapping.source_type,
    mapping.source_field,
    mapping.data_model,
    mapping.cim_field,
    mapping.transform || null,
    mapping.priority ?? 100,
    mapping.enabled !== false ? 1 : 0,
    now
  );

  return getFieldMapping(id)!;
}

export function updateFieldMapping(id: string, updates: Partial<FieldMapping>): FieldMapping | null {
  const database = getSQLiteDB();
  const existing = getFieldMapping(id);
  if (!existing) return null;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.source_type !== undefined) {
    setClauses.push('source_type = ?');
    params.push(updates.source_type);
  }
  if (updates.source_field !== undefined) {
    setClauses.push('source_field = ?');
    params.push(updates.source_field);
  }
  if (updates.data_model !== undefined) {
    setClauses.push('data_model = ?');
    params.push(updates.data_model);
  }
  if (updates.cim_field !== undefined) {
    setClauses.push('cim_field = ?');
    params.push(updates.cim_field);
  }
  if (updates.transform !== undefined) {
    setClauses.push('transform = ?');
    params.push(updates.transform);
  }
  if (updates.priority !== undefined) {
    setClauses.push('priority = ?');
    params.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  if (setClauses.length === 0) return existing;

  params.push(id);
  database.prepare(`UPDATE field_mappings SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getFieldMapping(id);
}

export function deleteFieldMapping(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM field_mappings WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getMappingsForSource(source_type: string): Map<string, { cim_field: string; transform: string | null }> {
  const mappings = getFieldMappings({ source_type, enabled: true });
  const result = new Map<string, { cim_field: string; transform: string | null }>();

  for (const mapping of mappings) {
    result.set(mapping.source_field, {
      cim_field: mapping.cim_field,
      transform: mapping.transform,
    });
  }

  return result;
}

export function getDataModelStats(): {
  total_models: number;
  by_category: Record<string, number>;
  total_mappings: number;
  mappings_by_source: Record<string, number>;
} {
  const database = getSQLiteDB();

  const totalModels = (database.prepare('SELECT COUNT(*) as count FROM data_models WHERE enabled = 1').get() as { count: number }).count;

  const categoryRows = database.prepare(`
    SELECT category, COUNT(*) as count FROM data_models WHERE enabled = 1 GROUP BY category
  `).all() as Array<{ category: string; count: number }>;

  const by_category: Record<string, number> = {};
  for (const row of categoryRows) {
    by_category[row.category] = row.count;
  }

  const totalMappings = (database.prepare('SELECT COUNT(*) as count FROM field_mappings WHERE enabled = 1').get() as { count: number }).count;

  const sourceRows = database.prepare(`
    SELECT source_type, COUNT(*) as count FROM field_mappings WHERE enabled = 1 GROUP BY source_type
  `).all() as Array<{ source_type: string; count: number }>;

  const mappings_by_source: Record<string, number> = {};
  for (const row of sourceRows) {
    mappings_by_source[row.source_type] = row.count;
  }

  return {
    total_models: totalModels,
    by_category,
    total_mappings: totalMappings,
    mappings_by_source,
  };
}

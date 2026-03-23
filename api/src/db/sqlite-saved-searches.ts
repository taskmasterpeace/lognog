import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

// Saved Searches
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  description?: string;
  owner_id?: string;
  is_shared: number;
  time_range: string;
  schedule?: string;
  schedule_enabled: number;
  folder: string;
  cache_ttl_seconds: number;
  cached_results?: string;
  cached_at?: string;
  cached_count?: number;
  cached_sql?: string;
  last_run?: string;
  last_run_duration_ms?: number;
  last_error?: string;
  run_count: number;
  tags: string;
  version: number;
  previous_versions: string;
  created_at: string;
  updated_at: string;
}

export interface SavedSearchFilters {
  owner_id?: string;
  is_shared?: boolean;
  tags?: string[];
  schedule_enabled?: boolean;
  search?: string;
  folder?: string;
}

export interface SavedSearchCreateOptions {
  description?: string;
  owner_id?: string;
  is_shared?: boolean;
  time_range?: string;
  schedule?: string;
  schedule_enabled?: boolean;
  cache_ttl_seconds?: number;
  tags?: string[];
  folder?: string;
}

export interface SavedSearchUpdateOptions {
  name?: string;
  query?: string;
  description?: string;
  is_shared?: boolean;
  time_range?: string;
  schedule?: string;
  schedule_enabled?: boolean;
  cache_ttl_seconds?: number;
  tags?: string[];
  folder?: string | null;
}

export function getSavedSearches(filters?: SavedSearchFilters): SavedSearch[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM saved_searches WHERE 1=1';
  const params: unknown[] = [];

  if (filters) {
    if (filters.owner_id) {
      sql += ' AND owner_id = ?';
      params.push(filters.owner_id);
    }
    if (filters.is_shared !== undefined) {
      sql += ' AND is_shared = ?';
      params.push(filters.is_shared ? 1 : 0);
    }
    if (filters.schedule_enabled !== undefined) {
      sql += ' AND schedule_enabled = ?';
      params.push(filters.schedule_enabled ? 1 : 0);
    }
    if (filters.search) {
      sql += ' AND (name LIKE ? OR description LIKE ? OR query LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    if (filters.tags && filters.tags.length > 0) {
      // Match any of the provided tags
      const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      filters.tags.forEach(tag => params.push(`%"${tag}"%`));
    }
    if (filters.folder) {
      sql += ' AND folder = ?';
      params.push(filters.folder);
    }
  }

  sql += ' ORDER BY folder ASC NULLS LAST, updated_at DESC';
  return database.prepare(sql).all(...params) as SavedSearch[];
}

export function getSavedSearch(id: string): SavedSearch | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id) as SavedSearch | undefined;
}

export function getScheduledSavedSearches(): SavedSearch[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM saved_searches WHERE schedule_enabled = 1 AND schedule IS NOT NULL'
  ).all() as SavedSearch[];
}

export function createSavedSearch(
  name: string,
  query: string,
  options?: SavedSearchCreateOptions
): SavedSearch {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO saved_searches (
      id, name, query, description, owner_id, is_shared, time_range,
      schedule, schedule_enabled, cache_ttl_seconds, tags, folder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    query,
    options?.description || null,
    options?.owner_id || null,
    options?.is_shared ? 1 : 0,
    options?.time_range || '-24h',
    options?.schedule || null,
    options?.schedule_enabled ? 1 : 0,
    options?.cache_ttl_seconds || 3600,
    JSON.stringify(options?.tags || []),
    options?.folder || 'Uncategorized'
  );

  return getSavedSearch(id)!;
}

export function updateSavedSearch(
  id: string,
  updates: SavedSearchUpdateOptions
): SavedSearch | undefined {
  const database = getSQLiteDB();
  const existing = getSavedSearch(id);
  if (!existing) return undefined;

  // Track version history if query changed
  let newVersion = existing.version;
  let previousVersions = JSON.parse(existing.previous_versions || '[]');

  if (updates.query && updates.query !== existing.query) {
    previousVersions.push({
      version: existing.version,
      query: existing.query,
      time_range: existing.time_range,
      changed_at: new Date().toISOString(),
    });
    newVersion = existing.version + 1;
  }

  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.query !== undefined) {
    fields.push('query = ?');
    values.push(updates.query);
    fields.push('version = ?');
    values.push(newVersion);
    fields.push('previous_versions = ?');
    values.push(JSON.stringify(previousVersions));
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.is_shared !== undefined) {
    fields.push('is_shared = ?');
    values.push(updates.is_shared ? 1 : 0);
  }
  if (updates.time_range !== undefined) {
    fields.push('time_range = ?');
    values.push(updates.time_range);
  }
  if (updates.schedule !== undefined) {
    fields.push('schedule = ?');
    values.push(updates.schedule);
  }
  if (updates.schedule_enabled !== undefined) {
    fields.push('schedule_enabled = ?');
    values.push(updates.schedule_enabled ? 1 : 0);
  }
  if (updates.cache_ttl_seconds !== undefined) {
    fields.push('cache_ttl_seconds = ?');
    values.push(updates.cache_ttl_seconds);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.folder !== undefined) {
    fields.push('folder = ?');
    values.push(updates.folder);
  }

  values.push(id);
  database.prepare(`UPDATE saved_searches SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getSavedSearch(id);
}

export function deleteSavedSearch(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteSavedSearchByName(name: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM saved_searches WHERE name = ?').run(name);
  return result.changes > 0;
}

export function updateSavedSearchCache(
  id: string,
  results: unknown[],
  sql: string,
  executionTimeMs: number
): SavedSearch | undefined {
  const database = getSQLiteDB();

  database.prepare(`
    UPDATE saved_searches SET
      cached_results = ?,
      cached_sql = ?,
      cached_at = datetime('now'),
      cached_count = ?,
      last_run = datetime('now'),
      last_run_duration_ms = ?,
      last_error = NULL,
      run_count = run_count + 1,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    JSON.stringify(results),
    sql,
    results.length,
    executionTimeMs,
    id
  );

  return getSavedSearch(id);
}

export function updateSavedSearchError(id: string, error: string): void {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE saved_searches SET
      last_run = datetime('now'),
      last_error = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(error, id);
}

export function clearSavedSearchCache(id: string): void {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE saved_searches SET
      cached_results = NULL,
      cached_sql = NULL,
      cached_at = NULL,
      cached_count = NULL
    WHERE id = ?
  `).run(id);
}

export function cleanupExpiredSearchCache(): number {
  const database = getSQLiteDB();

  // Find and clear expired caches
  const result = database.prepare(`
    UPDATE saved_searches SET
      cached_results = NULL,
      cached_sql = NULL,
      cached_at = NULL,
      cached_count = NULL
    WHERE cached_at IS NOT NULL
    AND (julianday('now') - julianday(cached_at)) * 86400 > cache_ttl_seconds
  `).run();

  return result.changes;
}

export function getSavedSearchTags(): string[] {
  const database = getSQLiteDB();
  const searches = database.prepare('SELECT tags FROM saved_searches').all() as { tags: string }[];

  const allTags = new Set<string>();
  searches.forEach(s => {
    const tags = JSON.parse(s.tags || '[]') as string[];
    tags.forEach(tag => allTags.add(tag));
  });

  return Array.from(allTags).sort();
}

export function getSavedSearchFolders(): string[] {
  const database = getSQLiteDB();
  const folders = database.prepare(
    `SELECT DISTINCT folder FROM saved_searches WHERE folder IS NOT NULL ORDER BY folder`
  ).all() as { folder: string }[];

  return folders.map(f => f.folder);
}

export function duplicateSavedSearch(id: string, newOwnerId?: string): SavedSearch | undefined {
  const existing = getSavedSearch(id);
  if (!existing) return undefined;

  return createSavedSearch(
    `${existing.name} (Copy)`,
    existing.query,
    {
      description: existing.description,
      owner_id: newOwnerId || existing.owner_id,
      is_shared: false,
      time_range: existing.time_range,
      schedule: existing.schedule,
      schedule_enabled: false, // Don't auto-enable schedule on copy
      cache_ttl_seconds: existing.cache_ttl_seconds,
      tags: JSON.parse(existing.tags || '[]'),
    }
  );
}

import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export interface Macro {
  id: string;
  name: string;
  definition: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function getMacros(): Macro[] {
  return getSQLiteDB().prepare('SELECT * FROM macros ORDER BY name ASC').all() as Macro[];
}

export function getMacro(id: string): Macro | undefined {
  return getSQLiteDB().prepare('SELECT * FROM macros WHERE id = ?').get(id) as Macro | undefined;
}

export function getMacroByName(name: string): Macro | undefined {
  return getSQLiteDB().prepare('SELECT * FROM macros WHERE name = ?').get(name) as Macro | undefined;
}

export function createMacro(m: { name: string; definition: string; description?: string | null }): Macro {
  const db = getSQLiteDB();
  const id = uuidv4();
  db.prepare('INSERT INTO macros (id, name, definition, description) VALUES (?, ?, ?, ?)').run(
    id,
    m.name,
    m.definition,
    m.description ?? null,
  );
  return getMacro(id)!;
}

export function updateMacro(
  id: string,
  updates: { name?: string; definition?: string; description?: string | null },
): Macro | undefined {
  const existing = getMacro(id);
  if (!existing) return undefined;
  const db = getSQLiteDB();
  db.prepare('UPDATE macros SET name = ?, definition = ?, description = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    updates.name ?? existing.name,
    updates.definition ?? existing.definition,
    updates.description !== undefined ? updates.description : existing.description,
    id,
  );
  return getMacro(id);
}

export function deleteMacro(id: string): boolean {
  const result = getSQLiteDB().prepare('DELETE FROM macros WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Resolve a `name` reference during query expansion: a macro definition first,
 * then a saved search's query by the same name (so a saved search can be chained
 * into another query as `saved_search_name`). Returns undefined if neither
 * exists, leaving the reference untouched.
 */
export function resolveMacroDefinition(name: string): string | undefined {
  const macro = getMacroByName(name);
  if (macro) return macro.definition;
  const saved = getSQLiteDB()
    .prepare('SELECT query FROM saved_searches WHERE name = ? LIMIT 1')
    .get(name) as { query: string } | undefined;
  return saved?.query;
}

process.env.SQLITE_PATH = ':memory:';

import { describe, it, expect, beforeEach } from 'vitest';
import { getSQLiteDB } from './sqlite.js';
import { createMacro, resolveMacroDefinition } from './sqlite-macros.js';

describe('resolveMacroDefinition', () => {
  beforeEach(() => {
    const db = getSQLiteDB();
    db.exec('DELETE FROM macros; DELETE FROM saved_searches;');
  });

  it('resolves a macro by name to its definition', () => {
    createMacro({ name: 'errors', definition: 'severity<=3' });
    expect(resolveMacroDefinition('errors')).toBe('severity<=3');
  });

  it('falls back to a saved search of the same name (saved-search chaining)', () => {
    getSQLiteDB()
      .prepare('INSERT INTO saved_searches (id, name, query) VALUES (?, ?, ?)')
      .run('ss1', 'top_talkers', 'search event.category=network | top source.ip');
    expect(resolveMacroDefinition('top_talkers')).toBe('search event.category=network | top source.ip');
  });

  it('prefers a macro over a saved search with the same name', () => {
    createMacro({ name: 'dupe', definition: 'MACRO_WINS' });
    getSQLiteDB().prepare('INSERT INTO saved_searches (id, name, query) VALUES (?, ?, ?)').run('ss2', 'dupe', 'SAVED');
    expect(resolveMacroDefinition('dupe')).toBe('MACRO_WINS');
  });

  it('returns undefined for an unknown name', () => {
    expect(resolveMacroDefinition('nope')).toBeUndefined();
  });
});

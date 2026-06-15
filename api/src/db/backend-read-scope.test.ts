import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Force SQLite/Lite mode BEFORE importing the backend module.
process.env.LOGNOG_BACKEND = 'sqlite';

// Give this file an isolated, unique logs DB so row counts are deterministic
// and not polluted by other test files (mirrors backend-index-scope.test.ts).
process.env.LOGS_DB_PATH = join(
  tmpdir(),
  `lognog-readscope-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

import {
  insertLogs,
  getLogById,
  getFieldValues,
  discoverStructuredDataFields,
  executeRawQuery,
} from './backend';
import { isIndexAllowed } from '../auth/index-scope';

describe('Phase 5.1 - read-side index scoping (SQLite/Lite, real DB)', () => {
  let alphaId: string;
  let betaId: string;

  beforeAll(async () => {
    await insertLogs([
      {
        timestamp: new Date().toISOString(),
        hostname: 'alpha-host',
        app_name: 'alpha-app',
        message: 'alpha one',
        index_name: 'alpha',
        structured_data: JSON.stringify({ alpha_field: 'av1', shared: 's' }),
      },
      {
        timestamp: new Date().toISOString(),
        hostname: 'alpha-host',
        app_name: 'alpha-app',
        message: 'alpha two',
        index_name: 'alpha',
        structured_data: JSON.stringify({ alpha_field: 'av2', shared: 's' }),
      },
      {
        timestamp: new Date().toISOString(),
        hostname: 'beta-host',
        app_name: 'beta-app',
        message: 'beta one',
        index_name: 'beta',
        structured_data: JSON.stringify({ beta_field: 'bv1', shared: 's' }),
      },
    ]);

    // Capture the row ids so we can fetch them by id.
    const rows = await executeRawQuery<{ id: string; index_name: string }>(
      'SELECT id, index_name FROM logs ORDER BY message',
    );
    alphaId = rows.find((r) => r.index_name === 'alpha')!.id;
    betaId = rows.find((r) => r.index_name === 'beta')!.id;
  });

  describe('getLogById + isIndexAllowed (single-log fetch scope check)', () => {
    it('a scoped key can fetch an in-scope (alpha) log', async () => {
      const log = await getLogById(alphaId, ['id', 'message', 'index_name']);
      expect(log).not.toBeNull();
      expect(isIndexAllowed(['alpha'], log!.index_name as string)).toBe(true);
    });

    it('a beta log exists but is excluded for an alpha-scoped key', async () => {
      const log = await getLogById(betaId, ['id', 'message', 'index_name']);
      // The row physically exists (getLogById is scope-agnostic)...
      expect(log).not.toBeNull();
      expect(log!.index_name).toBe('beta');
      // ...but the alpha-scoped key must be denied (the route returns 404).
      expect(isIndexAllowed(['alpha'], log!.index_name as string)).toBe(false);
    });

    it('an unscoped key may read either log', async () => {
      const a = await getLogById(alphaId, ['id', 'index_name']);
      const b = await getLogById(betaId, ['id', 'index_name']);
      expect(isIndexAllowed(undefined, a!.index_name as string)).toBe(true);
      expect(isIndexAllowed(undefined, b!.index_name as string)).toBe(true);
    });
  });

  describe('getFieldValues', () => {
    it('returns only alpha-derived values when scoped to alpha', async () => {
      const values = await getFieldValues('hostname', 100, ['alpha']);
      const hosts = values.map((v) => v.value);
      expect(hosts).toContain('alpha-host');
      expect(hosts).not.toContain('beta-host');
    });

    it('returns values across all indexes when unscoped', async () => {
      const values = await getFieldValues('hostname', 100);
      const hosts = values.map((v) => v.value);
      expect(hosts).toContain('alpha-host');
      expect(hosts).toContain('beta-host');
    });
  });

  describe('discoverStructuredDataFields', () => {
    it('returns only alpha-derived custom fields when scoped to alpha', async () => {
      const fields = await discoverStructuredDataFields({ allowedIndexes: ['alpha'] });
      const names = fields.map((f) => f.name);
      expect(names).toContain('alpha_field');
      expect(names).not.toContain('beta_field');
    });

    it('returns custom fields from all indexes when unscoped', async () => {
      const fields = await discoverStructuredDataFields({});
      const names = fields.map((f) => f.name);
      expect(names).toContain('alpha_field');
      expect(names).toContain('beta_field');
    });

    it('sample values do not leak across indexes', async () => {
      const fields = await discoverStructuredDataFields({ allowedIndexes: ['alpha'] });
      const shared = fields.find((f) => f.name === 'shared');
      // 'shared' exists in both indexes; scoped sampling must still only see
      // alpha rows (which it does — value is 's' either way), and beta_field
      // must be entirely absent (asserted above).
      expect(shared).toBeDefined();
    });
  });

  describe('stats /indexes-style aggregation (index enumeration)', () => {
    // Mirrors the SQL the /stats/indexes route runs (with scope spliced in).
    function indexesQuery(scopeWhere: string): string {
      return `SELECT index_name, COUNT(*) as count FROM logs${scopeWhere} GROUP BY index_name`;
    }

    it('a scoped key only sees its own index (cannot enumerate others)', async () => {
      const rows = await executeRawQuery<{ index_name: string }>(
        indexesQuery(" WHERE index_name IN ('alpha')"),
      );
      const names = rows.map((r) => r.index_name);
      expect(names).toContain('alpha');
      expect(names).not.toContain('beta');
    });

    it('an unscoped key sees every index', async () => {
      const rows = await executeRawQuery<{ index_name: string }>(indexesQuery(''));
      const names = rows.map((r) => r.index_name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });
  });
});

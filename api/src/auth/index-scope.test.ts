// api/src/auth/index-scope.test.ts
import { describe, it, expect } from 'vitest';
import { isIndexAllowed, firstDisallowedIndex, indexScopeSqlClause } from './index-scope.js';

describe('isIndexAllowed', () => {
  it('allows any index when restriction is null (unscoped key)', () => {
    expect(isIndexAllowed(null, 'anything')).toBe(true);
  });

  it('allows any index when restriction is an empty array', () => {
    expect(isIndexAllowed([], 'anything')).toBe(true);
  });

  it('allows an index that is in the allow-list', () => {
    expect(isIndexAllowed(['web-app', 'api-service'], 'web-app')).toBe(true);
  });

  it('rejects an index that is not in the allow-list', () => {
    expect(isIndexAllowed(['web-app'], 'api-service')).toBe(false);
  });

  it('matches case-insensitively (mixed-case allow-list vs lowercased index)', () => {
    expect(isIndexAllowed(['Web-App'], 'web-app')).toBe(true);
    expect(isIndexAllowed(['Web-App', 'Api-Service'], 'api-service')).toBe(true);
  });

  it('rejects when undefined restriction is treated as scoped-empty? No — undefined = all', () => {
    expect(isIndexAllowed(undefined, 'anything')).toBe(true);
  });
});

describe('firstDisallowedIndex', () => {
  it('returns null for an unscoped key (null allow-list)', () => {
    expect(
      firstDisallowedIndex(null, [{ index_name: 'anything' }, { index_name: 'other' }]),
    ).toBeNull();
  });

  it('returns null for an unscoped key (empty allow-list)', () => {
    expect(firstDisallowedIndex([], [{ index_name: 'anything' }])).toBeNull();
  });

  it('returns null when every record is in the allow-list', () => {
    expect(
      firstDisallowedIndex(['web-app', 'api-service'], [
        { index_name: 'web-app' },
        { index_name: 'api-service' },
      ]),
    ).toBeNull();
  });

  it('returns the first disallowed index name', () => {
    expect(
      firstDisallowedIndex(['web-app'], [
        { index_name: 'web-app' },
        { index_name: 'api-service' },
        { index_name: 'evil' },
      ]),
    ).toBe('api-service');
  });

  it('matches case-insensitively', () => {
    expect(
      firstDisallowedIndex(['Web-App'], [{ index_name: 'web-app' }]),
    ).toBeNull();
    expect(
      firstDisallowedIndex(['Web-App'], [{ index_name: 'Api-Service' }]),
    ).toBe('Api-Service');
  });

  it('treats a missing index_name as the storage default (main)', () => {
    // Records without index_name land in 'main' (COALESCE in the DB backend).
    expect(firstDisallowedIndex(['web-app'], [{}])).toBe('main');
    expect(firstDisallowedIndex(['main'], [{}])).toBeNull();
  });
});

describe('indexScopeSqlClause', () => {
  it('returns null for an unscoped key (null allow-list)', () => {
    expect(indexScopeSqlClause(null)).toBeNull();
  });

  it('returns null for an unscoped key (undefined allow-list)', () => {
    expect(indexScopeSqlClause(undefined)).toBeNull();
  });

  it('returns null for an empty allow-list', () => {
    expect(indexScopeSqlClause([])).toBeNull();
  });

  it('builds an IN clause for a single index', () => {
    expect(indexScopeSqlClause(['alpha'])).toBe("index_name IN ('alpha')");
  });

  it('builds an IN clause for multiple indexes', () => {
    expect(indexScopeSqlClause(['alpha', 'beta'])).toBe("index_name IN ('alpha','beta')");
  });

  it('force-lowercases index names (they are stored lowercase on ingest)', () => {
    expect(indexScopeSqlClause(['ALPHA', 'Beta'])).toBe("index_name IN ('alpha','beta')");
  });

  it("escapes single quotes by doubling them ('' )", () => {
    expect(indexScopeSqlClause(["o'brien"])).toBe("index_name IN ('o''brien')");
  });

  it('uses a custom column name when provided', () => {
    expect(indexScopeSqlClause(['alpha'], 'l.index_name')).toBe("l.index_name IN ('alpha')");
  });
});

// api/src/auth/index-scope.test.ts
import { describe, it, expect } from 'vitest';
import { isIndexAllowed } from './index-scope.js';

describe('isIndexAllowed', () => {
  it('allows any index when restriction is null (unscoped key)', () => {
    expect(isIndexAllowed(null, 'anything')).toBe(true);
  });

  it('allows any index when restriction is an empty array', () => {
    expect(isIndexAllowed([], 'anything')).toBe(true);
  });

  it('allows an index that is in the allow-list', () => {
    expect(isIndexAllowed(['hey-youre-hired', 'directors-palette'], 'hey-youre-hired')).toBe(true);
  });

  it('rejects an index that is not in the allow-list', () => {
    expect(isIndexAllowed(['hey-youre-hired'], 'directors-palette')).toBe(false);
  });

  it('matches case-insensitively (mixed-case allow-list vs lowercased index)', () => {
    expect(isIndexAllowed(['Hey-Youre-Hired'], 'hey-youre-hired')).toBe(true);
    expect(isIndexAllowed(['Hey-Youre-Hired', 'Directors-Palette'], 'directors-palette')).toBe(true);
  });

  it('rejects when undefined restriction is treated as scoped-empty? No — undefined = all', () => {
    expect(isIndexAllowed(undefined, 'anything')).toBe(true);
  });
});

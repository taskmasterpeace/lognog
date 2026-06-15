// api/src/auth/auth.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

// Use an isolated on-disk temp DB so the module singleton in db/sqlite.ts is harmless.
process.env.SQLITE_PATH = './lognog-test-phase1.db';

import { createUser, createApiKey, validateApiKey } from './auth.js';

describe('API key index scoping (round trip)', () => {
  let userId: string;

  beforeAll(async () => {
    const u = await createUser(
      `scoped_${Date.now()}`,
      `scoped_${Date.now()}@test.local`,
      'pw-does-not-matter',
      'user',
    );
    userId = u.id;
  });

  it('stores and returns allowed_indexes for a scoped key', async () => {
    const { apiKey } = await createApiKey(userId, 'scoped-key', ['write'], undefined, [
      'hey-youre-hired',
    ]);
    const result = await validateApiKey(apiKey);
    expect(result).not.toBeNull();
    expect(result!.allowedIndexes).toEqual(['hey-youre-hired']);
  });

  it('returns null allowedIndexes for an unscoped key', async () => {
    const { apiKey } = await createApiKey(userId, 'unscoped-key', ['write']);
    const result = await validateApiKey(apiKey);
    expect(result).not.toBeNull();
    expect(result!.allowedIndexes).toBeNull();
  });
});

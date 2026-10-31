// Sessions that last, and rate limits that don't bleed into each other.
// (2026-10-31: Robert kept being sent back to the login page.)
import { describe, it, expect, beforeAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

process.env.SQLITE_PATH = ':memory:';

import { createUser, generateTokenPair, refreshTokens } from './auth.js';
import { rateLimit } from './middleware.js';
import { getSQLiteDB } from '../db/sqlite.js';

describe('refresh tokens', () => {
  let user: Awaited<ReturnType<typeof createUser>>;
  beforeAll(async () => {
    user = await createUser(`sess_${Date.now()}`, `sess_${Date.now()}@test.local`, 'pw-does-not-matter-123', 'admin');
  });

  it('last 30 days, so a screen used monthly stays signed in', async () => {
    await generateTokenPair(user);
    const row = getSQLiteDB()
      .prepare('SELECT expires_at FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(user.id) as { expires_at: string };
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('keep twelve sign-ins per user: a sixth device no longer logs the first one out', async () => {
    getSQLiteDB().prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
    const first = await generateTokenPair(user);
    for (let i = 0; i < 5; i++) await generateTokenPair(user);
    // Six sign-ins: the first device's token still renews.
    expect(await refreshTokens(first.refreshToken)).not.toBeNull();
    for (let i = 0; i < 20; i++) await generateTokenPair(user);
    const count = (getSQLiteDB().prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ?').get(user.id) as { n: number }).n;
    expect(count).toBe(12);
  }, 30_000);
});

describe('rateLimit', () => {
  const call = (mw: ReturnType<typeof rateLimit>) => {
    let status = 200;
    const req = { user: { id: 'robert' }, ip: '10.0.1.6' } as unknown as Request;
    const res = {
      set: () => res,
      status: (s: number) => { status = s; return res; },
      json: () => res,
    } as unknown as Response;
    let passed = false;
    mw(req, res, (() => { passed = true; }) as NextFunction);
    return passed ? 200 : status;
  };

  it('each limit counts on its own: a busy dashboard cannot block token refresh', () => {
    const search = rateLimit(3, 60_000);
    const refresh = rateLimit(2, 60_000);
    expect([call(search), call(search), call(search), call(search)]).toEqual([200, 200, 200, 429]);
    // The search limit is used up; refresh still has its own allowance.
    expect([call(refresh), call(refresh), call(refresh)]).toEqual([200, 200, 429]);
  });
});

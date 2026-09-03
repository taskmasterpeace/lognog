import { describe, it, expect } from 'vitest';
import { accountLockoutRemaining, recordLoginFailure, clearLoginFailures } from './middleware';

// Per-account login lockout (defense-in-depth for the internet-facing instance).
// Helpers share a module-level map, so each test uses a unique username.
describe('account login lockout', () => {
  it('is not locked before the threshold', () => {
    const u = 'user-a@example.com';
    for (let i = 0; i < 4; i++) recordLoginFailure(u);
    expect(accountLockoutRemaining(u)).toBe(0);
  });

  it('locks after 5 failures within the window', () => {
    const u = 'user-b@example.com';
    for (let i = 0; i < 5; i++) recordLoginFailure(u);
    expect(accountLockoutRemaining(u)).toBeGreaterThan(0);
    expect(accountLockoutRemaining(u)).toBeLessThanOrEqual(15 * 60);
  });

  it('a successful login (clear) resets the counter', () => {
    const u = 'user-c@example.com';
    for (let i = 0; i < 5; i++) recordLoginFailure(u);
    expect(accountLockoutRemaining(u)).toBeGreaterThan(0);
    clearLoginFailures(u);
    expect(accountLockoutRemaining(u)).toBe(0);
  });

  it('is case-insensitive on the username', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('Mixed-Case');
    expect(accountLockoutRemaining('mixed-case')).toBeGreaterThan(0);
  });

  it('tracks unknown usernames too (no enumeration signal)', () => {
    // A username that does not exist still accrues lockout, so a locked
    // response cannot be used to tell real accounts from fake ones.
    const fake = 'definitely-not-a-real-user-zzz';
    for (let i = 0; i < 5; i++) recordLoginFailure(fake);
    expect(accountLockoutRemaining(fake)).toBeGreaterThan(0);
  });
});

/**
 * Alert action hardening: shell-argument sanitising and channel resolution.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { escapeShellArg } from './alerts.js';
import {
  closeDatabase,
  createNotificationChannel,
  resolveNotificationChannel,
} from '../db/sqlite.js';

describe('escapeShellArg', () => {
  it('strips the classic metacharacters', () => {
    expect(escapeShellArg('a; rm -rf / | b $(x) `y` &')).toBe('a rm -rf /  b x y ');
  });

  it('strips newlines and carriage returns (second-command injection)', () => {
    const out = escapeShellArg('ok\nrm -rf /\r\nmore');
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe('okrm -rf /more');
  });
});

describe('resolveNotificationChannel', () => {
  afterAll(() => closeDatabase());

  it('finds a channel by id or by name', () => {
    const ch = createNotificationChannel('pager', 'pagerduty', 'pagerduty://key', {});
    expect(resolveNotificationChannel(ch.id)?.name).toBe('pager');
    expect(resolveNotificationChannel('pager')?.id).toBe(ch.id);
    expect(resolveNotificationChannel('nope')).toBeUndefined();
  });
});

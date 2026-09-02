/**
 * Alert action hardening: shell-argument sanitising and channel resolution.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { escapeShellArg, checkTriggerCondition, renderAlertEmailHtml } from './alerts.js';

describe('checkTriggerCondition', () => {
  it('drops_by / rises_by compare against the previous value', () => {
    expect(checkTriggerCondition('drops_by', 40, 50, 100)).toBe(true);
    expect(checkTriggerCondition('drops_by', 80, 50, 100)).toBe(false);
    expect(checkTriggerCondition('rises_by', 160, 50, 100)).toBe(true);
    expect(checkTriggerCondition('rises_by', 120, 50, 100)).toBe(false);
  });

  it('never fires drops_by / rises_by without a baseline', () => {
    expect(checkTriggerCondition('drops_by', 0, 1, undefined)).toBe(false);
    expect(checkTriggerCondition('rises_by', 1000, 1, undefined)).toBe(false);
  });
});

describe('renderAlertEmailHtml', () => {
  it('renders results as an escaped table with the brand colours', () => {
    const html = renderAlertEmailHtml(
      { name: 'Disk <full>', severity: 'high', search_query: 'search disk_pct>90', description: undefined },
      3,
      [{ hostname: 'web-01', message: '<script>alert(1)</script>' }]
    );
    expect(html).toContain('Disk &lt;full&gt;');
    expect(html).toContain('web-01');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('#5A3F24');
    expect(html).not.toMatch(/#0ea5e9|purple|#a855f7/i);
  });
});
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

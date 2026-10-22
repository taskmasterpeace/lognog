/**
 * Key lock, round 3: what an alert action did is written to alert history and
 * to the searchable lognog-internal index. Any API key that can read searches
 * that index, so neither may carry a webhook's secret path or what a script
 * printed. (Admins still see the script output in alert history.)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.SQLITE_PATH = ':memory:';
delete process.env.LOGNOG_SELF_MONITORING;

const mockExecuteDSLQuery = vi.fn();
const mockInsertLogs = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: (...args: unknown[]) => mockInsertLogs(...args),
}));

import { evaluateAlert, webhookHost } from './alerts.js';
import { logAlertAction, actionLogSummary, logReportGenerated, reportErrorSummary, REPORT_ERROR_PHRASES, shutdown } from './internal-logger.js';
import { createAlert, getAlertHistory } from '../db/sqlite-alerts.js';
import { setSystemSetting } from '../db/sqlite-settings.js';

type Logged = { action: string; message: string; structured_data: string };
const logged = (): Logged[] => mockInsertLogs.mock.calls.flatMap((c) => c[0] as Logged[]);

let srv: http.Server;
let base = '';

beforeAll(async () => {
  setSystemSetting('internal_logging_enabled', 'true');
  setSystemSetting('internal_logging_level', 'INFO');
  setSystemSetting('internal_logging_categories', 'auth,alert,system,report');
  srv = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  // IPv6 loopback only: a 127.0.0.1-only server can share a port with another
  // test file's supertest server (wildcard) and answer that file's requests.
  await new Promise<void>((r) => srv.listen(0, '::1', r));
  base = `http://[::1]:${(srv.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => srv.close(r));
});

describe('alert action results carry no secrets', () => {
  it('a webhook result names the host only, in history and in the internal log', async () => {
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ message: 'boom' }] });
    const secretPath = '/services/T000/B000/kl-secret-token-xyz';
    const alert = createAlert('kl webhook', 'search *', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      time_range: '-5m',
      enabled: true,
      throttle_enabled: false,
      actions: [{ type: 'webhook', config: { url: `${base}${secretPath}?sig=kl-secret-sig`, method: 'POST' } }],
    });
    const out = await evaluateAlert(alert.id);
    expect(out.triggered).toBe(true);
    await shutdown();

    const history = JSON.stringify(getAlertHistory(alert.id));
    expect(history).toContain('Webhook POST [::1]:');
    expect(history).not.toContain('kl-secret');
    const sent = logged().filter((e) => e.action === 'alert.action_sent');
    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent)).not.toContain('kl-secret');
  });

  it('webhookHost never returns a path, query or login', () => {
    expect(webhookHost('https://user:pass@hooks.example.com/a/b?c=d')).toBe('hooks.example.com');
    expect(webhookHost('not a url')).toBe('webhook');
    expect(webhookHost(undefined)).toBe('webhook');
  });

  it('what a script printed stays out of the internal log', async () => {
    mockInsertLogs.mockClear();
    logAlertAction({ alert_id: 'a1', alert_name: 'kl script', action_type: 'script', success: true,
      message: 'Script executed successfully: kl-printed-secret' });
    logAlertAction({ alert_id: 'a1', alert_name: 'kl script', action_type: 'script', success: false,
      message: 'Script failed with code 2: kl-stderr-secret' });
    await shutdown();
    const text = JSON.stringify(logged());
    expect(text).toContain('Script executed successfully');
    expect(text).toContain('Script failed with code 2');
    expect(text).not.toContain('kl-printed-secret');
    expect(text).not.toContain('kl-stderr-secret');
  });

  it('e-mail addresses and remote error text stay out of the internal log too', async () => {
    mockInsertLogs.mockClear();
    logAlertAction({ alert_id: 'a2', alert_name: 'kl mail', action_type: 'email', success: true,
      message: 'Email sent to kl-secret-person@example.com' });
    logAlertAction({ alert_id: 'a2', alert_name: 'kl apprise', action_type: 'apprise', success: false,
      message: 'Apprise notification failed: 400 - bad url tgram://kl-secret-bot-token/123' });
    logAlertAction({ alert_id: 'a2', alert_name: 'kl hook', action_type: 'webhook', success: false,
      message: 'Webhook failed: kl-secret-error-text' });
    await shutdown();
    const text = JSON.stringify(logged());
    expect(text).toContain('Email sent');
    expect(text).toContain('Apprise notification failed');
    expect(text).toContain('Webhook failed');
    expect(text).not.toContain('kl-secret');
    expect(actionLogSummary('webhook', true, 'Webhook POST hooks.example.com - 200')).toBe('Webhook POST hooks.example.com - 200');
  });
});

describe('scheduled report runs carry no addresses or mail-server text (key lock round 6)', () => {
  it('a sent report logs how many people, never who', async () => {
    mockInsertLogs.mockClear();
    logReportGenerated({ report_id: 'r1', report_name: 'kl weekly', duration_ms: 5, row_count: 3,
      sent_to: ['kl-secret-a@example.com', 'kl-secret-b@example.org'] });
    await shutdown();
    const sent = logged().filter((e) => e.action === 'report.sent');
    expect(sent.length).toBe(1);
    const text = JSON.stringify(sent);
    expect(text).toContain('sent to 2 recipients');
    expect(text).toContain('recipient_count');
    expect(text).not.toContain('kl-secret');
    expect(text).not.toContain('@example');
  });

  it('a failed report logs the kind of failure only, not the mail server reply', async () => {
    mockInsertLogs.mockClear();
    logReportGenerated({ report_id: 'r2', report_name: 'kl broken', duration_ms: 5, row_count: 0,
      error: 'Invalid login: 535 5.7.8 kl-secret-user@example.com password rejected' });
    logReportGenerated({ report_id: 'r3', report_name: 'kl bounced', duration_ms: 5, row_count: 0,
      error: 'Can not send mail to kl-secret-c@example.net: mailbox full' });
    await shutdown();
    const failed = logged().filter((e) => e.action === 'report.error');
    expect(failed.length).toBe(2);
    const text = JSON.stringify(failed);
    // Fixed phrases only (round 7): the first clause of a mail error can
    // itself be the server's reply, so nothing from the error is copied.
    expect(text).toContain(REPORT_ERROR_PHRASES.login);
    expect(text).toContain(REPORT_ERROR_PHRASES.recipient);
    expect(text).not.toContain('kl-secret');
    expect(text).not.toContain('535');
    expect(text).not.toContain('mailbox');
    expect(text).not.toContain('Invalid login');
  });

  it('reportErrorSummary only ever answers with one of its fixed phrases (round 7)', () => {
    const phrases = Object.values(REPORT_ERROR_PHRASES) as string[];
    const nasty = [
      'Message failed 550 5.1.1 User unknown in virtual mailbox table b@x.y',
      'x'.repeat(5000) + ' kl-secret-long@example.com',
      'Can not send mail to b\uFF20x.y',
      'Can not send mail to b%40x.y',
      'Invalid login: 535 5.7.8 Username and Password not accepted',
      'connect ECONNREFUSED 10.0.0.5:587',
      'getaddrinfo ENOTFOUND smtp.internal.example',
      'Greeting never received',
      'Message failed: 552 message size exceeds',
      'Search failed: no such index kl-secret-index',
      'boom kl-secret-other',
      '',
    ];
    for (const raw of nasty) {
      const out = reportErrorSummary(raw);
      expect(phrases).toContain(out);
      expect(out).not.toMatch(/@|%40|\uFF20|kl-secret|\d{3}/);
      expect(out.length).toBeLessThan(60);
    }
    expect(reportErrorSummary(nasty[0])).toBe(REPORT_ERROR_PHRASES.recipient);
    expect(reportErrorSummary(nasty[2])).toBe(REPORT_ERROR_PHRASES.recipient);
    expect(reportErrorSummary(nasty[4])).toBe(REPORT_ERROR_PHRASES.login);
    expect(reportErrorSummary(nasty[5])).toBe(REPORT_ERROR_PHRASES.connection);
    expect(reportErrorSummary(nasty[6])).toBe(REPORT_ERROR_PHRASES.connection);
    expect(reportErrorSummary(nasty[7])).toBe(REPORT_ERROR_PHRASES.connection);
    expect(reportErrorSummary(nasty[8])).toBe(REPORT_ERROR_PHRASES.mail);
    expect(reportErrorSummary(nasty[9])).toBe(REPORT_ERROR_PHRASES.search);
    expect(reportErrorSummary(nasty[10])).toBe(REPORT_ERROR_PHRASES.other);
  });
});

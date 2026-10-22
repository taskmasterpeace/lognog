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

type Logged = { action: string; message: string; structured_data: string; timestamp?: string; received_at?: string; proc_id?: string };
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
      error: 'Invalid login: 535 5.7.8 kl-secret-user@example.com password rejected', stage: 'mail' });
    logReportGenerated({ report_id: 'r3', report_name: 'kl bounced', duration_ms: 5, row_count: 0,
      error: 'Can not send mail to kl-secret-c@example.net: mailbox full', stage: 'mail' });
    await shutdown();
    const failed = logged().filter((e) => e.action === 'report.error');
    expect(failed.length).toBe(2);
    // Drop the fields the logger fills from the clock and the process id: a
    // pid like 55354 or a time ending .535 is not a mail-server reply code.
    const text = JSON.stringify(failed.map(({ timestamp, received_at, proc_id, ...rest }) => rest));
    // Nothing from the mail server's reply is copied (checked first, so old
    // code fails on the leaked text itself) ...
    expect(text).not.toContain('kl-secret');
    expect(text).not.toMatch(/\b535\b/);
    expect(text).not.toContain('mailbox');
    expect(text).not.toContain('Invalid login');
    // ... only fixed phrases (round 7): the first clause of a mail error can
    // itself be the server's reply.
    expect(text).toContain(REPORT_ERROR_PHRASES.login);
    expect(text).toContain(REPORT_ERROR_PHRASES.recipient);
  });

  it('reportErrorSummary only ever answers with one of its fixed phrases (round 7)', () => {
    const phrases = Object.values(REPORT_ERROR_PHRASES ?? {}) as string[];
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
      const out = reportErrorSummary(raw, 'unknown');
      expect(out, raw.slice(0, 60)).not.toMatch(/@|%40|\uFF20|kl-secret|\d{3}/);
      expect(out.length).toBeLessThan(60);
      expect(phrases).toContain(out);
    }
    expect(reportErrorSummary(nasty[0], 'unknown')).toBe(REPORT_ERROR_PHRASES.recipient);
    expect(reportErrorSummary(nasty[2], 'unknown')).toBe(REPORT_ERROR_PHRASES.recipient);
    expect(reportErrorSummary(nasty[4], 'unknown')).toBe(REPORT_ERROR_PHRASES.login);
    expect(reportErrorSummary(nasty[5], 'unknown')).toBe(REPORT_ERROR_PHRASES.connection);
    expect(reportErrorSummary(nasty[6], 'unknown')).toBe(REPORT_ERROR_PHRASES.connection);
    expect(reportErrorSummary(nasty[7], 'unknown')).toBe(REPORT_ERROR_PHRASES.connection);
    expect(reportErrorSummary(nasty[8], 'unknown')).toBe(REPORT_ERROR_PHRASES.mail);
    expect(reportErrorSummary(nasty[9], 'unknown')).toBe(REPORT_ERROR_PHRASES.search);
    expect(reportErrorSummary(nasty[10], 'unknown')).toBe(REPORT_ERROR_PHRASES.other);
  });

  it('the step that failed picks the phrase: a database error is never called a mail-server problem (round 8)', async () => {
    const dbErrors = [
      'connect ECONNREFUSED 127.0.0.1:8123',
      'Query timed out after 30000 ms',
      'Code: 62. DB::Exception: Syntax error: failed at position 412',
      'Code: 516. DB::Exception: default: Authentication failed: password is incorrect',
      'getaddrinfo ENOTFOUND clickhouse',
      'socket hang up',
    ];
    for (const raw of dbErrors) {
      expect((reportErrorSummary as (e: string, s?: string) => string)(raw, 'search'), raw).toBe(REPORT_ERROR_PHRASES.search);
    }
    const s = reportErrorSummary as (e: string, s?: string) => string;
    expect(s('connect ECONNREFUSED 10.0.0.5:587', 'mail')).toBe(REPORT_ERROR_PHRASES.connection);
    expect(s('Invalid login: 535 5.7.8 rejected', 'mail')).toBe(REPORT_ERROR_PHRASES.login);
    expect(s('Can not send mail to b@x.y', 'mail')).toBe(REPORT_ERROR_PHRASES.recipient);
    // an unknown error while sending is not guessed to be a search problem
    expect(s('Unexpected index in response', 'mail')).toBe(REPORT_ERROR_PHRASES.other);
    // building the e-mail, or anything after sending it
    expect(s('connect ECONNREFUSED 127.0.0.1:8123', 'render')).toBe(REPORT_ERROR_PHRASES.other);
    expect(s('Invalid login', 'finish')).toBe(REPORT_ERROR_PHRASES.other);

    mockInsertLogs.mockClear();
    (logReportGenerated as (d: Record<string, unknown>) => void)({ report_id: 'r8', report_name: 'kl search down', duration_ms: 5, row_count: 0,
      error: 'connect ECONNREFUSED 127.0.0.1:8123', stage: 'search' });
    await shutdown();
    const failed = logged().filter((e) => e.action === 'report.error');
    expect(failed.length).toBe(1);
    expect(failed[0].message).toContain(REPORT_ERROR_PHRASES.search);
    expect(failed[0].message).not.toContain(REPORT_ERROR_PHRASES.connection);
    expect(JSON.parse(failed[0].structured_data).details).toMatchObject({ failed_step: 'search', error: REPORT_ERROR_PHRASES.search });
  });

  it('a failed run has to name its step: leaving it out does not compile, and "unknown" is asked for by name (round 9)', async () => {
    // Checked by tsc (the API's tsc covers the tests): if the step became
    // optional again, these @ts-expect-error lines would fail the type check.
    const check = () => {
      // @ts-expect-error the step is required
      reportErrorSummary('connect ECONNREFUSED 127.0.0.1:8123');
      // @ts-expect-error a failed run must name its step
      logReportGenerated({ report_id: 'r9', report_name: 'kl r9', duration_ms: 1, row_count: 0, error: 'boom' });
    };
    expect(typeof check).toBe('function');
    expect(reportErrorSummary('connect ECONNREFUSED 127.0.0.1:8123', 'unknown')).toBe(REPORT_ERROR_PHRASES.connection);
    mockInsertLogs.mockClear();
    logReportGenerated({ report_id: 'r9', report_name: 'kl r9 unknown', duration_ms: 1, row_count: 0, error: 'boom', stage: 'unknown' });
    await shutdown();
    const failed = logged().filter((e) => e.action === 'report.error');
    expect(failed.length).toBe(1);
    const details = JSON.parse(failed[0].structured_data).details;
    expect(details.error).toBe(REPORT_ERROR_PHRASES.other);
    // 'unknown' is not a step, so it is not written as one
    expect(details).not.toHaveProperty('failed_step');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A stand-in mail server: each port either answers, cannot be reached, or
 * refuses the password. Every transport built is recorded so the tests can see
 * exactly which ports and security settings were used.
 */
const h = vi.hoisted(() => ({
  built: [] as Array<Record<string, unknown>>,
  verifyCalls: [] as number[],
  sent: [] as Array<{ port: number; message: Record<string, unknown> }>,
  ports: {} as Record<number, 'ok' | string>,
  sendFails: {} as Record<number, string>,
}));

function fail(code: string): Error {
  // Like a real mail error: the text quotes an address and a password hint,
  // which must never reach a log.
  const e = new Error(`failure for owner@example.test with secret-pass`) as Error & { code: string };
  e.code = code;
  return e;
}

vi.mock('nodemailer', () => {
  const createTransport = (config: Record<string, unknown>) => {
    h.built.push(config);
    const port = config.port as number;
    return {
      verify: async () => {
        h.verifyCalls.push(port);
        const state = h.ports[port] ?? 'ETIMEDOUT';
        if (state !== 'ok') throw fail(state);
        return true;
      },
      sendMail: async (message: Record<string, unknown>) => {
        if (h.sendFails[port]) throw fail(h.sendFails[port]);
        h.sent.push({ port, message });
        return { messageId: 'x' };
      },
      close: () => undefined,
    };
  };
  return { default: { createTransport }, createTransport };
});

import { sendMail, checkMail, resolveMailRoute, resetMailRouteMemory, MAIL_CONNECT_TIMEOUT_MS } from './mailer';

const MESSAGE = { from: 'noreply@example.test', to: 'owner@example.test', subject: 'Hello', text: 'Body' };
const saved = { ...process.env };
let warn: { mock: { calls: unknown[][] } };
let error: { mock: { calls: unknown[][] } };
let log: { mock: { calls: unknown[][] } };

function setMail(port: string, secure: string): void {
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = port;
  process.env.SMTP_SECURE = secure;
  process.env.SMTP_USER = 'mail-user';
  process.env.SMTP_PASS = 'secret-pass';
}

function everythingLogged(): string {
  return [warn, error, log].flatMap((spy) => spy.mock.calls.map((c) => c.join(' '))).join('\n');
}

beforeEach(() => {
  h.built.length = 0;
  h.verifyCalls.length = 0;
  h.sent.length = 0;
  h.ports = {};
  h.sendFails = {};
  resetMailRouteMemory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe('mail connection: port fallback', () => {
  it('port 465 times out: the email goes out on 587 with STARTTLS required', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'ok' };
    await sendMail(MESSAGE);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].port).toBe(587);
    const used = h.built[h.built.length - 1];
    expect(used).toMatchObject({ host: 'smtp.example.test', port: 587, secure: false, requireTLS: true });
    expect(used.auth).toEqual({ user: 'mail-user', pass: 'secret-pass' });
  });

  it('each of the "cannot reach it" failures falls back, from 465 and from 25', async () => {
    for (const port of ['465', '25']) {
      for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ESOCKET']) {
        resetMailRouteMemory();
        h.sent.length = 0;
        setMail(port, port === '465' ? 'true' : 'false');
        h.ports = { [Number(port)]: code, 587: 'ok' };
        await sendMail(MESSAGE);
        expect(h.sent.map((s) => s.port)).toEqual([587]);
      }
    }
  });

  it('port 465 works: no fallback, and 587 is never touched', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ok', 587: 'ok' };
    await sendMail(MESSAGE);
    expect(h.sent.map((s) => s.port)).toEqual([465]);
    expect(h.built.every((c) => c.port === 465)).toBe(true);
    expect(h.built[0]).toMatchObject({ secure: true, requireTLS: false });
    expect(warn.mock.calls).toHaveLength(0);
  });

  it('a wrong password is reported as it is: no fallback, nothing sent', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'EAUTH', 587: 'ok' };
    await expect(sendMail(MESSAGE)).rejects.toMatchObject({ code: 'EAUTH' });
    expect(h.sent).toHaveLength(0);
    expect(h.built.every((c) => c.port === 465)).toBe(true);
  });

  it('TLS and unknown-host problems do not fall back either', async () => {
    for (const code of ['ETLS', 'EDNS', 'EPROTOCOL']) {
      resetMailRouteMemory();
      h.built.length = 0;
      setMail('465', 'true');
      h.ports = { 465: code, 587: 'ok' };
      await expect(sendMail(MESSAGE)).rejects.toMatchObject({ code });
      expect(h.built.every((c) => c.port === 465)).toBe(true);
    }
  });

  it('587 reachable but the password is refused there: that is the error, not a masked one', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'EAUTH' };
    await expect(sendMail(MESSAGE)).rejects.toMatchObject({ code: 'EAUTH' });
    expect(h.sent).toHaveLength(0);
  });

  it('both ports unreachable: one clear error code, naming the ports and codes only', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'ECONNREFUSED' };
    const failure = await sendMail(MESSAGE).then(
      () => null,
      (e: Error & { code?: string }) => e,
    );
    expect(failure?.code).toBe('ESMTPUNREACHABLE');
    expect(failure?.message).toContain('465 (ETIMEDOUT)');
    expect(failure?.message).toContain('587 (ECONNREFUSED)');
    expect(failure?.message).not.toContain('example.test');
    expect(h.sent).toHaveLength(0);
  });

  it('a configured port that is not 465 or 25 never falls back', async () => {
    setMail('2525', 'false');
    h.ports = { 2525: 'ETIMEDOUT', 587: 'ok' };
    await expect(sendMail(MESSAGE)).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(h.built.every((c) => c.port === 2525)).toBe(true);
  });

  it('remembers the working port: later emails do not try 465 again', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'ok' };
    await sendMail(MESSAGE);
    await sendMail(MESSAGE);
    await sendMail(MESSAGE);
    expect(h.sent.map((s) => s.port)).toEqual([587, 587, 587]);
    expect(h.verifyCalls).toEqual([465, 587]);
    expect(warn.mock.calls).toHaveLength(1);
  });

  it('a failed send is never repeated, so the fallback cannot send an email twice', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ok', 587: 'ok' };
    h.sendFails = { 465: 'ETIMEDOUT' };
    await expect(sendMail(MESSAGE)).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(h.sent).toHaveLength(0);
    // Next time it checks the ports again instead of trusting the old answer.
    h.sendFails = {};
    h.ports = { 465: 'ETIMEDOUT', 587: 'ok' };
    await sendMail(MESSAGE);
    expect(h.sent.map((s) => s.port)).toEqual([587]);
  });

  it('fails fast: short connection and greeting timeouts on every transport', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'ok' };
    await sendMail(MESSAGE);
    expect(MAIL_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    for (const config of h.built) {
      expect(config.connectionTimeout).toBe(MAIL_CONNECT_TIMEOUT_MS);
      expect(config.greetingTimeout).toBe(MAIL_CONNECT_TIMEOUT_MS);
    }
  });

  it('logs the port and the code, never the password, the account or an address', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'ok' };
    await sendMail(MESSAGE);
    const text = everythingLogged();
    expect(text).toContain('465');
    expect(text).toContain('587');
    expect(text).toContain('ETIMEDOUT');
    expect(text).not.toContain('secret-pass');
    expect(text).not.toContain('mail-user');
    expect(text).not.toContain('example.test');
  });

  it('the check connects and signs in but sends nothing', async () => {
    setMail('465', 'true');
    h.ports = { 465: 'ETIMEDOUT', 587: 'ok' };
    expect(await checkMail()).toEqual({ ok: true, port: 587, fallback: true });
    expect(h.sent).toHaveLength(0);

    resetMailRouteMemory();
    h.ports = { 465: 'EAUTH' };
    expect(await checkMail()).toEqual({ ok: false, code: 'EAUTH' });
  });

  it('alerts keep their old default of a mail server on this machine', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    h.ports = { 587: 'ok' };
    const route = await resolveMailRoute('localhost');
    expect(route).toMatchObject({ host: 'localhost', port: 587, secure: false, fallback: false });
    expect(h.built[0].auth).toBeUndefined();
  });
});

/**
 * The one place LogNog builds its mail connection. Scheduled reports, alert
 * emails and the weekly funnel report all send through `sendMail` here.
 *
 * Why it exists: some hosts block outgoing port 465 (and 25) but allow 587.
 * When the configured port is 465 or 25 and the mail server cannot be reached
 * on it, this falls back once to port 587 with STARTTLS required, so the
 * password is never sent in the clear.
 *
 * How it stays safe:
 *   - The port is chosen with a connection check (connect + sign in, no
 *     message). A message is handed over only after a port is known to work,
 *     and a failed send is never repeated here, so the fallback can never send
 *     the same email twice.
 *   - Only "could not reach the server" failures fall back. A wrong password,
 *     a TLS problem or an unknown host does not: those are reported as they are.
 *   - The working choice is remembered for the life of the process.
 *   - Logs name the port and an error code only. Never the password, the
 *     account or any address.
 */
import nodemailer from 'nodemailer';

/** How long to wait for the server to answer before calling a port blocked. */
export const MAIL_CONNECT_TIMEOUT_MS = 10_000;
/** The port tried when 465 or 25 cannot be reached. */
export const MAIL_FALLBACK_PORT = 587;

/** Failures that mean "the server could not be reached on this port". */
const UNREACHABLE = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ESOCKET', 'ECONNECTION']);

export interface MailRoute {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  /** True when this is the 587 fallback, not the configured port. */
  fallback: boolean;
}

export type MailMessage = nodemailer.SendMailOptions;

export interface MailCheck {
  ok: boolean;
  port?: number;
  fallback?: boolean;
  /** An error code such as ETIMEDOUT or EAUTH. Never a message, which could quote an address. */
  code?: string;
}

interface Verifiable {
  verify?: () => Promise<unknown>;
  sendMail: (message: MailMessage) => Promise<unknown>;
  close?: () => void;
}

/** True when a mail server is named in the environment. */
export function mailHostSet(): boolean {
  return !!process.env.SMTP_HOST;
}

function configuredRoute(defaultHost?: string): MailRoute {
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  return {
    host: process.env.SMTP_HOST || defaultHost || '',
    port: Number.isFinite(port) ? port : 587,
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: false,
    fallback: false,
  };
}

function fallbackRoute(configured: MailRoute): MailRoute | null {
  if (configured.port !== 465 && configured.port !== 25) return null;
  return { host: configured.host, port: MAIL_FALLBACK_PORT, secure: false, requireTLS: true, fallback: true };
}

function transportFor(route: MailRoute): Verifiable {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host: route.host,
    port: route.port,
    secure: route.secure,
    requireTLS: route.requireTLS,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: MAIL_CONNECT_TIMEOUT_MS,
    greetingTimeout: MAIL_CONNECT_TIMEOUT_MS,
  } as Parameters<typeof nodemailer.createTransport>[0]) as unknown as Verifiable;
}

/** The error code of a mail failure, cleaned so it is safe to log. */
export function mailFailureCode(error: unknown): string {
  const e = error as { code?: unknown } | null;
  const code = e && typeof e.code === 'string' ? e.code : '';
  return code.replace(/[^A-Za-z0-9_]/g, '').slice(0, 30) || 'unknown';
}

function isUnreachable(error: unknown): boolean {
  return UNREACHABLE.has(mailFailureCode(error));
}

/** The route that worked, per configured host/port/secure, for this process. */
const remembered = new Map<string, MailRoute>();

function keyOf(route: MailRoute): string {
  return `${route.host}|${route.port}|${route.secure}`;
}

/** Test hook: forget which port worked. */
export function resetMailRouteMemory(): void {
  remembered.clear();
}

async function check(route: MailRoute): Promise<void> {
  const transport = transportFor(route);
  try {
    // Connect and sign in; no message is sent. A transport with no check
    // (a stub) is taken as reachable.
    if (typeof transport.verify === 'function') await transport.verify();
  } finally {
    try {
      transport.close?.();
    } catch {
      /* nothing to close */
    }
  }
}

/**
 * Decide which port to use: the configured one if the server answers on it,
 * otherwise 587 with STARTTLS when the configured port is 465 or 25.
 * Throws the original problem when it is not a reachability problem, and an
 * error with code ESMTPUNREACHABLE when neither port can be reached.
 */
export async function resolveMailRoute(defaultHost?: string): Promise<MailRoute> {
  const configured = configuredRoute(defaultHost);
  const known = remembered.get(keyOf(configured));
  if (known) return known;

  try {
    await check(configured);
    remembered.set(keyOf(configured), configured);
    return configured;
  } catch (error) {
    const fallback = isUnreachable(error) ? fallbackRoute(configured) : null;
    if (!fallback) throw error;
    const firstCode = mailFailureCode(error);
    try {
      await check(fallback);
    } catch (second) {
      // Reached the server on 587 but it said no (wrong password, TLS): report that as it is.
      if (!isUnreachable(second)) throw second;
      const both = new Error(`The mail server could not be reached on port ${configured.port} (${firstCode}) or port ${fallback.port} (${mailFailureCode(second)}).`) as Error & { code: string };
      both.code = 'ESMTPUNREACHABLE';
      throw both;
    }
    remembered.set(keyOf(configured), fallback);
    console.warn(`[Mail] Port ${configured.port} could not be reached (${firstCode}). Using port ${fallback.port} with STARTTLS for this process.`);
    return fallback;
  }
}

/**
 * Send one email through the configured mail server, on the port that works.
 * A failed send is not repeated here: the caller decides.
 */
export async function sendMail(message: MailMessage, opts: { defaultHost?: string } = {}): Promise<unknown> {
  const route = await resolveMailRoute(opts.defaultHost);
  const transport = transportFor(route);
  try {
    return await transport.sendMail(message);
  } catch (error) {
    // If the port that used to work stopped answering, check again next time.
    if (isUnreachable(error)) remembered.delete(keyOf(configuredRoute(opts.defaultHost)));
    throw error;
  } finally {
    try {
      transport.close?.();
    } catch {
      /* nothing to close */
    }
  }
}

/** Connect and sign in without sending anything. For checks after a deploy. */
export async function checkMail(opts: { defaultHost?: string } = {}): Promise<MailCheck> {
  try {
    const route = await resolveMailRoute(opts.defaultHost);
    return { ok: true, port: route.port, fallback: route.fallback };
  } catch (error) {
    return { ok: false, code: mailFailureCode(error) };
  }
}

/**
 * CSRF Protection Middleware
 *
 * Uses the double-submit cookie pattern for stateless CSRF protection.
 * - Sets a CSRF token cookie on GET requests
 * - Validates the X-CSRF-Token header matches the cookie on state-changing requests
 *
 * This is suitable for SPA applications where the frontend can read the cookie
 * and send it back in a header.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_COOKIE_NAME = 'lognog_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

// Methods that don't require CSRF validation
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths exempt from CSRF (API key authenticated or pre-auth endpoints)
const EXEMPT_PATHS = [
  '/ingest',            // Agent ingestion uses API keys (exact match)
  '/ingest/',           // Agent ingestion uses API keys (with trailing slash)
  '/api/ingest',        // Alternate path (exact match)
  '/api/ingest/',       // Alternate path (with trailing slash)
  '/health',            // Health checks
  '/auth/login',        // Login - no CSRF token exists yet
  '/auth/setup',        // Initial setup - no CSRF token exists yet
  '/auth/refresh',      // Token refresh - uses refresh token auth
  '/auth/setup-required', // Check if setup needed
  '/api/auth/login',    // Alternate paths
  '/api/auth/setup',
  '/api/auth/refresh',
  '/api/auth/setup-required',
  '/onboarding',        // Onboarding - JWT protected, low risk
  '/api/onboarding',    // Alternate path
];

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Check if a path is exempt from CSRF protection
 */
function isExemptPath(path: string): boolean {
  return EXEMPT_PATHS.some(exempt => path.startsWith(exempt));
}

/**
 * Check if request has API key authentication
 * API key requests are exempt from CSRF as they use a different auth mechanism
 */
function hasApiKeyAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // Check for ApiKey in Authorization header
  if (authHeader?.startsWith('ApiKey ')) {
    return true;
  }

  // Check for X-API-Key header
  if (apiKeyHeader) {
    return true;
  }

  return false;
}

/**
 * CSRF protection middleware
 *
 * Usage:
 * - Add to Express app: app.use(csrfProtection);
 * - Frontend: Read the 'lognog_csrf' cookie and send it as 'X-CSRF-Token' header
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip exempt paths (API key authenticated)
  if (isExemptPath(req.path)) {
    return next();
  }

  // Skip CSRF for API key authenticated requests
  // API keys are validated by the auth middleware, CSRF is not needed
  if (hasApiKeyAuth(req)) {
    return next();
  }

  // For safe methods, just set/refresh the token
  if (SAFE_METHODS.has(req.method)) {
    // Set CSRF cookie if not present or refresh it
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const token = generateToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,  // Frontend needs to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,  // 24 hours
      });
    }
    return next();
  }

  // For state-changing methods, validate the token
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  // Both must be present and match
  if (!cookieToken || !headerToken) {
    res.status(403).json({
      error: 'CSRF token missing',
      message: 'Include X-CSRF-Token header with the value from the lognog_csrf cookie',
    });
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    res.status(403).json({
      error: 'CSRF token invalid',
      message: 'X-CSRF-Token header does not match cookie',
    });
    return;
  }

  next();
}

/**
 * Get the current CSRF token from request cookies
 * Useful for testing or SSR
 */
export function getCsrfToken(req: Request): string | undefined {
  return req.cookies?.[CSRF_COOKIE_NAME];
}

export default csrfProtection;

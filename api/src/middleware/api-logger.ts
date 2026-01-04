/**
 * API Request Logger Middleware
 *
 * Logs significant API events to ClickHouse for self-monitoring.
 * Only logs: mutations, errors, slow requests, and auth events.
 * Skips: read-only utility endpoints, 304 responses, health checks.
 */

import { Request, Response, NextFunction } from 'express';
import { logApiCall } from '../services/internal-logger.js';

// Paths to completely exclude from logging
const EXCLUDED_PATHS = [
  '/health',
  '/api/health',
  '/favicon.ico',
];

// Paths that are read-only utilities - don't log unless slow/error
const UTILITY_PATHS = [
  '/setup-required',
  '/status',
  '/me',
  '/preferences',
  '/fields/preferences',
  '/fields/discover',
  '/onboarding/status',
  '/ai/status',
  '/stats/sources',
];

// Path prefixes for read-only utility endpoints
const UTILITY_PATH_PREFIXES = [
  '/auth/refresh',
  '/settings/preferences',
];

// Threshold for "slow" request logging (ms)
const SLOW_REQUEST_THRESHOLD_MS = 1000;

/**
 * Determine if a request should be logged
 */
function shouldLog(
  method: string,
  path: string,
  status: number,
  duration_ms: number
): boolean {
  // Always skip health checks
  if (EXCLUDED_PATHS.includes(path)) {
    return false;
  }

  // Skip 304 Not Modified (nothing changed)
  if (status === 304) {
    return false;
  }

  // Always log errors (4xx, 5xx) - these are important
  if (status >= 400) {
    return true;
  }

  // Always log slow requests
  if (duration_ms >= SLOW_REQUEST_THRESHOLD_MS) {
    return true;
  }

  // Skip utility/read-only endpoints for successful GETs
  if (method === 'GET') {
    if (UTILITY_PATHS.includes(path)) {
      return false;
    }
    for (const prefix of UTILITY_PATH_PREFIXES) {
      if (path.startsWith(prefix)) {
        return false;
      }
    }
  }

  // Skip query endpoint - we have dedicated query logging
  if (path === '/query' && method === 'POST') {
    return false;
  }

  // Log all POST/PUT/DELETE (mutations are important)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return true;
  }

  // Skip other GETs by default (too noisy)
  if (method === 'GET') {
    return false;
  }

  return true;
}

/**
 * Express middleware for logging API requests
 */
export function apiLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip excluded paths early
  if (EXCLUDED_PATHS.includes(req.path)) {
    return next();
  }

  const start = Date.now();

  // Use on('finish') to capture response end
  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const method = req.method;
    const path = req.path;
    const status = res.statusCode;

    // Apply filtering logic
    if (!shouldLog(method, path, status, duration_ms)) {
      return;
    }

    // Get user id from request if auth middleware set it
    const user = (req as unknown as { user?: { id?: string } }).user;

    logApiCall({
      method,
      path,
      status,
      duration_ms,
      user_id: user?.id,
      ip: req.ip || req.socket.remoteAddress,
      // Don't log full user agent - it's noisy and not useful
      // Just log a short identifier if present
      user_agent: req.get('User-Agent')?.split(' ')[0] || undefined,
    });
  });

  next();
}

export default apiLogger;

/**
 * API Request Logger Middleware
 *
 * Logs all API requests to ClickHouse for self-monitoring.
 * Captures: method, path, status, duration, user info.
 */

import { Request, Response, NextFunction } from 'express';
import { logApiCall } from '../services/internal-logger.js';

// Paths to exclude from logging (internal/health checks)
const EXCLUDED_PATHS = [
  '/health',
  '/api/health',
  '/favicon.ico',
];

/**
 * Express middleware for logging API requests
 */
export function apiLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip excluded paths
  if (EXCLUDED_PATHS.includes(req.path)) {
    return next();
  }

  const start = Date.now();

  // Use on('finish') to capture response end
  res.on('finish', () => {
    const duration_ms = Date.now() - start;

    // Get user id from request if auth middleware set it
    const user = (req as unknown as { user?: { id?: string } }).user;

    logApiCall({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms,
      user_id: user?.id,
      ip: req.ip || req.socket.remoteAddress,
      user_agent: req.get('User-Agent'),
    });
  });

  next();
}

export default apiLogger;

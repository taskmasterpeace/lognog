import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, validateApiKey, getUserById, JwtPayload, logAuthEvent } from './auth.js';

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
      };
      authMethod?: 'jwt' | 'apikey';
      apiKeyPermissions?: string[];
      allowedIndexes?: string[] | null;
    }
  }
}

/**
 * Authentication middleware
 * Supports both JWT tokens and API keys
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'No authorization header' });
    return;
  }

  // Check for Bearer token (JWT)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = {
      id: payload.userId,
      username: payload.username,
      role: payload.role,
    };
    req.authMethod = 'jwt';
    next();
    return;
  }

  // Check for API key
  if (authHeader.startsWith('ApiKey ')) {
    const apiKey = authHeader.slice(7);

    try {
      const result = await validateApiKey(apiKey);
      if (!result) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      const user = getUserById(result.userId);
      if (!user || !user.is_active) {
        res.status(401).json({ error: 'User account is disabled' });
        return;
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
      req.authMethod = 'apikey';
      req.apiKeyPermissions = result.permissions;
      req.allowedIndexes = result.allowedIndexes;
      next();
    } catch {
      res.status(500).json({ error: 'Authentication error' });
    }
    return;
  }

  res.status(401).json({ error: 'Invalid authorization format' });
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  // Try Bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    if (payload) {
      req.user = {
        id: payload.userId,
        username: payload.username,
        role: payload.role,
      };
      req.authMethod = 'jwt';
    }
    next();
    return;
  }

  // Try API key
  if (authHeader.startsWith('ApiKey ')) {
    const apiKey = authHeader.slice(7);

    try {
      const result = await validateApiKey(apiKey);
      if (result) {
        const user = getUserById(result.userId);
        if (user && user.is_active) {
          req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
          };
          req.authMethod = 'apikey';
          req.apiKeyPermissions = result.permissions;
          req.allowedIndexes = result.allowedIndexes;
        }
      }
    } catch {
      // Ignore errors in optional auth
    }
    next();
    return;
  }

  next();
}

/**
 * Require specific role(s)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logAuthEvent(req.user.id, 'access_denied', req.ip, req.get('user-agent'), {
        requiredRoles: roles,
        userRole: req.user.role,
        path: req.path,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Require admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    logAuthEvent(req.user.id, 'admin_access_denied', req.ip, req.get('user-agent'), {
      path: req.path,
    });
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Validate an index name used in interpolated SQL (ClickHouse/SQLite) to prevent
 * SQL injection via route params / query params (#37). Index names are
 * alphanumeric, starting with a letter, and may contain `_`/`-`. Anything else
 * (quotes, spaces, semicolons, etc.) is rejected.
 */
const INDEX_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isValidIndexName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 128 && INDEX_NAME_RE.test(name);
}

/**
 * Roles that are NOT permitted to perform write/mutating operations.
 * A `readonly` role can authenticate and read, but must never satisfy 'write'.
 */
const READONLY_ROLES = new Set(['readonly', 'viewer', 'read-only']);

/** True when the given role is a read-only role that must be denied writes. */
function isReadonlyRole(role: string | undefined): boolean {
  return !!role && READONLY_ROLES.has(role);
}

/**
 * Map an abstract permission ('read' | 'write' | 'admin') to whether the
 * current user's ROLE grants it. JWT users are authorized by role rather than
 * by an explicit permission list.
 */
function roleGrantsPermission(role: string | undefined, permission: string): boolean {
  switch (permission) {
    case 'read':
      // Every authenticated role can read.
      return true;
    case 'write':
      // Read-only roles cannot write; everyone else can.
      return !isReadonlyRole(role);
    case 'admin':
      return role === 'admin';
    default:
      // Unknown/custom permissions: only deny for read-only roles on anything
      // that is clearly not a read.
      return !isReadonlyRole(role);
  }
}

/**
 * Require API key permission (or, for JWT users, the equivalent role grant).
 *
 * Previously JWT tokens were granted full access unconditionally, which let a
 * `readonly` user perform writes. We now evaluate the user's role for JWT auth
 * so read-only roles are denied write/admin operations (#36).
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // JWT tokens are authorized based on the user's role.
    if (req.authMethod === 'jwt') {
      const granted = permissions.some((p) => roleGrantsPermission(req.user!.role, p));
      if (!granted) {
        logAuthEvent(req.user.id, 'permission_denied', req.ip, req.get('user-agent'), {
          requiredPermissions: permissions,
          userRole: req.user.role,
          path: req.path,
        });
        res.status(403).json({ error: 'Insufficient permissions for this operation' });
        return;
      }
      next();
      return;
    }

    // API keys must have specific permissions...
    if (req.authMethod === 'apikey') {
      const hasPermission = permissions.some(
        (p) => req.apiKeyPermissions?.includes(p) || req.apiKeyPermissions?.includes('*')
      );

      if (!hasPermission) {
        logAuthEvent(req.user.id, 'permission_denied', req.ip, req.get('user-agent'), {
          requiredPermissions: permissions,
          apiKeyPermissions: req.apiKeyPermissions,
          path: req.path,
        });
        res.status(403).json({ error: 'API key lacks required permissions' });
        return;
      }

      // ...AND a read-only role must never write, even with a write-scoped key.
      const needsWrite = permissions.some((p) => p === 'write' || p === 'admin');
      if (needsWrite && isReadonlyRole(req.user.role)) {
        logAuthEvent(req.user.id, 'permission_denied', req.ip, req.get('user-agent'), {
          requiredPermissions: permissions,
          userRole: req.user.role,
          path: req.path,
        });
        res.status(403).json({ error: 'Read-only account cannot perform write operations' });
        return;
      }
    }

    next();
  };
}

/**
 * Deny write/mutating HTTP verbs (POST/PUT/PATCH/DELETE) for read-only roles.
 * Safe (GET/HEAD/OPTIONS) requests always pass through. Intended as a
 * router-level guard so read endpoints stay open while mutations are protected.
 */
export function denyReadonly(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  if (!isMutating) {
    next();
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (isReadonlyRole(req.user.role)) {
    logAuthEvent(req.user.id, 'permission_denied', req.ip, req.get('user-agent'), {
      reason: 'readonly_write_blocked',
      method,
      path: req.path,
    });
    res.status(403).json({ error: 'Read-only account cannot perform write operations' });
    return;
  }

  next();
}

/** Alias for denyReadonly: require a non-readonly (write-capable) role. */
export const requireWrite = denyReadonly;

/**
 * Rate limiting by user (simple in-memory implementation)
 */
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.id || req.ip || 'anonymous';
    const now = Date.now();

    const record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests',
        retryAfter,
      });
      return;
    }

    record.count++;
    next();
  };
}

// Cleanup rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Optional API key authentication for ingestion endpoints
 * Checks for API key in Authorization header (Bearer or ApiKey) or X-API-Key header
 * If OTLP_REQUIRE_AUTH=false, authentication is optional
 * If OTLP_REQUIRE_AUTH=true (default), authentication is required
 */
export async function authenticateIngestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requireAuth = process.env.OTLP_REQUIRE_AUTH !== 'false';

  // Check for authorization header or X-API-Key header
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  if (!authHeader && !apiKeyHeader) {
    if (requireAuth) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Provide API key in Authorization header (Bearer <key>) or X-API-Key header',
      });
      return;
    }
    // Auth not required, allow unauthenticated access
    next();
    return;
  }

  // Extract API key from either header
  let apiKey: string | undefined;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7);
    } else if (authHeader.startsWith('ApiKey ')) {
      apiKey = authHeader.slice(7);
    }
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader;
  }

  if (!apiKey) {
    if (requireAuth) {
      res.status(401).json({ error: 'Invalid authorization format' });
      return;
    }
    next();
    return;
  }

  // Validate API key
  try {
    const result = await validateApiKey(apiKey);

    if (!result) {
      if (requireAuth) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      next();
      return;
    }

    const user = getUserById(result.userId);
    if (!user || !user.is_active) {
      if (requireAuth) {
        res.status(401).json({ error: 'User account is disabled' });
        return;
      }
      next();
      return;
    }

    // Check if API key has write permission
    const hasWritePermission = result.permissions.includes('write') || result.permissions.includes('*');
    if (!hasWritePermission) {
      logAuthEvent(user.id, 'ingestion_permission_denied', req.ip, req.get('user-agent'), {
        apiKeyPermissions: result.permissions,
        path: req.path,
      });
      res.status(403).json({ error: 'API key requires write permission for ingestion' });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    req.authMethod = 'apikey';
    req.apiKeyPermissions = result.permissions;
    req.allowedIndexes = result.allowedIndexes;

    // Log successful authentication
    logAuthEvent(user.id, 'otlp_ingest_auth', req.ip, req.get('user-agent'), {
      path: req.path,
    });

    next();
  } catch {
    if (requireAuth) {
      res.status(500).json({ error: 'Authentication error' });
      return;
    }
    next();
  }
}

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
    }
  }
}

/**
 * Authentication middleware
 * Supports both JWT tokens and API keys
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
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

    validateApiKey(apiKey)
      .then((result) => {
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
        next();
      })
      .catch(() => {
        res.status(500).json({ error: 'Authentication error' });
      });
    return;
  }

  res.status(401).json({ error: 'Invalid authorization format' });
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
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

    validateApiKey(apiKey)
      .then((result) => {
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
          }
        }
        next();
      })
      .catch(() => {
        next();
      });
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
 * Require API key permission
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // JWT tokens have full access based on role
    if (req.authMethod === 'jwt') {
      next();
      return;
    }

    // API keys must have specific permissions
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
    }

    next();
  };
}

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
export function authenticateIngestion(req: Request, res: Response, next: NextFunction): void {
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
  validateApiKey(apiKey)
    .then((result) => {
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

      // Log successful authentication
      logAuthEvent(user.id, 'otlp_ingest_auth', req.ip, req.get('user-agent'), {
        path: req.path,
      });

      next();
    })
    .catch(() => {
      if (requireAuth) {
        res.status(500).json({ error: 'Authentication error' });
        return;
      }
      next();
    });
}

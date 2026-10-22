import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, getUserById, JwtPayload, logAuthEvent } from './auth.js';
import { resolveApiKeyCached } from './api-key-cache.js';
import { keyHasNeed, missingForPermission, apiKeyNeed, permissionNameForNeed } from './key-policy.js';
import { refuseApiKey, requestPath } from './api-key-gate.js';

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
      /** The id of the API key this request used (never the key itself). */
      apiKeyId?: string;
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
      const result = await resolveApiKeyCached(req, apiKey);
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
      req.apiKeyId = result.keyId;
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
      const result = await resolveApiKeyCached(req, apiKey);
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
          req.apiKeyId = result.keyId;
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
      if (req.authMethod === 'apikey') {
        // No route uses requireRole today; if one does, a key refused for its
        // owner's role answers like every other key refusal (audited, deduped,
        // with needed/missing). The key's own permissions are not what is
        // missing, so `missing` is empty.
        const needed = roles.includes('readonly') ? 'read' : roles.includes('user') ? 'write' : 'admin';
        refuseApiKey(req, res, {
          event: 'access_denied',
          needed,
          missing: [],
          message: `This API key can't do that: its owner's role (${req.user.role}) is not allowed here (allowed: ${roles.join(', ')}).`,
          details: { requiredRoles: roles, userRole: req.user.role },
        });
        return;
      }
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
    if (req.authMethod === 'apikey') {
      // A key never does more than its owner, and its owner is not an admin.
      refuseApiKey(req, res, {
        event: 'admin_access_denied',
        error: 'Admin access required',
        needed: 'admin',
        missing: ['admin'],
        message: "This API key can't do that: it needs the 'admin' permission, and only an administrator's key can have it.",
      });
      return;
    }
    logAuthEvent(req.user.id, 'admin_access_denied', req.ip, req.get('user-agent'), {
      path: req.path,
    });
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  // Every API key belongs to a user (today, the admin), so the role check above
  // alone let ANY key through. A key must also carry 'admin' (or '*') itself.
  if (req.authMethod === 'apikey' && !keyHasNeed(req.apiKeyPermissions, 'admin')) {
    refuseApiKey(req, res, {
      event: 'admin_access_denied',
      needed: 'admin',
      missing: ['admin'],
      message: `This API key can't do that: it needs the 'admin' permission (it has ${JSON.stringify(req.apiKeyPermissions ?? [])}).`,
    });
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
        // Any one of `permissions` would do; name the first (the one the key
        // form offers for this route) and everything the key lacks for it.
        const needed = permissions[0] ?? 'admin';
        refuseApiKey(req, res, {
          event: 'permission_denied',
          needed,
          missing: missingForPermission(req.apiKeyPermissions, needed, requestPath(req)),
          message: `This API key can't do that: it needs the '${needed}' permission (it has ${JSON.stringify(req.apiKeyPermissions ?? [])}).`,
          details: { requiredPermissions: permissions },
        });
        return;
      }

      // ...AND a read-only role must never write, even with a write-scoped key.
      const needsWrite = permissions.some((p) => p === 'write' || p === 'admin' || p.endsWith(':write'));
      if (needsWrite && isReadonlyRole(req.user.role)) {
        refuseReadonlyKey(req, res, permissions[0]);
        return;
      }
    }

    next();
  };
}

/**
 * A key whose owner is a read-only account may not change anything: its
 * write-type permissions don't count (key-policy.ts effectiveKeyPermissions),
 * so the permission the route needs is what it lacks.
 */
function refuseReadonlyKey(req: Request, res: Response, needed: string): void {
  refuseApiKey(req, res, {
    event: 'permission_denied',
    error: 'Read-only account cannot perform write operations',
    needed,
    missing: [needed],
    message: `This API key belongs to a read-only account, so it can't use the '${needed}' permission.`,
    details: { reason: 'readonly_write_blocked', userRole: req.user?.role },
  });
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
    if (req.authMethod === 'apikey') {
      refuseReadonlyKey(req, res, permissionNameForNeed(apiKeyNeed(method, requestPath(req))));
      return;
    }
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
 * Per-account login lockout — defense-in-depth on top of the per-IP rateLimit.
 *
 * Since the cloud instance is internet-facing (no Cloudflare Access wall in
 * front), a per-IP throttle alone doesn't stop distributed credential-stuffing
 * that spreads guesses for ONE account across many IPs. This locks a *username*
 * after too many failures, regardless of source IP.
 *
 * Tracking is keyed on the SUBMITTED username string (existing or not) and the
 * response is identical either way, so it never reveals which usernames exist.
 * In-memory is sufficient: the deployment runs a single API container.
 */
const loginFailures = new Map<string, { count: number; first: number; lockedUntil: number }>();
const LOCKOUT_THRESHOLD = 5;               // failed attempts...
const LOCKOUT_WINDOW_MS = 15 * 60_000;     // ...within this window...
const LOCKOUT_DURATION_MS = 15 * 60_000;   // ...locks the account this long.

/** Seconds remaining on a lockout for this username, or 0 if not locked. */
export function accountLockoutRemaining(username: string): number {
  const rec = loginFailures.get(username.toLowerCase());
  if (!rec) return 0;
  const remaining = rec.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** Record a failed login; trips the lock at LOCKOUT_THRESHOLD within the window. */
export function recordLoginFailure(username: string): void {
  const key = username.toLowerCase();
  const now = Date.now();
  const rec = loginFailures.get(key);
  if (!rec || now - rec.first > LOCKOUT_WINDOW_MS) {
    loginFailures.set(key, { count: 1, first: now, lockedUntil: 0 });
    return;
  }
  rec.count++;
  if (rec.count >= LOCKOUT_THRESHOLD) {
    rec.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
}

/** Clear a username's failure record on successful login. */
export function clearLoginFailures(username: string): void {
  loginFailures.delete(username.toLowerCase());
}

// Evict stale failure records so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of loginFailures) {
    if (rec.lockedUntil < now && now - rec.first > LOCKOUT_WINDOW_MS) {
      loginFailures.delete(key);
    }
  }
}, 60_000);

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
    const result = await resolveApiKeyCached(req, apiKey);

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
      refuseApiKey(req, res, {
        event: 'ingestion_permission_denied',
        error: 'API key requires write permission for ingestion',
        needed: 'write',
        missing: missingForPermission(result.permissions, 'write', requestPath(req)),
        message: `This API key can't do that: it needs the 'write' (send logs) permission (it has ${JSON.stringify(result.permissions)}).`,
        key: {
          keyId: result.keyId,
          userId: user.id,
          permissions: result.permissions,
          scoped: !!(result.allowedIndexes && result.allowedIndexes.length > 0),
        },
      });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    req.authMethod = 'apikey';
    req.apiKeyPermissions = result.permissions;
    req.apiKeyId = result.keyId;
    req.allowedIndexes = result.allowedIndexes;

    // Log successful authentication
    logAuthEvent(user.id, 'otlp_ingest_auth', req.ip, req.get('user-agent'), {
      path: requestPath(req),
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

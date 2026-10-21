/**
 * Validate an API key at most once per request.
 *
 * validateApiKey bcrypt-compares the key, which is deliberately slow. The
 * API-key gate validates the key first; `authenticate`, `optionalAuth` and
 * `authenticateIngestion` then reuse that result instead of paying for a
 * second bcrypt. The cache lives in a WeakMap keyed by the request object, so
 * it never outlives the request and the key itself is never stored on `req`.
 */
import type { Request } from 'express';
import { validateApiKey } from './auth.js';

type KeyResult = Awaited<ReturnType<typeof validateApiKey>>;

const cache = new WeakMap<Request, { key: string; result: Promise<KeyResult> }>();

export function resolveApiKeyCached(req: Request, key: string): Promise<KeyResult> {
  const hit = cache.get(req);
  if (hit && hit.key === key) return hit.result;
  const result = validateApiKey(key);
  cache.set(req, { key, result });
  // A rejected validation must not be served from the cache to a later caller.
  result.catch(() => cache.delete(req));
  return result;
}

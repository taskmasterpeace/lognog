import { randomBytes } from 'crypto';

/**
 * Generate an unguessable share token for public (no-auth) dashboard links.
 * 32 random bytes (256 bits) encoded URL-safe — safe to place in a URL path and
 * far stronger than a uuidv4 (122 bits, recognizable shape).
 */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

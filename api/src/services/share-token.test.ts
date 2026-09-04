import { describe, it, expect } from 'vitest';
import { generateShareToken } from './share-token.js';

/**
 * Public dashboard share links must be unguessable. A uuidv4 is only 122 bits of
 * entropy and has a recognizable shape; share links use a 256-bit URL-safe token.
 */
describe('generateShareToken', () => {
  it('produces a URL-safe token with at least 256 bits of entropy', () => {
    const token = generateShareToken();
    // 32 bytes base64url encodes to 43 chars.
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is unique across calls', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(tokens.size).toBe(1000);
  });
});

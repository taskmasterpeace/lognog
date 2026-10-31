// Session renewal in the browser client (ui/src/api/client.ts).
// Run: node --experimental-strip-types --test ui/tests/session-refresh.test.ts
// These cover the ways Robert kept getting sent back to the login page.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as any).document = { cookie: '' };

const client = await import('../src/api/client.ts');
let authFailures = 0;
client.setAuthFailureHandler(() => { authFailures++; });

beforeEach(() => {
  store.clear();
  authFailures = 0;
  client.setTokens('old-access', 'old-refresh');
});

function mockFetch(fn: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).fetch = fn;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('a good renewal stores the new pair', async () => {
  mockFetch(async () => json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }));
  assert.equal(await client.refreshAccessToken(), true);
  assert.equal(client.getRefreshToken(), 'new-refresh');
});

test('a network blip during renewal keeps the login', async () => {
  mockFetch(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(await client.refreshAccessToken(), false);
  assert.equal(client.getRefreshToken(), 'old-refresh');
  assert.equal(authFailures, 0);
});

test('a rate limit (429) or server error keeps the login', async () => {
  for (const status of [429, 500, 502]) {
    mockFetch(async () => json(status, { error: 'busy' }));
    assert.equal(await client.refreshAccessToken(), false, `status ${status}`);
    assert.equal(client.getRefreshToken(), 'old-refresh', `status ${status}`);
  }
  assert.equal(authFailures, 0);
});

test('another tab renewed first: use its pair instead of logging out', async () => {
  mockFetch(async () => {
    // The other tab rotated the token while our request was in flight.
    client.setTokens('tab2-access', 'tab2-refresh');
    return json(401, { error: 'Invalid or expired refresh token' });
  });
  assert.equal(await client.refreshAccessToken(), true);
  assert.equal(client.getRefreshToken(), 'tab2-refresh');
  assert.equal(authFailures, 0);
});

test('a real "no" (401) still logs out', async () => {
  mockFetch(async () => json(401, { error: 'Invalid or expired refresh token' }));
  assert.equal(await client.refreshAccessToken(), false);
  assert.equal(client.getRefreshToken(), null);
  assert.equal(authFailures, 1);
});

test('no answer at all reads as a plain sentence, not "Failed to fetch"', async () => {
  mockFetch(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(client.getHomeSummary(), /LogNog didn't answer/);
});

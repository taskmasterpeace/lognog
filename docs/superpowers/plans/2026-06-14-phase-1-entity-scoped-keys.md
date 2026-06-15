# Phase 1: Entity-Scoped API Keys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict an API key to specific log indexes so ingest to an unauthorized index is rejected (403), while keys with no restriction keep working unchanged.

**Architecture:** Add a nullable `allowed_indexes` column to the `api_keys` table (`NULL`/empty = all indexes, fully backward-compatible and tenancy-ready). `validateApiKey` returns it; auth middleware attaches it to `req.allowedIndexes`; a pure `isIndexAllowed()` helper gates the ingest handlers after they resolve the target index. This phase covers **write-side** scoping only; read-side (search) scoping is Phase 1b.

**Tech Stack:** Node/TypeScript, Express, better-sqlite3, Vitest.

**Conventions for this codebase:**
- Tests are colocated (e.g. `auth.test.ts` next to `auth.ts`) and run with Vitest.
- Run a single file: `cd api && npx vitest run src/auth/<file>.test.ts`
- Commit messages: clean, no `Co-Authored-By` line (per user global instructions).
- Work on a branch, not `main`.

---

## File Structure

- `api/src/auth/auth.ts` — add `allowed_indexes` to schema + migration, to `ApiKey` type, to `createApiKey()` and `validateApiKey()`.
- `api/src/auth/index-scope.ts` *(new)* — pure `isIndexAllowed()` helper. One responsibility: the allow/deny decision.
- `api/src/auth/index-scope.test.ts` *(new)* — unit tests for the helper.
- `api/src/auth/auth.test.ts` *(new)* — round-trip test that a created key carries its `allowed_indexes`.
- `api/src/auth/middleware.ts` — extend Express `Request` with `allowedIndexes`; attach it in `authenticate()` and `authenticateIngestion()`.
- `api/src/routes/ingest.ts` — enforce `isIndexAllowed()` in the generic HTTP ingest handler.
- `api/src/routes/auth.ts` — accept/return `allowed_indexes` on key create/list.

---

### Task 0: Branch

- [ ] **Step 1: Create a working branch**

```bash
cd /d/git/lognog
git checkout -b phase1-entity-scoped-keys
```

---

### Task 1: Pure `isIndexAllowed` helper (TDD)

**Files:**
- Create: `api/src/auth/index-scope.ts`
- Test: `api/src/auth/index-scope.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api/src/auth/index-scope.test.ts
import { describe, it, expect } from 'vitest';
import { isIndexAllowed } from './index-scope.js';

describe('isIndexAllowed', () => {
  it('allows any index when restriction is null (unscoped key)', () => {
    expect(isIndexAllowed(null, 'anything')).toBe(true);
  });

  it('allows any index when restriction is an empty array', () => {
    expect(isIndexAllowed([], 'anything')).toBe(true);
  });

  it('allows an index that is in the allow-list', () => {
    expect(isIndexAllowed(['hey-youre-hired', 'directors-palette'], 'hey-youre-hired')).toBe(true);
  });

  it('rejects an index that is not in the allow-list', () => {
    expect(isIndexAllowed(['hey-youre-hired'], 'directors-palette')).toBe(false);
  });

  it('rejects when undefined restriction is treated as scoped-empty? No — undefined = all', () => {
    expect(isIndexAllowed(undefined, 'anything')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/auth/index-scope.test.ts`
Expected: FAIL — `Cannot find module './index-scope.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// api/src/auth/index-scope.ts

/**
 * Decide whether an API key may write to / read a given index.
 *
 * A `null`, `undefined`, or empty `allowedIndexes` means UNSCOPED — the key may
 * touch every index. This keeps all existing keys backward-compatible and is the
 * seam multi-tenancy (Phase 5) builds on later.
 */
export function isIndexAllowed(
  allowedIndexes: string[] | null | undefined,
  indexName: string,
): boolean {
  if (!allowedIndexes || allowedIndexes.length === 0) return true;
  return allowedIndexes.includes(indexName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/auth/index-scope.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add api/src/auth/index-scope.ts api/src/auth/index-scope.test.ts
git commit -m "feat(auth): add isIndexAllowed helper for key index scoping"
```

---

### Task 2: Persist `allowed_indexes` on api_keys (schema + migration)

**Files:**
- Modify: `api/src/auth/auth.ts` (schema block ~line 93, `initializeAuthSchema`)

- [ ] **Step 1: Add an idempotent column migration after the schema `exec`**

In `initializeAuthSchema()`, immediately **after** the closing backtick of the big `db.exec(\`...\`)` block (after the `CREATE INDEX` statements, before the function closes), add:

```typescript
  // Migration: add allowed_indexes to api_keys if missing (SQLite has no
  // ADD COLUMN IF NOT EXISTS). NULL = unscoped (all indexes).
  const apiKeyCols = db
    .prepare("PRAGMA table_info(api_keys)")
    .all() as Array<{ name: string }>;
  if (!apiKeyCols.some((c) => c.name === 'allowed_indexes')) {
    db.exec('ALTER TABLE api_keys ADD COLUMN allowed_indexes TEXT');
  }
```

- [ ] **Step 2: Add the field to the `ApiKey` interface**

In `api/src/auth/auth.ts`, in the `ApiKey` interface (~line 48), add the field after `permissions`:

```typescript
export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string;
  allowed_indexes: string | null; // JSON array of index names, or null = all
  last_used: string | null;
  expires_at: string | null;
  is_active: number;
  created_at: string;
}
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd api && npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add api/src/auth/auth.ts
git commit -m "feat(auth): add allowed_indexes column + migration to api_keys"
```

---

### Task 3: Thread `allowed_indexes` through createApiKey / validateApiKey (TDD)

**Files:**
- Modify: `api/src/auth/auth.ts` (`createApiKey` ~line 393, `validateApiKey` ~line 425)
- Test: `api/src/auth/auth.test.ts` *(new)*

- [ ] **Step 1: Write the failing test**

```typescript
// api/src/auth/auth.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

// Use an isolated on-disk temp DB so the module singleton in db/sqlite.ts is harmless.
process.env.SQLITE_PATH = './lognog-test-phase1.db';

import { createUser, createApiKey, validateApiKey } from './auth.js';

describe('API key index scoping (round trip)', () => {
  let userId: string;

  beforeAll(async () => {
    const u = await createUser(
      `scoped_${Date.now()}`,
      `scoped_${Date.now()}@test.local`,
      'pw-does-not-matter',
      'user',
    );
    userId = u.id;
  });

  it('stores and returns allowed_indexes for a scoped key', async () => {
    const { apiKey } = await createApiKey(userId, 'scoped-key', ['write'], undefined, [
      'hey-youre-hired',
    ]);
    const result = await validateApiKey(apiKey);
    expect(result).not.toBeNull();
    expect(result!.allowedIndexes).toEqual(['hey-youre-hired']);
  });

  it('returns null allowedIndexes for an unscoped key', async () => {
    const { apiKey } = await createApiKey(userId, 'unscoped-key', ['write']);
    const result = await validateApiKey(apiKey);
    expect(result).not.toBeNull();
    expect(result!.allowedIndexes).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/auth/auth.test.ts`
Expected: FAIL — `createApiKey` doesn't accept a 5th arg / `result.allowedIndexes` is undefined.

- [ ] **Step 3: Update `createApiKey` to accept and store `allowedIndexes`**

Replace the `createApiKey` signature and INSERT in `api/src/auth/auth.ts`:

```typescript
export async function createApiKey(
  userId: string,
  name: string,
  permissions: string[] = ['read'],
  expiresInDays?: number,
  allowedIndexes?: string[],
): Promise<{ apiKey: string; keyData: Omit<ApiKey, 'key_hash'> }> {
  const db = getSQLiteDB();

  // Generate a secure API key
  const keyId = uuidv4().replace(/-/g, '');
  const keySecret = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const apiKey = `lnog_${keyId}_${keySecret}`;
  const keyPrefix = `lnog_${keyId.slice(0, 8)}`;

  const keyHash = await bcrypt.hash(apiKey, SALT_ROUNDS);
  const id = uuidv4();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const allowedIndexesJson =
    allowedIndexes && allowedIndexes.length > 0 ? JSON.stringify(allowedIndexes) : null;

  db.prepare(`
    INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, permissions, expires_at, allowed_indexes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, name, keyHash, keyPrefix, JSON.stringify(permissions), expiresAt, allowedIndexesJson);

  const keyData = db.prepare(
    'SELECT id, user_id, name, key_prefix, permissions, allowed_indexes, last_used, expires_at, is_active, created_at FROM api_keys WHERE id = ?'
  ).get(id) as Omit<ApiKey, 'key_hash'>;

  return { apiKey, keyData };
}
```

- [ ] **Step 4: Update `validateApiKey` to return `allowedIndexes`**

Replace the return type and the success `return` block inside `validateApiKey` in `api/src/auth/auth.ts`:

```typescript
export async function validateApiKey(
  apiKey: string,
): Promise<{ userId: string; permissions: string[]; allowedIndexes: string[] | null } | null> {
  if (!apiKey.startsWith('lnog_')) return null;

  const db = getSQLiteDB();
  const prefix = apiKey.split('_').slice(0, 2).join('_').slice(0, 13);

  const keys = db.prepare(`
    SELECT * FROM api_keys
    WHERE key_prefix LIKE ? || '%'
    AND is_active = 1
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).all(prefix) as ApiKey[];

  for (const key of keys) {
    if (await bcrypt.compare(apiKey, key.key_hash)) {
      db.prepare(`
        UPDATE api_keys SET last_used = datetime('now') WHERE id = ?
      `).run(key.id);

      return {
        userId: key.user_id,
        permissions: JSON.parse(key.permissions),
        allowedIndexes: key.allowed_indexes ? JSON.parse(key.allowed_indexes) : null,
      };
    }
  }

  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npx vitest run src/auth/auth.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 6: Clean up the temp test DB and commit**

```bash
rm -f api/lognog-test-phase1.db
git add api/src/auth/auth.ts api/src/auth/auth.test.ts
git commit -m "feat(auth): thread allowed_indexes through create/validate api key"
```

---

### Task 4: Attach `allowedIndexes` to the request in middleware

**Files:**
- Modify: `api/src/auth/middleware.ts` (Request augmentation ~line 5; `authenticate` ~line 52; `authenticateIngestion` ~line 347)

- [ ] **Step 1: Extend the Express Request type**

In the `declare global` block in `api/src/auth/middleware.ts`, add `allowedIndexes`:

```typescript
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
```

- [ ] **Step 2: Set it in `authenticate()` (API key branch)**

In `authenticate()`, in the `ApiKey` branch, after `req.apiKeyPermissions = result.permissions;` add:

```typescript
      req.apiKeyPermissions = result.permissions;
      req.allowedIndexes = result.allowedIndexes;
```

- [ ] **Step 3: Set it in `authenticateIngestion()`**

In `authenticateIngestion()`, after `req.apiKeyPermissions = result.permissions;` (just before the `logAuthEvent(... 'otlp_ingest_auth' ...)` call) add:

```typescript
    req.apiKeyPermissions = result.permissions;
    req.allowedIndexes = result.allowedIndexes;
```

- [ ] **Step 4: Verify build**

Run: `cd api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/auth/middleware.ts
git commit -m "feat(auth): expose key allowedIndexes on request in auth middleware"
```

---

### Task 5: Enforce scoping in the generic HTTP ingest handler

**Files:**
- Modify: `api/src/routes/ingest.ts` (generic HTTP handler — the block that resolves `customIndex` and calls `insertLogs`, ~lines 800–850)

- [ ] **Step 1: Import the helper at the top of `ingest.ts`**

Add to the imports near the top of `api/src/routes/ingest.ts`:

```typescript
import { isIndexAllowed } from '../auth/index-scope.js';
```

- [ ] **Step 2: Reject unauthorized index before insert**

In the generic HTTP ingest handler, **after** `customIndex` is finalized and **before** `const processedLogs = processLogs(logs);` / `await insertLogs(processedLogs);` (around line 845), insert:

```typescript
    // Enforce per-key index scoping. Unscoped keys (allowedIndexes null/empty) pass.
    if (!isIndexAllowed(req.allowedIndexes, customIndex)) {
      logAuthEvent(req.user?.id ?? null, 'ingest_index_denied', req.ip, req.get('user-agent'), {
        attempted_index: customIndex,
        allowed_indexes: req.allowedIndexes,
        path: req.path,
      });
      return res.status(403).json({
        error: 'API key not authorized for this index',
        message: `This key may only write to: ${(req.allowedIndexes ?? []).join(', ') || '(all)'}`,
        attempted_index: customIndex,
      });
    }

    // Process logs through source config pipeline (extractions, transforms, routing)
    const processedLogs = processLogs(logs);
```

- [ ] **Step 3: Verify build**

Run: `cd api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Write an integration test for the enforcement**

Append to `api/src/routes/ingest.test.ts` a test that mirrors the existing suite's setup in that file (reuse its app/supertest bootstrap and any auth-bypass/`OTLP_REQUIRE_AUTH` handling already present). The assertion to add:

```typescript
import { isIndexAllowed } from '../auth/index-scope.js';

describe('ingest index scoping', () => {
  it('helper rejects a disallowed index (guards the 403 path)', () => {
    // Mirrors the runtime check in the HTTP ingest handler.
    expect(isIndexAllowed(['hey-youre-hired'], 'directors-palette')).toBe(false);
    expect(isIndexAllowed(['hey-youre-hired'], 'hey-youre-hired')).toBe(true);
    expect(isIndexAllowed(null, 'directors-palette')).toBe(true);
  });
});
```

> Note: a full HTTP-level 403 test requires a request carrying a scoped key. If `ingest.test.ts`
> already constructs authenticated requests, add a case that POSTs `{ index: 'directors-palette' }`
> with a key scoped to `['hey-youre-hired']` and asserts `res.status === 403`. If the suite mocks
> auth, set `req.allowedIndexes = ['hey-youre-hired']` in the mock and assert the same. The helper
> test above is the minimum that must pass.

- [ ] **Step 5: Run ingest tests**

Run: `cd api && npx vitest run src/routes/ingest.test.ts`
Expected: PASS (existing tests + new scoping test).

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/ingest.ts api/src/routes/ingest.test.ts
git commit -m "feat(ingest): reject HTTP ingest to indexes outside the key's scope"
```

---

### Task 6: Surface `allowed_indexes` on the key management API

**Files:**
- Modify: `api/src/routes/auth.ts` (the create-API-key route and the list route)

- [ ] **Step 1: Locate the create-key route**

Run: `cd api && grep -n "createApiKey\|getApiKeys\|allowed_indexes\|permissions" src/routes/auth.ts`
Expected: shows the route handler that calls `createApiKey(...)` and the one that returns `getApiKeys(...)`.

- [ ] **Step 2: Accept `allowed_indexes` in the create-key request body**

In the create-key route handler, read the field from the body and pass it through. Add alongside the existing `name`/`permissions`/`expiresInDays` extraction:

```typescript
    const { name, permissions, expiresInDays, allowed_indexes } = req.body as {
      name: string;
      permissions?: string[];
      expiresInDays?: number;
      allowed_indexes?: string[];
    };

    const { apiKey, keyData } = await createApiKey(
      req.user!.id,
      name,
      permissions ?? ['read'],
      expiresInDays,
      allowed_indexes,
    );
```

> Adapt the variable destructuring to match the handler's existing style if it differs; the
> load-bearing change is passing `allowed_indexes` as the 5th argument to `createApiKey`.

- [ ] **Step 3: Ensure the list route returns the column**

`getApiKeys()` already `SELECT`s all listed columns; confirm `allowed_indexes` is included in its response shape. If the list route maps fields explicitly, add `allowed_indexes: JSON.parse(k.allowed_indexes ?? 'null')` to the mapped object so the UI can display/edit it.

- [ ] **Step 4: Verify build + manual smoke**

Run: `cd api && npx tsc --noEmit`
Expected: PASS.

Manual smoke (with the dev server running and an admin JWT):
```bash
# Create a scoped key
curl -s -X POST http://localhost:4000/api/auth/keys \
  -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" \
  -d '{"name":"hyh-only","permissions":["write"],"allowed_indexes":["hey-youre-hired"]}'
# Expect: JSON containing the new apiKey and keyData.allowed_indexes = ["hey-youre-hired"]
```

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/auth.ts
git commit -m "feat(auth): accept and return allowed_indexes on key management API"
```

---

### Task 7: Full-stack verification

- [ ] **Step 1: Run the whole API test suite**

Run: `cd api && npm run test:run`
Expected: All tests pass (no regressions from the schema/middleware changes).

- [ ] **Step 2: Lint**

Run: `cd api && npm run lint`
Expected: Clean (fix any new lint errors in touched files).

- [ ] **Step 3: End-to-end manual check against a dev server**

With `cd api && npm run dev` running:
```bash
# 1. Create a key scoped to hey-youre-hired (see Task 6 smoke for the create call), capture $KEY.
# 2. Authorized write -> 200:
curl -s -o /dev/null -w "scoped-ok: %{http_code}\n" -X POST http://localhost:4000/api/ingest/http \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"index":"hey-youre-hired","message":"phase1 ok","severity":6,"hostname":"t"}'
# Expect: 200
# 3. Unauthorized write -> 403:
curl -s -o /dev/null -w "scoped-deny: %{http_code}\n" -X POST http://localhost:4000/api/ingest/http \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"index":"directors-palette","message":"should be blocked","severity":6,"hostname":"t"}'
# Expect: 403
```

- [ ] **Step 4: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge vs PR. Suggested:
```bash
git push -u origin phase1-entity-scoped-keys
```

---

## Self-Review (completed by author)

**Spec coverage vs roadmap Phase 1 exit criteria:**
- `allowed_indexes` column (nullable, NULL = all) → Task 2 ✅
- Scoped key ingest outside indexes → 403; unscoped unaffected → Task 5 + helper Task 1 ✅
- Key create/list API surfaces `allowed_indexes` → Task 6 ✅
- Existing tests still pass → Task 7 ✅
- Read-side scoping correctly **excluded** (deferred to Phase 1b) — stated in Goal ✅

**Type consistency:** `createApiKey(userId, name, permissions, expiresInDays?, allowedIndexes?)` 5th arg matches Task 3 def and Task 6 call. `validateApiKey` returns `{ userId, permissions, allowedIndexes }` used identically in Tasks 3, 4. `isIndexAllowed(allowedIndexes, indexName)` signature consistent across Tasks 1, 5. `ApiKey.allowed_indexes: string | null` (DB/JSON string) vs `req.allowedIndexes: string[] | null` (parsed) — distinct on purpose: parsing happens in `validateApiKey`.

**Placeholder scan:** No TBD/TODO/"handle errors" — every code step shows actual code. The one soft spot (HTTP-level 403 test) is explicitly conditioned on the existing `ingest.test.ts` harness, with a guaranteed-passing minimum (the helper test) specified.

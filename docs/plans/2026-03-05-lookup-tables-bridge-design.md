# Lookup Tables Bridge — Connect SQLite to DSL

## Date: 2026-03-05

## Problem
UI creates lookups in SQLite, DSL uses in-memory tables. They're disconnected. User-created tables are invisible to queries.

## Solution
Bridge function that loads SQLite lookups into the in-memory service on startup and after CRUD ops. Add wildcard prefix matching (keys ending with `*`).

## Changes
1. `api/src/services/lookup-tables.ts` — Add `loadCustomLookups()`, update `applyLookup()` for wildcard matching
2. `api/src/routes/knowledge.ts` — Call refresh after CRUD
3. Pre-seed `user_types` lookup with internal/beta emails

## Wildcard Matching
Keys ending with `*` match any value starting with the prefix. Exact match takes priority.
Example: `taskmasterpeace*` matches `taskmasterpeace@gmail.com`, `taskmasterpeace+test@gmail.com`

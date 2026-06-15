import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Give each test-file process its own SQLite database, assigned BEFORE any
// application module is imported (and lazily opens the getSQLiteDB singleton).
//
// ES module import hoisting means a test file's own top-level
// `process.env.SQLITE_PATH = ...` executes AFTER its imports have already run —
// and modules like auth.ts open the singleton at import time. Without this
// setup, every test file therefore falls back to the shared ./lognog.db,
// causing cross-process lock contention ("database is locked") and cross-file
// state leakage (one file's rows polluting another's assertions).
//
// setupFiles run before the test module is imported, so this guarantees a
// unique, isolated DB per file. Files that set their own SQLITE_PATH later are
// harmless: their setting is ignored (singleton already created) and their
// guarded unlink cleanup simply no-ops on the unused path.
process.env.SQLITE_PATH = join(
  tmpdir(),
  `lognog-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

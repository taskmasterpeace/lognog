import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Assign each test-file process its own SQLite DB before any import (see
    // vitest.setup.ts). This is what makes the suite deterministic: no shared
    // ./lognog.db means no cross-file lock contention or state leakage. Default
    // file-level parallelism (one isolated process per file) is preserved.
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
    // The UTC-time test pins TZ at run time; Node only honours that in a
    // process's main thread, so that one file runs in a forked process.
    poolMatchGlobs: [['**/format-date-utc.test.ts', 'forks']],
  },
});

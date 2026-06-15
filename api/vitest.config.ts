import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Assign each test-file process its own SQLite DB before any import (see
    // vitest.setup.ts). This is what makes the suite deterministic: no shared
    // ./lognog.db means no cross-file lock contention or state leakage. Default
    // file-level parallelism (one isolated process per file) is preserved.
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
  },
});

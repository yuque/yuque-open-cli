import { defineConfig } from 'vitest/config';

/**
 * Functional (e2e) suite: spawns the built dist/bin.js against a local mock
 * Yuque API. The `npm run test:e2e` script builds before invoking this config.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

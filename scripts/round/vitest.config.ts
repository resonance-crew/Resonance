import { defineConfig } from 'vitest/config';

// The round tooling's own tests (scripts/lane.sh, the acceptance list, the workflows' syntax).
// Run with `npm run test:loop`. The root vitest.config.ts includes only src/ and scripts/visual/;
// adding 'scripts/round/**/*.test.ts' to its `include` would make `npm test` run these too.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/round/**/*.test.ts'],
    testTimeout: 30_000,
  },
});

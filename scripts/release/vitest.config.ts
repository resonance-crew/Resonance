import { defineConfig } from 'vitest/config';

// The release and ops scripts' own suites: `npm run test:release`. The repo's vitest.config.ts
// includes only src/ and scripts/visual/; until it also names scripts/release and scripts/ops,
// `npm test` (and CI) doesn't run these.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: `${__dirname}/../..`,
    include: ['scripts/release/**/*.test.ts', 'scripts/ops/**/*.test.ts'],
  },
});

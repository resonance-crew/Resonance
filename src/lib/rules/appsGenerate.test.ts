import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI regenerates everything the apps take from the web that git tracks — `apps:generate:tracked` —
 * and fails on a diff (ci.yml). It must stay `apps:generate` less its two git-ignored builds (the
 * editor and mascot islands' dist/), or a generator added to one and not the other goes unchecked:
 * until 2026-11-13 CI ran 3 of the 8, and stale reactions, sticker catalog or OpenAPI passed.
 */
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as { scripts: Record<string, string> };
const steps = (script: string) => script.split('&&').map((s) => s.trim());
const IGNORED_BUILDS = ['npm run -s native:editor', 'npm run -s native:mascots'];

describe('CI regenerates what the apps take from the web', () => {
  it('apps:generate:tracked is apps:generate without the git-ignored builds', () => {
    const all = steps(pkg.scripts['apps:generate']);
    expect(all.slice(-IGNORED_BUILDS.length)).toEqual(IGNORED_BUILDS);
    expect(steps(pkg.scripts['apps:generate:tracked'])).toEqual(all.filter((s) => !IGNORED_BUILDS.includes(s)));
  });

  it('CI runs it and fails on any change it makes', () => {
    const ci = readFileSync(resolve(__dirname, '../../../.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('npm run apps:generate:tracked');
    expect(ci).toMatch(/git diff --exit-code\b/);
  });
});

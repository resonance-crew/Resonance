import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// One Node everywhere. The 2.5.0 release commit passed `npm test` on Node 24
// locally and failed it on CI's Node 22 (jsdom's Blob as a Response body,
// 6534ba4c), and nobody saw it until the next day. `.nvmrc` names the major
// version; CI reads it (setup-node's node-version-file), package.json's engines
// say the same to npm and to Vercel (the project's own setting is also 24.x),
// and the suite refuses to pass on any other major, so a local run can no
// longer be green on a Node the deployment does not use.

const ROOT = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const nvmrc = read('.nvmrc').trim();

describe('the Node version', () => {
  it('.nvmrc names one major version', () => {
    expect(nvmrc).toMatch(/^\d+$/);
  });

  it("package.json's engines (what npm and Vercel read) name the same major", () => {
    const pkg = JSON.parse(read('package.json')) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe(`${nvmrc}.x`);
    const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { engines?: { node?: string } }> };
    expect(lock.packages[''].engines?.node, 'run npm install so the lockfile carries the engines too').toBe(`${nvmrc}.x`);
  });

  it('every CI job sets Node up from .nvmrc, never a number of its own', () => {
    const ci = read('.github/workflows/ci.yml');
    const setups = ci.match(/uses: actions\/setup-node@/g)?.length ?? 0;
    expect(setups).toBeGreaterThan(0);
    expect(ci.match(/node-version-file: \.nvmrc\n/g)?.length ?? 0).toBe(setups);
    expect(ci).not.toMatch(/node-version:/);
  });

  it('the suite runs on that Node', () => {
    expect(process.versions.node.split('.')[0], `this is Node ${process.versions.node}; use Node ${nvmrc} (nvm use)`).toBe(nvmrc);
  });
});

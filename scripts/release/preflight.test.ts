import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Adapters } from './adapters';
import { summarize } from './checks';
import { ENTITLEMENTS, runPreflight } from './preflight';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const HEAD = 'c'.repeat(40);
const RULES = "service cloud.firestore { match /{d=**} { allow read: if false; } }";

const files: Record<string, string> = {
  'apps/ios/project.yml': fixture('project.yml'),
  'apps/android/app/build.gradle.kts': fixture('build.gradle.kts'),
  [ENTITLEMENTS[0]]: fixture('Resonance.entitlements'),
  [ENTITLEMENTS[1]]: fixture('Resonance.entitlements'),
  'docs/release/owed.md': '# Owed\n\n- [x] done\n',
  'docs/visual-accept-log.md': fixture('visual-accept-log.md'),
  'firebase/firestore.rules': RULES,
};
const read = (p: string) => files[p] ?? null;

/** Everything green: each test breaks one thing. */
function mock(over: Partial<Adapters> = {}): Adapters {
  const base: Partial<Adapters> = {
    head: () => HEAD,
    porcelain: () => [],
    isAncestor: () => true,
    changedBetween: () => [],
    acceptLogSince: () => '2026-11-13T00:00:00.000Z',
    ciRuns: () => [{ status: 'completed', conclusion: 'success', url: 'https://github.com/x/actions/runs/1' }],
    latestProduction: () => ({ url: 'resonance-x.vercel.app', state: 'READY', sha: HEAD, createdAt: 1 }),
    deployedRules: async () => ({ source: RULES }),
    visualDir: () => '/nowhere/visual',
    visualRuns: () => [
      {
        run: { id: '20261114-010000', commit: HEAD, dirty: false, startedAt: '2026-11-14T01:00:00Z', platforms: ['web', 'ios', 'mac', 'android'], only: [], devices: [], flowsFailed: [] },
        summary: { run: '20261114-010000', pass: true },
      },
    ],
    baselineMetas: () => [
      { platform: 'web', commit: 'aaaaaaaa' + '0'.repeat(32), run: '20261114-010000', acceptedAt: '2026-11-14T02:00:00Z' },
    ],
  };
  return { ...base, ...over } as Adapters;
}

describe('runPreflight', () => {
  it('passes when everything holds, in the checklist\'s order', async () => {
    const results = await runPreflight(mock(), read);
    expect(results.map((r) => `${r.status} ${r.id}`)).toEqual([
      'PASS tree',
      'PASS ci',
      'PASS versions',
      'PASS web',
      'PASS rules',
      'PASS owed',
      'PASS visual',
      'PASS accept-log',
    ]);
    expect(summarize(results).exitCode).toBe(0);
  });

  it('a command that fails is a FAIL saying so, and the rest still run', async () => {
    const results = await runPreflight(
      mock({
        ciRuns: () => {
          throw Object.assign(new Error('Command failed'), { stderr: 'gh: To get started with GitHub CLI, please run: gh auth login\n' });
        },
      }),
      read,
    );
    expect(results.find((r) => r.id === 'ci')).toMatchObject({ status: 'FAIL', detail: "couldn't check: gh: To get started with GitHub CLI, please run: gh auth login" });
    expect(results).toHaveLength(8);
    expect(summarize(results)).toEqual({ line: 'Preflight FAIL: 7 pass, 1 fail, 0 warn — ci', exitCode: 1 });
  });

  it('asks Vercel only when the apps claim associated domains, and diffs from the deployed commit', async () => {
    const latestProduction = vi.fn(() => ({ url: 'u', state: 'READY', sha: 'd'.repeat(40), createdAt: 1 }));
    const changedBetween = vi.fn(() => ['src/app/page.tsx']);
    const results = await runPreflight(mock({ latestProduction, changedBetween }), read);
    expect(changedBetween).toHaveBeenCalledWith('d'.repeat(40), HEAD);
    expect(results.find((r) => r.id === 'web')?.status).toBe('FAIL');

    latestProduction.mockClear();
    const noDomains = (p: string) => (ENTITLEMENTS.includes(p) ? '<plist/>' : read(p));
    const again = await runPreflight(mock({ latestProduction }), noDomains);
    expect(latestProduction).not.toHaveBeenCalled();
    expect(again.find((r) => r.id === 'web')?.status).toBe('PASS');
  });

  it('judges the latest full visual run, not a later slice', async () => {
    const results = await runPreflight(
      mock({
        visualRuns: () => [
          { run: { id: 'full', commit: 'e'.repeat(40), dirty: false, startedAt: '2026-11-14T01:00:00Z', platforms: ['web', 'ios', 'mac', 'android'], only: [], devices: [], flowsFailed: [] }, summary: { run: 'full', pass: true } },
          { run: { id: 'slice', commit: HEAD, dirty: false, startedAt: '2026-11-15T01:00:00Z', platforms: ['web'], only: ['card'], devices: [] }, summary: { run: 'slice', pass: true } },
        ],
        changedBetween: () => ['apps/ios/Resonance/App/Feed.swift'],
      }),
      read,
    );
    expect(results.find((r) => r.id === 'visual')).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('run full was taken at eeeeeeee') });
  });

  it('owed items, a dirty tree and unreadable rules', async () => {
    const results = await runPreflight(
      mock({ porcelain: () => [' M apps/ios/project.yml'], deployedRules: async () => ({ error: 'no Firebase service account in .env' }) }),
      (p) => (p === 'docs/release/owed.md' ? fixture('owed.md') : read(p)),
    );
    const by = Object.fromEntries(results.map((r) => [r.id, r.status]));
    expect(by).toMatchObject({ tree: 'FAIL', rules: 'WARN', owed: 'FAIL' });
  });
});

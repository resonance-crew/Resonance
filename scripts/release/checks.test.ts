import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  associatedDomains,
  checkAcceptLog,
  checkCi,
  checkOwed,
  checkRules,
  checkTree,
  checkVersions,
  checkVisual,
  checkWeb,
  formatResult,
  isFullRun,
  latestFullRun,
  normalizeRules,
  openOwed,
  parseAcceptLog,
  shipsWeb,
  summarize,
  type RunJson,
} from './checks';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

describe('ci', () => {
  it('an empty run list is not green', () => {
    expect(checkCi(HEAD, [])).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('no CI run') });
  });
  it('green, running and red', () => {
    expect(checkCi(HEAD, [{ status: 'completed', conclusion: 'success', url: 'u/1' }]).status).toBe('PASS');
    expect(checkCi(HEAD, [{ status: 'in_progress', conclusion: null, url: 'https://x/runs/42' }])).toMatchObject({ status: 'FAIL', fix: 'gh run watch 42 --exit-status' });
    expect(checkCi(HEAD, [{ status: 'completed', conclusion: 'failure', url: 'u/2' }])).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('failure') });
    // A re-run that went green counts.
    expect(checkCi(HEAD, [{ status: 'completed', conclusion: 'failure', url: 'u/2' }, { status: 'completed', conclusion: 'success', url: 'u/3' }]).status).toBe('PASS');
  });
});

describe('tree', () => {
  it('fails on tracked changes, warns on untracked files', () => {
    expect(checkTree([]).status).toBe('PASS');
    expect(checkTree(['?? scratch.txt']).status).toBe('WARN');
    expect(checkTree([' M src/a.ts', '?? b'])).toMatchObject({ status: 'FAIL', detail: '1 tracked file(s) changed: src/a.ts' });
  });
});

describe('versions', () => {
  it('passes when the apps agree, fails when not', () => {
    expect(checkVersions(fixture('project.yml'), fixture('build.gradle.kts')).result).toMatchObject({ status: 'PASS', detail: 'iOS + Mac 2.5.0 (16), Android 2.5.0 (versionCode 17)' });
    const off = fixture('build.gradle.kts').replace('"2.5.0"', '"2.5.1"');
    expect(checkVersions(fixture('project.yml'), off).result.status).toBe('FAIL');
    expect(checkVersions('', '').result).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('no MARKETING_VERSION') });
  });
});

describe('web', () => {
  const domains = associatedDomains(fixture('Resonance.entitlements'));
  const ready = { url: 'resonance-x.vercel.app', state: 'READY', sha: OLD, createdAt: 1 };

  it('reads the applinks hosts', () => {
    expect(domains).toEqual(['applinks:resonance.channel', 'applinks:resonance-world.vercel.app']);
    expect(associatedDomains('<plist><dict></dict></plist>')).toEqual([]);
  });

  it('knows what Vercel skips building (scripts/vercel/ignore-build.sh)', () => {
    expect(shipsWeb('apps/ios/project.yml')).toBe(false);
    expect(shipsWeb('docs/release/owed.md')).toBe(false);
    expect(shipsWeb('docs/legal/privacy.en.md')).toBe(true);
    expect(shipsWeb('src/app/page.tsx')).toBe(true);
    expect(shipsWeb('scripts/release/preflight.ts')).toBe(true);
  });

  it('needs nothing when no domain is claimed', () => {
    expect(checkWeb({ head: HEAD, associatedDomains: [], deployment: null, isAncestor: null, changedSince: [] }).status).toBe('PASS');
  });

  it('passes at HEAD, or an ancestor with only app and docs changes since', () => {
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: { ...ready, sha: HEAD }, isAncestor: null, changedSince: [] }).status).toBe('PASS');
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: ready, isAncestor: true, changedSince: ['apps/ios/project.yml', 'docs/x.md'] }).status).toBe('PASS');
  });

  it('fails when production is older, elsewhere, not Ready or missing', () => {
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: ready, isAncestor: true, changedSince: ['src/a.ts', 'apps/x'] })).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('1 web change(s) in HEAD: src/a.ts') });
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: ready, isAncestor: false, changedSince: [] }).status).toBe('FAIL');
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: ready, isAncestor: null, changedSince: [] }).status).toBe('FAIL');
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: { ...ready, state: 'BUILDING' }, isAncestor: true, changedSince: [] })).toMatchObject({ status: 'FAIL', fix: expect.stringContaining('vercel inspect') });
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: { ...ready, sha: null }, isAncestor: null, changedSince: [] }).status).toBe('FAIL');
    expect(checkWeb({ head: HEAD, associatedDomains: domains, deployment: null, isAncestor: null, changedSince: [] }).status).toBe('FAIL');
  });
});

describe('rules', () => {
  const local = "rules_version = '2';\n// who reads\nservice cloud.firestore {\n  match /x/{id} { allow read: if false; } /* none */\n}\n";
  it('compares without comments and whitespace', () => {
    expect(normalizeRules(local)).toBe("rules_version = '2'; service cloud.firestore { match /x/{id} { allow read: if false; } }");
    expect(checkRules(local, { source: local.replace(/\n\s*/g, ' ').replace('// who reads', '') }).status).toBe('PASS');
  });
  it('fails on a difference, warns when it cannot read them', () => {
    expect(checkRules(local, { source: local.replace('false', 'true') }).status).toBe('FAIL');
    expect(checkRules(local, { error: 'PERMISSION_DENIED' })).toMatchObject({ status: 'WARN', detail: expect.stringContaining('PERMISSION_DENIED') });
  });
});

describe('owed', () => {
  it('lists the open items, ticked ones left out', () => {
    expect(openOwed(fixture('owed.md'))).toEqual([
      { line: 4, text: 'backfill: avatar-colors --apply on production (r22)' },
      { line: 5, text: 'rules: chatImages deny (r24)' },
    ]);
    expect(checkOwed(fixture('owed.md'))).toMatchObject({ status: 'FAIL', detail: expect.stringMatching(/^2 owed: backfill/) });
    expect(checkOwed('# Owed\n\n- [x] done\n').status).toBe('PASS');
    expect(checkOwed(null).status).toBe('FAIL');
  });
  it('the repo\'s own file parses', () => {
    expect(() => openOwed(readFileSync(join(__dirname, '../../docs/release/owed.md'), 'utf8'))).not.toThrow();
  });
});

describe('visual', () => {
  const full = (over: Partial<RunJson> = {}): RunJson => ({
    id: '20261114-010000',
    commit: HEAD,
    dirty: false,
    startedAt: '2026-11-14T01:00:00.000Z',
    platforms: ['web', 'ios', 'mac', 'android'],
    only: [],
    devices: [],
    flowsFailed: [],
    ...over,
  });
  const ok = { run: '20261114-010000', pass: true };

  it('a full run has every platform, screen and device, and its flows', () => {
    expect(isFullRun(full())).toBe(true);
    expect(isFullRun(full({ platforms: ['web'] }))).toBe(false);
    expect(isFullRun(full({ only: ['card'] }))).toBe(false);
    expect(isFullRun(full({ devices: ['phone'] }))).toBe(false);
    expect(isFullRun(full({ flowsFailed: undefined }))).toBe(false);
    expect(isFullRun(full({ commit: 'HEAD' }))).toBe(false);
    const older = full({ id: 'older', startedAt: '2026-11-13T01:00:00.000Z' });
    expect(latestFullRun([older, full(), full({ id: 'slice', startedAt: '2026-11-15T00:00:00.000Z', only: ['card'] })])?.id).toBe('20261114-010000');
    expect(latestFullRun([])).toBeNull();
  });

  it('passes at HEAD, or with only docs and versions changed since', () => {
    expect(checkVisual({ head: HEAD, run: full(), summary: ok, changedSince: [] }).status).toBe('PASS');
    expect(checkVisual({ head: HEAD, run: full({ commit: OLD }), summary: ok, changedSince: ['apps/ios/project.yml', 'apps/android/app/build.gradle.kts', 'docs/a.md'] })).toMatchObject({ status: 'PASS', detail: expect.stringContaining('only docs or versions') });
  });

  it('fails without a run, a verdict, a PASS, or at a commit that moved', () => {
    expect(checkVisual({ head: HEAD, run: null, summary: null, changedSince: [] }).status).toBe('FAIL');
    expect(checkVisual({ head: HEAD, run: full(), summary: null, changedSince: [] })).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('no summary.json') });
    expect(checkVisual({ head: HEAD, run: full(), summary: { run: 'x', pass: false, problems: [{ kind: 'flow', key: 'a' }, { kind: 'flow', key: 'b' }] }, changedSince: [] })).toMatchObject({ status: 'FAIL', detail: 'run 20261114-010000 is a FAIL (flow)' });
    expect(checkVisual({ head: HEAD, run: full({ commit: OLD }), summary: ok, changedSince: ['src/a.tsx'] }).status).toBe('FAIL');
    expect(checkVisual({ head: HEAD, run: full({ commit: OLD }), summary: ok, changedSince: null }).status).toBe('FAIL');
  });

  it('warns on a run taken from a dirty tree', () => {
    expect(checkVisual({ head: HEAD, run: full({ dirty: true }), summary: ok, changedSince: [] }).status).toBe('WARN');
  });
});

describe('accept log', () => {
  const rows = parseAcceptLog(fixture('visual-accept-log.md'));
  it('reads the table, escaped pipes and dirty commits included', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ run: '20261114-010000', commit: 'aaaaaaaa', platforms: ['web', 'ios'], reason: '念誠: "ok, accept" | the new tabs' });
    expect(rows[1]).toMatchObject({ commit: 'aaaaaaaa', platforms: ['android'], only: 'card' });
    expect(parseAcceptLog(readFileSync(join(__dirname, '../../docs/visual-accept-log.md'), 'utf8'))).toEqual(expect.any(Array));
  });

  const meta = (platform: string, over = {}) => ({ platform, commit: HEAD, run: '20261114-010000', acceptedAt: '2026-11-14T02:00:00.000Z', ...over });

  it('passes when every baseline has its row', () => {
    expect(checkAcceptLog([meta('web'), meta('ios'), meta('android')], rows, '2026-11-13T00:00:00.000Z').status).toBe('PASS');
  });

  it('fails on a baseline the log never saw', () => {
    expect(checkAcceptLog([meta('web'), meta('mac')], rows, '2026-11-13T00:00:00.000Z')).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('mac (20261114-010000)') });
    expect(checkAcceptLog([meta('web', { commit: OLD })], rows, null).status).toBe('FAIL');
  });

  it('only warns for a baseline older than the log', () => {
    const old = meta('mac', { run: '20261110-112400', acceptedAt: '2026-11-10T14:46:18.065Z' });
    expect(checkAcceptLog([old], rows, '2026-11-13T00:00:00.000Z')).toMatchObject({ status: 'WARN', detail: expect.stringContaining('mac (20261110-112400, 2026-11-10)') });
    expect(checkAcceptLog([], rows, null).status).toBe('WARN');
  });
});

describe('summary', () => {
  it('one line and the exit code', () => {
    const results = [
      { id: 'ci', status: 'FAIL' as const, detail: 'x', fix: 'do y' },
      { id: 'tree', status: 'PASS' as const, detail: 'ok' },
      { id: 'rules', status: 'WARN' as const, detail: 'z' },
    ];
    expect(summarize(results)).toEqual({ line: 'Preflight FAIL: 1 pass, 1 fail, 1 warn — ci', exitCode: 1 });
    expect(summarize(results.slice(1))).toEqual({ line: 'Preflight PASS: 1 pass, 0 fail, 1 warn', exitCode: 0 });
    expect(formatResult(results[0])).toEqual(['FAIL ci         x', '                → do y']);
  });
});

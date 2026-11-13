import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bump } from './bump-version';
import { applyAndroid, applyIos, bumpSubject, compareSemver, lineDiff, nextVersion, planBump, readVersions } from './versions';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const YML = fixture('project.yml');
const GRADLE = fixture('build.gradle.kts');

describe('readVersions', () => {
  it('reads both apps', () => {
    expect(readVersions(YML, GRADLE)).toEqual({ ios: { marketing: '2.5.0', build: 16 }, android: { name: '2.5.0', code: 17 } });
  });

  it('refuses a file that sets a value twice, differently', () => {
    const twice = YML.replace('SWIFT_VERSION: "6.0"', 'SWIFT_VERSION: "6.0"\n        MARKETING_VERSION: "2.4.0"');
    expect(() => readVersions(twice, GRADLE)).toThrow(/different values \(2\.5\.0, 2\.4\.0\)/);
  });

  it('refuses a missing value and a build number that is not a number', () => {
    expect(() => readVersions(YML, GRADLE.replace(/versionCode = 17\n/, ''))).toThrow(/no versionCode/);
    expect(() => readVersions(YML.replace('"16"', '"16a"'), GRADLE)).toThrow(/whole number/);
  });

  it('reads the real files', () => {
    const root = join(__dirname, '../..');
    const v = readVersions(readFileSync(join(root, 'apps/ios/project.yml'), 'utf8'), readFileSync(join(root, 'apps/android/app/build.gradle.kts'), 'utf8'));
    expect(v.ios.marketing).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.android.code).toBeGreaterThan(0);
  });
});

describe('versions', () => {
  it('steps and compares', () => {
    expect(nextVersion('2.5.0', 'patch')).toBe('2.5.1');
    expect(nextVersion('2.5.3', 'minor')).toBe('2.6.0');
    expect(nextVersion('2.5.3', 'major')).toBe('3.0.0');
    expect(nextVersion('2.5.3', '2.10.0')).toBe('2.10.0');
    expect(() => nextVersion('2.5.3', 'v2.6')).toThrow();
    expect(compareSemver('2.10.0', '2.9.9')).toBeGreaterThan(0);
  });

  it('plans one past each platform\'s own build number', () => {
    const plan = planBump(readVersions(YML, GRADLE), 'minor');
    expect(plan.to).toEqual({ ios: { marketing: '2.6.0', build: 17 }, android: { name: '2.6.0', code: 18 } });
    expect(bumpSubject(plan.to)).toBe('build: 🔖 2.6.0 — iOS + Mac 2.6.0 (17), Android 2.6.0 (versionCode 18)');
  });

  it('refuses going back, a build number that does not grow, and apps that disagree', () => {
    const v = readVersions(YML, GRADLE);
    expect(() => planBump(v, '2.4.9')).toThrow(/below/);
    expect(() => planBump(v, 'patch', { ios: 16 })).toThrow(/does not grow/);
    expect(() => planBump(v, 'patch', { android: 3 })).toThrow(/does not grow/);
    expect(() => planBump({ ...v, android: { name: '2.4.0', code: 17 } }, 'patch')).toThrow(/agree/);
    // A rebuild of the same version takes new build numbers only.
    expect(planBump(v, '2.5.0').to.ios).toEqual({ marketing: '2.5.0', build: 17 });
  });

  it('rewrites the four values and nothing else', () => {
    const ios = applyIos(YML, { marketing: '2.6.0', build: 17 });
    const android = applyAndroid(GRADLE, { name: '2.6.0', code: 18 });
    expect(readVersions(ios, android)).toEqual({ ios: { marketing: '2.6.0', build: 17 }, android: { name: '2.6.0', code: 18 } });
    expect(lineDiff('apps/ios/project.yml', YML, ios)).toEqual([
      '--- apps/ios/project.yml',
      '+++ apps/ios/project.yml',
      '@@ line 8',
      '-        MARKETING_VERSION: "2.5.0"',
      '+        MARKETING_VERSION: "2.6.0"',
      '@@ line 9',
      '-        CURRENT_PROJECT_VERSION: "16"',
      '+        CURRENT_PROJECT_VERSION: "17"',
    ]);
    expect(lineDiff('x', GRADLE, android).filter((l) => l.startsWith('+') && !l.startsWith('+++'))).toEqual([
      '+        versionCode = 18',
      '+        versionName = "2.6.0"',
    ]);
    expect(ios.includes('$(MARKETING_VERSION)')).toBe(true);
  });
});

describe('bump (the CLI\'s text in, text out)', () => {
  it('prints the diff and the subject; explicit build numbers win', () => {
    const out = bump(YML, GRADLE, ['patch', '--ios-build', '20', '--android-code', '30']);
    expect(out.lines[0]).toBe('From iOS + Mac 2.5.0 (16), Android 2.5.0 (versionCode 17)');
    expect(out.lines).toContain('+        CURRENT_PROJECT_VERSION: "20"');
    expect(out.lines.at(-1)).toBe('Commit subject: build: 🔖 2.5.1 — iOS + Mac 2.5.1 (20), Android 2.5.1 (versionCode 30)');
    expect(out.files.map((f) => f.path)).toEqual(['apps/ios/project.yml', 'apps/android/app/build.gradle.kts']);
  });

  it('needs a version and whole build numbers', () => {
    expect(() => bump(YML, GRADLE, ['--write'])).toThrow(/Usage/);
    expect(() => bump(YML, GRADLE, ['patch', '--ios-build'])).toThrow(/whole number/);
  });
});

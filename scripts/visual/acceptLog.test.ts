import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACCEPT_LOG, ACCEPT_LOG_HEADER, acceptReason, acceptRow, appendAcceptLog, platformsOf, type AcceptEntry } from './acceptLog';
import { ROOT } from './util';

const entry = (over: Partial<AcceptEntry> = {}): AcceptEntry => ({
  at: new Date('2026-11-13T01:02:03.456Z'),
  run: '20261113-010000',
  commit: '0123456789abcdef0123456789abcdef01234567',
  dirty: false,
  keys: ['ios/iphone/card@light-zh-TW.png', 'ios/ipad/card@light-zh-TW.png', 'web/phone/card@dark-en.png'],
  only: ['card'],
  reason: '念誠：「卡片這樣可以」',
  ...over,
});

describe('the reason an accept rests on', () => {
  it('is the word after --reason, trimmed', () => {
    expect(acceptReason(['--run', 'x', '--reason', '  owner: looks right  '])).toBe('owner: looks right');
    expect(acceptReason(['--reason', '念誠：「OK」', '--only', 'card'])).toBe('念誠：「OK」');
  });

  it('is missing without --reason, with a blank one, or when another flag stands in its place', () => {
    expect(acceptReason(['--run', 'x', '--only', 'card'])).toBeNull();
    expect(acceptReason(['--run', 'x', '--reason'])).toBeNull();
    expect(acceptReason(['--reason', '   '])).toBeNull();
    expect(acceptReason(['--reason', '--only', 'card'])).toBeNull();
  });
});

describe('a row of the accept log', () => {
  it('says when, which run and commit, the platforms, --only, how many captures and why', () => {
    expect(acceptRow(entry())).toBe('| 2026-11-13T01:02:03Z | 20261113-010000 | 01234567 | ios, web | card | 3 | 念誠：「卡片這樣可以」 |\n');
  });

  it('says all for a whole run, and dirty for a run of a tree with changes', () => {
    expect(acceptRow(entry({ only: [], dirty: true }))).toContain('| 01234567 (dirty) | ios, web | all | 3 |');
  });

  it('keeps a reason on one line and inside its cell', () => {
    const row = acceptRow(entry({ reason: 'first line\n  second | third' }));
    expect(row).toContain('| first line second \\| third |');
    expect(row.trimEnd().split('\n')).toHaveLength(1);
  });

  it('names each platform once, in the order its captures came', () => {
    expect(platformsOf(['web/phone/a.png', 'ios/iphone/a.png', 'web/desktop/a.png'])).toEqual(['web', 'ios']);
  });
});

describe('the accept log', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'accept-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is docs/visual-accept-log.md, in git, starting with its head', () => {
    expect(ACCEPT_LOG).toBe(join(ROOT, 'docs', 'visual-accept-log.md'));
    expect(readFileSync(ACCEPT_LOG, 'utf8').startsWith(ACCEPT_LOG_HEADER)).toBe(true);
    const ignored = spawnSync('git', ['check-ignore', '-q', ACCEPT_LOG], { cwd: ROOT });
    expect(ignored.status, 'the accept log must not be git-ignored').toBe(1);
  });

  it('gets its head once, then a row per accept', () => {
    const file = join(dir, 'docs', 'visual-accept-log.md');
    appendAcceptLog(entry(), file);
    appendAcceptLog(entry({ run: '20261113-020000', only: [] }), file);
    const text = readFileSync(file, 'utf8');
    expect(text.startsWith(ACCEPT_LOG_HEADER)).toBe(true);
    expect(text.slice(ACCEPT_LOG_HEADER.length).trimEnd().split('\n')).toEqual([
      '| 2026-11-13T01:02:03Z | 20261113-010000 | 01234567 | ios, web | card | 3 | 念誠：「卡片這樣可以」 |',
      '| 2026-11-13T01:02:03Z | 20261113-020000 | 01234567 | ios, web | all | 3 | 念誠：「卡片這樣可以」 |',
    ]);
  });

  it('starts a row on a line of its own after a hand edit lost the last line break', () => {
    const file = join(dir, 'log.md');
    writeFileSync(file, `${ACCEPT_LOG_HEADER}| an older row |`);
    appendAcceptLog(entry(), file);
    expect(readFileSync(file, 'utf8').endsWith('| an older row |\n| 2026-11-13T01:02:03Z | 20261113-010000 | 01234567 | ios, web | card | 3 | 念誠：「卡片這樣可以」 |\n')).toBe(true);
  });
});

describe('npm run visual -- accept', () => {
  const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
  const accept = (...args: string[]) =>
    spawnSync(tsx, [join(ROOT, 'scripts/visual/run.ts'), 'accept', ...args], { cwd: ROOT, encoding: 'utf8' });

  it('refuses without --reason, before it looks for the run, and says why', { timeout: 30_000 }, () => {
    const before = readFileSync(ACCEPT_LOG, 'utf8');
    for (const args of [['--run', 'no-such-run'], ['--run', 'no-such-run', '--reason', ' '], ['--reason', '--only', 'card']]) {
      const out = accept(...args);
      expect(out.status).toBe(1);
      expect(out.stderr).toContain('accept needs --reason');
      expect(out.stderr).not.toContain('No run to work on');
    }
    expect(readFileSync(ACCEPT_LOG, 'utf8')).toBe(before);
  });
});

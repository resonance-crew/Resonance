import { describe, expect, it } from 'vitest';
import type { Result, RunInfo } from './compare';
import { gateLines, judge, summaryLine, type GateInput } from './gate';
import type { Verdict } from './review';
import type { Finding } from './webChecks';

const info = (over: Partial<RunInfo> = {}): RunInfo => ({
  id: '20261113-020000',
  commit: 'abc',
  dirty: false,
  startedAt: '',
  platforms: ['web', 'android'],
  only: [],
  devices: [],
  unsettled: [],
  retaken: [],
  ...over,
});

const CARD = 'android/phone/card@light-zh-TW.png';
const HOME = 'web/phone/home@light-zh-TW.png';
const THREAD = 'web/desktop/thread@light-zh-TW.png';

const input = (over: Partial<GateInput> = {}): GateInput => ({
  info: info(),
  results: [
    { key: CARD, status: 'unchanged', ratio: 0 },
    { key: HOME, status: 'unchanged', ratio: 0 },
  ],
  verdicts: new Map(),
  intendedFor: () => [],
  findingsFor: () => [],
  report: 'visual/runs/20261113-020000/index.html',
  ...over,
});

const verdict = (key: string, v: Verdict['verdict'], note = ''): [string, Verdict] => [key, { key, verdict: v, note } as Verdict];

describe('the gate', () => {
  it('fails a run its watchdog ended, whatever it took before then', () => {
    const s = judge(input({ info: info({ aborted: 'nothing moved for 31 min (VISUAL_STALL_MIN is 30 min)' }) }));
    expect(s.pass).toBe(false);
    expect(s.problems).toEqual([{ kind: 'aborted', key: '20261113-020000', detail: 'nothing moved for 31 min (VISUAL_STALL_MIN is 30 min)' }]);
  });

  it('passes a run with nothing changed', () => {
    const s = judge(input());
    expect(s.pass).toBe(true);
    expect(s.problems).toEqual([]);
    expect(s.counts).toMatchObject({ unchanged: 2, changed: 0, problems: 0 });
  });

  it('fails a change no Visual: trailer names, and lets one a trailer names wait for the owner', () => {
    const results: Result[] = [
      { key: CARD, status: 'changed', ratio: 0.1 },
      { key: HOME, status: 'changed', ratio: 0.1 },
    ];
    const s = judge(input({ results, intendedFor: (key) => (key === HOME ? ['the header is lighter (abc1234)'] : []) }));
    expect(s.pass).toBe(false);
    expect(s.problems).toEqual([{ kind: 'unexplained', key: CARD, detail: expect.stringContaining('no Visual: trailer') }]);
    expect(s.awaiting).toEqual([HOME]);
  });

  it("fails what the review judged broken, even when a trailer names it, and not what it was unsure of", () => {
    const results: Result[] = [
      { key: CARD, status: 'changed', ratio: 0.1 },
      { key: HOME, status: 'changed', ratio: 0.1 },
    ];
    const verdicts = new Map([verdict(CARD, 'broken', 'the card is blank'), verdict(HOME, 'unsure')]);
    const s = judge(input({ results, verdicts, intendedFor: () => ['meant (abc1234)'] }));
    expect(s.problems).toEqual([{ kind: 'broken', key: CARD, detail: 'the card is blank' }]);
  });

  it('fails a capture that never held still and a failed flow; a capture taken again is only a warning', () => {
    const s = judge(input({ info: info({ unsettled: [CARD], retaken: [CARD, HOME], flowsFailed: ['ios/send-sticker'] }) }));
    expect(s.problems.map((p) => [p.kind, p.key])).toEqual([
      ['unsettled', CARD],
      ['flow', 'ios/send-sticker'],
    ]);
    expect(s.warnings.map((w) => [w.kind, w.key])).toEqual([['retaken', HOME]]);
  });

  it('warns of a missing capture and a web check at warn; fails one raised to fail', () => {
    const findings: Record<string, Finding[]> = {
      [HOME]: [{ check: 'overflow', level: 'fail', detail: 'the page is 420 px wide in a 390 px window' }],
      [THREAD]: [{ check: 'touch-target', level: 'warn', detail: '2 under 44 × 44: ⋯ (32 × 32), ＋ (40 × 40)' }],
    };
    const results: Result[] = [
      { key: HOME, status: 'unchanged', ratio: 0 },
      { key: THREAD, status: 'new', ratio: null },
      { key: CARD, status: 'missing', ratio: null },
    ];
    const s = judge(input({ results, findingsFor: (key) => findings[key] ?? [] }));
    expect(s.problems).toEqual([{ kind: 'check', key: HOME, detail: 'overflow: the page is 420 px wide in a 390 px window' }]);
    expect(s.warnings.map((w) => [w.kind, w.key])).toEqual([
      ['check', THREAD],
      ['missing', CARD],
    ]);
  });

  it('judges a capture only looked at by its checks and the review: never as changed or missing', () => {
    const still = 'web/phone/film-meet@light-zh-TW.png';
    const other = 'web/desktop/film-yours@light-zh-TW.png';
    const findings: Record<string, Finding[]> = {
      [still]: [{ check: 'film', level: 'fail', detail: '1 of 9 puppets never came on stage' }],
      [other]: [{ check: 'touch-target', level: 'warn', detail: '1 under 44 × 44' }],
    };
    const s = judge(input({ glances: [still, other], findingsFor: (key) => findings[key] ?? [], verdicts: new Map([verdict(other, 'broken', 'the sky is blank')]) }));
    expect(s.problems).toEqual([
      { kind: 'check', key: still, detail: 'film: 1 of 9 puppets never came on stage' },
      { kind: 'broken', key: other, detail: 'the sky is blank' },
    ]);
    expect(s.warnings.map((w) => w.key)).toEqual([other]);
    expect(s.counts).toMatchObject({ glances: 2, changed: 0, missing: 0 });
    expect(summaryLine(s, 'f.json')).toContain('· 0 changed, 0 new, 0 missing, 2 unchanged, 2 looked at · 1 warning →');
  });

  it('reads an older run without retakes or flows', () => {
    const old = info();
    delete old.retaken;
    expect(judge(input({ info: old })).pass).toBe(true);
  });
});

describe('the one line', () => {
  it('says PASS, what waits for the owner and the counts, then where the rest is', () => {
    const results: Result[] = [
      { key: HOME, status: 'changed', ratio: 0.1 },
      { key: CARD, status: 'unchanged', ratio: 0 },
    ];
    const s = judge(input({ results, intendedFor: () => ['meant (abc1234)'] }));
    expect(summaryLine(s, 'visual/runs/x/summary.json')).toBe(
      'Visual PASS 20261113-020000: nothing broken, unsettled or unexplained · 1 change for the owner to look at · 1 changed, 0 new, 0 missing, 1 unchanged → visual/runs/x/summary.json',
    );
  });

  it('says FAIL and why, after one line per problem', () => {
    const results: Result[] = [{ key: CARD, status: 'changed', ratio: 0.1 }];
    const s = judge(input({ results, info: info({ unsettled: [HOME] }) }));
    const lines = gateLines(s, 'visual/runs/x/summary.json');
    expect(lines.at(-1)).toMatch(/^Visual FAIL 20261113-020000: 1 unexplained, 1 unsettled · 1 changed, 0 new, 0 missing, 0 unchanged → visual\/runs\/x\/summary\.json$/);
    expect(lines.slice(0, -1)).toEqual([
      `  ✗ unexplained ${CARD}: changed, and no Visual: trailer since the baseline names this screen`,
      `  ✗ unsettled ${HOME}: never held still, even after a second look`,
    ]);
  });

  it('lists at most ten problems and points to the file for the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) => `web/phone/s${i}@light-zh-TW.png`);
    const lines = gateLines(judge(input({ info: info({ unsettled: many }) })), 'f.json');
    expect(lines).toHaveLength(12);
    expect(lines[10]).toBe('  … and 2 more in f.json');
  });

  it('warns, never fails, when the owner’s device went down during the run, and says so above the verdict', () => {
    const s = judge(input({ info: info({ devicesLost: ['emulator emulator-5554'] }) }));
    expect(s.pass).toBe(true);
    expect(s.warnings).toEqual([expect.objectContaining({ kind: 'device', key: 'emulator emulator-5554' })]);
    const lines = gateLines(s, 'f.json');
    expect(lines[0]).toMatch(/^  ! emulator emulator-5554: running when the run began, gone by its end — not shut down by the harness/);
    expect(lines.at(-1)).toMatch(/^Visual PASS .* · 1 warning → f\.json$/);
  });
});

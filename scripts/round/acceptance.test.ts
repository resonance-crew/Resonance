import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITEM_FIELDS,
  LANES,
  LIST_FIELDS,
  OPTIONAL_ITEM_FIELDS,
  changesBeyondPasses,
  parseList,
  problems,
  runVerify,
  summaryLine,
  withRunResults,
  type AcceptanceList,
} from './acceptance';

const ROOT = resolve(__dirname, '..', '..');
const EXAMPLE = join(ROOT, 'docs/agents/acceptance.example.json');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'docs/agents/acceptance.schema.json'), 'utf8'));

const example = (): AcceptanceList => JSON.parse(readFileSync(EXAMPLE, 'utf8'));

const tiny = (over: Partial<AcceptanceList> = {}): AcceptanceList => ({
  round: 30,
  spec: '/Users/x/Resonance-notes/2026-12-01-round30/spec.md',
  signedOff: { by: 'owner', words: '好的，請你全部開工。', at: '2026-12-01' },
  items: [
    { id: 'r30-1', ask: '一', lanes: ['web', 'ios'], verify: { web: 'true', ios: 'true' }, passes: false },
    { id: 'r30-2', ask: '二', lanes: ['android'], verify: { android: 'exit 3' }, passes: false },
  ],
  ...over,
});

describe('the acceptance list', () => {
  it('the example (round 24) is a valid list', () => {
    expect(problems(example())).toEqual([]);
  });

  it('the schema and the validator name the same fields and lanes', () => {
    expect(Object.keys(SCHEMA.properties).sort()).toEqual([...LIST_FIELDS].sort());
    expect([...SCHEMA.required].sort()).toEqual([...LIST_FIELDS].sort());
    const item = SCHEMA.properties.items.items;
    expect([...item.required].sort()).toEqual([...ITEM_FIELDS].sort());
    expect(Object.keys(item.properties).sort()).toEqual([...ITEM_FIELDS, ...OPTIONAL_ITEM_FIELDS].sort());
    expect(item.properties.lanes.items.enum).toEqual([...LANES]);
    expect(item.properties.verify.propertyNames.enum).toEqual([...LANES]);
  });

  it('refuses what the schema refuses', () => {
    const bad = tiny();
    bad.items.push({ ...bad.items[0] });
    bad.items[1].verify = { web: 'true' } as never;
    (bad.items[0] as Record<string, unknown>).owner = 'x';
    const p = problems({ ...bad, spec: '/private/tmp/claude-501/x/spec.md' });
    expect(p).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^spec: under \/tmp/),
        expect.stringMatching(/r30-1 twice/),
        expect.stringMatching(/verify\.web: not one of the item's lanes/),
        expect.stringMatching(/verify\.android: missing/),
        expect.stringMatching(/owner: not a field/),
      ]),
    );
    expect(problems({ ...tiny(), round: 31 })).toEqual(expect.arrayContaining([expect.stringMatching(/doesn't start with r31-/)]));
    expect(parseList('{').problems[0]).toMatch(/^not JSON/);
  });

  it('after sign-off only passes may change', () => {
    const signed = tiny();
    const flipped = { ...signed, items: signed.items.map((i) => ({ ...i, passes: true })) };
    expect(changesBeyondPasses(signed, flipped)).toEqual([]);
    const reworded = { ...signed, items: [{ ...signed.items[0], ask: '別的話' }, signed.items[1]] };
    expect(changesBeyondPasses(signed, reworded)).toEqual(['r30-1 changed beyond passes']);
    const weaker = { ...signed, items: [{ ...signed.items[0], verify: { web: 'true', ios: 'echo skipped' } }, signed.items[1]] };
    expect(changesBeyondPasses(signed, weaker)).toEqual(['r30-1 changed beyond passes']);
    expect(changesBeyondPasses(signed, { ...signed, items: [signed.items[0]] })).toEqual(['r30-2 removed']);
  });

  it('runs the verify commands and sets passes only from a run of every lane', () => {
    const lines: string[] = [];
    const list = tiny();
    const results = runVerify(list, { cwd: tmpdir(), log: (s) => lines.push(s) });
    expect(lines).toEqual(['r30-1 web exit=0', 'r30-1 ios exit=0', 'r30-2 android exit=3']);
    const after = withRunResults(list, results);
    expect(after.items.map((i) => i.passes)).toEqual([true, false]);
    // One lane's run says nothing about an item spanning two.
    const iosOnly = runVerify(list, { lane: 'ios', cwd: tmpdir(), log: () => {} });
    expect(withRunResults(list, iosOnly).items[0].passes).toBe(false);
    expect(summaryLine(after, undefined, false)).toBe('Acceptance FAIL r30: 1/2 passing — open: r30-2');
  });
});

describe('the acceptance command', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'acceptance-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', join(__dirname, 'acceptance.ts'), ...args], { cwd: ROOT, encoding: 'utf8' });
  const last = (s: string) => s.trim().split('\n').at(-1);

  it('ends with one verdict line and an exit code', () => {
    const file = join(dir, 'acceptance.json');
    const signed = join(dir, 'acceptance.signed.json');
    writeFileSync(file, JSON.stringify(tiny()));
    writeFileSync(signed, JSON.stringify(tiny()));

    let r = run(file);
    expect(r.status).toBe(0);
    expect(last(r.stdout)).toBe('Acceptance PASS r30: 0/2 passing — open: r30-1, r30-2');

    r = run(file, '--lane', 'web', '--all-pass');
    expect(r.status).toBe(1);

    r = run(file, '--run', '--write', '--cwd', dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('r30-2 android exit=3');
    expect(JSON.parse(readFileSync(file, 'utf8')).items.map((i: { passes: boolean }) => i.passes)).toEqual([true, false]);

    r = run(file, '--lane', 'web', '--all-pass', '--against', signed);
    expect(r.status).toBe(0);
    expect(last(r.stdout)).toBe('Acceptance PASS r30 web: 1/1 passing');

    const tampered = tiny();
    tampered.items[1].verify = { android: 'true' };
    writeFileSync(file, JSON.stringify(tampered));
    r = run(file, '--against', signed);
    expect(r.status).toBe(1);
    expect(last(r.stdout)).toMatch(/1 change beyond passes since sign-off$/);

    expect(run(file, '--run', '--write', '--lane', 'web').status).toBe(2);
    writeFileSync(file, '{"round": 1}');
    expect(run(file).status).toBe(2);
  });
});

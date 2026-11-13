import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// The saved workflows (.claude/workflows/*.js) run inside Claude Code's workflow runtime: a script body with
// top-level await and `return`, the hooks agent / parallel / pipeline / phase / log / args as globals. Neither
// node nor eslint can read that as a module, so this test wraps each body in an async function — what the
// runtime does — and (1) has `node --check` parse it, (2) runs it against stub agents to walk its control flow.
// That is all the testing they have: no workflow here has run for real yet.

const DIR = resolve(__dirname, '..', '..', '.claude', 'workflows');
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
const tmp = mkdtempSync(join(tmpdir(), 'workflows-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function wrap(file: string) {
  const text = readFileSync(join(DIR, file), 'utf8');
  const body = text.replace(/^export const meta = /m, 'const meta = ');
  const out = join(tmp, file.replace(/\.js$/, '.mjs'));
  writeFileSync(out, `export default async function workflow(args, agent, parallel, pipeline, phase, log, budget) {\n${body}\n}\n`);
  return { text, out };
}

function metaOf(text: string) {
  const m = /^export const meta = (\{[\s\S]*?\n\})\n/m.exec(text);
  expect(m, 'meta at the top').not.toBeNull();
  // A pure literal: evaluates with nothing in scope.
  return new Function(`return (${m![1]})`)() as { name: string; description: string; phases: { title: string }[] };
}

type Opts = { label?: string; phase?: string; schema?: unknown; agentType?: string; model?: string };
type Call = { prompt: string; opts: Opts };

async function walk(file: string, args: unknown, answer: (label: string, call: Call) => unknown) {
  const mod = await import(pathToFileURL(wrap(file).out).href);
  const calls: Call[] = [];
  const logs: string[] = [];
  const agent = async (prompt: string, opts: Opts = {}) => {
    const call = { prompt, opts };
    calls.push(call);
    return answer(opts.label ?? '', call);
  };
  const parallel = (thunks: (() => Promise<unknown>)[]) => Promise.all(thunks.map((t) => t().catch(() => null)));
  const pipeline = (items: unknown[], ...stages: ((prev: unknown, item: unknown, i: number) => unknown)[]) =>
    Promise.all(
      items.map(async (item, i) => {
        let v: unknown = item;
        for (const s of stages) v = await s(v, item, i);
        return v;
      }),
    );
  const result = await mod.default(args, agent, parallel, pipeline, () => {}, (s: string) => logs.push(s), { total: null });
  return { result, calls, logs };
}

describe.each(files)('%s', (file) => {
  it('parses as the runtime runs it', () => {
    const { out } = wrap(file);
    const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('has a pure meta whose phases are the ones it uses, and no clock or randomness', () => {
    const { text } = wrap(file);
    const meta = metaOf(text);
    expect(meta.name).toBe(file.replace(/\.js$/, ''));
    expect(meta.description.length).toBeGreaterThan(40);
    const used = [...text.matchAll(/phase\('([^']+)'\)/g)].map((m) => m[1]);
    expect([...new Set(used)]).toEqual(meta.phases.map((p) => p.title));
    expect(text).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(\)/);
    expect(text).toMatch(/^\/\/ UNTESTED/m);
    // The human gates stay outside: no workflow accepts a baseline or pushes.
    expect(text).not.toMatch(/visual -- accept --run [^<]/);
    expect(text).not.toMatch(/`git push/);
  });
});

const ARGS = {
  round: 25,
  date: '2026-11-14',
  notes: '/notes/2026-11-14-round25',
  spec: '/notes/2026-11-14-round25/spec.md',
  acceptance: '/notes/2026-11-14-round25/acceptance.json',
  platforms: ['web', 'ios', 'android'],
};
const env = (lane: string, n: number) => ({
  lane, worktree: `/d/Resonance-r25${lane === 'base' ? '' : `-${lane}`}`, branch: `r25/${lane}`, base: lane === 'base' ? 'main' : 'r25/base',
  auth: String(9400 + n), firestore: String(8400 + n), dev: String(3400 + n),
});
const preflight = (signed: boolean) => ({
  ok: true, reason: '', acceptanceLine: 'Acceptance PASS r25: 0/2 passing',
  signedOff: signed ? { by: 'owner', words: '好的，請你全部開工。', at: '2026-11-14' } : null,
  items: [{ id: 'r25-1', lanes: ['web', 'ios'] }, { id: 'r25-2', lanes: ['android'] }],
  base: env('base', 59), baseHead: 'abc123', lanes: [env('web', 54), env('ios', 55), env('android', 56)],
});
const laneReport = (ids: string[], exit: number) => ({
  commits: [{ hash: 'deadbeef', subject: 'feat: x' }], items: ids.map((id) => ({ id, exit, evidence: 'test' })),
  tests: [{ command: 'npm test', exit: 0 }], notDone: [], decisions: [], strings: [], docsNotes: [], mergeRisks: [],
});
const finding = { severity: 'medium', kind: 'defect', lens: 'web', file: 'src/x.ts', line: 3, summary: 's', failure_scenario: 'f', fix: 'x' };

describe('round-build against stub agents', () => {
  it('stops at preflight when the owner has not signed off, before any lane', async () => {
    const { result, calls } = await walk('round-build.js', ARGS, (label) => (label === 'preflight' ? preflight(false) : null));
    expect(result.stoppedAt).toBe('preflight');
    expect(calls.map((c) => c.opts.label)).toEqual(['preflight']);
  });

  it('walks lanes → merge → review → fixes → record, with retries capped', async () => {
    let androidTries = 0;
    const { result, calls } = await walk('round-build.js', ARGS, (label) => {
      if (label === 'preflight') return preflight(true);
      if (label.startsWith('lane:web') || label.startsWith('lane:ios')) return laneReport(['r25-1'], 0);
      if (label.startsWith('lane:android')) {
        androidTries++;
        return laneReport(['r25-2'], 1); // never passes: no progress after the first
      }
      if (label === 'merge') return { head: 'm1', merged: [], suites: [], acceptanceLine: 'Acceptance FAIL r25: 1/2', acceptanceExit: 1, openItems: ['r25-2'], problems: [] };
      if (label === 'review:web') return { findings: [finding] };
      if (label.startsWith('review:')) return { findings: [] };
      if (label === 'refute:web') return { findings: [finding] };
      if (label.startsWith('fix:')) return { fixed: [{ summary: 's', files: ['src/x.ts'] }], notReal: [], tests: [], notes: '' };
      if (label.startsWith('settle')) return { commits: [], suites: [], acceptanceLine: 'Acceptance FAIL r25: 1/2', acceptanceExit: 1 };
      if (label.startsWith('recheck:')) return { findings: [] };
      if (label === 'record') return 'written';
      throw new Error(`unexpected agent ${label}`);
    });
    expect(result.stoppedAt).toBeNull();
    // 1 try + at most 2 retries, and it stops after two tries without progress.
    expect(androidTries).toBe(3);
    const labels = calls.map((c) => c.opts.label);
    expect(labels).toEqual(expect.arrayContaining(['merge', 'review:web', 'review:ios', 'review:android', 'review:parity', 'refute:web', 'fix:web', 'settle', 'recheck:web', 'record']));
    expect(labels.filter((l) => l?.startsWith('refute:'))).toEqual(['refute:web']);
    expect(result.openFindings).toEqual([]);
    // Lanes and reviewers run as the repo's agent types; the mechanical steps on the cheaper model.
    expect(calls.find((c) => c.opts.label === 'lane:ios')!.opts.agentType).toBe('lane-ios');
    expect(calls.find((c) => c.opts.label === 'review:web')!.opts.agentType).toBe('post-merge-reviewer');
    expect(calls.find((c) => c.opts.label === 'preflight')!.opts.model).toBe('sonnet');
    expect(calls.find((c) => c.opts.label === 'merge')!.opts).not.toHaveProperty('model');
    // Every prompt carries the scope guard; the record step gets the data, not a request to remember.
    for (const c of calls) expect(c.prompt).toMatch(/^SCOPE \(read first\)|^Act as/);
    expect(calls.find((c) => c.opts.label === 'record')!.prompt).toContain('"openFindings":[]');
  });
});

describe('round-verify against stub agents', () => {
  it('captures one platform at a time, reviews what changed, fixes, retakes, records', async () => {
    const order: string[] = [];
    const { result, calls } = await walk(
      'round-verify.js',
      { ...ARGS, slices: { web: { only: 'thread', device: 'phone' }, android: { only: 'thread' } } },
      (label) => {
        order.push(label);
        if (label === 'preflight') return { ok: true, reason: '', worktree: '/d/Resonance-r25', branch: 'r25/base', head: 'h', visualEnv: 'VISUAL_AUTH_PORT=9459' };
        if (label === 'capture:web') return { run: 'r1', exit: 1, verdictLine: 'Visual FAIL r1', summaryPath: 's', changed: ['web/phone/thread@light-zh-TW.png'], newCaptures: [], problems: [], awaiting: [] };
        if (label === 'capture:android') return { run: 'r2', exit: 0, verdictLine: 'Visual PASS r2', summaryPath: 's', changed: [], newCaptures: [], problems: [], awaiting: [] };
        if (label === 'look:web') return { looked: [], issues: [{ capture: 'c', verdict: 'broken', what: 'w', where: '1,1', likely_cause: 'x', layer: 'app' }], fine: [], summary: '' };
        if (label === 'look:web:refute') return { looked: [], issues: [{ capture: 'c', verdict: 'broken', what: 'w', where: '1,1', likely_cause: 'x', layer: 'app' }], fine: [], summary: '' };
        if (label === 'fix:web') return { commits: [{ hash: 'f', subject: 'fix' }], notReal: [], tests: [], screens: ['thread'], notes: '' };
        if (label === 'retake:web') return { run: 'r3', exit: 0, verdictLine: 'Visual PASS r3', summaryPath: 's', changed: [], newCaptures: [], problems: [], awaiting: [] };
        if (label === 'record') return 'written';
        throw new Error(`unexpected agent ${label}`);
      },
    );
    expect(order.indexOf('capture:web')).toBeLessThan(order.indexOf('capture:android'));
    expect(result.openIssues).toEqual([]);
    expect(calls.find((c) => c.opts.label === 'look:web')!.opts.agentType).toBe('ui-reviewer');
    expect(calls.find((c) => c.opts.label === 'record')!.prompt).toContain('accept --run <id>');
  });
});

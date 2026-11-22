import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The project's guard hook (.claude/hooks/hooks.mjs): the baselines and their accept / promote are the owner's.
const HOOKS = '../../.claude/hooks/hooks.mjs';
const { guardDecision } = (await import(HOOKS)) as { guardDecision: (input: unknown) => string | null };

const dir = mkdtempSync(join(tmpdir(), 'guard-hook-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
/** A transcript whose last owner message is `said`. */
const transcript = (said: string) => {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(file, JSON.stringify({ type: 'user', message: { role: 'user', content: said } }) + '\n');
  return file;
};
const bash = (command: string, said = '') => guardDecision({ tool_name: 'Bash', tool_input: { command }, transcript_path: transcript(said) });
const write = (file_path: string) => guardDecision({ tool_name: 'Write', tool_input: { file_path } });

describe('the guard keeps every baseline the owner’s', () => {
  it('refuses writing under a branch’s baseline as under main’s, by shell or by file tool; reading is fine', () => {
    for (const command of ['rm -rf visual/baselines/r30%2Fbase', 'cp x.png visual/baselines/r30%2Fbase/web/phone/home@light-zh-TW.png', 'echo {} > visual/baselines/x/web/meta.json', 'rm -rf visual/baseline/web']) {
      expect(bash(command), command).toMatch(/visual\/baselines\/ \(each branch’s\)/);
    }
    for (const command of ['ls visual/baselines', 'cat visual/baselines/r30%2Fbase/branch.json', 'find visual/baselines -name meta.json']) {
      expect(bash(command), command).toBeNull();
    }
    expect(write('/Users/x/Resonance/visual/baselines/r30%2Fbase/web/meta.json')).toMatch(/owner’s accepted screenshots/);
    expect(write('/Users/x/Resonance/visual/baseline/web/meta.json')).toMatch(/owner’s accepted screenshots/);
    expect(write('/Users/x/Resonance/visual/runs/x/run.json')).toBeNull();
  });

  it('lets promote through only with the owner’s own words, as accept', () => {
    expect(bash('npm run visual -- promote --from r30/base')).toMatch(/`visual … promote` makes pictures a baseline: it needs `--reason/);
    expect(bash('npm run visual -- promote --from r30/base --reason "好，搬到 main"', '其他的話')).toMatch(/`visual … promote --reason` must quote the owner verbatim/);
    expect(bash('npm run visual -- promote --from r30/base --reason "好，搬到 main"', '好，搬到 main')).toBeNull();
    expect(bash('npm run visual -- accept --runs a,b --reason "收為基準"', '收為基準')).toBeNull();
    expect(bash('npm run visual -- accept --runs a,b --reason "收為基準"', '先別')).toMatch(/`visual … accept --reason` must quote/);
    // However it is spelled, without the owner's words it stops.
    for (const command of ['npx tsx scripts/visual/run.ts accept --run x', 'npm run -s visual -- accept --run x', 'VISUAL_BASELINE=main npm run visual -- promote --from r30/base', 'npm run visual accept']) {
      expect(bash(command), command).toMatch(/makes pictures a baseline/);
    }
    // Neither word elsewhere in a visual command trips it.
    expect(bash('npm run visual -- capture web --only promote-banner')).toBeNull();
  });
});

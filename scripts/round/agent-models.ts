/**
 * The one place to choose the round agents' models: .claude/agents/models.json ({ "<agent>": "<model>" }).
 *
 *   npm run -s agents:models            check that every agent's `model:` matches the table (exit 1 if not)
 *   npm run -s agents:models -- --write write the table's choices into the agents' frontmatter
 *
 * Edit the table, run with --write, commit both. docs/agents/README.md says why each role has its model.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AGENTS_DIR = resolve(__dirname, '..', '..', '.claude', 'agents');
const MODEL = /^(opus|sonnet|haiku|fable|inherit|claude-[a-z0-9.-]+)$/;

export function frontmatterModel(text: string): string | null {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return null;
  const m = /^model:\s*(\S+)\s*$/m.exec(fm[1]);
  return m ? m[1] : null;
}

export function withModel(text: string, model: string): string {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error('no frontmatter');
  const body = /^model:.*$/m.test(fm[1]) ? fm[1].replace(/^model:.*$/m, `model: ${model}`) : `${fm[1]}\nmodel: ${model}`;
  return `---\n${body}\n---\n${text.slice(fm[0].length)}`;
}

export function check(dir = AGENTS_DIR): { table: Record<string, string>; problems: string[] } {
  const table = JSON.parse(readFileSync(join(dir, 'models.json'), 'utf8')) as Record<string, string>;
  const problems: string[] = [];
  for (const [agent, model] of Object.entries(table)) {
    if (!MODEL.test(model)) problems.push(`${agent}: '${model}' is not a model (opus, sonnet, haiku, fable, inherit or a claude-… id)`);
    let text: string;
    try {
      text = readFileSync(join(dir, `${agent}.md`), 'utf8');
    } catch {
      problems.push(`${agent}: no .claude/agents/${agent}.md`);
      continue;
    }
    const name = /^name:\s*(\S+)\s*$/m.exec(text)?.[1];
    if (name !== agent) problems.push(`${agent}.md: its name is '${name}'`);
    const current = frontmatterModel(text);
    if (current !== model) problems.push(`${agent}: frontmatter says ${current ?? 'nothing'}, the table says ${model}`);
  }
  return { table, problems };
}

function main(argv: string[]): number {
  const { table, problems } = check();
  if (argv.includes('--write')) {
    for (const [agent, model] of Object.entries(table)) {
      const file = join(AGENTS_DIR, `${agent}.md`);
      writeFileSync(file, withModel(readFileSync(file, 'utf8'), model));
    }
    const after = check();
    for (const p of after.problems) console.log(`  ${p}`);
    console.log(after.problems.length ? 'Agent models FAIL' : `Agent models written: ${Object.entries(table).map(([a, m]) => `${a}=${m}`).join(', ')}`);
    return after.problems.length ? 1 : 0;
  }
  for (const p of problems) console.log(`  ${p}`);
  console.log(problems.length ? `Agent models FAIL: ${problems.length} mismatch(es) — run with --write` : `Agent models PASS: ${Object.entries(table).map(([a, m]) => `${a}=${m}`).join(', ')}`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

/**
 * Proof that splitting CLAUDE.md lost nothing (docs/claude-md-migration.md): every sentence of the old
 * file appears, word for word, in the new guide — the root CLAUDE.md, `.claude/rules/*.md` and the docs
 * it points to — or is listed in the migration doc's "Dropped on purpose" table with why.
 *
 *   npx tsx scripts/ci/claudeMdCoverage.ts [<old-ref>]     (default 343c6f21, the last single-file CLAUDE.md)
 *
 * A "sentence" is a heading, a table row, a code line, or a prose sentence (split after . ! ? before a
 * capital, a backtick, `*`, `(` or `「`). Compared with Markdown's line furniture (heading marks, list
 * bullets, quote marks), a link target's leading `../` and runs of white space set aside.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../..');
export const OLD_REF = '343c6f21';

/** The files the new guide is made of. */
export function guideFiles(root = ROOT): string[] {
  const rules = join(root, '.claude/rules');
  const docs = ['docs/rules', 'docs/design', 'docs/history'].map((d) => join(root, d));
  const md = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? md(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []))
      : [];
  return [join(root, 'CLAUDE.md'), ...md(rules), ...docs.flatMap(md)];
}

/** One line's text without Markdown's line furniture (and links' targets, which are relative to their file). */
export function bare(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, '')
    .replace(/\]\((?:\.\.\/)+/g, '](')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The old file's sentences, in order, each with its line number. */
export function sentences(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let fenced = false;
  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      return;
    }
    const b = bare(raw);
    if (!b || /^\|?\s*-{3}/.test(b)) return;
    if (fenced || b.startsWith('|') || /^#{1,6}\s/.test(raw.trim())) {
      out.push({ line, text: b });
      return;
    }
    for (const s of splitSentences(b)) out.push({ line, text: s });
  });
  return out;
}

/** Prose into sentences: after . ! ? (not e.g. / i.e. / vs.) before a capital, a backtick, `*`, `(`, `「` or a digit. */
export function splitSentences(prose: string): string[] {
  return prose
    .split(/(?<=(?<!\b(?:e\.g|i\.e|vs|etc|cf))[.!?])\s+(?=[A-Z`*(「\d])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The dropped-on-purpose sentences listed in the migration doc (its table's first column, in backticks or not). */
export function droppedOnPurpose(root = ROOT): string[] {
  const doc = join(root, 'docs/claude-md-migration.md');
  if (!existsSync(doc)) return [];
  const text = readFileSync(doc, 'utf8');
  const section = text.split(/^## Dropped on purpose/m)[1]?.split(/^## /m)[0] ?? '';
  return section
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*(?:Sentence|-)/.test(l))
    .map((l) => l.split('|')[1]?.trim().replace(/^`|`$/g, '') ?? '')
    .filter(Boolean);
}

export function coverage(oldText: string, root = ROOT): { total: number; missing: { line: number; text: string }[]; dropped: number } {
  const guide = guideFiles(root)
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, 'utf8').split('\n').map(bare).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ');
  const dropped = droppedOnPurpose(root);
  const all = sentences(oldText);
  const missing = all.filter((s) => !guide.includes(s.text) && !dropped.some((d) => s.text.includes(d)));
  return { total: all.length, missing, dropped: all.filter((s) => !guide.includes(s.text) && dropped.some((d) => s.text.includes(d))).length };
}

if (process.argv[1] && /claudeMdCoverage\.ts$/.test(process.argv[1])) {
  const ref = process.argv[2] ?? OLD_REF;
  const old = execFileSync('git', ['show', `${ref}:CLAUDE.md`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const { total, missing, dropped } = coverage(old);
  const files = guideFiles().filter((f) => existsSync(f));
  console.log(`old CLAUDE.md (${ref}): ${old.split('\n').length} lines, ${Buffer.byteLength(old)} bytes, ${total} sentences`);
  console.log(`new guide: ${files.length} files`);
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    console.log(`  ${f.slice(ROOT.length + 1).padEnd(40)} ${String(t.split('\n').length).padStart(4)} lines ${String(Buffer.byteLength(t)).padStart(7)} bytes`);
  }
  console.log(`found word for word: ${total - missing.length - dropped} · dropped on purpose (listed): ${dropped} · missing: ${missing.length}`);
  for (const m of missing.slice(0, 40)) console.log(`  ✗ old line ${m.line}: ${m.text.slice(0, 160)}`);
  process.exit(missing.length ? 1 : 0);
}

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OLD_REF, coverage } from '../../../scripts/ci/claudeMdCoverage';

/**
 * The agents' guide stays short enough to be followed and correct enough to be trusted: the root
 * CLAUDE.md and each `.claude/rules/*.md` under 200 lines (the official advice — longer files are
 * followed less reliably; the single file had grown to 159 KB), every rules file scoped by `paths:`
 * whose globs each match a file in the repo (a typo would mean rules that never load), every link
 * resolving, AGENTS.md sending other agents to both — and, where the old file is in this clone, every
 * sentence of the old CLAUDE.md still there word for word (docs/claude-md-migration.md).
 */
const ROOT = resolve(__dirname, '../../..');
const RULES = join(ROOT, '.claude/rules');
const rules = readdirSync(RULES).filter((f) => f.endsWith('.md')).map((f) => join(RULES, f));
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);

function frontmatterPaths(text: string): string[] | null {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return null;
  const list = /(?:^|\n)paths:\n((?:\s+-\s+.+\n?)+)/.exec(fm[1]);
  return list ? list[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, '').trim()).filter(Boolean) : [];
}

describe('the agents’ guide', () => {
  it('keeps the root CLAUDE.md and every rules file under 200 lines', () => {
    for (const f of [join(ROOT, 'CLAUDE.md'), ...rules]) {
      expect(readFileSync(f, 'utf8').split('\n').length, f.slice(ROOT.length + 1)).toBeLessThanOrEqual(200);
    }
  });

  it('scopes every rules file by paths that exist', () => {
    expect(rules.length).toBeGreaterThan(10);
    for (const f of rules) {
      const globs = frontmatterPaths(readFileSync(f, 'utf8'));
      expect(globs, `${f}: a paths: list in its frontmatter`).not.toBeNull();
      expect(globs!.length, f).toBeGreaterThan(0);
      for (const g of globs!) expect(tracked.some((t) => matchesGlob(t, g)), `${f.slice(ROOT.length + 1)}: ${g} matches no file`).toBe(true);
    }
    // every glob against ~4k tracked files: ~1.5 s alone, past 5 s under the full suite's load (and CI is slower still)
  }, 30_000);

  it('links only to files that are there', () => {
    for (const f of [join(ROOT, 'CLAUDE.md'), join(ROOT, 'AGENTS.md'), ...rules]) {
      const prose = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      for (const m of prose.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(m[1])) continue;
        expect(existsSync(resolve(dirname(f), m[1])), `${f.slice(ROOT.length + 1)} → ${m[1]}`).toBe(true);
      }
    }
  });

  it('names every rules file in the root map and sends other agents to them', () => {
    const root = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
    for (const f of rules) expect(root, f).toContain(`.claude/rules/${f.split('/').pop()}`);
    const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('CLAUDE.md');
    expect(agents).toContain('.claude/rules');
  });

  const old = (() => {
    try {
      return execFileSync('git', ['show', `${OLD_REF}:CLAUDE.md`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
    } catch {
      return null;
    }
  })();

  it.skipIf(!old)(`still holds every sentence of the single-file CLAUDE.md (${OLD_REF}) word for word, or says why not`, () => {
    const { total, missing } = coverage(old!, ROOT);
    expect(total).toBeGreaterThan(500);
    expect(missing.map((m) => `old line ${m.line}: ${m.text.slice(0, 120)}`)).toEqual([]);
  });
});

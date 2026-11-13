import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, WEB_FILES } from './sourceScan';

/**
 * The resonance-ui skill matches the code. The skill is what loads whenever an agent builds or reviews
 * UI, and from 2026-10-27 to 2026-11-13 it told agents to use `--sheet-shadow` — a token the menu's
 * own test refuses — and drew the round-17 menus round 18 had reversed. So every `--token`, component
 * name and source path the skill quotes must exist under src/: a rename or a removal fails here until
 * the skill follows. A name the skill quotes on purpose without it being in src/ is listed with why.
 */
const SKILL = resolve(ROOT, '.claude/skills/resonance-ui/SKILL.md');

const NOT_IN_SRC: Record<string, string> = {
  '--sheet-shadow': 'quoted as the token OrganicMenu.test.tsx refuses (no shadow anywhere)',
};

const md = readFileSync(SKILL, 'utf8');
const spans = [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

/** `--field-border`, `--field-pad-y/x` → `--field-pad-y` (the `/x` is the skill's shorthand). */
function quotedTokens(spansIn: string[]): string[] {
  return [...new Set(spansIn.flatMap((s) => [...s.matchAll(/--[a-z][a-z0-9-]*[a-z0-9]/g)].map((m) => m[0])))];
}

/** PascalCase names in code spans and JSX tags: `<OrganicButton`, `atoms/PaperSheet`, `RowBrushes`. */
function quotedComponents(text: string, spansIn: string[]): string[] {
  const names = new Set<string>();
  for (const s of spansIn) for (const m of s.matchAll(/(?:^|[<\s/(])([A-Z][a-z]+(?:[A-Z][a-z0-9]*)+)\b/g)) names.add(m[1]);
  for (const m of text.matchAll(/<([A-Z][a-z]+(?:[A-Z][a-z0-9]*)*)\b/g)) names.add(m[1]);
  return [...names];
}

/** `src/…`, `atoms/…`, `molecules/…`, `sections/…`, `providers/…` paths in code spans. */
function quotedPaths(spansIn: string[]): string[] {
  return [
    ...new Set(
      spansIn
        .map((s) => s.trim())
        .filter((s) => /^(?:src|atoms|molecules|sections|providers)\/[\w./[\]-]+$/.test(s))
        .map((s) => (s.startsWith('src/') ? s : `src/components/${s}`)),
    ),
  ];
}

describe('the resonance-ui skill matches the code', () => {
  const files = WEB_FILES();
  const code = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const fileNames = new Set(files.map((f) => basename(f).replace(/\.(?:module\.)?(?:tsx?|css)$/, '')));

  it('quotes only tokens the stylesheets define', () => {
    const tokens = quotedTokens(spans);
    expect(tokens.length).toBeGreaterThan(10);
    const defined = (t: string) => new RegExp(`${t}\\s*:`).test(code) || code.includes(`'${t.slice(2)}'`);
    expect(tokens.filter((t) => !(t in NOT_IN_SRC) && !defined(t)), 'a token the skill quotes that src/ no longer defines').toEqual([]);
  });

  it('quotes only components that exist', () => {
    const names = quotedComponents(md, spans);
    expect(names.length).toBeGreaterThan(20);
    const exists = (n: string) =>
      fileNames.has(n) || new RegExp(`(?:function|const|class|let|type|interface)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`).test(code);
    expect(names.filter((n) => !(n in NOT_IN_SRC) && !exists(n)), 'a component the skill quotes that src/ no longer has').toEqual([]);
  });

  it('quotes only source paths that exist', () => {
    const paths = quotedPaths(spans);
    expect(paths.length).toBeGreaterThan(3);
    const exists = (p: string) => ['', '.ts', '.tsx', '.css'].some((ext) => existsSync(resolve(ROOT, p + ext)));
    expect(paths.filter((p) => !exists(p)), 'a path the skill quotes that is gone').toEqual([]);
  });

  it('keeps its list of names outside src/ as short as the skill', () => {
    const quoted = new Set([...quotedTokens(spans), ...quotedComponents(md, spans)]);
    expect(Object.keys(NOT_IN_SRC).filter((n) => !quoted.has(n)), 'no longer quoted: remove it').toEqual([]);
  });

  it('reads tokens and names as meant', () => {
    expect(quotedTokens(['--field-pad-y/x', 'padding-top: calc(var(--app-header-h) + 1px)'])).toEqual(['--field-pad-y', '--app-header-h']);
    expect(quotedComponents('<Divider seed={6} />', ['atoms/PaperSheet', 'RowBrushes + useRowInk', 'INK'])).toEqual(
      expect.arrayContaining(['PaperSheet', 'RowBrushes', 'Divider']),
    );
    expect(quotedComponents('', ['INK_LIGHT', 'useRowInk', 'Cancel'])).toEqual([]);
  });
});

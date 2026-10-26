import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { customProperties, islandRoot } from '../../scripts/native/islandRoot';
import { lightRootCss } from '../lib/design/paletteCss';

// A story's type is written once (story.css) from one vocabulary (tokens.css),
// for the reader, the web writer and the apps' editor island; the apps' readers
// take the same numbers through scripts/native/tokens.ts.

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const tokensCss = read('./tokens.css');
const storyCss = read('./story.css');
// Colours are palette.css's (generated from lib/design/palette); light terracotta's :root stands for them.
const tokens = customProperties(tokensCss + lightRootCss());
const own = customProperties(storyCss);

/** What scripts/native/tokens.ts exports to Tokens.swift / Tokens.kt: `--x: N;` or `--x: Npx;`. */
const EXPORTED = new Set([...tokensCss.matchAll(/--([\w-]+):\s*(-?[\d.]+)(px)?\s*;/g)].map((m) => m[1]));

/** The story tokens the apps don't take as numbers: a viewport-bound cap, an em, a colour mix. */
const NOT_NUMBERS = new Set(['story-image-max-h', 'story-blank-line', 'story-code-tint']);

/** Variables set at runtime, not by a stylesheet: each link's pen wave (lib/design/storyLinkWave). */
const RUNTIME = new Set(['wave', 'wave-strong', 'wave-size']);

/** The variables story.css reads, the ones with a fallback of their own aside. */
const reads = [...new Set([...storyCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/var\(--([\w-]+)\s*\)/g)].map((m) => m[1]))];

describe('the story tokens', () => {
  it('are every one a plain px value or a unitless number, so the apps get them all', () => {
    const story = [...tokens.keys()].filter((name) => name.startsWith('story-') && !NOT_NUMBERS.has(name));
    expect(story.length).toBeGreaterThan(40);
    for (const name of story) expect(EXPORTED.has(name), `--${name}: ${tokens.get(name)}`).toBe(true);
  });

  it('leave nothing behind of the picture gap they replace', () => {
    expect(tokens.has('story-image-gap')).toBe(false);
  });
});

describe('story.css', () => {
  it('reads only tokens that exist, its own variables, and the wave each link is given', () => {
    for (const name of reads) {
      expect(tokens.has(name) || own.has(name) || RUNTIME.has(name), `var(--${name})`).toBe(true);
    }
  });

  it('justifies CJK and leaves a Latin-script story ragged', () => {
    expect(own.get('s-align')).toBe('start'); // the last declaration of it: the Latin rule
    expect(storyCss).toMatch(/--s-align: justify;[\s\S]*\[data-script='latin'\][\s\S]*--s-align: start;/);
  });
});

describe("the island's :root", () => {
  // build-editor.mjs: the island's :root, then the palette in hex (light terracotta's :root first).
  const root = customProperties(islandRoot(tokensCss) + lightRootCss('hex'));

  it('declares everything story.css reads (the page header, which the island has none of, aside)', () => {
    for (const name of reads) {
      if (own.has(name) || RUNTIME.has(name) || name === 'app-header-h') continue;
      expect(root.has(name), `var(--${name})`).toBe(true);
    }
  });

  it("carries the story's numbers as written and its colours as a WebView without oklch() reads them", () => {
    expect(root.get('story-size')).toBe('18px');
    expect(root.get('story-para-gap')).toBe('1.3');
    expect(root.get('font-story-sans')).toBe(tokens.get('font-story-sans'));
    expect(root.get('color-text')).toBe('#2f2115');
    expect(root.get('color-text-muted')).toBe('#786550');
    expect(root.get('button-on-tonal')).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.get('story-code-tint')).toBe('rgb(47 33 21 / 0.06)');
    for (const value of root.values()) expect(value).not.toMatch(/oklch\(|color-mix\(/);
  });
});

describe('the story stylesheet’s rules', () => {
  /** A selector list split at its own commas, not those inside :is(…) or :not(…). */
  const topLevel = (list: string) => {
    const out = [''];
    let depth = 0;
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) out.push('');
      else out[out.length - 1] += ch;
    }
    return out;
  };
  /** Each rule's selector list and body, comments out. */
  const rules = [...storyCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: topLevel(m[1]).map((s) => s.trim().replace(/\s+/g, ' ')),
    body: m[2],
  }));
  const ruleFor = (selector: string) => rules.find((r) => r.selectors.includes(selector));

  it('sets a Latin word’s apostrophe in the Latin face of a CJK story’s headings and title', () => {
    for (const selector of [
      ".story-prose:not([data-script='latin']) :is(h1, h2, h3, h4, h5, h6) .story-latin-mark",
      ".story-title:not([data-script='latin']) .story-latin-mark",
    ]) {
      expect(ruleFor(selector)?.body, selector).toMatch(/font-family:\s*var\(--font-playfair/);
    }
  });

  it('keeps a CJK title’s clauses whole, and nothing else in that rule', () => {
    const rule = ruleFor('.story-title .story-clause');
    expect(rule?.selectors).toEqual(['.story-title .story-clause']);
    expect(rule?.body.trim()).toBe('display: inline-block;');
  });
});

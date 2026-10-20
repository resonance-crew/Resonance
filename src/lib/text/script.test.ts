import { describe, expect, it } from 'vitest';
import fixture from '../../../native/fixtures/story-script.json';
import { draftScript } from '@/lib/ai/mirror';
import { latinMarks, localeScript, SCRIPT_READ_CHARS, storyLang, storyScript, storyType, type StoryScript } from './script';

// How a story is set by its script — the rule the reader, the writer and both
// apps share (native/fixtures/story-script.json is read by the apps' twins too).

describe('storyType', () => {
  for (const c of fixture.cases) {
    it(`sets "${c.id}" as ${c.script}${c.lang ? ` (${c.lang})` : ''}`, () => {
      const fallback = (c as { fallback?: StoryScript }).fallback;
      expect(storyType(c.title, c.story, fallback)).toEqual({ script: c.script, lang: c.lang ?? undefined });
      expect(storyScript(c.title, c.story, fallback)).toBe(c.script);
      expect(storyLang(c.title, c.story)).toBe(c.lang ?? undefined);
    });
  }

  it("starts an empty draft in the writer's own locale's type, and leaves it there until there are letters", () => {
    for (const { locale, script } of fixture.emptyByLocale) {
      expect(localeScript(locale)).toBe(script);
      expect(storyScript('', '', localeScript(locale))).toBe(script);
      // Digits and marks alone are no script either.
      expect(storyScript('2400', '……', localeScript(locale))).toBe(script);
    }
    // The first words decide, whoever is writing.
    expect(storyScript('', 'The first morning', localeScript('zh-TW'))).toBe('latin');
    expect(storyScript('', '第一個早晨', localeScript('en'))).toBe('cjk');
  });

  // One rule for the mirror and the page: the mirror never answers in one
  // language while the page sets the draft in the other's type.
  it("agrees with the mirror's reading of every case that has letters", () => {
    for (const c of fixture.cases) {
      const mirror = draftScript(c.title, c.story);
      if (c.lang === null) continue;
      expect(['han', 'kana', 'hangul'].includes(mirror) ? 'cjk' : 'latin', c.id).toBe(c.script);
    }
  });

  it("reads the story's start only, and quickly whatever follows", () => {
    const zh = '水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。';
    const en = 'The water was too hot and the grind too fine, but it was the first morning that felt like mine. ';
    expect(storyScript('', `${zh.repeat(Math.ceil(SCRIPT_READ_CHARS / zh.length) + 1)}${en.repeat(500)}`)).toBe('cjk');
    const started = performance.now();
    expect(storyScript('', '[a]('.repeat(250_000))).toBe('latin');
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('latinMarks', () => {
  for (const { text, indices } of fixture.latinMarks) {
    it(`finds ${JSON.stringify(indices)} in ${JSON.stringify(text)}`, () => {
      expect(latinMarks(text)).toEqual(indices);
      for (const i of indices) expect(['‘', '’']).toContain(text[i]);
    });
  }
});

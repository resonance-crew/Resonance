// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { APPEARANCE_SCRIPT, DIMMED_THEME_COLORS, THEME_COLORS, applyAppearance, metaScheme, resolvedAccent, resolvedScheme, syncThemeColor } from './appearance';
import { ACCENTS } from './palette';

const root = document.documentElement;
const run = () => new Function(APPEARANCE_SCRIPT)();

function metas() {
  document.head.innerHTML = '';
  for (const s of ['light', 'dark']) {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.media = `(prefers-color-scheme: ${s})`;
    m.content = THEME_COLORS.terracotta[s as 'light' | 'dark'];
    document.head.append(m);
  }
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

afterEach(() => {
  root.removeAttribute('data-accent');
  root.removeAttribute('data-scheme');
  localStorage.clear();
});

describe('the appearance before the first paint', () => {
  it('leaves <html> alone with nothing saved, or the defaults saved', () => {
    run();
    expect(root.hasAttribute('data-accent') || root.hasAttribute('data-scheme')).toBe(false);
    localStorage.setItem('resonance-tweaks', JSON.stringify({ accentColor: 'terracotta', scheme: 'system' }));
    run();
    expect(root.hasAttribute('data-accent') || root.hasAttribute('data-scheme')).toBe(false);
  });

  it('puts a saved theme and scheme on <html>, and the bars on its paper', () => {
    const [light, dark] = metas();
    localStorage.setItem('resonance-tweaks', JSON.stringify({ accentColor: 'lavender', scheme: 'dark' }));
    run();
    expect(root.getAttribute('data-accent')).toBe('lavender');
    expect(root.getAttribute('data-scheme')).toBe('dark');
    expect(light.content).toBe(THEME_COLORS.lavender.dark);
    expect(dark.content).toBe(THEME_COLORS.lavender.dark);
  });

  it('ignores what it does not know, and never throws', () => {
    localStorage.setItem('resonance-tweaks', JSON.stringify({ accentColor: 'ochre', scheme: 'dim' }));
    expect(run).not.toThrow();
    expect(root.hasAttribute('data-accent') || root.hasAttribute('data-scheme')).toBe(false);
    localStorage.setItem('resonance-tweaks', '{not json');
    expect(run).not.toThrow();
  });
});

describe('applying a choice', () => {
  it('sets and clears the attributes, and each meta follows its own scheme while the system decides', () => {
    const [light, dark] = metas();
    applyAppearance('sage', 'system');
    expect(root.getAttribute('data-accent')).toBe('sage');
    expect(root.hasAttribute('data-scheme')).toBe(false);
    expect([light.content, dark.content]).toEqual([THEME_COLORS.sage.light, THEME_COLORS.sage.dark]);
    expect(resolvedAccent()).toBe('sage');
    applyAppearance('terracotta', 'light');
    expect(root.hasAttribute('data-accent')).toBe(false);
    expect(resolvedScheme()).toBe('light');
    expect([light.content, dark.content]).toEqual([THEME_COLORS.terracotta.light, THEME_COLORS.terracotta.light]);
    syncThemeColor('terracotta', 'system');
    expect(dark.content).toBe(THEME_COLORS.terracotta.dark);
  });

  it("colours the light bars light terracotta's paper (less tinted since 2026-10-27)", () => {
    expect(THEME_COLORS.terracotta.light).toBe('#f8f3ec');
  });
});

describe('the bars under a dialog', () => {
  it('dim to the scrim over the paper, every theme darker than its paper', () => {
    expect(DIMMED_THEME_COLORS.terracotta.light).toBe('#c7c0b8');
    const L = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    for (const a of ACCENTS) for (const s of ['light', 'dark'] as const) expect(L(DIMMED_THEME_COLORS[a][s])).toBeLessThan(L(THEME_COLORS[a][s]));
  });

  it('takes the scheme each bar stands for: the reader’s, else its own media query', () => {
    const [light, dark] = metas();
    expect([metaScheme(light), metaScheme(dark)]).toEqual(['light', 'dark']);
    root.setAttribute('data-scheme', 'dark');
    expect([metaScheme(light), metaScheme(dark)]).toEqual(['dark', 'dark']);
  });
});

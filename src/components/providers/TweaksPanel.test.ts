// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lightRootCss } from '@/lib/design/paletteCss';
import { ACCENT_MAP, TWEAK_DEFAULTS, applySavedTweaks, applyTweaks, loadTweaks } from './TweaksPanel';

const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');
// Colours are palette.css's; light terracotta's :root stands for them beside tokens.css.
const tokens = read('src/styles/tokens.css') + lightRootCss();
const fonts = read('src/styles/fonts.ts');

/** A custom property's declared value in tokens.css. */
function token(name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`${name} not in tokens.css`);
  return m[1].trim();
}

const fontVariables = [...fonts.matchAll(/variable: '(--[\w-]+)'/g)].map((m) => m[1]);

afterEach(() => {
  document.documentElement.removeAttribute('style');
  localStorage.clear();
});

// The provider runs in the root layout, on every page: a throw there is every
// page's error screen.
describe('without site storage', () => {
  /** A browser blocking site data: reading `localStorage` itself throws. */
  function blockStorage() {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    return () => Object.defineProperty(window, 'localStorage', original);
  }

  it('applies the defaults and remembers nothing, without throwing', () => {
    const restore = blockStorage();
    try {
      expect(() => applyTweaks(loadTweaks())).not.toThrow();
      expect(loadTweaks()).toEqual(TWEAK_DEFAULTS);
      expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(token('--font-heading'));
    } finally {
      restore();
    }
  });

  it('reads what an older version saved, minus what no longer exists', () => {
    localStorage.setItem('resonance-tweaks', JSON.stringify({ accentColor: 'sage', cardDensity: 'airy', grainIntensity: 3 }));
    expect(loadTweaks()).toEqual({ accentColor: 'sage', fontFamily: 'default', grainIntensity: 3 });
    localStorage.setItem('resonance-tweaks', '"not an object"');
    expect(loadTweaks()).toEqual(TWEAK_DEFAULTS);
  });
});

// Density wrote grid-template-columns onto every [data-card-grid] at load; the
// home grid's node outlived the pre-hydration layout it was written for, and
// its masonry got an extra, empty column on a wide screen.
it('leaves the card grids their own columns', () => {
  const grid = document.createElement('div');
  grid.setAttribute('data-card-grid', '');
  document.body.appendChild(grid);
  applyTweaks({ ...TWEAK_DEFAULTS });
  expect(grid.style.gridTemplateColumns).toBe('');
  grid.remove();
});

describe('the heading-font tweak and the self-hosted faces', () => {
  it('declares a variable for each of the four faces', () => {
    expect(fontVariables).toEqual(['--font-playfair', '--font-dm-sans', '--font-noto-serif-tc', '--font-noto-sans-tc']);
  });

  it('builds the heading and body stacks from those variables', () => {
    for (const v of fontVariables) expect(tokens).toContain(`var(${v},`);
  });

  // The provider applies the saved tweaks on every page load, so its default
  // heading must be the token itself — anything else (say, family names the
  // page no longer defines) silently replaces the site's heading face.
  it('leaves the default heading exactly as tokens.css declares it', () => {
    applyTweaks({ ...TWEAK_DEFAULTS });
    expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(token('--font-heading'));
  });

  it('keeps the Chinese fallback of the handwritten heading on the self-hosted face', () => {
    applyTweaks({ ...TWEAK_DEFAULTS, fontFamily: 'handwritten' });
    expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(token('--font-handwritten'));
  });
});

// On every page load: the defaults are tokens.css's own values, so a reader
// who never changed the look (or changed it back) gets nothing written onto
// <html> — no dozen inline properties, no page-wide style recalc — and the
// page looks exactly the same.
describe('applying the saved tweaks on page load', () => {
  const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

  it('takes the defaults to be exactly tokens.css', () => {
    for (const [name, value] of Object.entries(ACCENT_MAP[TWEAK_DEFAULTS.accentColor])) {
      expect(same(value, token(name)), name).toBe(true);
    }
    applyTweaks({ ...TWEAK_DEFAULTS });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--font-heading')).toBe(token('--font-heading'));
    expect(Number(style.getPropertyValue('--grain-opacity'))).toBe(Number(token('--grain-opacity')));
  });

  it('writes nothing for the defaults, saved or not', () => {
    applySavedTweaks();
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(localStorage.getItem('resonance-tweaks')).toBeNull();

    localStorage.setItem('resonance-tweaks', JSON.stringify(TWEAK_DEFAULTS));
    applySavedTweaks();
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  it('applies a saved look', () => {
    localStorage.setItem('resonance-tweaks', JSON.stringify({ ...TWEAK_DEFAULTS, accentColor: 'sage', grainIntensity: 0 }));
    applySavedTweaks();
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-terracotta')).toBe(ACCENT_MAP.sage['--color-terracotta']);
    expect(style.getPropertyValue('--grain-opacity')).toBe('0');
  });
});

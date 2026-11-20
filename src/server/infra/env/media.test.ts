import { afterEach, describe, expect, it, vi } from 'vitest';
import { formerPublicBases, publicBases, storageKeyOf } from '@/lib/storage/publicUrl';
import { envMediaUrls, memoryMediaUrls } from './media';

// MediaUrlResolver: where our pictures are served from. The MEDIA_ names are
// the middle layer's; the R2_ ones (what every deployment sets today) are
// their aliases — so with only the R2_ names set, nothing changes, and the
// resolver answers exactly what publicUrl.ts answers.

const NOW = 'https://img.resonance.test';
const BEFORE = 'https://pub-0123.r2.dev';
const NEXT = 'https://media.example';
const KEY = 'image/2026-10/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.avif';

afterEach(() => vi.unstubAllEnvs());

describe('envMediaUrls', () => {
  it('with only the R2_ names, answers what publicBases and storageKeyOf answer', () => {
    vi.stubEnv('R2_PUBLIC_BASE', `${NOW}/`);
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', ` ${BEFORE}/ ,${NOW}`);
    const media = envMediaUrls();
    expect(media.bases()).toEqual(publicBases());
    expect(media.bases()).toEqual([NOW, BEFORE]);
    expect(media.publicUrl(KEY)).toBe(`${NOW}/${KEY}`);
    for (const url of [`${NOW}/${KEY}`, `${BEFORE}/${KEY}`, `https://elsewhere.example/${KEY}`, `${BEFORE}/image/../x.png`, null, undefined, '']) {
      expect(media.keyOf(url), String(url)).toBe(storageKeyOf(url));
      expect(media.isOurs(url), String(url)).toBe(storageKeyOf(url) !== null);
    }
  });

  it('reads MEDIA_PUBLIC_BASE / MEDIA_FORMER_BASES before their R2_ aliases', () => {
    vi.stubEnv('MEDIA_PUBLIC_BASE', NEXT);
    vi.stubEnv('R2_PUBLIC_BASE', NOW);
    vi.stubEnv('MEDIA_FORMER_BASES', `${NOW},${BEFORE}`);
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', 'https://ignored.example');
    const media = envMediaUrls();
    expect(media.bases()).toEqual([NEXT, NOW, BEFORE]);
    expect(formerPublicBases()).toEqual([NOW, BEFORE]);
    expect(media.publicUrl(KEY)).toBe(`${NEXT}/${KEY}`);
    expect(media.keyOf(`${NOW}/${KEY}`)).toBe(KEY);
    expect(media.isOurs(`https://ignored.example/${KEY}`)).toBe(false);
  });

  it('falls back to an alias name by name: an empty MEDIA_ value is unset', () => {
    vi.stubEnv('MEDIA_PUBLIC_BASE', '');
    vi.stubEnv('R2_PUBLIC_BASE', NOW);
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', BEFORE);
    expect(envMediaUrls().bases()).toEqual([NOW, BEFORE]);
    // The current base from one name, the former ones from the other.
    vi.stubEnv('MEDIA_PUBLIC_BASE', NEXT);
    expect(envMediaUrls().bases()).toEqual([NEXT, BEFORE]);
  });

  it('reads the environment on every call, and refuses a URL when it knows no base', () => {
    const media = envMediaUrls();
    vi.stubEnv('R2_PUBLIC_BASE', '');
    expect(media.bases()).toEqual([]);
    expect(media.isOurs(`${NOW}/${KEY}`)).toBe(false);
    expect(() => media.publicUrl(KEY)).toThrow(/MEDIA_PUBLIC_BASE/);
    vi.stubEnv('R2_PUBLIC_BASE', NOW);
    expect(media.publicUrl(KEY)).toBe(`${NOW}/${KEY}`);
  });

  it('takes an environment of its own', () => {
    const media = envMediaUrls({ MEDIA_PUBLIC_BASE: `${NEXT}//`, R2_FORMER_PUBLIC_BASES: BEFORE });
    expect(media.bases()).toEqual([NEXT, BEFORE]);
  });
});

describe('memoryMediaUrls', () => {
  it('has fixed bases, trimmed, and a copy of them each time', () => {
    const media = memoryMediaUrls('https://media.test/', [BEFORE]);
    expect(media.bases()).toEqual(['https://media.test', BEFORE]);
    media.bases().push('https://mutated.example');
    expect(media.bases()).toEqual(['https://media.test', BEFORE]);
    expect(media.publicUrl(KEY)).toBe(`https://media.test/${KEY}`);
    expect(media.keyOf(`${BEFORE}/${KEY}`)).toBe(KEY);
    expect(memoryMediaUrls().isOurs(`https://media.test/${KEY}`)).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { formerPublicBases, publicBases, storageKeyOf } from '@/lib/storage/publicUrl';
import { mediaKeyFor, resolvedMediaUrl } from '@/server/domain/media';
import { assertMediaConfig, envMediaUrls, MediaConfigError, mediaBaseProblem, memoryMediaUrls } from './media';

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

// ADR 0005: the apps draw a story's picture only from *.resonance.channel, so
// the base every key-built URL points at must be there — a deployment set to
// any other host fails loudly instead of quietly turning pictures into links.
describe('the media config check', () => {
  it('takes resonance.channel and its subdomains over https, and localhost for the emulators', () => {
    for (const base of ['https://img.resonance.channel', 'https://resonance.channel', 'https://a.b.resonance.channel/', 'http://localhost:3000', 'http://127.0.0.1:9199']) {
      expect(mediaBaseProblem(base), base).toBeNull();
    }
  });

  it('refuses any other host, plain http, a path, a look-alike domain or credentials', () => {
    for (const base of [
      'https://pub-0123.r2.dev',
      'https://media.example',
      'https://img.resonance.channel.evil.example',
      'https://evilresonance.channel',
      'http://img.resonance.channel',
      'https://img.resonance.channel/pictures',
      'https://user:pw@img.resonance.channel',
      'not a url',
    ]) {
      expect(mediaBaseProblem(base), base).not.toBeNull();
    }
  });

  it('fails loudly on a deployment whose current base is outside *.resonance.channel — a former base may be anywhere', () => {
    expect(() => assertMediaConfig({ MEDIA_PUBLIC_BASE: 'https://cdn.example.com' })).toThrow(MediaConfigError);
    expect(() => assertMediaConfig({ R2_PUBLIC_BASE: 'https://pub-1.r2.dev' })).toThrow(/resonance\.channel/);
    expect(() => assertMediaConfig({ MEDIA_PUBLIC_BASE: 'https://img.resonance.channel', MEDIA_FORMER_BASES: 'https://pub-1.r2.dev' })).not.toThrow();
    expect(() => assertMediaConfig({})).not.toThrow();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deployed = envMediaUrls({ MEDIA_PUBLIC_BASE: 'https://cdn.example.com', VERCEL_ENV: 'production' } as never);
    expect(() => deployed.publicUrl(KEY)).toThrow(MediaConfigError);
    expect(error).toHaveBeenCalledWith('[media]', expect.stringContaining('cdn.example.com'));
    error.mockRestore();
    // Off a deployment (tests, scripts, the emulators) the URL is built as before.
    expect(envMediaUrls({ MEDIA_PUBLIC_BASE: 'https://cdn.example.com' }).publicUrl(KEY)).toBe(`https://cdn.example.com/${KEY}`);
    expect(envMediaUrls({ MEDIA_PUBLIC_BASE: 'https://img.resonance.channel', VERCEL_ENV: 'production' } as never).publicUrl(KEY)).toBe(`https://img.resonance.channel/${KEY}`);
  });
});

describe('pictures by key (media.key, avatarKey)', () => {
  const media = memoryMediaUrls('https://img.resonance.channel', [BEFORE]);
  const NEW = 'https://img.resonance.channel';

  it('keeps a key beside a URL only when the URL is that key on the current base', () => {
    expect(mediaKeyFor(media, `${NEW}/${KEY}`)).toBe(KEY);
    expect(mediaKeyFor(media, `${BEFORE}/${KEY}`)).toBeNull();
    expect(mediaKeyFor(media, `https://elsewhere.example/${KEY}`)).toBeNull();
    expect(mediaKeyFor(media, null)).toBeNull();
    expect(mediaKeyFor(memoryMediaUrls('https://img.resonance.channel', []), `${NEW}/a/../b.png`)).toBeNull();
  });

  it('answers the key on the current base, only ever a host of ours — unless the URL names another key or none is stored', () => {
    expect(resolvedMediaUrl(media, `${BEFORE}/${KEY}`, KEY)).toBe(`${NEW}/${KEY}`);
    // After a move whose old host is no longer listed: the key still builds the new URL.
    expect(resolvedMediaUrl(memoryMediaUrls(NEW), `https://gone.example/${KEY}`, KEY)).toBe(`${NEW}/${KEY}`);
    // An older client changed only the URL: the URL is the newer.
    expect(resolvedMediaUrl(media, `${NEW}/image/2026-11/other.webp`, KEY)).toBe(`${NEW}/image/2026-11/other.webp`);
    // No key (an older document) or a key that isn't one: the URL as stored.
    expect(resolvedMediaUrl(media, `${BEFORE}/${KEY}`, undefined)).toBe(`${BEFORE}/${KEY}`);
    expect(resolvedMediaUrl(media, `${BEFORE}/${KEY}`, 'https://evil.example/x.png')).toBe(`${BEFORE}/${KEY}`);
    expect(resolvedMediaUrl(media, `${BEFORE}/${KEY}`, '../x')).toBe(`${BEFORE}/${KEY}`);
    // No URL is no picture, whatever key was left.
    expect(resolvedMediaUrl(media, null, KEY)).toBeNull();
    // No base known: as stored.
    expect(resolvedMediaUrl(envMediaUrls({}), `${BEFORE}/${KEY}`, KEY)).toBe(`${BEFORE}/${KEY}`);
  });
});

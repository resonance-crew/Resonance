import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// iOS Universal Links (round 23 §7): public/.well-known/apple-app-site-association claims for the iOS (and Mac) app
// exactly the pages the Android app's App Links filter claims — the pages both apps open themselves (Route), bare or
// under a locale — so a link tapped in another app opens the same place on either phone, and nothing else (the
// landing page, /home, the policies, the API) ever leaves the browser.

const root = process.cwd();
const AASA = 'public/.well-known/apple-app-site-association';
const raw = readFileSync(join(root, AASA), 'utf8');
const aasa = JSON.parse(raw) as {
  applinks: { details: { appIDs: string[]; components: { '/': string; '?'?: unknown; '#'?: unknown; exclude?: boolean; comment?: string }[] }[] };
};

/** The Android filter's path prefixes: the `autoVerify` intent filter in the app's manifest. */
function androidPrefixes(): string[] {
  const xml = readFileSync(join(root, 'apps/android/app/src/main/AndroidManifest.xml'), 'utf8');
  const filter = xml.match(/<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/);
  expect(filter, 'the App Links filter').not.toBeNull();
  return [...filter![1].matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * An Android path prefix as Apple's patterns say it: a prefix ending in `/` claims one character or more after it
 * (`?*` — a bare `/card/` names no card), one ending in a name claims that page with or without its slash.
 */
function asApplePatterns(prefix: string): string[] {
  return prefix.endsWith('/') ? [`${prefix}?*`] : [prefix, `${prefix}/`];
}

describe('apple-app-site-association', () => {
  it('is small JSON, one entry for the app on iPhone, iPad and the Mac', () => {
    expect(Buffer.byteLength(raw)).toBeLessThan(128 * 1024);
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0].appIDs).toEqual(['V7H59QAJPL.com.resonance.stories']);
  });

  it('claims exactly the pages Android’s App Links claim, no more', () => {
    const patterns = aasa.applinks.details[0].components.map((c) => c['/']);
    const expected = androidPrefixes().flatMap(asApplePatterns);
    expect(expected).toHaveLength(15);
    expect([...patterns].sort()).toEqual([...expected].sort());
    // Paths only: every query (a note to answer, ?u=) and fragment goes along, nothing is excluded.
    for (const c of aasa.applinks.details[0].components) {
      expect(c).not.toHaveProperty('?');
      expect(c).not.toHaveProperty('#');
      expect(c).not.toHaveProperty('exclude');
    }
  });

  it('leaves everything else to the browser', () => {
    const patterns = aasa.applinks.details[0].components.map((c) => c['/']);
    const claims = (path: string) =>
      patterns.some((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?\*/g, '.+').replace(/\*/g, '.*')}$`).test(path));
    for (const path of ['/card/rain-walk', '/zh-TW/card/rain-walk', '/en/u/bob', '/messages/bob', '/me/thought-map', '/zh-TW/me/thought-map/']) {
      expect(claims(path), path).toBe(true);
    }
    for (const path of ['/', '/zh-TW', '/home', '/en/home', '/card/', '/api/v1/feed', '/privacy', '/zh-TW/paper-pals', '/me', '/notifications', '/download']) {
      expect(claims(path), path).toBe(false);
    }
  });

  it('is served as JSON (next.config), never redirected (vercel.json spares /.well-known)', async () => {
    const { default: config } = await import('../../next.config');
    const rules = await config.headers!();
    const rule = rules.find((r) => r.source === '/.well-known/apple-app-site-association');
    expect(rule?.headers).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { redirects?: { source: string }[] };
    const { getPathMatch } = await import('next/dist/shared/lib/router/utils/path-match');
    for (const redirect of vercel.redirects ?? []) expect(getPathMatch(redirect.source)('/.well-known/apple-app-site-association')).toBe(false);
  });
});

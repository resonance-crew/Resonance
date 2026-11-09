import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAY_PACKAGE, PLAY_STORE_URL } from '@/lib/appStores';
import manifest from './manifest';

// /manifest.webmanifest (round 23 §6): the Android app named for Chrome's own install prompt — and the site itself
// never installable (09c30a9c): Chrome's native-app path needs the play entry's id to match its store link's, and
// every desktop browser's web-app path needs a display mode `browser` isn't.

const root = process.cwd();

/** A PNG's own width and height (its IHDR chunk). */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(join(root, 'public', path));
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('the web manifest', () => {
  const m = manifest();

  it('names the Android app on Google Play, and prefers it', () => {
    expect(m.prefer_related_applications).toBe(true);
    expect(m.related_applications).toEqual([{ platform: 'play', id: PLAY_PACKAGE, url: PLAY_STORE_URL }]);
    // Chrome refuses an entry whose url's ?id= isn't its id (IDS_DO_NOT_MATCH).
    const [app] = m.related_applications!;
    expect(new URL(app.url!).searchParams.get('id')).toBe(app.id);
    // …and it is the package the Android app ships as.
    const gradle = readFileSync(join(root, 'apps/android/app/build.gradle.kts'), 'utf8');
    expect(gradle).toContain(`applicationId = "${PLAY_PACKAGE}"`);
  });

  it('keeps the site itself from being installable: display browser, no display_override', () => {
    expect(m.display).toBe('browser');
    expect(m).not.toHaveProperty('display_override');
    expect(m.start_url).toBe('/');
    expect(m.name).toBe('Resonance');
    expect(m.short_name).toBe('Resonance');
  });

  it('lists icons that are in public/ at the sizes it says', () => {
    expect(m.icons?.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of m.icons ?? []) {
      const [w, h] = pngSize(icon.src);
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
      expect(icon.type).toBe('image/png');
    }
  });
});

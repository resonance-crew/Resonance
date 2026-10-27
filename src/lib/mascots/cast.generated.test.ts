import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAST_PUBLIC, CAST_URL, castSlugs, contentVersion, scriptHash, sourceHash,
} from '../../../scripts/mascots/castFiles';
import { MASCOT_CAST, MASCOT_CAST_SOURCES } from './cast.generated';
import { readManifest, rigInfo } from './rig';

const REGENERATE = 'stale: run `npm run mascots:cast`';

describe('the landing stage’s cast (cast.generated.ts, public/mascots)', () => {
  it('is built from designs/mascots/cast and the build script as they are now', () => {
    const slugs = castSlugs();
    expect(MASCOT_CAST.map(c => c.slug), REGENERATE).toEqual(slugs);
    expect(MASCOT_CAST_SOURCES.script, `scripts/mascots/build-cast.ts changed — ${REGENERATE}`).toBe(scriptHash());
    for (const slug of slugs) {
      expect(MASCOT_CAST_SOURCES.cast[slug], `designs/mascots/cast/${slug} changed — ${REGENERATE}`).toBe(sourceHash(slug));
    }
  });

  it('serves every part it names, and only those, under its content version', () => {
    for (const { slug, base, manifest } of MASCOT_CAST) {
      expect(base).toBe(`${CAST_URL}/${slug}/`);
      const drawn = manifest.parts.filter(p => p.w);
      const urls = drawn.map(p => /^([a-z0-9-]+\.webp)\?v=([0-9a-f]{10})$/.exec(p.img));
      expect(urls.every(Boolean), `${slug}: every part image is <name>.webp?v=<version>`).toBe(true);
      const files = urls.map(u => u![1]);
      const versions = new Set(urls.map(u => u![2]));
      expect(versions.size, `${slug}: one version for the character`).toBe(1);
      const dir = join(CAST_PUBLIC, slug);
      expect(existsSync(dir), `public/mascots/${slug} is missing — ${REGENERATE}`).toBe(true);
      expect(readdirSync(dir).sort(), `public/mascots/${slug} — ${REGENERATE}`).toEqual([...files].sort());
      // the version is what the files hold, so a changed part never meets a cached one
      const served = drawn.map((p, i) => ({ name: p.name, bytes: readFileSync(join(dir, files[i])) }));
      expect(contentVersion(served), `public/mascots/${slug} changed — ${REGENERATE}`).toBe([...versions][0]);
    }
    const folders = readdirSync(CAST_PUBLIC, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    expect(folders.sort()).toEqual(MASCOT_CAST.map(c => c.slug).sort());
  });

  it('carries what the engine reads from the part images: the pointer shape and the secret', () => {
    for (const { slug, manifest } of MASCOT_CAST) {
      const rig = rigInfo(readManifest(manifest));
      const hit = rig.torso.hit ?? [];
      expect(hit, slug).toHaveLength(32);
      expect(hit.every(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1), slug).toBe(true);
    }
    const rig = (slug: string) => {
      const entry = MASCOT_CAST.find(c => c.slug === slug);
      if (!entry) throw new Error(`no ${slug} in the cast`);
      return rigInfo(readManifest(entry.manifest));
    };
    // 摺摺's dog-ear is a corner a mitten lifts, its tip on the torso's box; 牽牽's back and 聆聆's written card are
    // whole sheets, nothing to reach for
    const tuck = rig('tuck');
    const [tx, ty] = tuck.revealAt ?? [NaN, NaN];
    const t = tuck.parts.get('torso-alt')!;
    expect(tx >= t.x && tx <= t.x + t.w && ty >= t.y && ty <= t.y + t.h).toBe(true);
    expect(rig('tag').revealAt).toBeNull();
    expect(rig('card').revealAt).toBeNull();
    expect(rig('tag').hides.get('torso-alt')).toEqual(['face', 'arm-l', 'arm-r', 'deco']);
  });
});

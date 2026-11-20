import { publicBases, storageKeyOf, type PublicBaseEnv } from '@/lib/storage/publicUrl';
import type { MediaUrlResolver } from '@/server/ports/media';

/**
 * A resolver over a list of bases, the current one first (where new
 * pictures go), then the former ones that still serve the same keys.
 */
export function mediaUrlsOver(bases: () => readonly string[]): MediaUrlResolver {
  return {
    publicUrl(key) {
      const [current] = bases();
      if (!current) throw new Error('MEDIA_PUBLIC_BASE (or its alias R2_PUBLIC_BASE) is not set');
      return `${current}/${key}`;
    },
    keyOf: (url) => storageKeyOf(url, bases()),
    isOurs: (url) => storageKeyOf(url, bases()) !== null,
    bases: () => [...bases()],
  };
}

/**
 * The public bases from the environment, read on every call (a test may
 * stub them): MEDIA_PUBLIC_BASE, then MEDIA_FORMER_BASES — or their aliases
 * R2_PUBLIC_BASE / R2_FORMER_PUBLIC_BASES, read when the MEDIA_ one is unset —
 * through src/lib/storage/publicUrl, so every caller of `publicBases` /
 * `storageKeyOf` and this resolver agree.
 */
export function envMediaUrls(env: PublicBaseEnv = process.env as PublicBaseEnv): MediaUrlResolver {
  return mediaUrlsOver(() => publicBases(env));
}

/** Fixed bases, for tests (memoryCtx): `https://media.test` unless given, trimmed as the environment's are. */
export function memoryMediaUrls(current = 'https://media.test', former: string[] = []): MediaUrlResolver {
  const bases = publicBases({ MEDIA_PUBLIC_BASE: current, MEDIA_FORMER_BASES: former.join(',') });
  return mediaUrlsOver(() => bases);
}

import { publicBases, storageKeyOf, type PublicBaseEnv } from '@/lib/storage/publicUrl';
import type { MediaUrlResolver } from '@/server/ports/media';

/**
 * The public bases from the environment (R2_PUBLIC_BASE, then
 * R2_FORMER_PUBLIC_BASES), by delegating to src/lib/storage/publicUrl — a
 * pure module, so imported directly. The media lane adds the
 * MEDIA_PUBLIC_BASE / MEDIA_FORMER_BASES names (the R2_ ones kept as aliases).
 */
export function envMediaUrls(env: PublicBaseEnv = process.env as PublicBaseEnv): MediaUrlResolver {
  const bases = () => publicBases(env);
  return {
    publicUrl(key) {
      const [current] = bases();
      if (!current) throw new Error('R2_PUBLIC_BASE is not set');
      return `${current}/${key}`;
    },
    keyOf: (url) => storageKeyOf(url, bases()),
    isOurs: (url) => storageKeyOf(url, bases()) !== null,
    bases,
  };
}

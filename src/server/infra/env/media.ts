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
 * The domain every public picture is served under (ADR 0005): both apps draw
 * a picture inside a story only from the site's domain or a subdomain of it
 * (StoryPictures.swift, StoryPictures.kt); from anywhere else it becomes a link.
 */
export const MEDIA_DOMAIN = 'resonance.channel';

export class MediaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaConfigError';
  }
}

/**
 * What is wrong with a current public base, or null: https on
 * `resonance.channel` or a subdomain of it, no path, query or credentials —
 * or, for the emulators and local development only, http on localhost.
 */
export function mediaBaseProblem(base: string): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return `${JSON.stringify(base)} is not a URL`;
  }
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (!local) {
    if (url.protocol !== 'https:') return `${base} is not https`;
    const host = url.hostname.toLowerCase();
    if (host !== MEDIA_DOMAIN && !host.endsWith(`.${MEDIA_DOMAIN}`)) {
      return `${base} is not under ${MEDIA_DOMAIN}: the apps draw story pictures only from *.${MEDIA_DOMAIN} (ADR 0005) — release apps that allow the new host first`;
    }
    if (url.pathname !== '/' && url.pathname !== '') return `${base} has a path: a base is an origin`;
  }
  if (url.username || url.password || url.search || url.hash) return `${base} carries credentials, a query or a fragment`;
  return null;
}

/**
 * The deployment's media settings checked: the current base (where new
 * pictures go, and every key-built URL points) must be one the apps draw.
 * Former bases are only read (`storageKeyOf`), never built on, so any host
 * may stay there while a move finishes. Throws MediaConfigError.
 */
export function assertMediaConfig(env: PublicBaseEnv = process.env as PublicBaseEnv): void {
  const [current] = publicBases(env);
  if (!current) return;
  const problem = mediaBaseProblem(current);
  if (problem) throw new MediaConfigError(`MEDIA_PUBLIC_BASE (or R2_PUBLIC_BASE): ${problem}`);
}

/** Whether this process is a deployment (Vercel sets VERCEL_ENV on production and preview builds and functions). */
const deployed = (env: Record<string, string | undefined>) => Boolean(env.VERCEL_ENV);

/**
 * The public bases from the environment, read on every call (a test may
 * stub them): MEDIA_PUBLIC_BASE, then MEDIA_FORMER_BASES — or their aliases
 * R2_PUBLIC_BASE / R2_FORMER_PUBLIC_BASES, read when the MEDIA_ one is unset —
 * through src/lib/storage/publicUrl, so every caller of `publicBases` /
 * `storageKeyOf` and this resolver agree.
 *
 * On a deployment the current base is checked (assertMediaConfig) before a
 * URL is built on it: a base outside `*.resonance.channel` fails loudly —
 * every upload and key-built URL throws MediaConfigError, logged — rather
 * than quietly handing the apps pictures they would show as links.
 */
export function envMediaUrls(env: PublicBaseEnv = process.env as PublicBaseEnv): MediaUrlResolver {
  const inner = mediaUrlsOver(() => publicBases(env));
  return {
    ...inner,
    publicUrl(key) {
      if (deployed(env as Record<string, string | undefined>)) {
        try {
          assertMediaConfig(env);
        } catch (e) {
          console.error('[media]', (e as Error).message);
          throw e;
        }
      }
      return inner.publicUrl(key);
    },
  };
}

/** Fixed bases, for tests (memoryCtx): `https://media.test` unless given, trimmed as the environment's are. */
export function memoryMediaUrls(current = 'https://media.test', former: string[] = []): MediaUrlResolver {
  const bases = publicBases({ MEDIA_PUBLIC_BASE: current, MEDIA_FORMER_BASES: former.join(',') });
  return mediaUrlsOver(() => bases);
}

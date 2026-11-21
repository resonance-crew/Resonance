import type { MediaUrlResolver } from '@/server/ports/media';

/**
 * Pictures by key (ADR 0005, plan §3.8): a card's cover (`media.key`) and a
 * profile photo (`users.avatarKey`) keep their storage key beside the URL;
 * an answer builds the URL from the key on the current base, so moving the
 * storage is a DNS change and a bucket copy. Pure: the resolver is handed in.
 */

/** A storage key as we write them (`image/2026-11/<uuid>.webp`): never a URL, never `..`, never a leading or doubled `/`. */
export const STORAGE_KEY = /^[A-Za-z0-9_.\-/]{1,512}$/;

export function isStorageKey(v: unknown): v is string {
  return typeof v === 'string' && STORAGE_KEY.test(v) && !v.split('/').some((s) => s === '' || s === '.' || s === '..');
}

/**
 * The key to keep beside a URL being written: its key when the URL is
 * exactly that key on the current base — so a stored pair always agrees
 * (`url === publicUrl(key)`) — else null (a picture elsewhere, a former
 * base mid-move, no base known: the backfill fills it once the move is done).
 */
export function mediaKeyFor(media: MediaUrlResolver, url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  const key = media.keyOf(url);
  if (!key || !isStorageKey(key)) return null;
  try {
    return media.publicUrl(key) === url ? key : null;
  } catch {
    return null;
  }
}

/**
 * The URL to answer for a stored picture (`url`, and `key` beside it when
 * kept). The key wins — on the current base — unless the URL names another
 * of our keys: an older client that writes only the URL (the rules let it)
 * leaves the previous key behind, and the URL is then the newer of the two.
 * No URL is no picture, whatever key is left. Without a key, or with no base
 * to build on, the stored URL as it is (an older document: storageKeyOf on
 * read is what every path did before).
 */
export function resolvedMediaUrl(media: MediaUrlResolver, url: unknown, key: unknown): string | null {
  const stored = typeof url === 'string' && url ? url : null;
  if (!stored) return null;
  if (!isStorageKey(key)) return stored;
  const named = media.keyOf(stored);
  if (named && named !== key) return stored;
  try {
    return media.publicUrl(key);
  } catch {
    return stored;
  }
}

import { FieldPath, FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { mediaKeyFor } from '../../src/server/domain/media';
import type { MediaUrlResolver } from '../../src/server/ports/media';

const PAGE = 500;

/**
 * ADR 0005 / plan §3.8: the storage key beside every stored picture URL the
 * server now writes one for — a profile photo's `avatarKey`, a card cover's
 * `media.key` — for the documents written before. A key is kept only where
 * the URL is exactly that key on the current base (domain/media.ts
 * mediaKeyFor, as the server writes them); one that no longer goes with its
 * URL (an older client changed only the URL) is put right or removed. Only
 * those fields are written: never a URL, `updatedAt` or a summary.
 *
 * Idempotent; with `apply: false` it only counts. `npx tsx scripts/backfill.ts media-keys [--apply] [--emulator]`.
 */
export async function backfillMediaKeys(db: Firestore, opts: { apply: boolean; media: MediaUrlResolver; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  if (!opts.media.bases().length) throw new Error('MEDIA_PUBLIC_BASE (or R2_PUBLIC_BASE) is required: keys are made against the current base');
  const changes: { ref: DocumentReference; patch: Record<string, unknown> }[] = [];
  const counts = { users: 0, cards: 0, avatarKeys: 0, coverKeys: 0, removed: 0 };

  async function scan(collection: 'users' | 'cards', fields: string[], visit: (data: (f: string) => unknown, ref: DocumentReference) => void) {
    let after: string | null = null;
    for (;;) {
      let page = db.collection(collection).orderBy(FieldPath.documentId()).select(...fields).limit(PAGE);
      if (after) page = page.startAfter(after);
      const snap = await page.get();
      counts[collection] += snap.size;
      for (const d of snap.docs) visit((f) => d.get(f), d.ref);
      if (snap.size < PAGE) break;
      after = snap.docs[snap.size - 1].id;
    }
  }

  await scan('users', ['avatarUrl', 'avatarKey'], (get, ref) => {
    const want = mediaKeyFor(opts.media, get('avatarUrl'));
    const have = get('avatarKey') ?? null;
    if (want === have) return;
    if (want) counts.avatarKeys++;
    else counts.removed++;
    changes.push({ ref, patch: { avatarKey: want ?? FieldValue.delete() } });
  });

  await scan('cards', ['media'], (get, ref) => {
    const media = get('media') as { url?: unknown; key?: unknown } | null | undefined;
    if (!media || typeof media !== 'object') return;
    const want = mediaKeyFor(opts.media, media.url);
    const have = media.key ?? null;
    if (want === have) return;
    if (want) counts.coverKeys++;
    else counts.removed++;
    changes.push({ ref, patch: { 'media.key': want ?? FieldValue.delete() } });
  });

  log(
    `profiles: ${counts.users}, cards: ${counts.cards}; keys to add or put right — photos: ${counts.avatarKeys}, covers: ${counts.coverKeys}; ` +
      `keys to remove (no longer the URL's): ${counts.removed}`,
  );
  if (!opts.apply || !changes.length) return { ...counts, written: 0 };
  const writer = db.bulkWriter();
  for (const c of changes) void writer.update(c.ref, c.patch);
  await writer.close();
  log(`wrote ${changes.length} document(s)`);
  return { ...counts, written: changes.length };
}

import type { Firestore } from 'firebase-admin/firestore';
import { coverThumbKey } from '../../src/lib/images/coverThumb';
import { normalizeUpload } from '../../src/lib/storage/image';
import { storageKeyOf } from '../../src/lib/storage/publicUrl';
import { recordUpload, UPLOADS, uploadId } from '../../src/lib/storage/uploads';
import type { IStorageProvider } from '../../src/lib/storage/interfaces';

/** Where a copy is stored, and how a stored picture is read and looked for by its public URL. */
export type ThumbStorage = Pick<IStorageProvider, 'putObject'>;
export type ReadPicture = (url: string) => Promise<Uint8Array | null>;
export type PictureExists = (url: string) => Promise<boolean>;

/**
 * Covers stored before every `image` upload kept its ≤ 960 px copy (B2,
 * lib/images/coverThumb) get one: the cover read by its public URL, encoded
 * as an upload's copy is (normalizeUpload 'thumb': ≤ 960 px, WebP), stored
 * under the key made from the cover's, on record as the cover's owner's (its
 * `uploads/{uuid}` record, else the card's author) — so the account purge
 * finds it — and named on the card as `media.thumbUrl` (no updatedAt or
 * summary change), which the web reads. Lists (FeedCard.imageThumbUrl) derive
 * the copy's URL from the cover's, so this must have run before a list is
 * served one that doesn't exist yet (docs/release/owed.md).
 *
 * A copy already there is not made again; a card whose cover changed after it
 * was read here is not written (reported; the next run takes it). Covers
 * hosted elsewhere and videos are left alone. Idempotent; with `apply: false`
 * it only reports.
 */
export async function backfillCoverThumbs(
  db: Firestore,
  storage: ThumbStorage | null,
  opts: { apply: boolean; publicBases: readonly string[]; read: ReadPicture; exists: PictureExists; log?: (line: string) => void },
) {
  const log = opts.log ?? console.log;
  if (opts.apply && !storage) throw new Error('cover-thumbs --apply needs the storage (R2 credentials)');
  const cards = await db.collection('cards').select('media', 'authorId').get();
  const report = { cards: cards.size, covers: 0, notOurs: 0, made: 0, present: 0, unreadable: 0, named: 0, notWritten: 0 };

  for (const doc of cards.docs) {
    const media = doc.get('media') as { type?: unknown; url?: unknown; thumbUrl?: unknown } | undefined;
    const url = typeof media?.url === 'string' ? media.url : '';
    if (!url || media?.type === 'video') continue;
    report.covers++;
    const key = storageKeyOf(url, opts.publicBases);
    const thumbKey = coverThumbKey(key);
    if (!key || !thumbKey) {
      report.notOurs++;
      continue;
    }
    const thumbUrl = `${url.slice(0, url.length - key.length)}${thumbKey}`;
    if (await opts.exists(thumbUrl).catch(() => false)) {
      report.present++;
    } else {
      const bytes = await opts.read(url).catch(() => null);
      const thumb = bytes ? await normalizeUpload(bytes, 'thumb').catch(() => null) : null;
      if (!thumb) {
        report.unreadable++;
        log(`  ${doc.ref.path}: unreadable ${url}`);
        continue;
      }
      report.made++;
      log(`  ${doc.ref.path}: ${thumbKey} (${thumb.width}×${thumb.height}, ${thumb.data.byteLength} B)`);
      if (opts.apply) {
        const record = await db.collection(UPLOADS).doc(uploadId(key)).get();
        const ownerId = String(record.get('ownerId') ?? doc.get('authorId') ?? '');
        const stored = await storage!.putObject(thumbKey, thumb.contentType, thumb.data);
        if (ownerId) await recordUpload(db, ownerId, stored, 'image');
      }
    }
    if (media?.thumbUrl === thumbUrl) continue;
    report.named++;
    if (!opts.apply) continue;
    try {
      // Only the cover that was read: a card whose media changed since is the next run's.
      await doc.ref.update({ 'media.thumbUrl': thumbUrl }, { lastUpdateTime: doc.updateTime });
    } catch {
      report.notWritten++;
      log(`  ${doc.ref.path}: changed while read, not written`);
    }
  }
  log(JSON.stringify(report));
  return report;
}

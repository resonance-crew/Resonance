import { coverThumbKey } from '@/lib/images/coverThumb';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import type { IStorageProvider } from './interfaces';
import type { StoredObject, UploadIntent } from './types';

/**
 * Whose each stored picture is. A storage key names no one
 * (`{kind}/{yyyy-mm}/{uuid}.{ext}`, see r2.ts) — it is in every cover's
 * public URL, an anonymous card's too — so ownership lives here instead, in
 * server-only `uploads/{uuid}`: what the account purge deletes a person's
 * pictures by. (Keys from before carry the owner's uid as their second
 * segment, and are still purged by that prefix.)
 */
export { UPLOADS, uploadId } from '@/server/domain/conversations';

type Firestore = AdminDb;

export async function recordUpload(db: Firestore, ownerId: string, stored: StoredObject, kind: string): Promise<void> {
  // Its Firestore code: src/server/infra/firestore/repos/conversations.ts.
  await ctxFor(db).data.conversations.recordUpload(ownerId, stored.key, kind, new Date());
}

/** The keys of every picture `uid` stored (by its record). */
export async function uploadedKeys(db: Firestore, uid: string): Promise<string[]> {
  return ctxFor(db).data.conversations.uploadedKeys(uid);
}

/**
 * Store a picture and record whose it is. Should the record fail, the
 * picture is removed again (best effort) rather than left behind with no
 * owner the purge could find.
 */
export async function storeOwned(
  db: Firestore,
  storage: Pick<IStorageProvider, 'uploadObject' | 'deleteObject'>,
  intent: UploadIntent,
  body: Uint8Array,
): Promise<StoredObject> {
  const stored = await storage.uploadObject(intent, body);
  try {
    await recordUpload(db, intent.ownerId, stored, intent.kind);
  } catch (e) {
    await storage.deleteObject(stored.key).catch(() => {});
    throw e;
  }
  return stored;
}

/**
 * A cover-sized picture and its smaller copy (B2, lib/images/coverThumb): the
 * picture stored as storeOwned stores it, the copy under the key made from the
 * picture's, each on record as the owner's (the account purge finds both by
 * their records). Should either fail, both are removed again — every `image`
 * upload has its copy, which is what lets a list derive the copy's URL from the
 * cover's alone.
 */
export async function storeOwnedWithThumb(
  db: Firestore,
  storage: Pick<IStorageProvider, 'uploadObject' | 'putObject' | 'deleteObject'>,
  intent: UploadIntent,
  body: Uint8Array,
  thumb: { contentType: string; body: Uint8Array },
): Promise<StoredObject & { thumbUrl: string }> {
  const stored = await storage.uploadObject(intent, body);
  const thumbKey = coverThumbKey(stored.key);
  let thumbStored: StoredObject | null = null;
  try {
    if (!thumbKey) throw new Error(`No copy key for ${stored.key}`);
    thumbStored = await storage.putObject(thumbKey, thumb.contentType, thumb.body);
    await Promise.all([
      recordUpload(db, intent.ownerId, stored, intent.kind),
      recordUpload(db, intent.ownerId, thumbStored, intent.kind),
    ]);
  } catch (e) {
    await Promise.all([
      storage.deleteObject(stored.key).catch(() => {}),
      thumbKey ? storage.deleteObject(thumbKey).catch(() => {}) : undefined,
    ]);
    throw e;
  }
  return { ...stored, thumbUrl: thumbStored.publicUrl };
}

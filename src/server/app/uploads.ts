import { coverThumbKey } from '@/lib/images/coverThumb';
import type { StoredObject, UploadIntent } from '@/lib/storage/types';
import type { ServerCtx } from '@/server/ctx';
import type { ObjectStore } from '@/server/ports/objects';

/**
 * A public picture stored with its owner on record (`uploads/*`, the
 * conversations aggregate's `recordUpload`): what /api/upload and
 * /api/generate-image keep. `src/lib/storage/uploads.ts` storeOwned /
 * storeOwnedWithThumb are the legacy facades over these, with the store they
 * are handed in place of `ctx.objects`.
 */
export interface UploadCtx {
  data: Pick<ServerCtx['data'], 'conversations'>;
  objects: Pick<ObjectStore, 'uploadObject' | 'putObject' | 'deleteObject'>;
  clock: Pick<ServerCtx['clock'], 'date'>;
}

async function record(ctx: Pick<UploadCtx, 'data' | 'clock'>, ownerId: string, stored: StoredObject, kind: string): Promise<void> {
  await ctx.data.conversations.recordUpload(ownerId, stored.key, kind, ctx.clock.date());
}

/** The file, then its record; a record that fails takes the file back out (best effort), and throws. */
export async function storeOwnedIn(
  ctx: Pick<UploadCtx, 'data' | 'clock'> & { objects: Pick<ObjectStore, 'uploadObject' | 'deleteObject'> },
  intent: UploadIntent, body: Uint8Array): Promise<StoredObject> {
  const stored = await ctx.objects.uploadObject(intent, body);
  try {
    await record(ctx, intent.ownerId, stored, intent.kind);
  } catch (e) {
    await ctx.objects.deleteObject(stored.key).catch(() => {});
    throw e;
  }
  return stored;
}

/** storeOwnedIn with the picture's smaller copy beside it (lib/images/coverThumb); both on record, or neither kept. */
export async function storeOwnedWithThumbIn(
  ctx: UploadCtx,
  intent: UploadIntent,
  body: Uint8Array,
  thumb: { contentType: string; body: Uint8Array },
): Promise<StoredObject & { thumbUrl: string }> {
  const stored = await ctx.objects.uploadObject(intent, body);
  const thumbKey = coverThumbKey(stored.key);
  let thumbStored: StoredObject | null = null;
  try {
    if (!thumbKey) throw new Error(`No copy key for ${stored.key}`);
    thumbStored = await ctx.objects.putObject(thumbKey, thumb.contentType, thumb.body);
    await Promise.all([record(ctx, intent.ownerId, stored, intent.kind), record(ctx, intent.ownerId, thumbStored, intent.kind)]);
  } catch (e) {
    await Promise.all([
      ctx.objects.deleteObject(stored.key).catch(() => {}),
      thumbKey ? ctx.objects.deleteObject(thumbKey).catch(() => {}) : undefined,
    ]);
    throw e;
  }
  return { ...stored, thumbUrl: thumbStored.publicUrl };
}

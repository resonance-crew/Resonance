import type { UploadIntent } from '@/lib/storage/types';

/** The Cache-Control an uploaded object is served with. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';

/** How many keys a listing page (and one R2 DeleteObjects request) holds. */
export const PAGE_KEYS = 1000;

function extension(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext ? `.${ext}` : '';
}

/**
 * `{kind}/{yyyy-mm}/{uuid}.{ext}` — never the owner: the key is in the
 * picture's public URL, and an anonymous card's cover must not name its
 * author. Whose it is lives in `uploads/{uuid}` (src/lib/storage/uploads).
 */
export function objectKey(intent: UploadIntent): string {
  const now = new Date();
  return [
    intent.kind,
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    `${crypto.randomUUID()}${extension(intent.filename)}`,
  ].join('/');
}

/** An entity tag without the quotes S3 wraps it in. */
export const bareEtag = (etag: string | undefined | null) => (etag ?? '').replace(/^"|"$/g, '');

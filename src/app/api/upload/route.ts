import { NextResponse } from 'next/server';
import { crossOriginCookieWrite } from '@/lib/api/sameOrigin';
import { getCurrentUser } from '@/lib/auth';
import { storeOwnedIn, storeOwnedWithThumbIn } from '@/server/app/uploads';
import { serverCtx } from '@/server/ctx';
import { normalizeUpload, normalizeUploadWithThumb, UnsupportedImage, type NormalizedImage, type UploadPurpose } from '@/lib/storage/image';
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILE_BYTES } from '@/lib/images/limits';

export const runtime = 'nodejs';
// A re-encode is bounded (normalizeUpload's pixel and frame limits); this bounds the rest.
export const maxDuration = 30;

const tooLarge = () => NextResponse.json({ error: 'Image is too large' }, { status: 413 });

/**
 * Server-side upload proxy. The browser (and the apps) POST the file here as
 * multipart/form-data — `file`, and `purpose=avatar` for a profile photo —
 * and we store it in R2 from the server, so the client never has to open a
 * TLS connection to *.r2.cloudflarestorage.com — which fails for some
 * production networks (ERR_SSL_VERSION_OR_CIPHER_MISMATCH). Returns the
 * public URL.
 *
 * Nothing the client says about the file is trusted: the bytes are decoded
 * and re-encoded (normalizeUpload: upright, scaled to fit — a profile photo
 * to 256 px — metadata such as GPS stripped, WebP), and the stored object's
 * type and extension are the encoder's. A cover or story picture also
 * answers `thumbUrl`, its ≤ 960 px copy stored beside it (lib/images/coverThumb). Clients still compress first
 * (src/lib/images/compress.ts), which keeps the request small.
 */
export async function POST(req: Request) {
  // A write with the session cookie from another origin (a same-site subdomain too) is never the caller's own page.
  if (crossOriginCookieWrite(req)) return NextResponse.json({ error: 'This request did not come from the site' }, { status: 403 });
  // Signed out (or a revoked session) is a 401 — what makes a client renew its token — not a crash.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  // Refused before the body is read; a body sent without a length is checked once parsed.
  if (Number(req.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) return tooLarge();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size > UPLOAD_MAX_FILE_BYTES) return tooLarge();
  const purpose: UploadPurpose = form?.get('purpose') === 'avatar' ? 'avatar' : 'image';

  const ctx = serverCtx();
  // The count and the bytes in one transaction, as spent one after the other.
  const refused = await ctx.limits.limited(user.id, [['upload'], ['uploadBytes', file.size]]);
  if (refused) return refused;

  let image: NormalizedImage;
  // A cover or story picture is kept with its smaller copy (≤ 960 px, what lists draw: FeedCard.imageThumbUrl).
  let thumb: NormalizedImage | null = null;
  try {
    if (purpose === 'image') ({ full: image, thumb } = await normalizeUploadWithThumb(new Uint8Array(await file.arrayBuffer())));
    else image = await normalizeUpload(new Uint8Array(await file.arrayBuffer()), purpose);
  } catch (e) {
    if (e instanceof UnsupportedImage) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    throw e;
  }

  // The key names no one (an anonymous card's cover is public); whose it is goes on record.
  const intent = {
    filename: `upload.${image.extension}`,
    contentType: image.contentType,
    size: image.data.byteLength,
    ownerId: user.id,
    kind: 'image' as const,
  };
  if (thumb) {
    const stored = await storeOwnedWithThumbIn(ctx, intent, image.data, { contentType: thumb.contentType, body: thumb.data });
    return NextResponse.json({ publicUrl: stored.publicUrl, key: stored.key, thumbUrl: stored.thumbUrl });
  }
  const stored = await storeOwnedIn(ctx, intent, image.data);

  return NextResponse.json({ publicUrl: stored.publicUrl, key: stored.key });
}

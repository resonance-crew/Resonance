import { getAdminDb } from '@/lib/db/firestore/admin';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { mapCard, mapUser } from '@/lib/db/firestore/mapper';
import {
  readStoredPicture,
  shareImageFallback,
  shareImageRedirect,
  shareImageResponse,
  shareJpegResponse,
} from '@/lib/api/shareImage';
import { LINK_IMAGE_SIZE, coverVersion, drawnCard, drawnCardVersion } from '@/lib/linkImage/model';
import { renderDrawnCard } from '@/lib/linkImage/render';
import { storageKeyOf } from '@/lib/storage/publicUrl';

export const runtime = 'nodejs';

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** What the image needs of a card — its gate, its cover, and what the drawing shows — and nothing more. */
const CARD_FIELDS = ['visibility', 'publishedAt', 'media', 'anonymous', 'authorId', 'thoughtCore', 'story', 'accentHue'];
/** What the byline shows of a named card's author. */
const AUTHOR_FIELDS = ['handle', 'initials', 'avatarSeed', 'avatarUrl'];

/**
 * GET /api/og/card/{id}?v= — a card's link-preview image (a 1200 × 630 JPEG),
 * the og:image of its page. Only for a public, published card, as a signed-out
 * reader sees it; anything else gets the platform cover. A card with a cover
 * is its cover, cropped to that size (lib/api/shareImage); one without is the
 * card drawn (lib/linkImage) — its author's pen name and photo only when the
 * card is named: an anonymous card's author is never read. Only the current
 * version (`v`, which the page's metadata names) is drawn; any other is sent
 * on to it, so a made-up URL can't make the server draw over and over.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // An id Firestore keeps for itself (`__x__`) would make the read throw: it is no such card.
  if (!DOC_ID.test(id) || isReservedId(id)) return shareImageFallback();
  const db = getAdminDb();
  const [snap] = await db.getAll(db.doc(`cards/${id}`), { fieldMask: CARD_FIELDS });
  const data = snap?.data();
  if (!data || data.visibility !== 'public' || data.publishedAt == null) return shareImageFallback();
  // A cover is shared as itself (lib/og's cardImage names the same one).
  const media = data.media as { type?: unknown; url?: unknown } | undefined;
  if (media?.type === 'image' && typeof media.url === 'string' && media.url) {
    return shareImageResponse(req, media.url, { version: coverVersion, crop: LINK_IMAGE_SIZE });
  }

  const card = mapCard(id, data);
  const authorId = typeof data.authorId === 'string' ? data.authorId : '';
  let author = null;
  if (!card.anonymous && DOC_ID.test(authorId) && !isReservedId(authorId)) {
    const [user] = await db.getAll(db.doc(`users/${authorId}`), { fieldMask: AUTHOR_FIELDS });
    if (user?.exists) author = mapUser(user.id, user.data() ?? {});
  }
  const drawn = drawnCard(card, author);
  const redirect = shareImageRedirect(req, drawnCardVersion(drawn));
  if (redirect) return redirect;

  try {
    const photoKey = drawn.byline.anonymous ? null : storageKeyOf(drawn.byline.avatarUrl);
    const photo = photoKey ? await readStoredPicture(photoKey).catch(() => null) : null;
    return shareJpegResponse(await renderDrawnCard(drawn, photo));
  } catch (e) {
    console.error('[og] drawn card', id, e);
    return shareImageFallback();
  }
}

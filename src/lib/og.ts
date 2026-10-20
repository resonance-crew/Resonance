import type { Metadata } from 'next';
import type { Card, Locale, User } from '@/lib/db/types';
import { plainExcerpt } from '@/lib/adapters/story';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import { imageVersion } from '@/lib/linkImage/version';
import { LINK_IMAGE_SIZE, coverVersion, drawnCard, drawnCardVersion } from '@/lib/linkImage/model';

/** Absolute-URL default share image (the platform cover). */
export const OG_COVER_PATH = '/og-cover.jpg';
export const OG_COVER_SIZE = { width: 2640, height: 1416 } as const;

export { imageVersion };

/**
 * The share image for one of our stored pictures: a JPEG made from it by
 * /api/og/{kind}/{id} — stored pictures are AVIF or WebP, which some
 * platforms can't show. A picture hosted elsewhere is shared as it is.
 */
function shareImage(base: string, kind: 'card' | 'user', id: string, url: string, storageBases: readonly string[] | undefined): string {
  if (!storageKeyOf(url, storageBases)) return url;
  return `${base}/api/og/${kind}/${encodeURIComponent(id)}?v=${imageVersion(url)}`;
}

/**
 * A card's link-preview image, 1200 × 630 (/api/og/card/{id}): its stored
 * cover cropped to that size, or — without one — the card drawn
 * (lib/linkImage). A cover hosted elsewhere is shared as it is, its size
 * unknown.
 */
function cardImage(card: Card, author: User | null, base: string, storageBases: readonly string[] | undefined) {
  const path = `${base}/api/og/card/${encodeURIComponent(card.id)}`;
  const cover = card.media?.type === 'image' && card.media.url ? card.media.url : null;
  if (cover && !storageKeyOf(cover, storageBases)) return { url: cover };
  // An anonymous card's image is drawn from the card alone.
  const version = cover ? coverVersion(cover) : drawnCardVersion(drawnCard(card, card.anonymous ? null : author, storageBases));
  return { url: `${path}?v=${version}`, ...LINK_IMAGE_SIZE };
}

/**
 * Localized view of a card for the share card: prefer the viewer-locale
 * translation, fall back to the original prose.
 */
function localizedCard(card: Card, locale: Locale) {
  const t = card.translations?.[locale];
  return {
    title: t?.thoughtCore || t?.title || card.thoughtCore,
    story: t?.story || card.story,
  };
}

/**
 * Build Open Graph / Twitter metadata for a single card page.
 *
 * Pure so it can be unit-tested without touching Firestore: the caller resolves
 * the card + author server-side (public cards only — never leak private ones)
 * and passes them in. `base` is the deployment origin from {@link siteUrl}.
 */
export function buildCardMetadata(opts: {
  card: Card;
  author: User | null;
  locale: Locale;
  base: string;
  anonymousLabel: string;
  /** publicBases(): where our stored pictures are served from (R2_PUBLIC_BASE, and a former base during a move). */
  storageBases?: readonly string[];
}): Metadata {
  const { card, author, locale, base, anonymousLabel, storageBases } = opts;
  const { title, story } = localizedCard(card, locale);
  const description = plainExcerpt(story, 200);

  const byline = card.anonymous || !author ? anonymousLabel : author.handle;
  // Share thumbnail: the card's cover (as a JPEG), else the card itself drawn.
  const image = cardImage(card, author, base, storageBases);
  // The address platforms keep for the card (canonical, og:url — Facebook and
  // LINE resolve a shared link to og:url). An anonymous card's is its id: a
  // slug that collided carries `-{handle}` (lib/ai/slugify) and never changes,
  // so one assigned while the card was named would name its author.
  const key = card.anonymous ? card.id : card.slug;
  const url = key ? `${base}/${locale}/card/${key}` : undefined;

  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: 'Resonance',
      locale,
      images: [{ ...image, alt: title }],
      authors: card.anonymous || !author ? undefined : [byline],
      publishedTime: card.publishedAt ? new Date(card.publishedAt).toISOString() : undefined,
      tags: card.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  };
}

/**
 * Build Open Graph / Twitter metadata for a public profile page.
 *
 * Profiles are anonymous-readable, so there's nothing to gate here. The caller
 * resolves the user by handle and passes localized `title`/`description`
 * (the user's bio, or a fallback) in.
 *
 * Share thumbnail: the user's avatar when they have one — shown as a square
 * `summary` card so it isn't awkwardly cropped — otherwise the platform cover
 * as a wide `summary_large_image`.
 */
export function buildProfileMetadata(opts: {
  user: User;
  locale: Locale;
  base: string;
  title: string;
  description: string;
  /** publicBases(): where our stored pictures are served from (R2_PUBLIC_BASE, and a former base during a move). */
  storageBases?: readonly string[];
}): Metadata {
  const { user, locale, base, title, description, storageBases } = opts;
  const hasAvatar = Boolean(user.avatarUrl);
  const image = hasAvatar ? shareImage(base, 'user', user.id, user.avatarUrl!, storageBases) : `${base}${OG_COVER_PATH}`;
  const url = `${base}/${locale}/u/${encodeURIComponent(user.handle)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      title,
      description,
      url,
      siteName: 'Resonance',
      locale,
      username: user.handle,
      images: [{ url: image, alt: user.handle }],
    },
    twitter: {
      card: hasAvatar ? 'summary' : 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

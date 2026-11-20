import type { Card, User } from '@/lib/db/types';
import type { Story } from '@/components/molecules/StoryCard/StoryCard';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';
import { storyType } from '@/lib/text/script';
import { summaryHashOf } from '@/lib/text/summaryHash';
import type { TranslationTarget } from '@/lib/text/translation';

/**
 * Plain-text excerpt of a markdown story — markdown syntax and bare addresses
 * left out, by the same rules as the excerpts the server stores for lists
 * (lib/markdown/plainText) — so card surfaces (thought-map nodes, a shared
 * card in a thread, the og:description) can preview the prose itself.
 */
export function plainExcerpt(markdown: string, max = 80): string {
  return excerpt(plainText(markdown), max);
}

export interface CardToStoryOptions {
  /** Localized byline for anonymous cards (e.g.「匿名」/ "Anonymous"). */
  anonymousLabel?: string;
  /**
   * Show the real byline even when the card is anonymous — only for surfaces
   * where the viewer IS the author (the me-page card box), which mark the card
   * with an explicit anonymous badge instead.
   */
  deanonymize?: boolean;
  /**
   * 自動翻譯 is on (round 25 §F7): the interface language its translated title and excerpt are shown in, when the
   * card carries them — and the words the small mark is named by. Never for the viewer's own card (`viewerId`).
   */
  translate?: { to: TranslationTarget; mark: string; viewerId?: string | null };
}

/**
 * A feed card's title and excerpt in the reader's interface language (§F7), when the card carries them: a summary
 * from /api/v1 has them only while they match (the server checked); a card read from Firestore carries `of`, checked
 * here against what it shows. Only a published, public card that isn't the viewer's own.
 */
export function translatedSummary(
  card: Card,
  shown: { title: string; excerpt: string },
  to: TranslationTarget,
  viewerId?: string | null,
): { title: string; excerpt: string } | null {
  const st = card.summaryTranslations;
  if (!st || !card.publishedAt || card.visibility !== 'public' || card.trashedAt) return null;
  if (viewerId && card.authorId === viewerId) return null;
  if (!card.summary && st.of !== summaryHashOf(shown.title, shown.excerpt)) return null;
  const e = st[to];
  return e && typeof e.title === 'string' && e.title && typeof e.excerpt === 'string' ? e : null;
}

/**
 * The placeholder byline for an anonymous card. Seeded from the card id so the
 * avatar wobble stays deterministic but carries no identity.
 */
export function anonymousByline(card: Card, label: string) {
  return {
    author: label,
    authorInitials: '·',
    avatarUrl: undefined,
    avatarSeed: String((card.id.charCodeAt(0) ?? 7) * 31),
  };
}

/**
 * Adapt a Card (domain) to the Story shape used by the existing StoryCard
 * molecule.  The MVP uses the story card for Card rendering so the visual
 * identity stays consistent across marketing + app pages.
 *
 * `author` may be missing only for an anonymous card shown anonymously — its
 * author is never fetched (see bylineAuthorIds in lib/data/hooks).
 */
export function cardToStory(
  card: Card,
  author: (Pick<User, 'handle' | 'initials' | 'avatarUrl' | 'avatarSeed'> & { accentColor?: string }) | null | undefined,
  opts?: CardToStoryOptions,
): Story {
  // A summary's story is only its excerpt: it brings the whole story's read time along.
  const minutes = card.summary?.readMinutes ?? readMinutes(card.story);
  // A summary's story is the server's excerpt already; a whole story is cut down the way the server cuts it.
  const shown = card.summary ? card.story : excerpt(plainText(card.story));
  const anonymized = (card.anonymous && !opts?.deanonymize) || !author;
  const byline = anonymized
    ? anonymousByline(card, opts?.anonymousLabel ?? '匿名')
    : {
        author: author.handle,
        authorInitials: author.initials,
        avatarUrl: author.avatarUrl,
        avatarSeed: author.avatarSeed,
      };
  const tr = opts?.translate ? translatedSummary(card, { title: card.thoughtCore, excerpt: shown }, opts.translate.to, opts.translate.viewerId) : null;
  return {
    title: tr?.title ?? card.thoughtCore,
    excerpt: tr?.excerpt ?? shown,
    ...(tr ? { translated: { script: storyType(tr.title, tr.excerpt).script, lang: opts!.translate!.to, mark: opts!.translate!.mark } } : {}),
    ...byline,
    readTime: `${minutes} min`,
    tags: card.tags,
    imageUrl: card.media?.url,
    ...(card.media?.url && coverThumbUrl(card) ? { imageThumbUrl: coverThumbUrl(card) } : {}),
    ...(card.media?.url && card.media.frame ? { imageFrame: card.media.frame } : {}),
    imageLabel: card.media?.label ?? card.thoughtCore.slice(0, 24),
    accentHue: card.accentHue,
  };
}

/**
 * A card's smaller cover for a list (`media.thumbUrl`: ≤ 960 px on its longer edge, stored beside the cover at upload —
 * the v1 FeedCard's `imageThumbUrl`), when it has one; a list falls back to the cover itself. Its page, the cover
 * editor and the og image keep the cover.
 */
export function coverThumbUrl(card: Pick<Card, 'media'>): string | undefined {
  const thumb = card.media?.thumbUrl;
  const url = card.media?.url;
  if (typeof thumb !== 'string' || !thumb || typeof url !== 'string') return undefined;
  // Only this cover's own copy: draft saves merge `media`, so a new cover can keep the old one's thumbUrl.
  return thumb === url.replace(/\.[A-Za-z0-9]+$/, '-w960.webp') ? thumb : undefined;
}

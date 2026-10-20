import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import type { Card, User } from '@/lib/db/types';
import { sharePassages } from '@/lib/markdown/sharePassages';
import { publishedDate } from '@/lib/publishedDate';
import { sharePalette, shareSeed } from '@/lib/share/shareCard';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import { storyType, type StoryScript } from '@/lib/text/script';
import { imageVersion, keyedImageVersion } from './version';

/**
 * What the link-preview image of a card draws (/api/og/card/{id}, og:image):
 * a published, public card without a cover is drawn as the feed draws it
 * (./render); one with a cover is shared as its cover, cropped to the same
 * size. Pure — the card page's metadata builds the image's address from it,
 * and the route draws from it — so the two always agree on the version.
 *
 * An anonymous card's model never holds its author: its byline is 匿名 /
 * Anonymous, so the image can't name them.
 */

/** The link-preview image's size: what og:image:width / og:image:height say. */
export const LINK_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Bumped when the drawing changes: every drawn image gets a new address, and platforms fetch it again. */
export const DRAWN_CARD_RECIPE = 1;

/** A stored cover as the share image, cropped to LINK_IMAGE_SIZE: its version (the crop is part of what it shows). */
export function coverVersion(coverUrl: string): string {
  return imageVersion(`${coverUrl}#${LINK_IMAGE_SIZE.width}x${LINK_IMAGE_SIZE.height}`);
}

export type DrawnByline =
  | { anonymous: true; name: string }
  | { anonymous: false; name: string; initials: string; avatarSeed: number; avatarUrl: string | null };

/** Everything the image draws — and so everything its address's version is made from. */
export interface DrawnCard {
  recipe: number;
  id: string;
  script: StoryScript;
  /** The card's own title (untranslated: the image quotes the story). */
  title: string;
  opening: string;
  palette: number;
  seed: number;
  /** The published day in the story's language (2026年10月10日, Oct 10, 2026). */
  date: string | null;
  byline: DrawnByline;
}

const ANONYMOUS = { cjk: zhTW.card.anonymousAuthor, latin: en.card.anonymousAuthor } as const;
const DATE_LOCALE = { cjk: 'zh-TW', latin: 'en' } as const;

/**
 * What a card's image draws. `author` is used only for a named card — the
 * card page and the route read none for an anonymous one — and its photo only
 * when it is one of our stored pictures (`storageBases`, publicBases()).
 */
export function drawnCard(
  card: Pick<Card, 'id' | 'thoughtCore' | 'story' | 'anonymous' | 'accentHue' | 'publishedAt'>,
  author: Pick<User, 'handle' | 'initials' | 'avatarSeed' | 'avatarUrl'> | null,
  storageBases?: readonly string[],
): DrawnCard {
  const title = (card.thoughtCore ?? '').trim();
  const story = card.story ?? '';
  const { script } = storyType(title, story);
  const named = !card.anonymous && author && author.handle?.trim();
  let byline: DrawnByline;
  if (named) {
    const initials = author.initials?.trim() || Array.from(author.handle.trim())[0].toUpperCase();
    byline = {
      anonymous: false,
      name: author.handle.trim(),
      initials,
      avatarSeed: Number(author.avatarSeed) || initials.charCodeAt(0) * 13,
      avatarUrl: author.avatarUrl && storageKeyOf(author.avatarUrl, storageBases) ? author.avatarUrl : null,
    };
  } else {
    byline = { anonymous: true, name: ANONYMOUS[script] };
  }
  return {
    recipe: DRAWN_CARD_RECIPE,
    id: card.id,
    script,
    title,
    opening: sharePassages(story).opening,
    palette: sharePalette(card),
    seed: shareSeed(card.id),
    date: publishedDate(card.publishedAt, DATE_LOCALE[script], 'UTC')?.label ?? null,
    byline,
  };
}

/**
 * The version in a drawn image's address (`?v=`): a new drawing is a new URL
 * no cache answers from the old. Keyed (keyedImageVersion): what a drawing
 * names — a pen name, a photo — is public, but which version a card's drawing
 * had under a name it no longer shows must not be something anyone can make.
 */
export function drawnCardVersion(card: DrawnCard, key?: Buffer | null): string {
  return keyedImageVersion(JSON.stringify(card), key);
}


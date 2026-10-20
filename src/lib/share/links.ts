import { siteUrl } from '@/lib/site';

/**
 * What a share sends: the link to a card or a profile, and the platforms'
 * own web intents for it (the web's ShareMenu). Pure and client-safe — no SDK,
 * no script, frame or connect origin: an intent is a page the platform serves,
 * opened in a window of its own.
 *
 * The link carries no locale (the middleware gives the recipient their own
 * language, as the apps' shared links do) and no tracking parameter.
 */

/** A card or a profile, as the page that shares it knows it. */
export type ShareTarget =
  | {
      kind: 'card';
      id: string;
      /** The card's slug; a draft or an older card may have none. */
      slug?: string | null;
      title: string;
      anonymous: boolean;
      /** The author's pen name — never passed, or never used, for an anonymous card. */
      handle?: string;
    }
  | { kind: 'profile'; handle: string };

/** The platforms the web menu lists, in its order (copy first, the system share last, around them). */
export const SHARE_PLATFORMS = ['line', 'threads', 'facebook', 'x'] as const;
export type SharePlatform = (typeof SHARE_PLATFORMS)[number];

/** The brands' own names: never translated. */
export const PLATFORM_NAMES: Record<SharePlatform, string> = {
  line: 'LINE',
  threads: 'Threads',
  facebook: 'Facebook',
  x: 'X',
};

/**
 * The origin a shared link names: the site's own (NEXT_PUBLIC_SITE_URL) when
 * it is set; else, in a browser, the address it was opened from (a preview
 * deployment shares its own pages); else siteUrl()'s fallbacks.
 */
export function shareOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return siteUrl();
}

/**
 * The key a card is shared under: its slug, else its id — and always its id
 * when it is anonymous. A slug that collided carries its author's pen name
 * (`-{handle}`, lib/ai/slugify), and a slug never changes: a card made
 * anonymous after it was published would name its author in its link.
 */
export function cardShareKey(card: { id: string; slug?: string | null; anonymous?: boolean }): string {
  return card.anonymous ? card.id : card.slug || card.id;
}

/** `{origin}/card/{key}` (cardShareKey). */
export function cardShareUrl(
  card: { id: string; slug?: string | null; anonymous?: boolean },
  origin: string = shareOrigin(),
): string {
  return `${origin}/card/${encodeURIComponent(cardShareKey(card))}`;
}

/** `{origin}/u/{handle}`. */
export function profileShareUrl(handle: string, origin: string = shareOrigin()): string {
  return `${origin}/u/${encodeURIComponent(handle)}`;
}

/** The link a target is shared by. */
export function shareUrl(target: ShareTarget, origin: string = shareOrigin()): string {
  return target.kind === 'card' ? cardShareUrl(target, origin) : profileShareUrl(target.handle, origin);
}

/** A message-catalogue lookup, as next-intl's `t` (the root namespace). */
export type ShareTranslate = (key: string, values?: Record<string, string>) => string;

/**
 * The words a post starts with (Threads, X, LINE): a named card's title and
 * pen name (`share.postText`), an anonymous card's title alone
 * (`share.postTextAnonymous` — never a name), a profile's `profile.shareTitle`.
 */
export function sharePostText(target: ShareTarget, t: ShareTranslate): string {
  if (target.kind === 'profile') return t('profile.shareTitle', { handle: target.handle });
  if (target.anonymous || !target.handle) return t('share.postTextAnonymous', { title: target.title });
  return t('share.postText', { title: target.title, handle: target.handle });
}

/** What a share's title is (navigator.share's `title`): the card's title, or the profile's share title. */
export function shareTitle(target: ShareTarget, t: ShareTranslate): string {
  return target.kind === 'card' ? target.title : t('profile.shareTitle', { handle: target.handle });
}

const q = encodeURIComponent;

/**
 * A platform's web intent for a link and its post text (2026):
 * - LINE: the documented share button (`social-plugins.line.me/lineit/share`)
 *   — LINE's web login on a desktop, the app on a phone. `text` is not
 *   documented there; the row works on `url` alone if LINE ignores it.
 *   (`line.me/R/share` only redirects to line.me on a desktop.)
 * - Threads: `threads.com/intent/post` (threads.net redirects there).
 * - Facebook: the documented Share Dialog when the site has a Meta App ID —
 *   a feed post with the link's preview card; no hashtag, and none of the
 *   deprecated `redirect_uri` — else `sharer.php`, undocumented but answering.
 * - X: `x.com/intent/tweet`.
 */
export function intentUrl(
  platform: SharePlatform,
  { url, text }: { url: string; text: string },
  { metaAppId }: { metaAppId?: string | null } = {},
): string {
  switch (platform) {
    case 'line':
      return `https://social-plugins.line.me/lineit/share?url=${q(url)}&text=${q(text)}`;
    case 'threads':
      return `https://www.threads.com/intent/post?text=${q(text)}&url=${q(url)}`;
    case 'facebook':
      return metaAppId
        ? `https://www.facebook.com/dialog/share?app_id=${q(metaAppId)}&href=${q(url)}&display=popup`
        : `https://www.facebook.com/sharer/sharer.php?u=${q(url)}`;
    case 'x':
      return `https://x.com/intent/tweet?text=${q(text)}&url=${q(url)}`;
  }
}

/** The intent window's size, and its place: centred on the window it is opened from. */
export const SHARE_POPUP = { width: 600, height: 640 } as const;

/** `window.open` features for an intent popup centred on a window at (x, y) of w × h. */
export function popupFeatures(win: { screenX: number; screenY: number; outerWidth: number; outerHeight: number }): string {
  const left = Math.max(0, Math.round(win.screenX + (win.outerWidth - SHARE_POPUP.width) / 2));
  const top = Math.max(0, Math.round(win.screenY + (win.outerHeight - SHARE_POPUP.height) / 2));
  return `popup,width=${SHARE_POPUP.width},height=${SHARE_POPUP.height},left=${left},top=${top},noopener,noreferrer`;
}

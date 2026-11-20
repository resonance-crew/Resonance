import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import type { DeviceLocale } from './devices';

/**
 * What a push says and where it leads — pure, in each device's language
 * (lib/push/send, picks, connectionCards and tapBell re-export these).
 */

/** The Android channel the apps create for these (its id is part of the contract with them). */
export const ANDROID_CHANNEL = 'activity';
/** The channel a conversation's messages come in (the apps create it beside `activity`). */
export const MESSAGES_CHANNEL = 'messages';
/** The Android channel tonight's card and new cards come in (`native.channelNewCards`); builds without it show them on `activity`. */
export const PICKS_CHANNEL = 'picks';

const MESSAGES: Record<DeviceLocale, typeof en> = { en, 'zh-TW': zhTW };

/** `app.notifications` in one language. */
export const notificationsText = (locale: DeviceLocale) => createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' });

/** `app.notifications.*`: the bell's own copy, so a push reads exactly as the row it opens. */
export const TEXT_KEY: Record<string, keyof typeof en.app.notifications> = {
  resonance: 'resonance',
  note: 'note',
  message: 'message',
  card_link: 'cardLink',
  invite: 'invite',
  invite_accepted: 'inviteAccepted',
  translation_done: 'translationDone',
  resonance_summary: 'resonanceSummary',
  // Written already pushed, both: lib/push/tapBell pushes a tap itself, and the weekly read summary is a bell row only.
  resonance_tap: 'tap',
  read_summary: 'readSummary',
};

/** The kinds whose push opens a conversation with their sender (pushRoute's thread). */
export const OPENS_THREAD = new Set(['note', 'message', 'resonance', 'invite_accepted']);

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** Cut by code points, so an emoji is never split in half. */
export const cutText = (text: string, n: number) => Array.from(text).slice(0, n).join('');

/**
 * A note or resonance on an anonymous card (`payload.anonymous`): it opens the
 * card, never a thread with whoever wrote it — opening that thread zeroes
 * their unread count in it, which they can watch, and its reply would answer
 * the anonymous card under its author's name.
 */
export const onAnonymousCard = (type: string, payload: Payload) => (type === 'note' || type === 'resonance') && payload.anonymous === true;

/**
 * Where tapping the push leads: a site path both apps already open (the web
 * bell's hrefs). A note opens the thread with it quoted — or, on an anonymous
 * card, the card; types with no page of their own leave it empty and the app
 * shows its notifications.
 */
export function pushRoute(type: string, payload: Payload): string {
  const handle = str(payload.fromHandle);
  const thread = handle ? `/messages/${encodeURIComponent(handle)}` : '';
  if (onAnonymousCard(type, payload)) return str(payload.cardId) ? `/card/${encodeURIComponent(str(payload.cardId))}` : '';
  switch (type) {
    case 'note': {
      const [note, card] = [str(payload.noteId), str(payload.cardId)];
      return thread && note && card ? `${thread}?note=${encodeURIComponent(note)}&card=${encodeURIComponent(card)}` : thread;
    }
    case 'message':
    case 'resonance':
    case 'invite_accepted':
      return thread;
    case 'card_link':
    case 'translation_done':
    // A resonance tap and the weekly read summary open the card, named or anonymous alike — never a thread.
    case 'resonance_tap':
    case 'read_summary':
      return str(payload.cardId) ? `/card/${encodeURIComponent(str(payload.cardId))}` : '';
    default:
      return '';
  }
}

/** The push's lines in one language: the bell's sentence, and a note's preview under it. */
export function pushText(locale: DeviceLocale, type: string, payload: Payload): { title: string; body?: string } | null {
  const key = TEXT_KEY[type];
  if (!key) return null;
  const t = notificationsText(locale);
  const title = t(key, { handle: str(payload.fromHandle), count: Number(payload.count ?? payload.readers ?? 0) });
  const preview = type === 'note' ? str(payload.preview) : '';
  return preview ? { title, body: `「${preview}」` } : { title };
}

/** The tap push's line in one language: the reader, and how many others rang the card that day. */
export function tapText(locale: DeviceLocale, handle: string, others: number): string {
  const t = notificationsText(locale);
  return others > 0 ? t('tapMany', { handle, count: others }) : t('tap', { handle });
}

/** The card's title in a pick or new-card push (code points). */
export const PICK_TITLE_CHARS = 60;
/** The reason line (code points; the recommender writes ≤ 30 characters). */
const PICK_REASON_CHARS = 80;

/** Tonight's card's words in one language: a heading, then the card's title over why it was picked. Never the author's name. */
export function pickText(locale: DeviceLocale, cardTitle: string, reason: string): { title: string; body: string } {
  const t = notificationsText(locale);
  // The recommender writes its reasons in Chinese only; other languages get a line of their own.
  const why = locale === 'zh-TW' && reason.trim() ? cutText(reason.trim(), PICK_REASON_CHARS) : t('pickBody');
  return { title: t('pickTitle'), body: `${cutText(cardTitle.trim(), PICK_TITLE_CHARS)}\n${why}` };
}

/** A new card's push in one language: who wrote it, then its title. */
export function connectionCardText(locale: DeviceLocale, handle: string, cardTitle: string): { title: string; body: string } {
  const t = notificationsText(locale);
  return { title: t('newCard', { handle }), body: cutText(cardTitle.trim(), PICK_TITLE_CHARS) };
}

/**
 * Where a card's push opens: the card's page, by its slug when it has one
 * (both apps open `/card/{key}`) — an anonymous card always by its id, as it
 * is shared (cardShareKey): its slug may end in its author's pen name.
 */
export function cardRoute(card: { id: string; slug?: unknown; anonymous?: unknown }): string {
  const key = card.anonymous !== true && typeof card.slug === 'string' && card.slug ? card.slug : card.id;
  return `/card/${encodeURIComponent(key)}`;
}

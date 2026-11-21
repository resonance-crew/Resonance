import { linkPreviewOf } from '@/lib/links/previewShape';
import type { BellPayload, ConversationBody, MessagePageBody, ThreadMessageBody } from './schemas';
import type { z } from 'zod';
import { toAuthor } from './present';
import type { ConversationRow, StoredMessage } from '@/server/ports/repos/conversations';
import type { ListedBellRow } from '@/server/ports/repos/bell';
import type { PersonRow } from '@/server/ports/repos/users';
import { encodeCursor } from '@/server/ports/time';

// Phase 2 inbox (2a-inbox): the conversation list, a thread's messages and
// the bell as /api/v1 shows them — what each client's own mapping of the
// Firestore documents did (lib/db/firestore/client/{messages,notifications},
// the apps' ConversationsStore / ThreadModel / NotificationsStore), done once
// on the server. Never more than a participant's own listener read: a
// conversation's other unread count, a bell row's push bookkeeping and any
// payload field no client draws stay behind.

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** A person as a list shows them; null for a gone account, or one that never chose a pen name (drawn as gone). */
export function briefOf(id: string, row: PersonRow | undefined) {
  if (!row || typeof row.handle !== 'string' || !row.handle.trim()) return null;
  return toAuthor(id, row);
}

/** One of `viewer`'s conversations as the list shows it. */
export function presentConversation(row: ConversationRow, viewer: string, other: string, person: PersonRow | undefined): ConversationBody {
  const last = row.lastMessage;
  return {
    id: row.id,
    participants: row.participants,
    otherId: other,
    other: briefOf(other, person),
    unread: Math.max(0, Math.trunc(row.unread[viewer] ?? 0)),
    lastMessage: last
      ? {
          text: last.text,
          senderId: last.senderId,
          sentAt: last.sentAt,
          image: last.image,
          sticker: last.sticker,
          albumCount: last.albumCount,
          // A preview written over an older one may keep a stale flag beside new words: the words win (the apps' rule).
          unsent: last.unsent && !last.text && !last.image && !last.cardRef,
        }
      : null,
    request: row.request,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    originCardId: row.originCardId,
  };
}

/** A reply's quote as stored: an unsent one keeps only who sent it; one without an id is none. */
function quoteOf(v: unknown): ThreadMessageBody['replyTo'] {
  if (!isMap(v)) return undefined;
  const id = str(v.id);
  if (!id) return undefined;
  const senderId = String(v.senderId ?? '');
  if (v.unsent === true) return { id, senderId, text: '', unsent: true };
  const sticker = isMap(v.sticker) && str(v.sticker.pack) && str(v.sticker.id) ? { pack: String(v.sticker.pack), id: String(v.sticker.id) } : undefined;
  return {
    id,
    senderId,
    text: typeof v.text === 'string' ? v.text : '',
    ...(str(v.cardRef) ? { cardRef: String(v.cardRef) } : {}),
    ...(v.image === true ? { image: true } : {}),
    ...(sticker && /^[a-z0-9-]{1,32}$/.test(sticker.pack) && /^[a-z0-9-]{1,40}$/.test(sticker.id) ? { sticker } : {}),
  };
}

/** A message as the thread shows it; null for one without a send time (never placed in a thread). */
export function presentMessage(m: StoredMessage): ThreadMessageBody | null {
  if (!m.sentAt) return null;
  const head = { id: m.id, cursor: encodeCursor({ t: m.sentAt, id: m.id }), senderId: m.senderId ?? '', sentAt: m.sentAt };
  // Unsent: who sent it and when is all there is (the server keeps nothing else on it either).
  if (m.unsent) return { ...head, text: '', ...(m.unsentAt ? { unsentAt: m.unsentAt } : { unsentAt: m.sentAt }) };
  const reactions = Object.fromEntries(Object.entries(m.reactions).filter((e): e is [string, string] => !!e[0] && typeof e[1] === 'string' && !!e[1]));
  const noteRef = m.noteRef && str(m.noteRef.cardId) && str(m.noteRef.noteId) ? { cardId: String(m.noteRef.cardId), noteId: String(m.noteRef.noteId) } : undefined;
  const replyTo = quoteOf(m.replyTo);
  const preview = linkPreviewOf(m.preview);
  return {
    ...head,
    text: m.text ?? '',
    ...(m.kind ? { kind: m.kind } : {}),
    ...(m.cardRef ? { cardRef: m.cardRef } : {}),
    ...(noteRef ? { noteRef } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(m.image ? { image: { id: m.image.id, width: m.image.width, height: m.image.height } } : {}),
    // An album's place only beside its picture.
    ...(m.image && m.album ? { album: { id: m.album.id, index: m.album.index, count: m.album.count } } : {}),
    ...(m.sticker ? { sticker: { pack: m.sticker.pack, id: m.sticker.id } } : {}),
    ...(Object.keys(reactions).length ? { reactions } : {}),
    ...(m.privateShare ? { privateShare: true } : {}),
    ...(preview
      ? { preview: { url: preview.url, title: preview.title, description: preview.description ?? null, siteName: preview.siteName ?? null, image: preview.image ?? null } }
      : {}),
  };
}

/** A page of messages, newest first, with where to go on from it. */
export function presentMessagePage(
  messages: StoredMessage[],
  page: { mode: 'newest' | 'before' | 'after'; next: string | null; after?: string },
): MessagePageBody {
  const shown = messages.map(presentMessage).filter((m): m is ThreadMessageBody => m !== null);
  const newest = shown[0]?.cursor ?? (page.mode === 'after' ? (page.after ?? null) : null);
  return {
    messages: shown,
    olderCursor: page.mode === 'after' ? null : page.next,
    newerCursor: page.mode === 'before' ? (shown[0]?.cursor ?? null) : newest,
    hasNewer: page.mode === 'after' && page.next !== null,
  };
}

type BellPayloadBody = z.infer<typeof BellPayload>;

/** A bell row's payload: the fields the clients draw, each only when it has its type. */
export function presentBellPayload(p: Record<string, unknown>): BellPayloadBody {
  const out: BellPayloadBody = {};
  for (const key of ['fromUserId', 'fromHandle', 'cardId', 'noteId', 'preview', 'inviteId'] as const) {
    if (typeof p[key] === 'string') out[key] = p[key] as string;
  }
  if (Array.isArray(p.fromUserIds)) out.fromUserIds = p.fromUserIds.filter((v): v is string => typeof v === 'string' && !!v);
  for (const key of ['count', 'readers'] as const) {
    if (typeof p[key] === 'number' && Number.isFinite(p[key])) out[key] = p[key] as number;
  }
  for (const key of ['reread', 'anonymous'] as const) {
    if (typeof p[key] === 'boolean') out[key] = p[key] as boolean;
  }
  return out;
}

/** How many of a tap row's readers come with their profiles: the faces a row draws (the rest, by GET /users). */
export const BELL_FACES = 3;

/** The uids the rows name (who wrote; a tap row's first readers), each once. */
export function bellPeople(rows: ListedBellRow[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (typeof r.payload.fromUserId === 'string' && r.payload.fromUserId) ids.add(r.payload.fromUserId);
    if (Array.isArray(r.payload.fromUserIds)) {
      for (const id of r.payload.fromUserIds.filter((v): v is string => typeof v === 'string' && !!v).slice(0, BELL_FACES)) ids.add(id);
    }
  }
  return [...ids].filter((id) => !id.includes('/'));
}

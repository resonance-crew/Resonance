import type { ConversationPreview, ConversationRow } from '@/server/ports/repos/conversations';
import type { Instant } from '@/server/ports/time';

// Phase 2 inbox (2a-inbox): a conversation's stored document read as the
// lists show it, the same for every store — each passes its own way of
// reading a stored time. What the clients' own mapping does today
// (lib/db/firestore/client/messages mapConversation, the apps'
// ConversationsStore), moved to the server: anything odd reads as absent.

type Data = Record<string, unknown>;
const isMap = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** How many pictures a list's last message was one of, when the server said so (2 to 10). */
function albumCountOf(v: unknown): number | null {
  const count = isMap(v) ? v.count : undefined;
  return typeof count === 'number' && Number.isInteger(count) && count >= 2 && count <= 10 ? count : null;
}

function previewOf(v: unknown, instantOf: (v: unknown) => Instant | null): ConversationPreview | null {
  if (!isMap(v)) return null;
  return {
    text: typeof v.text === 'string' ? v.text : '',
    senderId: typeof v.senderId === 'string' ? v.senderId : '',
    sentAt: instantOf(v.sentAt),
    image: v.image === true,
    sticker: v.sticker === true,
    albumCount: albumCountOf(v.album),
    unsent: v.unsent === true,
    cardRef: typeof v.cardRef === 'string' && !!v.cardRef,
  };
}

/** The letter a conversation holds: who left it (a uid, else none), on which card, how many notes (an odd count, 0). */
function letterOf(v: unknown): ConversationRow['request'] {
  if (!isMap(v)) return null;
  const from = str(v.from);
  if (!from) return null;
  const count = typeof v.count === 'number' && Number.isInteger(v.count) && v.count >= 0 ? v.count : 0;
  return { from, cardId: str(v.cardId), count };
}

/** A stored conversation as the lists show it. */
export function conversationRowOf(id: string, d: Data, instantOf: (v: unknown) => Instant | null): ConversationRow {
  const participants = Array.isArray(d.participants) ? d.participants.filter((p): p is string => typeof p === 'string' && !!p) : [];
  const unread: Record<string, number> = {};
  if (isMap(d.unread)) {
    for (const [uid, n] of Object.entries(d.unread)) if (typeof n === 'number' && Number.isFinite(n)) unread[uid] = n;
  }
  return {
    id,
    participants,
    unread,
    lastMessage: previewOf(d.lastMessage, instantOf),
    request: letterOf(d.request),
    createdAt: instantOf(d.createdAt),
    updatedAt: instantOf(d.updatedAt),
    originCardId: str(d.originCardId),
  };
}

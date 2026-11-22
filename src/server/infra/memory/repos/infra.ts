import type { CardLinksRow, InfraData, InfraTxRepo, MessagePreviewRow, SlugCardRow } from '@/server/ports/repos/infra';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';
import { EDITED_AT, editStamp } from './conversations';

// Tables named after the collections: `cards`, `users`, `retiredSlugs`, and
// `conversations/{pair}/messages` (one table per conversation, as the path).
// A card is published when its row has a `publishedAt` (a Date, an Instant
// string or epoch ms).

const messages = (conversationId: string) => `conversations/${conversationId}/messages`;

function cardLinksOf(row: Row | null): CardLinksRow | null {
  if (!row || row.publishedAt == null) return null;
  return { story: row.story, linkPreviews: row.linkPreviews, linkPreviewsFor: row.linkPreviewsFor, authorId: row.authorId };
}

function messagePreviewOf(row: Row | null): MessagePreviewRow | null {
  if (!row) return null;
  return { text: row.text, hasPreview: row.preview != null, unsent: row.unsentAt != null };
}

/** When a card was published, for slugHolder's order (the first published holds a slug); never published: last. */
function publishedMs(at: unknown): number {
  if (at instanceof Date) return at.getTime();
  if (typeof at === 'number') return at;
  if (typeof at === 'string' && !Number.isNaN(Date.parse(at))) return Date.parse(at);
  return Number.POSITIVE_INFINITY;
}

/** As the 'cards' query and its limit answer: by id. */
const cardsWithSlug = (state: MemoryState, slug: string, limit: number) => state.rows('cards', (row) => row.slug === slug).slice(0, limit);

/** A slug as slugify makes one — and so a retiredSlugs id it can be (src/lib/db/firestore/tombstones `retirable`). */
const retirable = (slug: string) => /^[a-z0-9][a-z0-9-]{0,199}$/.test(slug);

/** `infra` inside a memory transaction. */
export function infraTx(tx: MemoryTx): InfraTxRepo {
  return {
    getPublishedCardLinks: async (cardId) => cardLinksOf(tx.get('cards', cardId)),
    setCardLinkPreviews(cardId, value) {
      tx.merge('cards', cardId, value ? { linkPreviews: value.previews, linkPreviewsFor: value.links } : { linkPreviews: undefined, linkPreviewsFor: undefined });
    },
    getMessageForPreview: async (conversationId, messageId) => messagePreviewOf(tx.get(messages(conversationId), messageId)),
    setMessagePreview(conversationId, messageId, preview) {
      // As Firestore's: a preview is a change to a message already sent, so it sets `editedAt`.
      tx.merge(messages(conversationId), messageId, { preview, [EDITED_AT]: editStamp(tx.state) });
    },
  };
}

/** `infra` outside a transaction. */
export function infraData(state: MemoryState): InfraData {
  return {
    getPublishedCardLinks: async (cardId) => cardLinksOf(state.get('cards', cardId)),
    getMessageForPreview: async (conversationId, messageId) => messagePreviewOf(state.get(messages(conversationId), messageId)),
    getCardForSlug: async (cardId) => state.get<SlugCardRow & Row>('cards', cardId),
    async slugHolderId(slug) {
      const holders = cardsWithSlug(state, slug, 10);
      holders.sort((a, b) => publishedMs(a.row.publishedAt) - publishedMs(b.row.publishedAt) || (a.id < b.id ? -1 : 1));
      return holders[0]?.id ?? null;
    },
    async slugTaken(candidate, cardId) {
      const retired = retirable(candidate) && state.get('retiredSlugs', candidate) !== null;
      return retired || cardsWithSlug(state, candidate, 1).some(({ id }) => id !== cardId);
    },
    getUserHandle: async (uid) => String(state.get('users', uid)?.handle ?? ''),
    async setCardSlug(cardId, slug) {
      if (!state.get('cards', cardId)) return false;
      state.merge('cards', cardId, { slug });
      return true;
    },
  };
}

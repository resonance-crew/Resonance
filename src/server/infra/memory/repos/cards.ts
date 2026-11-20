import { encodePageToken, pageTokenPosition } from '@/lib/api/v1/paging';
import type { ListCard } from '@/lib/api/v1/summary';
import { blankCard, unlistedCard, wordless } from '@/lib/cards/blank';
import type { Card, User } from '@/lib/db/types';
import { docIdOk, properlyPublished } from '@/server/domain/cards';
import type { CardPage, CardsData, CardsTxRepo, FilmWindowRow, PageStart } from '@/server/ports/repos/cards';
import { compareInstants, instantParts, toInstant } from '@/server/ports/time';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/**
 * Tables, named after the collections: `cards` (Card rows by id — times as
 * Date, the story included, a stored list summary as `excerpt` /
 * `readMinutes` / `excerptAt`), `cardLinks` (`{ sourceCardId, targetCardId,
 * targetAuthorId, createdAt }`), `users/{uid}/bookmarks` (`{ createdAt }` by
 * card id), `cardSignatures` (`{ insightScore, listedForStrangers }`),
 * `cardVectors` (`{ vector: number[] }` by `{id}__{channel}__{i}`), `config`
 * (`landingFilm`: the film's pin). Reads answer what the Firestore repository
 * answers for the same rows; the summary/story and sort rules are the same.
 */
export function cardsTx(_tx: MemoryTx): CardsTxRepo {
  return {};
}

type Row = Card & Record<string, unknown>;
const isDate = (v: unknown): v is Date => v instanceof Date && !Number.isNaN(v.getTime());
const ms = (v: unknown) => (isDate(v) ? v.getTime() : null);

/** A row as a list reads it: without its story, its stored summary while current (summary.ts storedSummary). */
function listRow(id: string, row: Row): ListCard {
  const { story: _story, excerpt, readMinutes, excerptAt, updatedAt, ...rest } = row;
  const card: ListCard = { ...(rest as unknown as Card), id, publishedAt: isDate(row.publishedAt) ? row.publishedAt : null };
  const current = isDate(excerptAt) && (updatedAt == null || (isDate(updatedAt) && updatedAt.getTime() <= excerptAt.getTime()));
  if (typeof excerpt === 'string' && Number.isInteger(readMinutes) && (readMinutes as number) >= 1 && current) {
    card.listing = { excerpt, readMinutes: readMinutes as number };
  }
  if (isDate(updatedAt)) card.editedAt = updatedAt;
  return card;
}

/** Newest first by publishedAt, then by id (the Firestore repository's page order). */
const newestFirst = (a: { id: string; row: Row }, b: { id: string; row: Row }) =>
  (ms(b.row.publishedAt) ?? -Infinity) - (ms(a.row.publishedAt) ?? -Infinity) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function cardsData(state: MemoryState): CardsData {
  const card = (id: string) => (docIdOk(id) ? state.get<Row>('cards', id) : null);
  const whole = (id: string, row: Row): Card => ({ ...row, id, publishedAt: isDate(row.publishedAt) ? row.publishedAt : null });

  const page = (where: (row: Row) => boolean, limit: number, start: PageStart = {}): CardPage => {
    let rows = state.rows<Row>('cards', (r) => where(r) && isDate(r.publishedAt)).sort(newestFirst);
    if (start.pageToken) {
      const after = pageTokenPosition(start.pageToken);
      rows = rows.filter((r) => {
        const t = toInstant(r.row.publishedAt as Date);
        const byTime = compareInstants(t, after.t);
        return byTime < 0 || (byTime === 0 && r.id < after.id);
      });
    } else if (start.cursor) {
      const cut = new Date(start.cursor).getTime();
      rows = rows.filter((r) => (ms(r.row.publishedAt) ?? 0) < cut);
    }
    const raw = rows.slice(0, limit);
    const last = raw.at(-1);
    const end =
      raw.length === limit && last && isDate(last.row.publishedAt)
        ? (() => {
            const { seconds, nanos } = instantParts(toInstant(last.row.publishedAt as Date));
            return { nextCursor: (last.row.publishedAt as Date).toISOString(), nextPageToken: encodePageToken({ seconds, nanoseconds: nanos }, last.id) };
          })()
        : { nextCursor: null, nextPageToken: null };
    return { cards: raw.filter((r) => properlyPublished(r.row.publishedAt)).map((r) => listRow(r.id, r.row)), end };
  };

  const listByIds = async (ids: string[]) => {
    const out: ListCard[] = [];
    for (const id of new Set(ids)) {
      const row = card(id);
      if (row) out.push(listRow(id, row));
    }
    return out;
  };

  const findByKey = async (key: string): Promise<Card | null> => {
    if (!key || key.includes('/')) return null;
    // The slug's holder (the published one that took it first), else the card whose id the key is.
    const [holder] = state
      .rows<Row>('cards', (r) => r.slug === key)
      .sort((a, b) => (ms(a.row.publishedAt) ?? Infinity) - (ms(b.row.publishedAt) ?? Infinity) || (a.id < b.id ? -1 : 1));
    if (holder) return whole(holder.id, holder.row);
    const row = card(key);
    return row ? whole(key, row) : null;
  };

  const publicPublished = (r: Row) => r.visibility === 'public' && r.publishedAt != null;
  const authorCards = (authorId: string) => (r: Row) =>
    r.authorId === authorId && r.visibility === 'public' && r.anonymous === false && isDate(r.publishedAt) && r.publishedAt.getTime() <= Date.now() + 60 * 60 * 1000;

  return {
    scope: state,
    async get(id, fields) {
      const row = card(id);
      if (!row) return null;
      const kept = fields ? (Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])) as Row) : row;
      return whole(id, kept);
    },
    findByKey,
    async findForAnyone(key) {
      const found = await findByKey(key);
      if (!found || found.trashedAt != null || (found.anonymous === true && found.id !== key)) return null;
      return { id: found.id, card: found, stamped: found.publishedAt != null };
    },
    listByIds,
    async listByKeys(keys) {
      const seen = new Set<string>();
      const out: ListCard[] = [];
      for (const key of keys) {
        const found = await findByKey(key);
        if (!found || seen.has(found.id)) continue;
        seen.add(found.id);
        out.push(listRow(found.id, state.get<Row>('cards', found.id)!));
      }
      return out;
    },
    feedPage: async (limit, start) => page(publicPublished, limit, start),
    authorPage: async (authorId, limit, start) => page(authorCards(authorId), limit, start),
    countAuthorCards: async (authorId, max) => Math.min(max, state.rows<Row>('cards', authorCards(authorId)).length),
    async resonancesOf(cardId, limit) {
      return state
        .rows<Row>('cards', (r) => r.referenceCardId === cardId && publicPublished(r))
        .sort(newestFirst)
        .slice(0, limit)
        .map((r) => listRow(r.id, r.row));
    },
    async recentPublic(limit) {
      return state.rows<Row>('cards', publicPublished).sort(newestFirst).slice(0, limit).map((r) => listRow(r.id, r.row));
    },
    async linkSourcesTo(cardId, limit) {
      return state
        .rows<{ sourceCardId?: unknown; targetCardId?: unknown; createdAt?: unknown }>('cardLinks', (l) => l.targetCardId === cardId)
        .sort((a, b) => (ms(b.row.createdAt) ?? 0) - (ms(a.row.createdAt) ?? 0))
        .slice(0, limit)
        .map((l) => String(l.row.sourceCardId ?? ''))
        .filter(Boolean);
    },
    async linkPairsToAuthor(authorId, limit) {
      return state
        .rows<{ sourceCardId?: unknown; targetCardId?: unknown; targetAuthorId?: unknown; createdAt?: unknown }>('cardLinks', (l) => l.targetAuthorId === authorId)
        .sort((a, b) => (ms(b.row.createdAt) ?? 0) - (ms(a.row.createdAt) ?? 0))
        .slice(0, limit)
        .map((l) => ({ source: String(l.row.sourceCardId ?? ''), target: String(l.row.targetCardId ?? '') }))
        .filter((p) => p.source);
    },
    async ownShelf(uid, shelf, limit) {
      const own = state.rows<Row>('cards', (r) => r.authorId === uid && r.trashedAt == null);
      if (shelf === 'draft') {
        return own
          .filter((r) => r.row.publishedAt == null)
          .sort((a, b) => (ms(b.row.updatedAt) ?? 0) - (ms(a.row.updatedAt) ?? 0))
          .slice(0, limit)
          .map((r) => {
            const c = listRow(r.id, r.row);
            // A draft's stored summary stands in only when stamped after its last change.
            const kept = ms(r.row.excerptAt) != null && ms(r.row.updatedAt) != null && ms(r.row.excerptAt)! > ms(r.row.updatedAt)!;
            if (!kept) delete c.listing;
            return c;
          });
      }
      const wanted = shelf === 'private' ? ['private'] : ['public', 'connections'];
      return own
        .filter((r) => wanted.includes(String(r.row.visibility)) && isDate(r.row.publishedAt))
        .sort(newestFirst)
        .slice(0, limit)
        .map((r) => listRow(r.id, r.row));
    },
    async trashShelf(uid, limit) {
      return state
        .rows<Row>('cards', (r) => r.authorId === uid && r.trashedAt != null)
        .sort((a, b) => (ms(b.row.trashedAt) ?? 0) - (ms(a.row.trashedAt) ?? 0))
        .slice(0, limit)
        .map((r) => listRow(r.id, r.row));
    },
    async answeredIds(uid, limit) {
      return state
        .rows<Row>('cards', (r) => r.authorId === uid && typeof r.referenceCardId === 'string' && r.referenceCardId > '')
        .slice(0, limit)
        .map((r) => r.row.referenceCardId as string);
    },
    async bookmarkIds(uid, limit) {
      return state
        .rows<{ createdAt?: unknown }>(`users/${uid}/bookmarks`)
        .sort((a, b) => (ms(b.row.createdAt) ?? 0) - (ms(a.row.createdAt) ?? 0))
        .slice(0, limit)
        .map((r) => r.id);
    },
    async withStories(cards) {
      for (const c of cards) {
        if (typeof c.story === 'string' || c.listing) continue;
        const story = card(c.id)?.story;
        c.story = typeof story === 'string' ? story : '';
      }
      return cards;
    },
    async unlistedForStrangers(ids) {
      return new Set(ids.filter((id) => docIdOk(id) && state.get<{ listedForStrangers?: unknown }>('cardSignatures', id)?.listedForStrangers === false));
    },
    // Shared cards are the conversations aggregate's, taps the taps aggregate's: a memory context has neither until
    // those lanes model them — no pass, no tap.
    sharedAmong: async () => new Set(),
    tapOf: async () => null,
    async latestForLanding(limit) {
      const cards = state
        .rows<Row>('cards', publicPublished)
        .sort(newestFirst)
        .slice(0, limit + 3)
        .map((r) => whole(r.id, r.row))
        .filter((c) => !blankCard(c) && !unlistedCard(c))
        .slice(0, limit)
        .map(({ thin: _thin, signature: _signature, ...c }) => (c.anonymous ? { ...c, authorId: '' } : c));
      const authors: Record<string, User> = {};
      for (const id of new Set(cards.map((c) => c.authorId))) {
        const u = docIdOk(id) ? state.get<User & Record<string, unknown>>('users', id) : null;
        if (u) {
          authors[id] = {
            id,
            handle: u.handle,
            initials: u.initials,
            avatarUrl: u.avatarUrl,
            avatarSeed: u.avatarSeed,
            accentColor: u.accentColor,
            region: '',
            primaryLocale: u.primaryLocale,
            autoTranslateTo: [],
            verified: u.verified,
            phoneHash: '',
            joinedAt: new Date(0),
            handleChangedAt: new Date(0),
          };
        }
      }
      return { cards, authors };
    },
    async sitemapCards(max, now) {
      return state
        .rows<Row>('cards', (r) => r.visibility === 'public' && r.anonymous === false && r.publishedAt != null)
        .sort(newestFirst)
        .slice(0, max)
        .flatMap((r) => {
          const { slug, publishedAt, updatedAt } = r.row;
          if (!properlyPublished(publishedAt, now) || typeof slug !== 'string' || !slug) return [];
          const listed = listRow(r.id, r.row);
          if (wordless(r.row.thoughtCore, listed.listing ? listed.listing.excerpt : 'unknown') || unlistedCard(r.row)) return [];
          const at = publishedAt as Date;
          const edited = isDate(updatedAt) && updatedAt.getTime() > at.getTime() && updatedAt.getTime() <= now;
          return [{ slug, lastModified: edited ? (updatedAt as Date) : at }];
        });
    },
    async filmWindow(limit) {
      return state
        .rows<Row>('cards', publicPublished)
        .sort(newestFirst)
        .slice(0, limit)
        .map((r): FilmWindowRow => {
          const reading = state.get<{ insightScore?: unknown; listedForStrangers?: unknown }>('cardSignatures', r.id);
          const listed = listRow(r.id, r.row);
          const { story: _story, ...d } = r.row;
          return {
            id: r.id,
            d,
            ...(reading
              ? { reading: { insightScore: typeof reading.insightScore === 'number' && Number.isFinite(reading.insightScore) ? reading.insightScore : null, listed: reading.listedForStrangers !== false } }
              : {}),
            summary: listed.listing ?? null,
            blank: wordless(r.row.thoughtCore, listed.listing ? listed.listing.excerpt : 'unknown'),
          };
        });
    },
    async filmPin() {
      const pin = state.get<{ written?: unknown; answer?: unknown; until?: unknown }>('config', 'landingFilm');
      if (!pin) return null;
      return {
        ...(typeof pin.written === 'string' ? { written: pin.written } : {}),
        ...(typeof pin.answer === 'string' ? { answer: pin.answer } : {}),
        ...(isDate(pin.until) ? { until: pin.until } : {}),
      };
    },
    async partVectors(ids, channel, perCard) {
      const out = new Map<string, number[][]>();
      for (const id of ids) {
        for (let i = 0; i < perCard; i++) {
          const vec = state.get<{ vector?: unknown }>('cardVectors', `${id}__${channel}__${i}`)?.vector;
          if (Array.isArray(vec) && vec.length) out.set(id, [...(out.get(id) ?? []), vec as number[]]);
        }
      }
      return out;
    },
    async landingCards(ids) {
      return ids.flatMap((id) => {
        const row = card(id);
        if (!row) return [];
        const { signature, ...rest } = row;
        const placeholder = (signature as { placeholder?: unknown } | undefined)?.placeholder;
        return [whole(id, { ...rest, ...(placeholder === undefined ? {} : { signature: { placeholder } }) } as Row)];
      });
    },
    async stillPublic(ids) {
      return new Set(ids.filter((id) => {
        const row = card(id);
        return !!row && row.visibility === 'public' && row.publishedAt != null && row.trashedAt == null;
      }));
    },
  };
}

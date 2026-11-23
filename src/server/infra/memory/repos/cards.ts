import { encodePageToken, pageTokenPosition } from '@/lib/api/v1/paging';
import type { ListCard } from '@/lib/api/v1/summary';
import { blankCard, thinCard, unlistedCard, wordless } from '@/lib/cards/blank';
import type { Card, User } from '@/lib/db/types';
import { docIdOk, properlyPublished } from '@/server/domain/cards';
import { filmTodayOf } from '@/server/domain/filmToday';
import type { CardPage, CardsData, CardsTxRepo, FilmWindowRow, PageStart, ReachPlan, TakeBackPlan } from '@/server/ports/repos/cards';
import { summarize } from '@/lib/api/v1/summary';
import { TRANSLATION_TARGETS } from '@/lib/text/translation';
import { cardOf, hasPenNameRow, pathId, reachable } from '@/server/domain/cardsWrite';
import { cardVisible } from '@/server/domain/visibility';
import { compareInstants, instantParts, toInstant } from '@/server/ports/time';
import type { MemoryState } from '../state';
import { MemoryTx, TxTracker } from '../uow';
import { bellMade } from './bell';

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
export function cardsTx(tx: MemoryTx): CardsTxRepo {
  return cardsWriteTx(tx);
}

/* ───────────── write side (cardsWrite lane) ───────────── */

// More tables the writes reach, named after the collections: `cards/{id}/edits` (`current`, a pending
// edit), `cards/{id}/translations`, `privateShares`, `cardSignatures`, `cardTombstones` / `retiredSlugs`
// (what deleting leaves), `notes` (`{ cardId }`), `connections` / `connectionOrigins` (by `a_b`,
// `{ userIds, reasons, resonanceCards }`), `notifications` (bells), `users/{uid}/blocks`. The resonance
// parts (take-back, reach) are src/lib/api/v1/{origins,resonate}.ts's, over these rows.

const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const EDITS = (id: string) => `cards/${id}/edits`;
const resonanceKey = (by: string, cardId: string) => `resonance_${by}_${cardId}`;
const bellId = (uid: string, targetId: string) => `resonance_${uid}_${targetId}`;

type MemoryTakeBack = TakeBackPlan & { plans: { pair: string; ends: boolean; reasons: Record<string, unknown>; cards: unknown[] }[] };
type MemoryReach = ReachPlan & {
  from: string;
  originalId: string;
  original: Card | null;
  me: Record<string, unknown> | null;
  rang: boolean;
  blockOut: boolean;
  blockIn: boolean;
  connected: boolean;
  origins: Record<string, unknown> | null;
};

/** Summary stamps as a server write leaves them: `excerptAt` equal to `updatedAt` (summary.ts summaryFields). */
const summaryAt = (story: unknown, at: Date) => ({ ...summarize(story), excerptAt: at });
/** listingFields: `thin` when its words are too few, else the field removed. */
const listingOf = (card: { thoughtCore?: unknown; story?: unknown }) => ({ thin: thinCard(card) ? true : undefined });

function cardsWriteTx(tx: MemoryTx): CardsTxRepo {
  return {
    async getCardRow(id) {
      return tx.get('cards', id);
    },
    async getEditRow(id) {
      return tx.get(EDITS(id), 'current');
    },
    async getAuthorRow(uid) {
      return docIdOk(uid) ? tx.get('users', uid) : null;
    },
    async readTakeBack(uid, cardId) {
      const key = resonanceKey(uid, cardId);
      const found = tx
        .rows<Record<string, unknown>>('connectionOrigins', (r) => Array.isArray(r.resonanceCards) && r.resonanceCards.includes(cardId))
        .slice(0, 10)
        .filter(({ row }) => isMap(row.reasons) && row.reasons[key] !== undefined && Array.isArray(row.userIds) && row.userIds.includes(uid));
      const plans = found.map(({ id, row }) => {
        const reasons = { ...(row.reasons as Record<string, unknown>) };
        delete reasons[key];
        const connection = tx.get('connections', id);
        return { pair: id, ends: !!connection && !Object.keys(reasons).length, reasons, cards: (row.resonanceCards as unknown[]).filter((c) => c !== cardId) };
      });
      const plan: MemoryTakeBack = { __takeBack: true, plans, ends: plans.filter((p) => p.ends).map((p) => p.pair) };
      return plan;
    },
    async answersTo(uid, originalId, limit) {
      return tx.rows('cards', (r) => r.authorId === uid && r.referenceCardId === originalId).slice(0, limit).map((r) => r.id);
    },
    async readReach(from, originalId) {
      const found = tx.get('cards', originalId);
      const original = found ? cardOf(originalId, found) : null;
      const me = tx.get('users', from);
      const bell = tx.get('notifications', bellId(from, originalId));
      const plan: MemoryReach = {
        __reach: true,
        originalAnswers: original?.referenceCardId,
        from,
        originalId,
        original,
        me,
        rang: !!bell,
        blockOut: false,
        blockIn: false,
        connected: false,
        origins: null,
      };
      const other = original?.authorId;
      if (!pathId(other) || other === from) return plan;
      const legacy = bell
        ? []
        : tx.rows<Record<string, unknown>>('notifications', (r) => {
            const p = isMap(r.payload) ? r.payload : {};
            return r.userId === other && r.type === 'resonance' && p.fromUserId === from && p.cardId === originalId;
          });
      const reach: MemoryReach = {
        ...plan,
        rang: !!bell || legacy.length > 0,
        blockOut: !!tx.get(`users/${from}/blocks`, other),
        blockIn: !!tx.get(`users/${other}/blocks`, from),
        connected: !!tx.get('connections', pairOf(from, other)),
        origins: tx.get('connectionOrigins', pairOf(from, other)),
      };
      return reach;
    },

    takeBack(plan) {
      for (const p of (plan as MemoryTakeBack).plans) {
        if (p.ends) {
          tx.delete('connections', p.pair);
          tx.delete('connectionOrigins', p.pair);
        } else tx.merge('connectionOrigins', p.pair, { reasons: p.reasons, resonanceCards: p.cards });
      }
    },
    reachOriginal(cardId, card, plan, made) {
      const r = plan as MemoryReach;
      const o = r.original;
      if (!reachable(card) || card.authorId !== r.from || card.referenceCardId !== r.originalId || !properlyPublished(card.publishedAt)) return null;
      if (!o || !pathId(o.authorId) || o.authorId === r.from || !cardVisible(o, r.from, () => r.connected)) return null;
      if (r.blockOut || r.blockIn || !hasPenNameRow(r.me)) return null;
      const now = new Date();
      const named = o.anonymous !== true;
      const pair = pairOf(r.from, o.authorId);
      const userIds = [r.from, o.authorId].sort();
      const reason = { kind: 'resonance', by: r.from, cardId, originalId: r.originalId, at: now };
      if (named && r.connected) {
        const kept = r.origins && isMap(r.origins.reasons) ? r.origins.reasons : { legacy: { kind: 'legacy', at: now } };
        const cards = Array.isArray(r.origins?.resonanceCards) ? (r.origins.resonanceCards as unknown[]) : [];
        tx.merge('connectionOrigins', pair, { userIds, reasons: { ...kept, [resonanceKey(r.from, cardId)]: reason }, resonanceCards: [...new Set([...cards, cardId])] });
      } else if (named && !r.rang) {
        tx.put('connections', pair, { userIds, establishedAt: now });
        made?.push([r.from, o.authorId]);
        tx.put('connectionOrigins', pair, { userIds, reasons: { [resonanceKey(r.from, cardId)]: reason }, resonanceCards: [cardId] });
      }
      if (r.rang) return null;
      const id = bellId(r.from, r.originalId);
      tx.put('notifications', id, {
        userId: o.authorId,
        type: 'resonance',
        payload: { fromUserId: r.from, fromHandle: String(r.me?.handle), cardId: r.originalId, ...(named ? {} : { anonymous: true }) },
        readAt: null,
        createdAt: now,
        ...bellMade(tx.state),
      });
      return id;
    },
    setAudience(id, patch, restate) {
      const at = new Date();
      tx.merge('cards', id, { ...patch, updatedAt: at, ...(restate ? summaryAt(restate.story, at) : {}) });
    },
    patchEdit(id, patch) {
      tx.merge(EDITS(id), 'current', { ...patch });
    },
    publish(id, row, firstPublish) {
      const at = new Date();
      tx.merge('cards', id, {
        ...(firstPublish ? { publishedAt: at } : {}),
        anonymous: row.anonymous === true,
        updatedAt: at,
        ...summaryAt(row.story, at),
        ...listingOf(row),
      });
    },
    applyEdit(id, content, audience) {
      const at = new Date();
      tx.merge('cards', id, { ...content, ...summaryAt(content.story, at), ...listingOf(content), ...audience, media: content.media ?? undefined, updatedAt: at });
      tx.delete(EDITS(id), 'current');
    },
    moveToTrash(id, at, from, forDeletion) {
      tx.merge('cards', id, { trashedAt: new Date(at.getTime()), trashedFrom: from, visibility: 'private', referenceCardId: undefined, ...(forDeletion ? { trashedFor: 'deletion' } : {}) });
    },
    restore(id, visibility, referenceCardId) {
      tx.merge('cards', id, { visibility, trashedAt: undefined, trashedFrom: undefined, trashedFor: undefined, ...(referenceCardId ? { referenceCardId } : {}) });
    },
    deleteForGood(id, slug) {
      tx.delete('cards', id);
      tx.delete(EDITS(id), 'current');
      for (const to of TRANSLATION_TARGETS) tx.delete(`cards/${id}/translations`, to);
      tx.delete('privateShares', id);
      tx.delete('cardSignatures', id);
      tx.put('cardTombstones', id, { deletedAt: new Date() });
      // tombstones retirable: a slug as slugify makes one.
      if (typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,199}$/.test(slug)) tx.put('retiredSlugs', slug, { retiredAt: new Date() });
    },
  };
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

  const trashedBy = (uid: string, cutoff: Date) =>
    state
      .rows<Row>('cards', (r) => r.authorId === uid && isDate(r.trashedAt) && r.trashedAt.getTime() <= cutoff.getTime())
      .sort((a, b) => (b.row.trashedAt as Date).getTime() - (a.row.trashedAt as Date).getTime() || (a.id < b.id ? -1 : 1));

  const publicPublished = (r: Row) => r.visibility === 'public' && r.publishedAt != null;
  const authorCards = (authorId: string, connections = false) => (r: Row) =>
    r.authorId === authorId &&
    (r.visibility === 'public' || (connections && r.visibility === 'connections')) &&
    r.anonymous === false &&
    isDate(r.publishedAt) &&
    r.publishedAt.getTime() <= Date.now() + 60 * 60 * 1000;

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
    authorPage: async (authorId, limit, start, scope) => page(authorCards(authorId, scope?.connections === true), limit, start),
    countAuthorCards: async (authorId, max, scope) => Math.min(max, state.rows<Row>('cards', authorCards(authorId, scope?.connections === true)).length),
    async connectionsCards(authorIds, window, limit) {
      const wanted = new Set(authorIds);
      return state
        .rows<Row>(
          'cards',
          (r) =>
            wanted.has(r.authorId as string) &&
            r.visibility === 'connections' &&
            r.anonymous === false &&
            isDate(r.publishedAt) &&
            (!window.before || r.publishedAt.getTime() < window.before.getTime()) &&
            (!window.since || r.publishedAt.getTime() >= window.since.getTime()),
        )
        .sort(newestFirst)
        .slice(0, limit)
        .map(({ id, row }) => listRow(id, row));
    },
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
    async filmToday() {
      return filmTodayOf(state.get('config', 'landingFilmToday'));
    },
    async saveFilmToday(today) {
      state.put('config', 'landingFilmToday', { ...today });
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

    // --- write side (cardsWrite lane)

    async deleteNotesOn(cardId) {
      for (const { id } of state.rows('notes', (row) => row.cardId === cardId)) state.delete('notes', id);
    },
    async reachResonance(uid, cardId) {
      // In a transaction of its own, as resonate reachResonance: the card read as it is now.
      try {
        const tx = new MemoryTx(state, new TxTracker('reachResonance'));
        const repo = cardsWriteTx(tx);
        const row = await repo.getCardRow(cardId);
        if (!row || row.authorId !== uid || !reachable(row) || !pathId(row.referenceCardId)) return null;
        const bell = repo.reachOriginal(cardId, row, await repo.readReach(uid, row.referenceCardId));
        tx.commit();
        return bell;
      } catch (e) {
        console.error('[api/v1] resonance', cardId, e);
        return null;
      }
    },
    async trashedIds(uid, cutoff, limit) {
      return trashedBy(uid, cutoff)
        .slice(0, limit)
        .map((r) => r.id);
    },
    async countTrashed(uid, cutoff) {
      return trashedBy(uid, cutoff).length;
    },
    async *expiredTrash(cutoff, pageSize) {
      let last: { at: number; id: string } | null = null;
      for (;;) {
        const after: { at: number; id: string } | null = last;
        const page: { id: string; authorId: unknown; at: number }[] = state
          .rows<Row>('cards', (r) => isDate(r.trashedAt) && r.trashedAt.getTime() <= cutoff.getTime())
          .map((r) => ({ id: r.id, authorId: r.row.authorId, at: (r.row.trashedAt as Date).getTime() }))
          .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
          .filter((r) => !after || r.at > after.at || (r.at === after.at && r.id > after.id))
          .slice(0, pageSize);
        if (!page.length) return;
        last = page[page.length - 1];
        yield page.map(({ id, authorId }) => ({ id, authorId }));
        if (page.length < pageSize) return;
      }
    },

    // --- routes lane

    async authorTagHistory(uid, limit) {
      return state
        .rows<Row>('cards', (r) => r.authorId === uid)
        .slice(0, limit)
        .map(({ row }) => (Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : []));
    },
    async anonymousCardsToHold(uid) {
      return state
        .rows<Row>('cards', (r) => r.authorId === uid && r.anonymous === true && r.publishedAt != null && r.trashedAt == null)
        .map((r) => r.id);
    },
    async cardsHeldForDeletion(uid) {
      return state.rows<Row>('cards', (r) => r.authorId === uid && r.trashedFor === 'deletion').map((r) => r.id);
    },
  };
}

import { ApiFailure } from '@/lib/api/v1/http';
import { cardVisible } from '@/lib/api/v1/present';
import { mapCard } from '@/lib/db/firestore/mapper';
import {
  ORIGINS,
  docId,
  isMap,
  keepsReasons,
  pairKey,
  resonanceBellId,
  resonanceCardsOf,
  takeBackCandidate,
  takeBackPlan,
  type ConnectionReason,
  type KeyedReason,
  type Origins,
  type TakeBackPlan,
} from '@/server/domain/graph';
import type { GraphCard, GraphData, GraphTxRepo, Reach } from '@/server/ports/repos/graph';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';
import { bellMade } from './bell';

/**
 * The graph aggregate over memory. Tables, named after the collections, rows
 * shaped as the documents with `Date`s for Timestamps (the taps aggregate's
 * shapes for the tables they share):
 *
 * - `connections/{pair}` `{ userIds, establishedAt, …extra }`
 * - `connectionOrigins/{pair}` `{ userIds, reasons: { [key]: { kind, …, at } }, resonanceCards }`
 * - `invites/{id}` `{ fromUserId, toUserId, status, expiresAt }`
 * - `notifications/{id}` `{ userId, type, payload, readAt, createdAt }`
 * - `letters/{from}_{to}` `{ count, … }`, `conversations/{pair}` `{ request? }`
 * - read: `cards/{id}` (a card; `referenceCardId` written), `users/{uid}`,
 *   `blocks/{uid}/{blocked}` (users/{uid}/blocks/*), `devices/{id}` `{ userId, platform, locale, updatedAt }`.
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');

const originsOf = (row: Row | null): Origins | null => (row ? { reasons: isMap(row.reasons) ? row.reasons : null } : null);

type Read = <T extends Row = Row>(table: string, id: string) => T | null;

function graphCardOf(id: string, row: Row | null): GraphCard | null {
  if (!row) return null;
  return {
    card: mapCard(id, row),
    resonance: {
      authorId: row.authorId,
      referenceCardId: row.referenceCardId,
      visibility: row.visibility,
      anonymous: row.anonymous,
      publishedAt: row.publishedAt instanceof Date ? row.publishedAt : null,
    },
    trashed: row.trashedAt != null,
    slug: typeof row.slug === 'string' ? row.slug : null,
  };
}

const withAt = (reason: ConnectionReason, at: Date) => ({ ...reason, at });

/** `graph` inside a memory transaction. */
export function graphTx(tx: MemoryTx): GraphTxRepo {
  const read: Read = (table, id) => tx.get(table, id);
  const blocked = (a: string, b: string) => !!read('blocks', `${a}/${b}`);
  // Firestore's server time: when the transaction commits. Close enough here.
  const now = () => new Date();
  return {
    async getCard(cardId) {
      return graphCardOf(cardId, read('cards', cardId));
    },
    async findAnswers(uid, targetId, limit) {
      return tx
        .rows('cards', (row) => row.authorId === uid && row.referenceCardId === targetId)
        .slice(0, limit)
        .map((r) => r.id);
    },
    async readReach(from, originalId): Promise<Reach> {
      const bellId = resonanceBellId(from, originalId);
      const row = read('cards', originalId);
      const original = row ? mapCard(originalId, row) : null;
      const bell = !!read('notifications', bellId);
      const none: Reach = {
        from, originalId, original, me: read('users', from), bellId, rang: bell, blockOut: false, blockIn: false, connected: false, origins: null,
      };
      const other = original?.authorId;
      if (!docId(other) || other === from) return none;
      const legacy =
        !bell &&
        tx.rows('notifications', (n) => {
          const p = n.payload as Row | undefined;
          return n.userId === other && n.type === 'resonance' && p?.fromUserId === from && p?.cardId === originalId;
        }).length > 0;
      return {
        ...none,
        rang: bell || legacy,
        blockOut: blocked(from, other),
        blockIn: blocked(other, from),
        connected: !!read('connections', pairKey(from, other)),
        origins: originsOf(read(ORIGINS, pairKey(from, other))),
      };
    },
    async readTakeBack(uid, cardId): Promise<TakeBackPlan[]> {
      const found = tx
        .rows(ORIGINS, (row) => Array.isArray(row.resonanceCards) && row.resonanceCards.includes(cardId))
        .slice(0, 10)
        .filter(({ row }) => takeBackCandidate(uid, cardId, originsOf(row)!, row.userIds));
      return found.map(({ id, row }) => takeBackPlan(uid, cardId, id, originsOf(row)!, !!read('connections', id)));
    },
    async getInvite(inviteId) {
      const row = read('invites', inviteId);
      if (!row) return null;
      return { fromUserId: row.fromUserId, toUserId: row.toUserId, status: row.status, expiresAt: row.expiresAt instanceof Date ? row.expiresAt : null };
    },
    async readPair(uid, other) {
      const pair = pairKey(uid, other);
      const conversation = read('conversations', pair);
      return {
        me: read('users', uid),
        blockOut: blocked(uid, other),
        blockIn: blocked(other, uid),
        connected: !!read('connections', pair),
        origins: originsOf(read(ORIGINS, pair)),
        requestHeld: !!conversation && conversation.request !== undefined,
      };
    },

    pointCard(cardId, targetId) {
      tx.merge('cards', cardId, { referenceCardId: targetId });
    },
    unpointCard(cardId) {
      tx.merge('cards', cardId, { referenceCardId: undefined });
    },
    connect([a, b], { key, reason }, opts = {}) {
      const userIds = [a, b].sort();
      const at = now();
      tx.put('connections', pairKey(a, b), { userIds, establishedAt: at, ...opts.extra });
      tx.put(ORIGINS, pairKey(a, b), { userIds, reasons: { [key]: withAt(reason, at) }, resonanceCards: reason.kind === 'resonance' ? [reason.cardId] : [] });
    },
    addReason([a, b], origins, ...added) {
      const list = added.filter((r): r is KeyedReason => r != null);
      if (!list.length) return;
      const at = now();
      const pair = pairKey(a, b);
      // A merge as Firestore's `set(…, { merge: true })`: the reasons map merged key by key, resonanceCards a set union.
      const was = tx.state.get(ORIGINS, pair);
      const legacy = keepsReasons(origins) ? {} : { legacy: withAt({ kind: 'legacy' }, at) };
      const cards = resonanceCardsOf(list);
      const kept = Array.isArray(was?.resonanceCards) ? (was.resonanceCards as unknown[]) : [];
      tx.merge(ORIGINS, pair, {
        userIds: [a, b].sort(),
        reasons: { ...(isMap(was?.reasons) ? was.reasons : {}), ...legacy, ...Object.fromEntries(list.map(({ key, reason }) => [key, withAt(reason, at)])) },
        ...(cards.length ? { resonanceCards: [...kept, ...cards.filter((c) => !kept.includes(c)).filter((c, i, all) => all.indexOf(c) === i)] } : {}),
      });
    },
    takeBack(plans) {
      for (const p of plans) {
        if (p.ends) {
          tx.delete('connections', p.pair);
          tx.delete(ORIGINS, p.pair);
        } else {
          const was = tx.state.get(ORIGINS, p.pair);
          if (!was) throw new Error(`no origins ${p.pair} to update`);
          const reasons = { ...(isMap(was.reasons) ? was.reasons : {}) };
          delete reasons[p.key];
          const cards = Array.isArray(was.resonanceCards) ? (was.resonanceCards as unknown[]).filter((c) => c !== p.cardId) : [];
          tx.merge(ORIGINS, p.pair, { reasons, resonanceCards: cards });
        }
      }
    },
    ringResonance(bellId, b) {
      tx.put('notifications', bellId, {
        userId: b.to,
        type: 'resonance',
        payload: { fromUserId: b.from, fromHandle: b.fromHandle, cardId: b.cardId, ...(b.anonymous ? { anonymous: true } : {}) },
        readAt: null,
        createdAt: now(),
        ...bellMade(tx.state),
      });
    },
    setInviteStatus(inviteId, status) {
      tx.merge('invites', inviteId, { status });
    },
    ringInviteAccepted(to, payload) {
      const id = `bell_${crypto.randomUUID().replace(/-/g, '').slice(0, 15)}`;
      tx.put('notifications', id, { userId: to, type: 'invite_accepted', payload, readAt: null, createdAt: now(), ...bellMade(tx.state) });
      return id;
    },
    answerLetters(a, b, requestHeld) {
      if (requestHeld) tx.merge('conversations', pairKey(a, b), { request: undefined });
      tx.delete('letters', `${a}_${b}`);
      tx.delete('letters', `${b}_${a}`);
    },
  };
}

/** `graph` outside a transaction. */
export function graphData(state: MemoryState): GraphData {
  const get: Read = (table, id) => state.get(table, id);
  return {
    async visibleCard(viewerId, cardId) {
      if (!cardId || cardId.includes('/')) throw notFound();
      const row = get('cards', cardId);
      const card = row ? mapCard(cardId, row) : null;
      if (!card || !cardVisible(card, viewerId, (author) => author !== viewerId && !!get('connections', pairKey(viewerId, author)))) throw notFound();
      return card;
    },
    async hasBlocked(a, b) {
      return !!get('blocks', `${a}/${b}`);
    },
    async deviceLocale(uid, platform) {
      const time = (v: unknown) => (v instanceof Date ? v.getTime() : 0);
      const registered = state
        .rows('devices', (row) => row.userId === uid && row.platform === platform && typeof row.locale === 'string')
        .sort((x, y) => time(y.row.updatedAt) - time(x.row.updatedAt))[0];
      return registered ? (registered.row.locale as string) : null;
    },
    async primaryLocale(uid) {
      return get('users', uid)?.primaryLocale;
    },
  };
}

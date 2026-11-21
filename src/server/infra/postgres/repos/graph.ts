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
import type { Doc } from '../codec';
import type { PgDocs } from '../docs';
import type { PgTx } from '../uow';

/**
 * The graph aggregate over PostgreSQL: `connections`, `connection_origins`
 * (the take-back's in-transaction `array-contains` is the GIN index on
 * `resonance_cards`), `invites`, `notifications`, `letters` — the memory
 * repository's semantics (infra/memory/repos/graph.ts). A reason merged
 * into existing origins reads them as committed inside the same
 * serializable transaction (`PgTx.apply`), as Firestore's merge does on the
 * server.
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');
const originsOf = (row: Doc | null): Origins | null => (row ? { reasons: isMap(row.reasons) ? row.reasons : null } : null);

function graphCardOf(id: string, row: Doc | null): GraphCard | null {
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

export function pgGraphTx(tx: PgTx): GraphTxRepo {
  const read = (table: string, id: string) => tx.get(table, id);
  const blocked = async (a: string, b: string) => !!(await read('blocks', `${a}/${b}`));
  const now = () => new Date();
  return {
    async getCard(cardId) {
      return graphCardOf(cardId, await read('cards', cardId));
    },
    async findAnswers(uid, targetId, limit) {
      return (await tx.rows('cards', { eq: { authorId: uid, referenceCardId: targetId }, limit })).map((r) => r.id);
    },
    async readReach(from, originalId): Promise<Reach> {
      const bellId = resonanceBellId(from, originalId);
      const [row, bellRow, me] = await Promise.all([read('cards', originalId), read('notifications', bellId), read('users', from)]);
      const original = row ? mapCard(originalId, row) : null;
      const bell = !!bellRow;
      const none: Reach = {
        from, originalId, original, me, bellId, rang: bell, blockOut: false, blockIn: false, connected: false, origins: null,
      };
      const other = original?.authorId;
      if (!docId(other) || other === from) return none;
      const [legacyRows, blockOut, blockIn, connection, origins] = await Promise.all([
        bell ? Promise.resolve([]) : tx.rows('notifications', { eq: { userId: other, type: 'resonance' } }),
        blocked(from, other),
        blocked(other, from),
        read('connections', pairKey(from, other)),
        read(ORIGINS, pairKey(from, other)),
      ]);
      const legacy = legacyRows.some(({ row }) => {
        const p = row.payload as Doc | undefined;
        return p?.fromUserId === from && p?.cardId === originalId;
      });
      return { ...none, rang: bell || legacy, blockOut, blockIn, connected: !!connection, origins: originsOf(origins) };
    },
    async readTakeBack(uid, cardId): Promise<TakeBackPlan[]> {
      const found = (await tx.rows(ORIGINS, { contains: { resonanceCards: cardId }, limit: 10 })).filter(({ row }) =>
        takeBackCandidate(uid, cardId, originsOf(row)!, row.userIds),
      );
      const connected = await Promise.all(found.map(({ id }) => read('connections', id)));
      return found.map(({ id, row }, i) => takeBackPlan(uid, cardId, id, originsOf(row)!, !!connected[i]));
    },
    async getInvite(inviteId) {
      const row = await read('invites', inviteId);
      if (!row) return null;
      return { fromUserId: row.fromUserId, toUserId: row.toUserId, status: row.status, expiresAt: row.expiresAt instanceof Date ? row.expiresAt : null };
    },
    async readPair(uid, other) {
      const pair = pairKey(uid, other);
      const [conversation, me, blockOut, blockIn, connection, origins] = await Promise.all([
        read('conversations', pair),
        read('users', uid),
        blocked(uid, other),
        blocked(other, uid),
        read('connections', pair),
        read(ORIGINS, pair),
      ]);
      return { me, blockOut, blockIn, connected: !!connection, origins: originsOf(origins), requestHeld: !!conversation && conversation.request !== undefined };
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
      tx.apply({ table: ORIGINS, id: pair }, async (docs) => {
        // `set(…, { merge: true })`: the reasons map merged key by key, resonanceCards a set union.
        const was = await docs.get(ORIGINS, pair);
        const legacy = keepsReasons(origins) ? {} : { legacy: withAt({ kind: 'legacy' }, at) };
        const cards = resonanceCardsOf(list);
        const kept = Array.isArray(was?.resonanceCards) ? (was.resonanceCards as unknown[]) : [];
        await docs.merge(ORIGINS, pair, {
          userIds: [a, b].sort(),
          reasons: { ...(isMap(was?.reasons) ? was.reasons : {}), ...legacy, ...Object.fromEntries(list.map(({ key, reason }) => [key, withAt(reason, at)])) },
          ...(cards.length ? { resonanceCards: [...kept, ...cards.filter((c) => !kept.includes(c)).filter((c, i, all) => all.indexOf(c) === i)] } : {}),
        });
      });
    },
    takeBack(plans) {
      for (const p of plans) {
        if (p.ends) {
          tx.delete('connections', p.pair);
          tx.delete(ORIGINS, p.pair);
        } else {
          tx.apply({ table: ORIGINS, id: p.pair }, async (docs) => {
            const was = await docs.get(ORIGINS, p.pair);
            if (!was) throw new Error(`no origins ${p.pair} to update`);
            const reasons = { ...(isMap(was.reasons) ? was.reasons : {}) };
            delete reasons[p.key];
            const cards = Array.isArray(was.resonanceCards) ? (was.resonanceCards as unknown[]).filter((c) => c !== p.cardId) : [];
            await docs.merge(ORIGINS, p.pair, { reasons, resonanceCards: cards });
          });
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
      });
    },
    setInviteStatus(inviteId, status) {
      tx.merge('invites', inviteId, { status });
    },
    ringInviteAccepted(to, payload) {
      const id = `bell_${crypto.randomUUID().replace(/-/g, '').slice(0, 15)}`;
      tx.put('notifications', id, { userId: to, type: 'invite_accepted', payload, readAt: null, createdAt: now() });
      return id;
    },
    answerLetters(a, b, requestHeld) {
      if (requestHeld) tx.merge('conversations', pairKey(a, b), { request: undefined });
      tx.delete('letters', `${a}_${b}`);
      tx.delete('letters', `${b}_${a}`);
    },
  };
}

export function pgGraphData(docs: PgDocs): GraphData {
  const get = (table: string, id: string) => docs.get(table, id);
  return {
    async visibleCard(viewerId, cardId) {
      if (!cardId || cardId.includes('/')) throw notFound();
      const row = await get('cards', cardId);
      const card = row ? mapCard(cardId, row) : null;
      if (!card) throw notFound();
      const connected = card.authorId !== viewerId && !!(await get('connections', pairKey(viewerId, card.authorId)));
      if (!cardVisible(card, viewerId, () => connected)) throw notFound();
      return card;
    },
    async hasBlocked(a, b) {
      return !!(await get('blocks', `${a}/${b}`));
    },
    async deviceLocale(uid, platform) {
      const time = (v: unknown) => (v instanceof Date ? v.getTime() : 0);
      const registered = (await docs.rows('devices', { eq: { userId: uid, platform } }))
        .filter((r) => typeof r.row.locale === 'string')
        .sort((x, y) => time(y.row.updatedAt) - time(x.row.updatedAt))[0];
      return registered ? (registered.row.locale as string) : null;
    },
    async primaryLocale(uid) {
      return (await get('users', uid))?.primaryLocale;
    },
  };
}

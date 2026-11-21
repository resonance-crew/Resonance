import { describe, expect, it } from 'vitest';
import type { ServerCtx } from '@/server/ctx';
import { purgeAccountIn } from '@/server/app/account';
import { exportAccountJsonIn } from '@/server/app/accountExport';
import { ENTITY_NAMES, SPECS, type EntityName } from '@/server/domain/schema/registry';

/**
 * The account purge, held to the registry on any store: one account with a
 * record in every entity that can name a person — each person field the
 * registry declares, the records found through its card, its subcollections
 * — and others' records beside them. After the purge no record anywhere
 * holds the account's uid, in its path or in any value, except what the
 * registry keeps on purpose (KEPT, each with its reason). Run on memory
 * (src/server/app/account.test.ts) and on the Firestore emulator
 * (test/emulator/ports.account.emulator.test.ts).
 */

export const UID = 'u-alice-7f3';
const BOB = 'u-bob-2c1';
const CAROL = 'u-carol-9d4';
/** Her card (found by authorId), and Bob's. */
const CARD = 'card-of-hers';
const BOB_CARD = 'card-of-his';
const CONVERSATION = 'convo-of-two';

export interface AccountHarness {
  ctx: ServerCtx;
  /** Write a record at this path (`cards/x`, `users/u/blocks/v`). */
  seed(path: string, row: Record<string, unknown>): Promise<void>;
  /** Every record of every registered collection (and subcollection), by path. */
  dump(): Promise<{ path: string; row: Record<string, unknown> }[]>;
}

/** Kept after the purge although they name the account, and why (registry `kept`). */
export const KEPT: Record<string, string> = {
  'reports/filed-against-her': "a report filed against the account is moderation history (registry: reports.kept.targetUserId)",
};

function set(row: Record<string, unknown>, field: string, value: unknown) {
  const parts = field.split('.');
  let at = row;
  for (const part of parts.slice(0, -1)) at = (at[part] ??= {}) as Record<string, unknown>;
  at[parts[parts.length - 1]] = value;
}

/** A record per person field of every top-level entity the registry has, then the shapes the steps need. */
export async function seedAccountWorld(seed: AccountHarness['seed']): Promise<void> {
  const now = new Date();
  const writes: [string, Record<string, unknown>][] = [];
  const put = (path: string, row: Record<string, unknown>) => writes.push([path, row]);
  for (const entity of ENTITY_NAMES) {
    const spec = SPECS[entity];
    if (spec.parent) continue;
    if (spec.uid.includes('$id')) put(`${entity}/${UID}`, { at: now });
    for (const field of spec.uid) {
      if (field.startsWith('$') || spec.special?.[field]) continue;
      const array = field.endsWith('[]');
      const name = array ? field.slice(0, -2) : field;
      const row: Record<string, unknown> = { at: now };
      set(row, name, array ? [UID, BOB] : UID);
      put(`${entity}/${entity}-by-${name.replace(/\W/g, '-')}`, row);
    }
    // Records found through her card, by someone else.
    if (spec.byCard) put(`${entity}/${entity}-on-her-card`, { [spec.byCard]: CARD, userId: BOB, fromUserId: BOB, at: now });
  }
  // Her profile and her card, as the pages and the steps read them.
  put(`users/${UID}`, { handle: 'AlicePen', handleLower: 'alicepen' });
  put(`users/${BOB}`, { handle: 'BobPen', handleLower: 'bobpen' });
  put(`cards/${CARD}`, { authorId: UID, slug: 'her-story', publishedAt: now, visibility: 'public', thoughtCore: 'Hers' });
  put(`cards/${BOB_CARD}`, { authorId: BOB, slug: 'his-story', publishedAt: now, visibility: 'public', thoughtCore: 'His' });
  put(`handles/alicepen`, { uid: UID, handle: 'AlicePen' });
  put(`conversations/${CONVERSATION}`, { participants: [UID, BOB] });
  // Subcollections: hers, under her trees and roots; and the ones naming her under other people's.
  put(`users/${UID}/bookmarks/${BOB_CARD}`, { cardId: BOB_CARD, createdAt: now });
  put(`users/${UID}/blocks/${CAROL}`, { blockedUid: CAROL, createdAt: now });
  put(`users/${BOB}/blocks/${UID}`, { blockedUid: UID, createdAt: now });
  put(`users/${BOB}/bookmarks/${CARD}`, { cardId: CARD, createdAt: now });
  put(`cards/${CARD}/edits/current`, { authorId: UID, story: 'draft' });
  put(`cards/gone-card/edits/current`, { authorId: UID, story: 'an edit outliving its card' });
  put(`cards/${CARD}/translations/en`, { title: 'Hers', story: 's' });
  // Her drafts' patch log: under her card, and one an older app's own delete of its draft left behind.
  put(`cards/${CARD}/draftLog/1`, { authorId: UID, rev: 1, patch: { set: { story: 'draft' }, clear: [] }, expireAt: now });
  put(`cards/gone-draft/draftLog/3`, { authorId: UID, rev: 3, patch: { set: { story: 'a log outliving its draft' }, clear: [] }, expireAt: now });
  put(`conversations/${CONVERSATION}/messages/m1`, { senderId: UID, text: 'hi', sentAt: now });
  put(`conversations/${CONVERSATION}/messages/m2`, { senderId: BOB, text: 'hey', sentAt: now });
  put(`thoughtMaps/${UID}/nodes/${CARD}`, { cardId: CARD, x: 0, y: 0 });
  put(`thoughtMaps/${UID}/edges/${CARD}_${BOB_CARD}`, { sourceCardId: CARD, targetCardId: BOB_CARD });
  put(`thoughtMaps/${UID}/groups/g1`, { title: 'mine', x: 0, y: 0, w: 1, h: 1 });
  // Bob's bell rows of taps: one naming her among others (she leaves it), one naming her alone (it goes).
  put('notifications/rtap-shared', { userId: BOB, type: 'resonance_tap', payload: { cardId: BOB_CARD, fromUserIds: [CAROL, UID] } });
  put('notifications/rtap-hers-alone', { userId: BOB, type: 'resonance_tap', payload: { cardId: BOB_CARD, fromUserIds: [UID] } });
  // A report Bob filed against her: kept (KEPT).
  put('reports/filed-against-her', { reporterId: BOB, targetType: 'user', targetId: UID, targetUserId: UID, reason: 'spam' });
  // What the export reads.
  put('notes/her-note', { fromUserId: UID, toUserId: BOB, cardId: BOB_CARD, text: 'her words', readAt: now });
  put(`resonanceTaps/${BOB_CARD}_${UID}`, { cardId: BOB_CARD, userId: UID, on: true, at: now });
  put(`readerSignals/${UID}_${BOB_CARD}`, { cardId: BOB_CARD, userId: UID, activeSeconds: 40, expireAt: now });
  put('accountDeletions/' + UID, { uid: UID, requestedAt: now, purgeAfter: now });
  for (const [path, row] of writes) await seed(path, row);
}

/** Whether a value (deeply) holds the uid. */
function names(value: unknown, uid: string): boolean {
  if (typeof value === 'string') return value.includes(uid);
  if (Array.isArray(value)) return value.some((v) => names(v, uid));
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.values(value).some((v) => names(v, uid));
  return false;
}

export function describeAccountPurgeContract(name: string, make: () => Promise<AccountHarness> | AccountHarness) {
  describe(`account purge (${name})`, () => {
    it('seeds a record in every registered entity', async () => {
      const h = await make();
      await seedAccountWorld(h.seed);
      const collections = new Set((await h.dump()).map((d) => collectionOf(d.path)));
      // The three left hold no uid: tombstones and retired slugs are written by the purge, config never.
      expect(ENTITY_NAMES.filter((e) => !collections.has(e))).toEqual(['cardTombstones', 'retiredSlugs', 'config']);
    });

    it('leaves no record naming the account anywhere, but the ones the registry keeps', async () => {
      const h = await make();
      await seedAccountWorld(h.seed);
      const report = await purgeAccountIn(h.ctx, { deleteAuthUser: async () => {} }, UID);
      expect(report.complete).toBe(true);
      const left = (await h.dump()).filter((d) => d.path.includes(UID) || names(d.row, UID)).map((d) => d.path);
      expect(left.sort()).toEqual(Object.keys(KEPT).sort());
    });

    it("keeps everyone else's records, retires her card, holds her pen name for no one", async () => {
      const h = await make();
      await seedAccountWorld(h.seed);
      await purgeAccountIn(h.ctx, { deleteAuthUser: async () => {} }, UID);
      const byPath = new Map((await h.dump()).map((d) => [d.path, d.row]));
      for (const path of [`users/${BOB}`, `cards/${BOB_CARD}`, `users/${BOB}/bookmarks/${CARD}`, 'notifications/rtap-shared']) expect(byPath.has(path), path).toBe(true);
      expect((byPath.get('notifications/rtap-shared')!.payload as { fromUserIds: string[] }).fromUserIds).toEqual([CAROL]);
      expect(byPath.has('notifications/rtap-hers-alone')).toBe(false);
      expect(byPath.has(`cardTombstones/${CARD}`)).toBe(true);
      expect(byPath.has('retiredSlugs/her-story')).toBe(true);
      expect(byPath.get('handleHolds/alicepen')?.heldFor).toBeNull();
      expect(byPath.has(`accountDeletions/${UID}`)).toBe(false);
    });

    it('exports her own words, section by section, and none of whom her notes reached', async () => {
      const h = await make();
      await seedAccountWorld(h.seed);
      let text = '';
      for await (const piece of exportAccountJsonIn(h.ctx, UID, new Date('2026-11-21T00:00:00Z'))) text += piece;
      const exp = JSON.parse(text);
      expect(Object.keys(exp)).toEqual(['exportedAt', 'profile', 'cards', 'bookmarks', 'thoughtMap', 'notesSent', 'messagesSent', 'cardsResonated', 'reading']);
      expect(exp.profile.handle).toBe('AlicePen');
      expect(exp.cards.map((c: { id: string }) => c.id).sort()).toEqual([CARD, 'cards-by-authorId'].sort());
      expect(exp.bookmarks.map((b: { id: string }) => b.id)).toEqual([BOB_CARD]);
      expect(exp.thoughtMap.nodes).toHaveLength(1);
      expect(exp.thoughtMap.edges).toHaveLength(1);
      expect(exp.thoughtMap.groups).toHaveLength(1);
      const note = exp.notesSent.find((n: { id: string }) => n.id === 'her-note');
      expect(note.text).toBe('her words');
      for (const n of exp.notesSent) for (const key of ['toUserId', 'readAt', 'withheldFor']) expect(n).not.toHaveProperty(key);
      expect(exp.messagesSent).toEqual([expect.objectContaining({ conversationId: CONVERSATION, id: 'm1', text: 'hi' })]);
      expect(exp.cardsResonated).toEqual([expect.objectContaining({ cardId: BOB_CARD, link: `/card/${BOB_CARD}` })]);
      expect(exp.reading).toHaveLength(2);
      for (const r of exp.reading) expect(r).toHaveProperty('keptUntil');
    });
  });
}

const collectionOf = (path: string) => {
  const parts = path.split('/');
  return parts[parts.length - 2] as EntityName;
};

import { beforeEach, describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { DataRepos, TxRepos, UnitOfWork } from '@/server/ports/uow';
import { compareInstants, decodeCursor, encodeCursor, type Instant } from '@/server/ports/time';

/**
 * Phase 2 inbox (2a-inbox): what every adapter's inbox reads and read marks
 * guarantee (ports/repos/conversations.ts `listConversations`,
 * `getConversationRow`, `listMessagesAfter`, `markRead`; ports/repos/bell.ts
 * `listRows`, `markRead`, `markReadBefore`), run against memory
 * (src/server/infra/memory/repos/inbox.test.ts) and Firestore's emulator
 * (test/emulator/ports.inbox.emulator.test.ts). Uids are the harness's own.
 */
export interface InboxHarness {
  data: DataRepos;
  /** The adapter's transactions (a reaction, an unsend: what changes a message already sent). */
  uow: UnitOfWork<TxRepos>;
  uid(n: string): string;
  /** A conversation stored as is (times exact, to the microsecond). */
  seedConversation(pair: string, c: { participants: string[]; updatedAt: Instant; unread?: Record<string, number>; lastMessage?: Record<string, unknown>; request?: Record<string, unknown> }): Promise<void>;
  /** A message stored as is, with this exact sentAt. */
  seedMessage(pair: string, id: string, m: { senderId: string; text: string; sentAt: Instant; unsentAt?: Instant }): Promise<void>;
  /** A bell row stored as is. */
  seedBell(id: string, r: { userId: string; type: string; payload: Record<string, unknown>; createdAt: Instant; readAt?: Instant | null }): Promise<void>;
  /** A row's readAt as stored (null when unread or missing). */
  readAt(id: string): Promise<Instant | null>;
}

const t = (micros: string) => `2026-11-20T03:04:05.${micros}Z`;

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

export function describeInboxContract(name: string, make: () => InboxHarness | Promise<InboxHarness>) {
  describe(`inbox repositories contract — ${name}`, () => {
    let h: InboxHarness;
    let a: string;
    let b: string;
    let c: string;
    const pairOf = (x: string, y: string) => (x < y ? `${x}_${y}` : `${y}_${x}`);
    beforeEach(async () => {
      h = await make();
      a = h.uid('a');
      b = h.uid('b');
      c = h.uid('c');
    });

    it('listConversations: only theirs, (updatedAt, id) descending to the microsecond, paged without a skip', async () => {
      const ab = pairOf(a, b);
      const ac = pairOf(a, c);
      const bc = pairOf(b, c);
      await h.seedConversation(ab, { participants: [a, b].sort(), updatedAt: t('123456'), unread: { [a]: 2, [b]: 0 } });
      // The same millisecond, a microsecond later.
      await h.seedConversation(ac, { participants: [a, c].sort(), updatedAt: t('123457'), lastMessage: { text: 'hi', senderId: c, sentAt: t('123457'), image: true, album: { count: 3 } } });
      await h.seedConversation(bc, { participants: [b, c].sort(), updatedAt: t('999999') });
      const first = await h.data.conversations.listConversations(a, 1);
      expect(first.conversations.map((x) => x.id)).toEqual([ac]);
      expect(first.conversations[0]).toMatchObject({
        participants: [a, c].sort(),
        updatedAt: t('123457'),
        lastMessage: { text: 'hi', senderId: c, sentAt: t('123457'), image: true, sticker: false, albumCount: 3, unsent: false },
      });
      expect(first.next).not.toBeNull();
      const second = await h.data.conversations.listConversations(a, 1, first.next!);
      expect(second.conversations.map((x) => x.id)).toEqual([ab]);
      expect(second.conversations[0].unread).toEqual({ [a]: 2, [b]: 0 });
      const third = await h.data.conversations.listConversations(a, 1, second.next!);
      expect(third).toEqual({ conversations: [], next: null });
      expect((await h.data.conversations.listConversations(a, 5)).next).toBeNull();
      expect((await failure(h.data.conversations.listConversations(a, 5, 'nope'))).code).toBe('invalid_request');
    });

    it('getConversationRow: the document as the lists read it, its letter parsed; null when none', async () => {
      const ab = pairOf(a, b);
      await h.seedConversation(ab, { participants: [a, b].sort(), updatedAt: t('000001'), request: { from: b, cardId: 'card1', count: 2 } });
      expect(await h.data.conversations.getConversationRow(ab)).toMatchObject({ id: ab, request: { from: b, cardId: 'card1', count: 2 }, lastMessage: null });
      expect(await h.data.conversations.getConversationRow(pairOf(a, c))).toBeNull();
    });

    it('listMessagesAfter: what came right after a cursor, newest first, two in one millisecond never skipped', async () => {
      const ab = pairOf(a, b);
      await h.seedConversation(ab, { participants: [a, b].sort(), updatedAt: t('000005') });
      await h.seedMessage(ab, 'm1', { senderId: a, text: 'one', sentAt: t('000001') });
      await h.seedMessage(ab, 'm2', { senderId: b, text: 'two', sentAt: t('000002') });
      await h.seedMessage(ab, 'm3', { senderId: a, text: 'three', sentAt: t('000002') });
      await h.seedMessage(ab, 'm4', { senderId: a, text: 'four', sentAt: t('000003'), unsentAt: t('000004') });
      const from = encodeCursor({ t: t('000001'), id: 'm1' });
      const page = await h.data.conversations.listMessagesAfter(ab, 2, from);
      expect(page.messages.map((m) => m.id)).toEqual(['m3', 'm2']);
      expect(decodeCursor(page.next)).toEqual({ t: t('000002'), id: 'm3' });
      const rest = await h.data.conversations.listMessagesAfter(ab, 2, page.next!);
      expect(rest.messages.map((m) => [m.id, m.unsent, m.unsentAt])).toEqual([['m4', true, t('000004')]]);
      expect(rest.next).toBeNull();
      // The other way, the same order: the page before m3 is m2, then m1.
      const back = await h.data.conversations.listMessages(ab, 5, encodeCursor({ t: t('000002'), id: 'm3' }));
      expect(back.messages.map((m) => m.id)).toEqual(['m2', 'm1']);
      expect((await failure(h.data.conversations.listMessagesAfter(ab, 2, 'c1.bad'))).code).toBe('invalid_request');
    });

    it('listMessagesChangedAfter: every change to a message already sent, of any age, after the mark a page was read at', async () => {
      const ab = pairOf(a, b);
      await h.seedConversation(ab, { participants: [a, b].sort(), updatedAt: t('000005') });
      await h.seedMessage(ab, 'm1', { senderId: a, text: 'one', sentAt: t('000001') });
      await h.seedMessage(ab, 'm2', { senderId: b, text: 'two', sentAt: t('000002') });
      await h.seedMessage(ab, 'm3', { senderId: a, text: 'three', sentAt: t('000003') });
      const page = await h.data.conversations.listMessages(ab, 1);
      expect(page.messages.map((m) => m.id)).toEqual(['m3']);
      expect(page.mark).toBeTruthy();
      // Nothing changed since the page was read.
      const none = await h.data.conversations.listMessagesChangedAfter(ab, 10, page.mark!);
      expect(none.messages).toEqual([]);
      expect(none.mark).toBeTruthy();

      // A reaction on the oldest (outside the page) and an unsend of the newest.
      await h.uow.run(async ({ conversations: tx }) => tx.setReaction(ab, 'm1', b, 'heart'));
      await h.uow.run(async ({ conversations: tx }) => tx.unsendMessage(ab, 'm3', a, t('000003'), new Date()));
      const changed = await h.data.conversations.listMessagesChangedAfter(ab, 10, none.mark!);
      expect(changed.messages.map((m) => m.id)).toEqual(['m1', 'm3']);
      expect(changed.messages[0].reactions).toEqual({ [b]: 'heart' });
      expect(changed.messages[1].unsent).toBe(true);
      // Heard: asked again from its mark, nothing.
      expect((await h.data.conversations.listMessagesChangedAfter(ab, 10, changed.mark!)).messages).toEqual([]);
      // A full page says it can't vouch for the rest: no mark.
      const full = await h.data.conversations.listMessagesChangedAfter(ab, 1, none.mark!);
      expect(full.messages.map((m) => m.id)).toEqual(['m1']);
      expect(full.mark).toBeNull();
    });

    it('markRead: their count 0, the other untouched; a conversation gone is `gone` and not made again', async () => {
      const ab = pairOf(a, b);
      await h.seedConversation(ab, { participants: [a, b].sort(), updatedAt: t('000001'), unread: { [a]: 3, [b]: 1 } });
      expect(await h.data.conversations.markRead(ab, a)).toBe('marked');
      expect((await h.data.conversations.getConversationRow(ab))?.unread).toEqual({ [a]: 0, [b]: 1 });
      expect(await h.data.conversations.markRead(pairOf(a, c), a)).toBe('gone');
      expect(await h.data.conversations.getConversationRow(pairOf(a, c))).toBeNull();
    });

    it('bell listRows: only theirs, (createdAt, id) descending to the microsecond, paged without a skip', async () => {
      await h.seedBell(h.uid('n1'), { userId: a, type: 'note', payload: { cardId: 'x', anonymous: true }, createdAt: t('000001') });
      await h.seedBell(h.uid('n2'), { userId: a, type: 'resonance_tap', payload: { fromUserIds: [b, c] }, createdAt: t('000002'), readAt: t('000009') });
      await h.seedBell(h.uid('n3'), { userId: a, type: 'message', payload: { fromUserId: b }, createdAt: t('000002') });
      await h.seedBell(h.uid('n4'), { userId: b, type: 'message', payload: {}, createdAt: t('000005') });
      const first = await h.data.bell.listRows(a, 2);
      expect(first.rows.map((r) => r.id)).toEqual([h.uid('n3'), h.uid('n2')]);
      expect(first.rows[1]).toMatchObject({ type: 'resonance_tap', payload: { fromUserIds: [b, c] }, createdAt: t('000002'), readAt: t('000009') });
      const second = await h.data.bell.listRows(a, 2, first.next!);
      expect(second.rows.map((r) => [r.id, r.readAt, r.payload])).toEqual([[h.uid('n1'), null, { cardId: 'x', anonymous: true }]]);
      expect(second.next).toBeNull();
      expect((await failure(h.data.bell.listRows(a, 2, 'x'))).code).toBe('invalid_request');
    });

    it('bell markRead: only their own unread rows, by id; one read already keeps its time', async () => {
      await h.seedBell(h.uid('r1'), { userId: a, type: 'note', payload: {}, createdAt: t('000001') });
      await h.seedBell(h.uid('r2'), { userId: a, type: 'note', payload: {}, createdAt: t('000002'), readAt: t('000003') });
      await h.seedBell(h.uid('r3'), { userId: b, type: 'note', payload: {}, createdAt: t('000002') });
      expect(await h.data.bell.markRead(a, [h.uid('r1'), h.uid('r2'), h.uid('r3'), h.uid('missing')])).toBe(1);
      expect(await h.readAt(h.uid('r1'))).not.toBeNull();
      expect(await h.readAt(h.uid('r2'))).toBe(t('000003'));
      expect(await h.readAt(h.uid('r3'))).toBeNull();
    });

    it('bell listRowsChangedAfter: only theirs changed after a read’s mark — read, made, its readers changed — oldest change first; countRows', async () => {
      await h.seedBell(h.uid('c1'), { userId: a, type: 'note', payload: {}, createdAt: t('000001') });
      await h.seedBell(h.uid('c2'), { userId: a, type: 'resonance_tap', payload: { fromUserIds: [b, c] }, createdAt: t('000002') });
      await h.seedBell(h.uid('c3'), { userId: b, type: 'note', payload: {}, createdAt: t('000002') });
      const page = await h.data.bell.listRows(a, 20);
      expect(page.mark).toBeTruthy();
      expect(await h.data.bell.countRows(a)).toBe(2);
      expect((await h.data.bell.listRowsChangedAfter(a, 20, page.mark!)).rows).toEqual([]);

      await h.data.bell.markRead(a, [h.uid('c1')]);
      await h.data.bell.markRead(b, [h.uid('c3')]);
      await h.uow.run(async (tx) => {
        await tx.bell.getRow(h.uid('c2'));
        tx.bell.setRowReaders(h.uid('c2'), [c]);
      });
      await h.uow.run(async (tx) => {
        await tx.bell.getRow(h.uid('c4'));
        tx.bell.putRow(h.uid('c4'), { userId: a, type: 'read_summary', payload: { cardId: 'x', readers: 3 }, atMs: Date.parse(t('000004')) });
      });
      const changed = await h.data.bell.listRowsChangedAfter(a, 20, page.mark!);
      expect(changed.rows.map((r) => r.id)).toEqual([h.uid('c1'), h.uid('c2'), h.uid('c4')]);
      expect(changed.rows[0].readAt).not.toBeNull();
      expect(changed.rows[1].payload).toEqual({ fromUserIds: [c] });
      // Only the row made since has a time it was made after the mark.
      const madeAfter = (r: { madeAt?: Instant | null }) => !!r.madeAt && compareInstants(r.madeAt, page.mark!) > 0;
      expect(changed.rows.map(madeAfter)).toEqual([false, false, true]);
      expect(changed.mark).toBeTruthy();
      expect(await h.data.bell.countRows(a)).toBe(3);
      expect((await h.data.bell.listRowsChangedAfter(a, 20, changed.mark!)).rows).toEqual([]);
      // As many as the limit: more may have changed, no mark.
      const one = await h.data.bell.listRowsChangedAfter(a, 1, page.mark!);
      expect(one.rows).toHaveLength(1);
      expect(one.mark).toBeNull();
    });

    it('bell markReadBefore: their unread rows made up to the time, not after it, not anyone else’s', async () => {
      await h.seedBell(h.uid('b1'), { userId: a, type: 'note', payload: {}, createdAt: t('000001') });
      await h.seedBell(h.uid('b2'), { userId: a, type: 'note', payload: {}, createdAt: t('000002') });
      await h.seedBell(h.uid('b3'), { userId: a, type: 'note', payload: {}, createdAt: t('000003') });
      await h.seedBell(h.uid('b4'), { userId: b, type: 'note', payload: {}, createdAt: t('000001') });
      expect(await h.data.bell.markReadBefore(a, t('000002'), 100)).toBe(2);
      expect(await h.readAt(h.uid('b1'))).not.toBeNull();
      expect(await h.readAt(h.uid('b2'))).not.toBeNull();
      expect(await h.readAt(h.uid('b3'))).toBeNull();
      expect(await h.readAt(h.uid('b4'))).toBeNull();
      expect(await h.data.bell.markReadBefore(a, t('000002'), 100)).toBe(0);
    });
  });
}

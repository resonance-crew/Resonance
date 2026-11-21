import { beforeEach, describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { DataRepos, UnitOfWork } from '@/server/ports/uow';
import { toInstant, type Instant } from '@/server/ports/time';

/**
 * What every adapter of the conversations aggregate's repositories
 * guarantees (ports/repos/conversations.ts), run against memory
 * (src/server/infra/memory/repos/conversations.test.ts) and Firestore's
 * emulator (test/emulator/ports.conversations.emulator.test.ts). `make`
 * answers a fresh harness for each test; uids are the harness's own
 * (`uid(n)`), so runs never see each other's rows.
 */
export interface ConversationsHarness {
  uow: UnitOfWork;
  data: DataRepos;
  /** A uid of this harness's own. */
  uid(n: string): string;
  /** A message stored as is, with this exact sentAt (microseconds and all). */
  seedMessage(pair: string, id: string, m: { senderId: string; text: string; sentAt: Instant }): Promise<void>;
  /** The conversation's committed unread counts. */
  unread(pair: string): Promise<Record<string, number>>;
}

const T0 = Date.parse('2026-11-20T03:04:05.123Z');
const AT = new Date(T0);

export function describeConversationsContract(name: string, make: () => ConversationsHarness | Promise<ConversationsHarness>) {
  describe(`conversations repositories contract — ${name}`, () => {
    let h: ConversationsHarness;
    let a: string;
    let b: string;
    let pair: string;
    beforeEach(async () => {
      h = await make();
      a = h.uid('a');
      b = h.uid('b');
      pair = a < b ? `${a}_${b}` : `${b}_${a}`;
    });

    const open = () =>
      h.uow.run(async (tx) => {
        tx.conversations.openConversation(pair, [a, b], AT);
      });

    it('insertIfAbsent: a send under the same client id writes one message, the second finds it (exists)', async () => {
      const send = () =>
        h.uow.run(async ({ conversations: tx }) => {
          const [existing, convo] = await Promise.all([tx.getMessage(pair, 'client-1'), tx.getConversation(pair)]);
          if (existing) return 'exists' as const;
          if (!convo) tx.openConversation(pair, [a, b], AT);
          tx.putMessage(pair, 'client-1', { senderId: a, text: 'hello' }, AT);
          tx.recordSent(pair, { preview: { text: 'hello', senderId: a }, unreadFor: b, request: 'keep' }, AT);
          return 'inserted' as const;
        });
      expect(await send()).toBe('inserted');
      expect(await send()).toBe('exists');
      const page = await h.data.conversations.listMessages(pair, 10);
      expect(page.messages.map((m) => [m.id, m.senderId, m.text])).toEqual([['client-1', a, 'hello']]);
      expect(await h.unread(pair)).toMatchObject({ [a]: 0, [b]: 1 });
      // The message and the preview were written together: the same server time.
      const convo = await h.data.conversations.getConversation(pair);
      expect(convo?.lastMessage?.sentAt).toBe(page.messages[0].sentAt);
      expect(convo?.lastMessage?.senderId).toBe(a);
    });

    it('insertChatImageIfAbsent: inserted once, exists after, the first record kept', async () => {
      const id = h.uid('picture');
      const record = { senderId: a, to: b, pair, key: 'k1', thumbKey: 't1', width: 10, height: 20, bytes: 5, animated: false };
      expect(await h.data.conversations.insertChatImageIfAbsent(id, record, AT)).toBe('inserted');
      expect(await h.data.conversations.insertChatImageIfAbsent(id, { ...record, key: 'k2' }, AT)).toBe('exists');
      const kept = await h.data.conversations.getChatImage(id);
      expect(kept).toMatchObject({ id, key: 'k1', thumbKey: 't1', pair, senderId: a, unsent: true, width: 10, height: 20 });
      expect(kept?.unsentAt).toEqual(expect.stringMatching(/Z$/));
    });

    it('bumpUnread / clearUnread: one more for one person, back to 0 for them, the other untouched', async () => {
      await open();
      expect(await h.unread(pair)).toEqual({ [a]: 0, [b]: 0 });
      await h.uow.run(async (tx) => tx.conversations.bumpUnread(pair, b));
      await h.data.conversations.bumpUnread(pair, b);
      await h.data.conversations.bumpUnread(pair, a);
      expect(await h.unread(pair)).toEqual({ [a]: 1, [b]: 2 });
      await h.data.conversations.clearUnread(pair, b);
      expect(await h.unread(pair)).toEqual({ [a]: 1, [b]: 0 });
    });

    it('recordSent: a letter set waits in the conversation, cleared it is gone; the preview says what was sent', async () => {
      await open();
      await h.uow.run(async (tx) => {
        tx.conversations.recordSent(
          pair,
          { preview: { text: 'pic', senderId: a, image: true, album: { count: 3 } }, unreadFor: b, request: { set: { from: a, cardId: 'c1', count: 2 } } },
          AT,
        );
      });
      let convo = await h.data.conversations.getConversation(pair);
      expect(convo?.request).toEqual({ from: a, count: 2 });
      expect(convo?.holdsRequest).toBe(true);
      await h.uow.run(async (tx) => {
        tx.conversations.recordSent(pair, { preview: { text: 'ok', senderId: b }, unreadFor: a, request: 'clear' }, AT);
      });
      convo = await h.data.conversations.getConversation(pair);
      expect(convo?.request).toBeNull();
      expect(convo?.holdsRequest).toBe(false);
      expect(await h.unread(pair)).toEqual({ [a]: 1, [b]: 1 });
    });

    it('setReaction: set, replaced, cleared with null — one per person', async () => {
      await open();
      await h.seedMessage(pair, 'm1', { senderId: a, text: 'hi', sentAt: toInstant(T0) });
      const react = (uid: string, r: string | null) => h.uow.run(async (tx) => tx.conversations.setReaction(pair, 'm1', uid, r));
      await react(b, 'heart');
      await react(a, 'laugh');
      expect((await h.data.conversations.getMessage(pair, 'm1'))?.reactions).toEqual({ [b]: 'heart', [a]: 'laugh' });
      await react(b, 'wow');
      await react(a, null);
      expect((await h.data.conversations.getMessage(pair, 'm1'))?.reactions).toEqual({ [b]: 'wow' });
    });

    it('listMessages: pages newest first by (sentAt, id) and never skips messages sent in the same millisecond', async () => {
      await open();
      // Three in one millisecond (different microseconds), two at the very same microsecond, one older.
      const seeds: [string, Instant][] = [
        ['m0', toInstant(T0 - 5)],
        ['m1', toInstant(T0, 1)],
        ['m2', toInstant(T0, 2)],
        ['m3', toInstant(T0, 3)],
        ['m4', toInstant(T0, 7)],
        ['m5', toInstant(T0, 7)],
      ];
      for (const [id, sentAt] of seeds) await h.seedMessage(pair, id, { senderId: a, text: id, sentAt });
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const page = await h.data.conversations.listMessages(pair, 2, cursor);
        seen.push(...page.messages.map((m) => m.id));
        if (!page.next) break;
        cursor = page.next;
      }
      expect(seen).toEqual(['m5', 'm4', 'm3', 'm2', 'm1', 'm0']);
      const first = await h.data.conversations.listMessages(pair, 6);
      expect(first.messages.map((m) => m.sentAt)).toEqual(seeds.map(([, t]) => t).reverse());
      await expect(h.data.conversations.listMessages(pair, 2, 'not-a-cursor')).rejects.toBeInstanceOf(ApiFailure);
    });

    it('messagesBefore: the ones sent before a microsecond instant, newest first', async () => {
      await open();
      for (const [id, micros] of [['x1', 1], ['x2', 2], ['x3', 3]] as const) {
        await h.seedMessage(pair, id, { senderId: a, text: id, sentAt: toInstant(T0, micros) });
      }
      expect((await h.data.conversations.messagesBefore(pair, toInstant(T0, 3), 20)).map((m) => m.id)).toEqual(['x2', 'x1']);
      expect((await h.data.conversations.messagesBefore(pair, null, 2)).map((m) => m.id)).toEqual(['x3', 'x2']);
    });

    it('unsendMessage keeps the message’s own sentAt, to the microsecond', async () => {
      await open();
      const sentAt = toInstant(T0, 456);
      await h.seedMessage(pair, 'u1', { senderId: a, text: 'oops', sentAt });
      await h.uow.run(async (tx) => tx.conversations.unsendMessage(pair, 'u1', a, sentAt, AT));
      const m = await h.data.conversations.getMessage(pair, 'u1');
      expect(m).toMatchObject({ id: 'u1', senderId: a, sentAt, unsent: true, text: null, reactions: {} });
    });
  });
}

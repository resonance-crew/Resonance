import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { fakeAdminDb } from '../../test/fakeAdminDb';
import { signalledJson } from '@/lib/api/v1/signalTag';
import { getCardDetail } from '@/server/app/cardsRead';
import { listBellIn, listConversationsIn, listThreadIn } from '@/server/app/inbox';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { memoryRealtime } from '@/server/infra/memory/adapters';

// Read-count ratchets: how many Firestore documents the reads the clients
// pull most often cost, on the Firestore repositories themselves (over
// test/fakeAdminDb, which counts documents as Firestore bills them). Each
// number may fall, never rise — a change that makes one of these reads cost
// more lowers nothing and fails here; one that makes it cheaper lowers MAX.
// (2026-11-22, the perf lane of the middleware hardening: before it, every
// pull of an open thread was the whole window, and every safety pull of the
// list the whole list.)
const MAX = {
  /** GET /conversations, 50 conversations: the page and each other person's profile. */
  conversations: 100,
  /** …asked again while the viewer's `inbox` counter stands: the signal document alone (100 before the early 304). */
  conversationsUnchanged: 1,
  /** GET /me/bell, 20 rows naming 20 people. */
  bell: 40,
  /** GET …/messages, the newest window of 50. */
  threadWindow: 51,
  /** …then an open thread's pull after one message came and one changed: the conversation, a new one, a changed one (51 before). */
  threadSince: 3,
  /** GET /cards/{id}?include=resonances,related,links,embeds on a card with none of them. */
  cardDetail: 15,
} as const;

const ts = (ms: number) => Timestamp.fromMillis(ms);
const T0 = Date.UTC(2026, 10, 22);
const ME = 'me';
const others = Array.from({ length: 50 }, (_, i) => `u${String(i).padStart(2, '0')}`);
const pairWith = (o: string) => [ME, o].sort().join('_');

function seeded() {
  const docs: Record<string, Record<string, unknown>> = {
    [`users/${ME}`]: { handle: 'Me', initials: 'ME', accentColor: 'c' },
  };
  others.forEach((o, i) => {
    docs[`users/${o}`] = { handle: `Person${i}`, initials: 'PE', accentColor: 'c' };
    docs[`conversations/${pairWith(o)}`] = {
      participants: [ME, o].sort(),
      createdAt: ts(T0),
      updatedAt: ts(T0 + i * 1000),
      lastMessage: { text: 'hi', senderId: o, sentAt: ts(T0 + i * 1000) },
      unread: { [ME]: 1, [o]: 0 },
    };
    docs[`notifications/n${i}`] = { userId: ME, type: 'message', payload: { fromUserId: o }, readAt: null, createdAt: ts(T0 + i * 1000) };
  });
  const pair = pairWith(others[0]);
  for (let i = 0; i < 60; i++) {
    docs[`conversations/${pair}/messages/m${String(i).padStart(3, '0')}`] = { senderId: i % 2 ? ME : others[0], text: `message ${i}`, sentAt: ts(T0 + i * 1000) };
  }
  docs['cards/card1'] = {
    authorId: others[1],
    visibility: 'public',
    anonymous: false,
    publishedAt: ts(T0),
    createdAt: ts(T0),
    updatedAt: ts(T0),
    trashedAt: null,
    thoughtCore: 'A walk after rain',
    story: 'It rained, and then it stopped.',
  };
  const fake = fakeAdminDb(docs);
  const realtime = memoryRealtime();
  const ctx = ctxFor(fake.db, { realtime });
  return { fake, ctx, realtime, pair };
}

/** How many documents `fn` read. */
async function cost(fake: ReturnType<typeof fakeAdminDb>, fn: () => Promise<unknown>): Promise<number> {
  const before = fake.billed();
  await fn();
  return fake.billed() - before;
}

describe('read-count ratchets', () => {
  it('the conversation list, and the list asked again while nothing moved', async () => {
    const { fake, ctx, realtime } = seeded();
    const req = (etag?: string) => new Request('https://resonance.test/api/v1/conversations', { headers: etag ? { 'If-None-Match': etag } : {} });
    const s = { uid: ME, topic: 'inbox' as const, realtime, now: T0 };
    let etag = '';
    const whole = await cost(fake, async () => {
      etag = (await signalledJson(req(), s, () => listConversationsIn(ctx, ME))).headers.get('ETag')!;
    });
    expect(whole).toBeLessThanOrEqual(MAX.conversations);
    // (memoryRealtime reads no Firestore: the signal document costs one read on Firestore, firestoreRealtime.read.)
    const unchanged = await cost(fake, async () => {
      const res = await signalledJson(req(etag), { ...s, now: T0 + 60_000 }, () => listConversationsIn(ctx, ME));
      expect(res.status).toBe(304);
    });
    expect(unchanged + 1).toBeLessThanOrEqual(MAX.conversationsUnchanged);
  });

  it('the bell', async () => {
    const { fake, ctx } = seeded();
    expect(await cost(fake, () => listBellIn(ctx, ME, 20))).toBeLessThanOrEqual(MAX.bell);
  });

  it('an open thread: the window once, then only what came and what changed', async () => {
    const { fake, ctx, pair } = seeded();
    let page = await listThreadIn(ctx, ME, pair, { limit: 50, changes: '1' });
    const window = await cost(fake, async () => {
      page = await listThreadIn(ctx, ME, pair, { limit: 50, changes: '1' });
    });
    expect(window).toBeLessThanOrEqual(MAX.threadWindow);
    expect(page.updatedCursor).toBeTruthy();

    // One came, one older changed (a reaction: its editedAt the store's time, after the window was read).
    const later = Date.now() + 1000;
    fake.docs[`conversations/${pair}/messages/m060`] = { senderId: others[0], text: 'new', sentAt: ts(T0 + 60_000) };
    fake.docs[`conversations/${pair}/messages/m010`] = {
      ...fake.docs[`conversations/${pair}/messages/m010`],
      reactions: { [ME]: 'heart' },
      editedAt: ts(later),
    };
    let since = page;
    const incremental = await cost(fake, async () => {
      since = await listThreadIn(ctx, ME, pair, { limit: 100, after: page.newerCursor, updatedAfter: page.updatedCursor });
    });
    expect(since.messages.map((m) => m.text)).toEqual(['new']);
    expect(since.updated!.map((m) => m.id)).toEqual(['m010']);
    expect(incremental).toBeLessThanOrEqual(MAX.threadSince);
  });

  it('a card page signed in, with every list it may show', async () => {
    const { fake, ctx } = seeded();
    const n = await cost(fake, () => getCardDetail(ctx, ME, 'card1', new Set(['resonances', 'related', 'links', 'embeds'] as const)));
    expect(n).toBeLessThanOrEqual(MAX.cardDetail);
  });
});

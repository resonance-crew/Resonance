import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { fakeAdminDb } from '../../test/fakeAdminDb';

// The routes themselves, for the lists whose early 304 is the route's own choice: the viewer is ME, the server's
// context the seeded one.
const route = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: 'me' }) }));
vi.mock('@/server/ctx', () => ({ serverCtx: () => route.ctx }));
import { GET as getConnections } from '@/app/api/v1/me/connections/route';
import { signalledJson } from '@/lib/api/v1/signalTag';
import { getCardDetail } from '@/server/app/cardsRead';
import { cardTapIn } from '@/server/app/taps';
import { listBellIn, listConversationsByIdIn, listConversationsIn, listThreadIn, markBellReadIn } from '@/server/app/inbox';
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
  /**
   * GET /conversations?pairs= — the web's list after a send, a read mark or a message heard: the conversation that
   * moved and its person (the whole page, 100, before the delta; client/messages conversationsReader).
   */
  conversationsDelta: 2,
  /** GET /me/connections, 20 connections: the list and each person's profile. */
  connections: 40,
  /** …asked again while the viewer's `graph` counter stands: the signal document alone (40 before the early 304). */
  connectionsUnchanged: 1,
  /** GET /me/bell, 20 rows naming 20 people. */
  bell: 40,
  /** …asked for its changes (`changes=1`, the web's whole read): the page, its people, and the rows' count. */
  bellWhole: 41,
  /**
   * …then the open bell's pull after one row was marked read (`updatedAfter`): the rows' count and the row (41
   * before: the page and its people again; client/notifications bellReader).
   */
  bellDelta: 2,
  /** GET …/messages, the newest window of 50. */
  threadWindow: 51,
  /** …then an open thread's pull after one message came and one changed: the conversation, a new one, a changed one (51 before). */
  threadSince: 3,
  /**
   * A reader's tap answer on a card three people tapped, the reader with 50 connections: their own tap, one page of
   * the card's taps, the blocks both ways with the reader and — on a named card — with its author, the standing and
   * the faces; no connection document at all (67 before P0 #6: every connection first; 19 with P0 #6's three pairs
   * by id; 20 since Wave 2 #3b, where every reader sees every tapper and the author's block list is read instead).
   */
  cardTapReader: 20,
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
  const fake = fakeAdminDb(docs, { serverTime: true });
  const realtime = memoryRealtime();
  const ctx = ctxFor(fake.db, { realtime });
  route.ctx = ctx;
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

  it('the list after one conversation moved: that conversation and its person', async () => {
    const { fake, ctx } = seeded();
    let n = 0;
    const one = await cost(fake, async () => {
      n = (await listConversationsByIdIn(ctx, ME, [pairWith(others[3])])).conversations.length;
    });
    expect(n).toBe(1);
    expect(one).toBeLessThanOrEqual(MAX.conversationsDelta);
  });

  it('the connections list, and the list asked again while nothing moved', async () => {
    const { fake } = seeded();
    others.slice(0, 20).forEach((o, i) => (fake.docs[`connections/${pairWith(o)}`] = { userIds: [ME, o].sort(), establishedAt: ts(T0 + i * 1000) }));
    const req = (etag?: string) => new Request('https://resonance.test/api/v1/me/connections', { headers: etag ? { 'If-None-Match': etag } : {} });
    let etag = '';
    const whole = await cost(fake, async () => {
      const res = await getConnections(req());
      expect(((await res.json()) as { connections: unknown[] }).connections).toHaveLength(20);
      etag = res.headers.get('ETag')!;
    });
    expect(whole).toBeLessThanOrEqual(MAX.connections);
    const unchanged = await cost(fake, async () => {
      expect((await getConnections(req(etag))).status).toBe(304);
    });
    // (memoryRealtime reads no Firestore: the signal document costs one read on Firestore, firestoreRealtime.read.)
    expect(unchanged + 1).toBeLessThanOrEqual(MAX.connectionsUnchanged);
  });

  it('the bell', async () => {
    const { fake, ctx } = seeded();
    expect(await cost(fake, () => listBellIn(ctx, ME, 20))).toBeLessThanOrEqual(MAX.bell);
  });

  it('an open bell: the page once, then only the row that changed', async () => {
    const { fake, ctx } = seeded();
    let page = await listBellIn(ctx, ME, 20, null, { changes: true });
    const whole = await cost(fake, async () => {
      page = await listBellIn(ctx, ME, 20, null, { changes: true });
    });
    expect(page.items).toHaveLength(20);
    expect(whole).toBeLessThanOrEqual(MAX.bellWhole);
    await markBellReadIn(ctx, ME, { ids: [page.items[3].id] });
    let since = page;
    const delta = await cost(fake, async () => {
      since = await listBellIn(ctx, ME, 20, null, { updatedAfter: page.updatedCursor });
    });
    expect(since.delta).toBe(true);
    expect(since.items.map((i) => [i.id, i.readAt !== null])).toEqual([[page.items[3].id, true]]);
    expect(delta).toBeLessThanOrEqual(MAX.bellDelta);
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

  it('a reader\'s people on a card with a few taps: never a connection document of theirs', async () => {
    const { fake, ctx } = seeded();
    others.forEach((o, i) => (fake.docs[`connections/${pairWith(o)}`] = { userIds: [ME, o].sort(), establishedAt: ts(T0 + i * 1000) }));
    for (const [i, o] of [others[2], others[3], others[4]].entries()) {
      fake.docs[`resonanceTaps/card1_${o}`] = { cardId: 'card1', userId: o, on: true, at: ts(T0 + i * 1000), rangAt: null };
    }
    const card = await ctx.data.taps.visibleCard(ME, 'card1');
    let faces: string[] = [];
    const n = await cost(fake, async () => {
      faces = (await cardTapIn(ctx, ME, card, { pass: false }))!.faces.map((f) => f.handle);
    });
    expect(faces).toEqual(['Person4', 'Person3', 'Person2']);
    expect(n).toBeLessThanOrEqual(MAX.cardTapReader);
  });

  it('a card page signed in, with every list it may show', async () => {
    const { fake, ctx } = seeded();
    const n = await cost(fake, () => getCardDetail(ctx, ME, 'card1', new Set(['resonances', 'related', 'links', 'embeds'] as const)));
    expect(n).toBeLessThanOrEqual(MAX.cardDetail);
  });
});

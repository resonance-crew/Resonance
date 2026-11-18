import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { fakeAdminDb } from '../../../test/fakeAdminDb';
import {
  BELL_TAP_CAPABILITY,
  TAP_NOTE_WINDOW_MS,
  TAP_ROW_MAX,
  everyAppDraws,
  noteRidesTap,
  purgeTapRows,
  pushTap,
  ringTap,
  tapBellId,
  tapCollapseKey,
  tapText,
  untapBell,
  withTapper,
  withoutTapper,
} from './tapBell';
import { pushRoute, pushText, type PushSender } from './send';

// What a resonance tap tells the card's author (round 26 §R2): one ring per
// reader and card, ever; the day's bell row gathering the day's readers —
// only for an author whose every app build draws it —; a push for everyone,
// worded by the server, opening the card, under the card's collapse id; and
// silence across a block, on an anonymous card as on a named one.

const NOW = Date.parse('2026-11-19T10:00:00Z');
const ago = (min: number) => Timestamp.fromMillis(NOW - min * 60_000);
const profile = (id: string) => ({ handle: id, handleLower: id });
const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'bob', thoughtCore: 'A walk', story: 's', tags: [], visibility: 'public', anonymous: false, publishedAt: ago(60 * 24), ...extra,
});
const on = (cardId: string, uid: string, extra: Record<string, unknown> = {}) => ({
  [`resonanceTaps/${cardId}_${uid}`]: { cardId, userId: uid, on: true, at: ago(1), rangAt: null, ...extra },
});

function world(more: Record<string, Record<string, unknown>> = {}) {
  return fakeAdminDb({
    ...Object.fromEntries(['alice', 'bob', 'carol'].map((id) => [`users/${id}`, profile(id)])),
    'cards/walk': card(),
    'cards/masked': card({ anonymous: true }),
    ...more,
  });
}

/** Records every multicast. */
function fakeFcm() {
  const sent: MulticastMessage[] = [];
  const sender: PushSender = {
    async sendEachForMulticast(message) {
      sent.push(message);
      const responses = message.tokens.map((t) => ({ success: true, messageId: `m-${t}` })) as BatchResponse['responses'];
      return { responses, successCount: responses.length, failureCount: 0 };
    },
  };
  return { sender, sent };
}

/** A row's readers, as stored. */
const readersOf = (row: Record<string, unknown> | undefined) => (row?.payload as { fromUserIds?: unknown } | undefined)?.fromUserIds;

const device = (id: string, locale: string, capabilities: string[] = [BELL_TAP_CAPABILITY]) => ({
  [`devices/${id}`]: { userId: 'bob', token: `t-${id}`, platform: 'ios', locale, capabilities },
});

describe('ringTap', () => {
  it("rings once ever: marks the tap, and opens the day's row — read again by every later ring that day, newest first", async () => {
    const { db, docs } = world({ ...on('walk', 'alice'), ...on('walk', 'carol') });
    expect(await ringTap(db, 'alice', 'walk', NOW)).toEqual({ to: 'bob', handle: 'alice', notificationId: tapBellId('walk', NOW), others: 0 });
    expect(tapBellId('walk', NOW)).toBe('rtap_walk_20261119');
    expect(docs['resonanceTaps/walk_alice'].rangAt).toEqual(Timestamp.fromMillis(NOW));
    expect(docs['notifications/rtap_walk_20261119']).toEqual({
      userId: 'bob',
      type: 'resonance_tap',
      payload: { cardId: 'walk', fromUserIds: ['alice'] },
      readAt: null,
      createdAt: Timestamp.fromMillis(NOW),
      pushedAt: Timestamp.fromMillis(NOW),
    });
    docs['notifications/rtap_walk_20261119'].readAt = ago(0);
    expect(await ringTap(db, 'carol', 'walk', NOW + 60_000)).toMatchObject({ handle: 'carol', others: 1 });
    expect(docs['notifications/rtap_walk_20261119']).toMatchObject({
      payload: { cardId: 'walk', fromUserIds: ['carol', 'alice'] },
      readAt: null,
      createdAt: Timestamp.fromMillis(NOW + 60_000),
    });
    // Never twice for the same reader and card.
    expect(await ringTap(db, 'alice', 'walk', NOW + 120_000)).toBeNull();
    // Another day, another row.
    docs['resonanceTaps/walk_carol'].rangAt = null;
    expect(await ringTap(db, 'carol', 'walk', NOW + 24 * 3600_000)).toMatchObject({ notificationId: 'rtap_walk_20261120', others: 0 });
  });

  it('marks a row on an anonymous card so, and opens it the same — named to its author, the author named to no one', async () => {
    const { db, docs } = world(on('masked', 'alice'));
    expect(await ringTap(db, 'alice', 'masked', NOW)).toMatchObject({ to: 'bob', handle: 'alice' });
    expect(docs['notifications/rtap_masked_20261119'].payload).toEqual({ cardId: 'masked', fromUserIds: ['alice'], anonymous: true });
    expect(pushRoute('resonance_tap', { cardId: 'masked', anonymous: true, fromUserId: 'alice', fromHandle: 'alice' })).toBe('/card/masked');
  });

  it('rings no one across a block either way — on an anonymous card as on a named one — nor for a tap taken back, nor a card gone', async () => {
    for (const block of ['users/alice/blocks/bob', 'users/bob/blocks/alice']) {
      for (const id of ['walk', 'masked']) {
        const { db, docs } = world({ ...on(id, 'alice'), [block]: { blockedUid: 'x' } });
        expect(await ringTap(db, 'alice', id, NOW), `${block} ${id}`).toBeNull();
        expect(docs[`resonanceTaps/${id}_alice`].rangAt).toBeNull();
        expect(Object.keys(docs).some((p) => p.startsWith('notifications/'))).toBe(false);
      }
    }
    const { db, docs } = world({ ...on('walk', 'alice', { on: false }), ...on('masked', 'alice') });
    expect(await ringTap(db, 'alice', 'walk', NOW)).toBeNull();
    docs['cards/masked'].trashedAt = ago(0);
    expect(await ringTap(db, 'alice', 'masked', NOW)).toBeNull();
    expect(await ringTap(db, 'alice', 'nope', NOW)).toBeNull();
  });

  it("writes the row only when every app build of the author's draws it (none at all: the web alone, yes) — the ring goes either way", async () => {
    const old = world({ ...on('walk', 'alice'), ...device('new', 'en'), ...device('old', 'en', ['chat-push']) });
    expect(await ringTap(old.db, 'alice', 'walk', NOW)).toEqual({ to: 'bob', handle: 'alice', notificationId: null, others: 0 });
    expect(Object.keys(old.docs).some((p) => p.startsWith('notifications/'))).toBe(false);
    expect(old.docs['resonanceTaps/walk_alice'].rangAt).toEqual(Timestamp.fromMillis(NOW));
    const fresh = world({ ...on('walk', 'alice'), ...device('new', 'en') });
    expect((await ringTap(fresh.db, 'alice', 'walk', NOW))!.notificationId).toBe('rtap_walk_20261119');
    expect(everyAppDraws([], BELL_TAP_CAPABILITY)).toBe(true);
  });

  it(`keeps at most ${TAP_ROW_MAX} readers in a row, newest first, each once`, () => {
    const many = Array.from({ length: TAP_ROW_MAX + 5 }, (_, i) => `r${i}`);
    expect(withTapper(many, 'new')).toEqual(['new', ...many.slice(0, TAP_ROW_MAX - 1)]);
    expect(withTapper(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(withoutTapper(['a', 'b', 7], 'a')).toEqual(['b']);
  });
});

describe('untapBell', () => {
  it('takes a reader who took their tap back out of the row their ring wrote, and deletes a row left with no one', async () => {
    const { db, docs } = world({ ...on('walk', 'alice'), ...on('walk', 'carol') });
    await ringTap(db, 'alice', 'walk', NOW);
    await ringTap(db, 'carol', 'walk', NOW + 1000);
    docs['resonanceTaps/walk_alice'].on = false;
    await untapBell(db, 'alice', 'walk');
    expect(docs['notifications/rtap_walk_20261119'].payload).toEqual({ cardId: 'walk', fromUserIds: ['carol'] });
    // Tapped on again since: left where the ring put them.
    docs['resonanceTaps/walk_carol'].on = true;
    await untapBell(db, 'carol', 'walk');
    expect(readersOf(docs['notifications/rtap_walk_20261119'])).toEqual(['carol']);
    docs['resonanceTaps/walk_carol'].on = false;
    await untapBell(db, 'carol', 'walk');
    expect(docs['notifications/rtap_walk_20261119']).toBeUndefined();
  });
});

describe('purgeTapRows', () => {
  it("takes a purged reader out of every row naming them, deleting a row they alone were in", async () => {
    const { db, docs } = world({
      'notifications/rtap_walk_20261118': { userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['carol', 'alice'] } },
      'notifications/rtap_masked_20261118': { userId: 'bob', type: 'resonance_tap', payload: { cardId: 'masked', fromUserIds: ['alice'], anonymous: true } },
      'notifications/other': { userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['carol'] } },
    });
    expect(await purgeTapRows(db, 'alice')).toBe(2);
    expect(readersOf(docs['notifications/rtap_walk_20261118'])).toEqual(['carol']);
    expect(docs['notifications/rtap_masked_20261118']).toBeUndefined();
    expect(readersOf(docs['notifications/other'])).toEqual(['carol']);
  });
});

describe('pushTap', () => {
  const ring = { to: 'bob', from: 'alice', cardId: 'walk', handle: '小安', notificationId: 'rtap_walk_20261119', others: 0 };

  it("says who in each device's language, opens the card by id — never a thread, no sender id — under the card's collapse id", async () => {
    const { db } = world({ ...device('a', 'zh-Hant'), ...device('b', 'en-US') });
    const fcm = fakeFcm();
    expect(await pushTap(db, fcm.sender, ring, NOW)).toEqual({ sent: 2, pruned: 0 });
    const byTitle = Object.fromEntries(fcm.sent.map((m) => [m.notification!.title, m]));
    expect(Object.keys(byTitle).sort()).toEqual(['小安 resonated with your card', '小安 與你的卡片共振了']);
    const zh = byTitle['小安 與你的卡片共振了'];
    expect(zh.data).toEqual({ type: 'resonance_tap', cardId: 'walk', route: '/card/walk', notificationId: 'rtap_walk_20261119' });
    expect(zh.android).toEqual({ notification: { channelId: 'activity', tag: 'rtap_walk' } });
    expect(zh.apns).toEqual({ headers: { 'apns-collapse-id': 'rtap_walk' }, payload: { aps: { sound: 'default', threadId: 'resonance_tap' } } });
  });

  it('names the others of the day\'s row, and carries no notification id without a row behind it', async () => {
    const { db } = world(device('a', 'en'));
    const fcm = fakeFcm();
    await pushTap(db, fcm.sender, { ...ring, others: 2, notificationId: null }, NOW);
    expect(fcm.sent[0].notification!.title).toBe('小安 and 2 others resonated with your card');
    expect(fcm.sent[0].data).toEqual({ type: 'resonance_tap', cardId: 'walk', route: '/card/walk' });
    expect(tapText('en', 'Ann', 1)).toBe('Ann and 1 other resonated with your card');
    expect(tapText('zh-TW', '小安', 2)).toBe('小安 和另外 2 人與你的卡片共振了');
  });

  it('stays silent for someone who turned 有人共振 off, and when the reader left a note on the card just before', async () => {
    const off = world({ ...device('a', 'en'), 'notificationSettings/bob': { resonanceTaps: false } });
    const fcm = fakeFcm();
    expect(await pushTap(off.db, fcm.sender, ring, NOW)).toBeNull();
    const noted = world({
      ...device('a', 'en'),
      'notes/n1': { cardId: 'walk', fromUserId: 'alice', toUserId: 'bob', text: 'hi', createdAt: Timestamp.fromMillis(NOW - TAP_NOTE_WINDOW_MS + 1000) },
    });
    expect(await pushTap(noted.db, fcm.sender, ring, NOW)).toBeNull();
    expect(fcm.sent).toEqual([]);
    const later = world({
      ...device('a', 'en'),
      'notes/n1': { cardId: 'walk', fromUserId: 'alice', toUserId: 'bob', text: 'hi', createdAt: Timestamp.fromMillis(NOW - TAP_NOTE_WINDOW_MS - 1000) },
    });
    expect(await pushTap(later.db, fcm.sender, ring, NOW)).toEqual({ sent: 1, pruned: 0 });
  });

  it('sends nothing, and needs no FCM, for someone with no devices', async () => {
    const { db } = world();
    expect(await pushTap(db, { sendEachForMulticast: () => Promise.reject(new Error('no')) }, ring, NOW)).toEqual({ sent: 0, pruned: 0 });
  });
});

describe('a note riding a tap', () => {
  it("gives a note left within ten minutes of its writer's tap ringing the tap's collapse id, and none after", async () => {
    const { db } = world(on('walk', 'alice', { rangAt: Timestamp.fromMillis(NOW) }));
    expect(await noteRidesTap(db, 'alice', 'walk', NOW + TAP_NOTE_WINDOW_MS)).toBe('rtap_walk');
    expect(await noteRidesTap(db, 'alice', 'walk', NOW + TAP_NOTE_WINDOW_MS + 1)).toBeNull();
    expect(await noteRidesTap(db, 'carol', 'walk', NOW)).toBeNull();
    expect(tapCollapseKey('x'.repeat(70))).toBeNull();
  });
});

describe("the bell's other senders", () => {
  it('route a resonance tap and a read summary to the card, and word them from the bell', () => {
    expect(pushRoute('read_summary', { cardId: 'walk' })).toBe('/card/walk');
    expect(pushText('zh-TW', 'resonance_tap', { fromHandle: '小安' })).toEqual({ title: '小安 與你的卡片共振了' });
    expect(pushText('en', 'read_summary', { readers: 4 })).toEqual({ title: '4 people read this card to the end last week' });
  });
});

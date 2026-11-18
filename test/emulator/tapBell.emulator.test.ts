import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { setTap } from '@/lib/api/v1/taps';
import { registerDevice } from '@/lib/push/devices';
import { updateNotificationSettings } from '@/lib/push/settings';
import { BELL_TAP_CAPABILITY, purgeTapRows, pushTap, ringTap, tapBellId, untapBell } from '@/lib/push/tapBell';
import type { PushSender } from '@/lib/push/send';

// What a resonance tap tells its author (round 26 §R2) against the Firestore
// emulator: the day's row gathering that day's readers, a reader leaving it
// as they take their tap back (and the row going with its last one), the row
// held from an author whose app build would draw its type as a raw string —
// the push going all the same —, the 有人共振 switch, and the account purge's
// way out of a row naming several (array-contains, then out of the array).

const PROJECT = 'demo-resonance-tap-bell';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'tap-bell-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    ...['alice', 'bob', 'carol', 'dora'].map((id) => set(`users/${id}`, { handle: id, handleLower: id })),
    set('cards/walk', {
      authorId: 'bob', thoughtCore: 'A walk', story: 's', tags: [], visibility: 'public', anonymous: false,
      publishedAt: Timestamp.fromMillis(Date.now() - 86_400_000),
    }),
  ]);
});

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

const tapAndRing = async (uid: string, now = Date.now()) => {
  await setTap(db, uid, 'walk', true, now);
  return ringTap(db, uid, 'walk', now);
};
const row = async (id: string) => (await db.doc(`notifications/${id}`).get()).data();

describe("the day's row", () => {
  it('gathers the day\'s readers newest first, loses each who takes their tap back, and goes with the last one', async () => {
    const now = Date.now();
    const id = tapBellId('walk', now);
    await tapAndRing('alice', now);
    await tapAndRing('carol', now + 1);
    expect(await row(id)).toMatchObject({ userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['carol', 'alice'] } });
    await setTap(db, 'alice', 'walk', false);
    await untapBell(db, 'alice', 'walk');
    expect((await row(id))!.payload.fromUserIds).toEqual(['carol']);
    await setTap(db, 'carol', 'walk', false);
    await untapBell(db, 'carol', 'walk');
    expect(await row(id)).toBeUndefined();
  });

  it("is held from an author with an app build that doesn't draw it — whose phone is still told — and written once every build does", async () => {
    await registerDevice(db, 'bob', 'install-old-0001', { token: 'old', platform: 'android', locale: 'zh-TW', capabilities: ['chat-push'] });
    const rang = await tapAndRing('alice');
    expect(rang).toMatchObject({ notificationId: null });
    expect((await db.collection('notifications').get()).empty).toBe(true);
    const fcm = fakeFcm();
    expect(await pushTap(db, fcm.sender, { ...rang!, from: 'alice', cardId: 'walk' })).toEqual({ sent: 1, pruned: 0 });
    expect(fcm.sent[0]).toMatchObject({ notification: { title: 'alice 與你的卡片共振了' }, data: { type: 'resonance_tap', route: '/card/walk' } });
    expect(fcm.sent[0].data).not.toHaveProperty('notificationId');
    await registerDevice(db, 'bob', 'install-old-0001', { token: 'old', platform: 'android', locale: 'zh-TW', capabilities: ['chat-push', BELL_TAP_CAPABILITY] });
    expect(await tapAndRing('carol')).toMatchObject({ notificationId: expect.stringMatching(/^rtap_walk_\d{8}$/) });
  });

  it('pushes nothing once its author turns 有人共振 off, and again once they turn it back on', async () => {
    await registerDevice(db, 'bob', 'install-new-0001', { token: 'new', platform: 'ios', locale: 'en', capabilities: [BELL_TAP_CAPABILITY] });
    await updateNotificationSettings(db, 'bob', { resonanceTaps: false });
    const fcm = fakeFcm();
    const rang = await tapAndRing('alice');
    expect(await pushTap(db, fcm.sender, { ...rang!, from: 'alice', cardId: 'walk' })).toBeNull();
    // The row is the record either way.
    expect((await db.collection('notifications').get()).size).toBe(1);
    await updateNotificationSettings(db, 'bob', { resonanceTaps: true });
    const again = await tapAndRing('carol');
    expect(await pushTap(db, fcm.sender, { ...again!, from: 'carol', cardId: 'walk' })).toEqual({ sent: 1, pruned: 0 });
    expect(fcm.sent[0].notification!.title).toBe('carol and 1 other resonated with your card');
  });
});

describe('the account purge', () => {
  it("takes a purged reader out of every row naming them, deleting a row they alone were in", async () => {
    await set('notifications/rtap_walk_20261118', { userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['carol', 'alice'] } });
    await set('notifications/rtap_walk_20261117', { userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['alice'] } });
    await set('notifications/rtap_walk_20261116', { userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['dora'] } });
    expect(await purgeTapRows(db, 'alice')).toBe(2);
    expect((await row('rtap_walk_20261118'))!.payload.fromUserIds).toEqual(['carol']);
    expect(await row('rtap_walk_20261117')).toBeUndefined();
    expect((await row('rtap_walk_20261116'))!.payload.fromUserIds).toEqual(['dora']);
  });
});

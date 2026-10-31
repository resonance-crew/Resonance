/**
 * Seed the local Firebase emulators with a small, known world for manual and
 * browser testing (`npm run emulators`, then `npx tsx scripts/seed-emulator.ts`).
 *
 * Two connected people (Alice, Bob) with cards, a conversation, a
 * stranger (Carol), and a newcomer with no cards yet (Dora — the write
 * page's first-card guide shows for her). The accounts exist only in the Auth emulator of the
 * `demo-resonance` project; the password below is a local test value.
 * In the browser (dev:emulator), sign in from devtools with:
 *   await window.__emulatorSignIn('alice@resonance.test')
 */
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';

export const SEED_PASSWORD = 'resonance-emulator-pw';

export const SEED_USERS = [
  { uid: 'alice', handle: 'alice', email: 'alice@resonance.test', accent: 'oklch(88% 0.08 55)' },
  { uid: 'bob', handle: 'bob', email: 'bob@resonance.test', accent: 'oklch(90% 0.06 140)' },
  { uid: 'carol', handle: 'carol', email: 'carol@resonance.test', accent: 'oklch(90% 0.05 290)' },
  { uid: 'dora', handle: 'dora', email: 'dora@resonance.test', accent: 'oklch(90% 0.05 215)' },
] as const;

async function main() {
  Object.assign(process.env, emulatorEnv);
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

  const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'seed');
  const auth = getAuth(app);
  const db = getFirestore(app);
  // SEED_RESET=1 empties the database first, so nothing a flow wrote (a connection, a bookmark, a sent message) outlives
  // the next seed. The visual harness's private emulators only: never the shared ones by default.
  if (process.env.SEED_RESET === '1') {
    // The emulator now and then cancels a delete while a client's listener is open: try again.
    for (let attempt = 1; ; attempt++) {
      try {
        for (const collection of await db.listCollections()) await db.recursiveDelete(collection);
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  // SEED_NOW (an ISO time) pins the world's clock: the release screenshots
  // (scripts/visual) seed one fixed day, so no date on a screen moves between runs.
  const now = process.env.SEED_NOW ? Date.parse(process.env.SEED_NOW) : Date.now();
  const at = (minutesAgo: number) => Timestamp.fromMillis(now - minutesAgo * 60_000);

  for (const u of SEED_USERS) {
    await auth.deleteUser(u.uid).catch(() => {});
    await auth.createUser({ uid: u.uid, email: u.email, password: SEED_PASSWORD, emailVerified: true });
    await db.doc(`users/${u.uid}`).set({
      handle: u.handle,
      handleLower: u.handle,
      bio: `${u.handle} 的測試帳號`,
      region: 'TW',
      primaryLocale: 'zh-TW',
      autoTranslateTo: ['en'],
      verified: true,
      phoneHash: '',
      avatarSeed: String(u.handle.charCodeAt(0) * 7),
      initials: u.handle.slice(0, 2).toUpperCase(),
      accentColor: u.accent,
      joinedAt: at(60 * 24 * 30),
      handleChangedAt: at(60 * 24 * 30),
    });
    // The pen name's reservation, as the profile writes keep it (lib/db/firestore/handles).
    await db.doc(`handles/${u.handle.toLowerCase()}`).set({ uid: u.uid, handle: u.handle, reservedAt: at(60 * 24 * 30) });
  }

  const card = (id: string, authorId: string, thoughtCore: string, story: string, minutesAgo: number, hue: number) =>
    db.doc(`cards/${id}`).set({
      authorId,
      slug: id,
      thoughtCore,
      story,
      tags: ['日常', '散步'],
      originalLocale: 'zh-TW',
      translations: {},
      visibility: 'public',
      publishedAt: at(minutesAgo),
      readCount: 0,
      resonanceCount: 0,
      inviteCount: 0,
      accentHue: hue,
      anonymous: false,
    });

  await card(
    'rain-walk',
    'bob',
    '一場雨後的散步',
    '雨停的時候，巷口的積水映出整排路燈。\n\n我突然想起小時候，也是這樣踩著水窪回家。',
    30,
    215,
  );
  await card(
    'first-coffee',
    'bob',
    '第一杯自己沖的咖啡',
    '水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。',
    90,
    55,
  );
  await card(
    'letter',
    'alice',
    '寫給十年前的自己',
    '你以為的失敗，後來都變成了轉彎的地方。',
    120,
    18,
  );
  await card('carol-note', 'carol', '陌生人的一句話', '在車站有人對我說辛苦了，那天就被接住了。', 200, 140);
  // Published anonymously: only carol's own browser may read its document (it names her).
  await card('unsigned-letter', 'carol', '一封沒有署名的信', '有些話，只有不署名才說得出口。\n\n謝謝那年冬天，借我一把傘的人。', 60, 300);
  await db.doc('cards/unsigned-letter').update({ anonymous: true });
  // Every kind of content a story can hold, for checking readers (web and apps) side by side.
  await card(
    'rich-story',
    'alice',
    '搬家後的第一個安靜夜晚',
    [
      '箱子堆滿了客廳，我坐在地上，第一次覺得**安靜是屬於自己的**。窗外有人在*慢慢地*收衣服。',
      '## 那些帶不走的東西',
      '有些東西在打包的時候就決定留下了：舊沙發、一面有裂痕的鏡子，還有 [一篇讀過很多次的文章](https://example.com/essay)。',
      '> 你不是失去了一個家，\n> 你是多了一個可以回去的地方。',
      '\u00A0',
      '### 清單',
      '- 把書按照顏色排好\n- 在窗台放一盆薄荷\n- 寫信給十年前的自己',
      '1. 先睡一覺\n2. 再說',
      '延伸閱讀：',
      '[一場雨後的散步](/card/rain-walk)',
      '也可以看看 [第一杯自己沖的咖啡](/card/first-coffee) 這張，寫得很溫柔。',
      '---',
      'The quiet after moving out felt like mine — *finally*.',
    ].join('\n\n'),
    45,
    290,
  );

  // alice resonated with bob's walk, and keeps a draft.
  await db.doc('cards/alice-reply').set({
    authorId: 'alice', slug: 'alice-reply', thoughtCore: '我也在雨裡走過', story: '讀完那篇散步，我想起高中放學的那條路。',
    tags: ['回應'], originalLocale: 'zh-TW', translations: {}, visibility: 'public', publishedAt: at(25),
    readCount: 0, resonanceCount: 0, inviteCount: 0, accentHue: 140, referenceCardId: 'rain-walk', anonymous: false,
  });
  await db.doc('cards/alice-draft').set({
    authorId: 'alice', thoughtCore: '還沒寫完的清晨', story: '五點的街道很安靜，', tags: [], originalLocale: 'zh-TW',
    translations: {}, visibility: 'public', publishedAt: null, updatedAt: at(15), readCount: 0, resonanceCount: 0, inviteCount: 0,
    anonymous: false,
  });

  // alice's thought map: a region holding two of her cards, bob's walk she resonated with, one labelled arrow
  // (written over a clean map — and without seed-thought-map-bench.ts's hundred cards, if it ran).
  const map = db.doc('thoughtMaps/alice');
  await db.recursiveDelete(map);
  const bench = await db.collection('cards').where('authorId', '==', 'alice').get();
  await Promise.all(bench.docs.filter((d) => d.id.startsWith('bench-')).map((d) => d.ref.delete()));
  const node = (cardId: string, x: number, y: number, groupId: string | null) =>
    map.collection('nodes').doc(cardId).set({ cardId, x, y, groupId, createdAt: at(60), updatedAt: at(60) });
  await map.collection('groups').doc('g-memory').set({ title: '回憶', hue: 88, x: -40, y: -70, w: 560, h: 300, createdAt: at(60) });
  await node('letter', 0, 0, 'g-memory');
  await node('rich-story', 272, 20, 'g-memory');
  await node('rain-walk', 130, 330, null);
  await map.collection('edges').doc('rain-walk_letter').set({ sourceCardId: 'rain-walk', targetCardId: 'letter', label: '後來', createdAt: at(60) });

  await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: at(60 * 24) });
  await db.doc('conversations/alice_bob').set({
    participants: ['alice', 'bob'],
    createdAt: at(60),
    updatedAt: at(5),
    // bob's note on her letter (below) is the newest: read already, so no screen's badge depends on which screen came first.
    lastMessage: { text: '你的信讓我想起我自己的十年前。', senderId: 'bob', sentAt: at(5) },
    unread: { alice: 0, bob: 1 },
  });
  // A thread showing what a message can be: reactions, a sticker, a reply, an unsent one, a note on a card.
  const thread = (id: string, data: Record<string, unknown>) => db.doc(`conversations/alice_bob/messages/${id}`).set(data);
  await thread('m1', { senderId: 'bob', text: '嗨，謝謝你的共振！', sentAt: at(20), reactions: { alice: 'heart' } });
  await thread('m1-sticker', { senderId: 'bob', text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' }, sentAt: at(19) });
  await thread('m1-reply', {
    senderId: 'alice', text: '不客氣，那篇真的寫到我心裡了', sentAt: at(15),
    replyTo: { id: 'm1', senderId: 'bob', text: '嗨，謝謝你的共振！' }, reactions: { bob: 'hug' },
  });
  await thread('m1-unsent', { senderId: 'bob', sentAt: at(12), unsentAt: at(11) });
  await thread('m2', { senderId: 'alice', text: '那篇雨後散步寫得好好', sentAt: at(10) });
  // Between two connected people a note is also a message in their thread (its own id), quoting the card it was left on.
  await db.doc('notes/n-bob-letter').set({
    cardId: 'letter', fromUserId: 'bob', toUserId: 'alice', text: '你的信讓我想起我自己的十年前。', readAt: at(4), createdAt: at(5),
  });
  await thread('n-bob-letter', { senderId: 'bob', text: '你的信讓我想起我自己的十年前。', sentAt: at(5), cardRef: 'letter', kind: 'note' });

  // carol (not connected to alice) left a note on alice's rich story: a letter, waiting for alice's answer.
  await db.doc('notes/n-carol-letter').set({
    cardId: 'rich-story', fromUserId: 'carol', toUserId: 'alice', text: '讀到搬家那段，好像看見自己。', readAt: null, createdAt: at(50),
  });
  await db.doc('conversations/alice_carol').set({
    participants: ['alice', 'carol'],
    createdAt: at(50),
    updatedAt: at(50),
    lastMessage: { text: '讀到搬家那段，好像看見自己。', senderId: 'carol', sentAt: at(50) },
    unread: { alice: 0, carol: 0 },
    request: { from: 'carol', cardId: 'rich-story', at: at(50), count: 1 },
  });
  await db.doc('conversations/alice_carol/messages/n-carol-letter').set({
    senderId: 'carol', text: '讀到搬家那段，好像看見自己。', sentAt: at(50), cardRef: 'rich-story', kind: 'note',
  });
  await db.doc('letters/carol_alice').set({ from: 'carol', to: 'alice', count: 1, cardId: 'rich-story', at: at(50) });

  // A card alice moved to the trash three days ago (public before): its page says so and offers 還原. By the real
  // clock, not SEED_NOW: the trash forgets a card 30 days on (and the days left stay the same from run to run).
  await db.doc('cards/old-poem').set({
    authorId: 'alice', slug: 'old-poem', thoughtCore: '一首沒寫完的詩', story: '月亮掉進杯子裡，\n我沒有喝。',
    tags: ['詩'], originalLocale: 'zh-TW', translations: {}, visibility: 'private', publishedAt: at(60 * 24 * 10),
    readCount: 0, resonanceCount: 0, inviteCount: 0, accentHue: 250, anonymous: false,
    trashedAt: Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60_000), trashedFrom: { visibility: 'public', referenceCardId: null },
  });

  // alice's notifications: one of each kind the apps route (unread first).
  const notify = (id: string, type: string, payload: Record<string, unknown>, minutesAgo: number, read = false) =>
    db.doc(`notifications/${id}`).set({ userId: 'alice', type, payload, readAt: read ? at(minutesAgo - 1) : null, createdAt: at(minutesAgo) });
  await notify('n-note', 'note', { fromUserId: 'bob', fromHandle: 'bob', noteId: 'n-bob-letter', preview: '你的信讓我想起我自己的十年前。', cardId: 'letter' }, 5);
  await notify('n-resonance', 'resonance', { fromUserId: 'bob', fromHandle: 'bob', cardId: 'letter' }, 40);
  await notify('n-link', 'card_link', { fromUserId: 'carol', fromHandle: 'carol', cardId: 'carol-note' }, 90, true);
  // carol's letter (above), unread; and bob's first message, which opened their conversation (its row read since).
  await notify('n-carol-note', 'note', {
    fromUserId: 'carol', fromHandle: 'carol', noteId: 'n-carol-letter', preview: '讀到搬家那段，好像看見自己。', cardId: 'rich-story',
  }, 50);
  await notify('n-message', 'message', { fromUserId: 'bob', fromHandle: 'bob', preview: '嗨，謝謝你的共振！' }, 20, true);

  console.log(`Seeded ${SEED_USERS.length} users into ${EMULATOR_PROJECT_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

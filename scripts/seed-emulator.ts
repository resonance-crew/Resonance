/**
 * Seed the local Firebase emulators with a small, known world for manual and
 * browser testing (`npm run emulators`, then `npx tsx scripts/seed-emulator.ts`).
 *
 * Two connected people (Alice, Bob) with cards, a conversation, a
 * stranger (Carol), and a newcomer with no cards yet (Dora — the write
 * page's first-card guide shows for her), connected to Alice. Four more
 * readers who never sign in (eli, fay — Alice's connections —, gus, hana)
 * resonated with cards (round 26's tap: their faces). The accounts exist only in the Auth emulator of the
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

/**
 * Empties the emulator's whole Firestore database at once (its own REST endpoint, some 60 ms): the reset a flow needs
 * between flows (SEED_RESET=1), which `recursiveDelete` of every collection did in seconds. Answers whether it did.
 */
export async function wipeFirestore(host = process.env.FIRESTORE_EMULATOR_HOST): Promise<boolean> {
  if (!host) return false;
  try {
    const res = await fetch(`http://${host}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The whole test world, into the emulators `process.env` names (EMULATOR_AUTH_PORT / EMULATOR_FIRESTORE_PORT, read
 * by emulator-env.mjs). Run as a script (`npx tsx scripts/seed-emulator.ts`), or called again and again by a process
 * that keeps it loaded (scripts/visual/seedServer.ts: every Maestro flow starts from a fresh world, and loading this
 * script and what it imports took a second or more of each).
 */
export async function seedWorld() {
  Object.assign(process.env, emulatorEnv);
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const { translationHash } = await import('../src/lib/api/v1/translationHash');
  const { summaryHash } = await import('../src/lib/api/v1/summaryTranslations');
  const { passagesHash, PASSAGES_VERSION } = await import('../src/lib/cards/tapPassages');
  const { RICH_STORY, RICH_STORY_TITLE, RICH_STORY_PASSAGES, RICH_STORY_EN, RICH_STORY_EN_TITLE, RICH_STORY_EN_PASSAGES } = await import('./seed/pinned');
  const { passagesSig } = await import('../src/lib/cards/translatedPassages');
  const { summarize } = await import('../src/lib/api/v1/summary');

  const app = getApps().find((a) => a.name === 'seed') ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'seed');
  const auth = getAuth(app);
  const db = getFirestore(app);
  // SEED_RESET=1 empties the database first, so nothing a flow wrote (a connection, a bookmark, a sent message) outlives
  // the next seed. The visual harness's private emulators only: never the shared ones by default.
  // Through the emulator's own endpoint at once; the old way when that can't be reached.
  if (process.env.SEED_RESET === '1' && !(await wipeFirestore())) {
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
    RICH_STORY_TITLE,
    RICH_STORY,
    45,
    290,
  );
  // Its tap passages (round 27 §V1), so the reader's dialog after 共振 has alice's own sentences to offer
  // (scripts/visual/screens.ts card-passages). Written here whatever the floor says: the story is the only seeded
  // one near it, and no new card moves the lists' baselines. PINNED (the owner, 2026-11-23: 「這種資料應該要把它固定
  // 下來，不能每次都叫 AI 重標」): the words are what passages v2's offline pick made of this story, written out, so a
  // later change to the pick never moves the screenshots — tapPassages.test.ts says when they drift from it.
  {
    const rich = (await db.doc('cards/rich-story').get()).data()!;
    const items = RICH_STORY_PASSAGES;
    await db.doc('cards/rich-story').update({ tapPassages: { of: passagesHash(rich.story), items, model: 'offline', v: PASSAGES_VERSION, at: at(45) } });
  }

  // A story in English (carol's), weeks old so it sits at the feed's end: the one a 繁體中文 reader can translate.
  await card(
    'bridge-rain',
    'carol',
    'Rain on the old bridge',
    'We stood on the old bridge and watched the rain move across the river.\n\nNobody said anything, and for once that was enough.',
    60 * 24 * 20,
    200,
  );

  // Translations (round 25 §F): no model answers against the emulators, so the two stories a reader can translate
  // carry what the server would have kept — bob's walk into English, carol's bridge into 繁體中文 — each for the card
  // exactly as seeded (its hash), and the feed card's translated title and excerpt beside it (summaryTranslations).
  const translated = async (id: string, to: 'en' | 'zh-TW', title: string, story: string, excerpt: string) => {
    const snap = await db.doc(`cards/${id}`).get();
    const [ownTitle, ownStory] = [String(snap.get('thoughtCore')), String(snap.get('story'))];
    await db.doc(`cards/${id}/translations/${to}`).set({ title, story, hash: translationHash(ownTitle, ownStory), model: 'seed', createdAt: at(10) });
    const of = summaryHash(ownTitle, summarize(ownStory).excerpt);
    await db.doc(`cards/${id}`).update({ summaryTranslations: { of, [to]: { title, excerpt } } });
  };
  // rich-story into English with its passages placed (round 31): what dora reads under 自動翻譯 in English — the
  // dialog after 共振 offers the translation's words, and the sentences readers picked are marked in it.
  await db.doc('cards/rich-story/translations/en').set({
    title: RICH_STORY_EN_TITLE,
    story: RICH_STORY_EN,
    hash: translationHash(RICH_STORY_TITLE, RICH_STORY),
    model: 'seed',
    createdAt: at(10),
    passages: { of: passagesSig(RICH_STORY_PASSAGES), items: RICH_STORY_EN_PASSAGES, at: at(10) },
  });
  await translated(
    'rain-walk',
    'en',
    'A walk after the rain',
    'When the rain stopped, the puddles at the end of the lane held a whole row of streetlights.\n\nI suddenly remembered being small, splashing through puddles like this on the way home.',
    'When the rain stopped, the puddles in the lane held a whole row of streetlights. I suddenly…',
  );
  await translated(
    'bridge-rain',
    'zh-TW',
    '舊橋上的雨',
    '我們站在舊橋上，看著雨從河面上移過去。\n\n誰都沒有說話，而那一次，這樣就夠了。',
    '我們站在舊橋上，看著雨從河面上移過去。誰都沒有說話，而那一次，這樣就夠了。',
  );

  // A cover framed off its centre (round 25 §G1, the `card-framed` screen): a picture stored as the emulators store one
  // (lib/storage/local: a folder this machine's dev server serves), its lamp far to the right, and the card's
  // media.frame looking at it — so every renderer shows the lamp, not the picture's empty middle.
  {
    const { localStorageRoot, LOCAL_STORAGE_PATH } = await import('../src/lib/storage/local');
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const sharp = (await import('sharp')).default;
    const key = 'cover/seed/harbour-lamp.webp';
    const storageBase = process.env.EMULATOR_DEV_PORT ? `http://localhost:${process.env.EMULATOR_DEV_PORT}${LOCAL_STORAGE_PATH}` : LOCAL_STORAGE_PATH;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f3d63"/><stop offset="1" stop-color="#d98b6a"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#sky)"/>
      <rect y="640" width="1600" height="260" fill="#26324f"/>
      <rect x="1290" y="330" width="26" height="330" fill="#1b2238"/>
      <circle cx="1303" cy="318" r="62" fill="#ffd98a"/>
      <circle cx="1303" cy="318" r="130" fill="#ffd98a" opacity="0.25"/>
      <rect x="1180" y="660" width="250" height="18" fill="#ffd98a" opacity="0.5"/>
    </svg>`;
    const path = join(localStorageRoot(), key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer());
    await card('harbour-lamp', 'alice', '港邊的那盞燈', '每次加班回家，港邊那盞燈都還亮著。\n\n它不知道我是誰，可是它一直在那裡。', 60 * 24 * 25, 30);
    await db.doc('cards/harbour-lamp').update({
      // at the address the dev server serves the stand-in's pictures (EMULATOR_DEV_PORT: the harness's port, a lane's),
      // as an upload against the emulators is stored — the apps load no path without a host (round 25: both showed an
      // empty cover); with no port given, a path of whatever site reads it, which the web alone resolves
      media: { type: 'image', url: `${storageBase}/${key}`, label: '港邊的燈', frame: { cx: 0.8, cy: 0.42, zoom: 1.35, ar: 1600 / 900 } },
    });
  }

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

  // Round 26 (§V3): who resonated (共振, the tap — resonanceTaps, lib/api/v1/taps). alice is connected to bob, dora and
  // two readers who never sign in (eli, fay: profiles only); carol stays a stranger to her (her letter waits) and so
  // do gus and hana. On bob's walk, alice sees the faces of the connections who tapped — dora, eli, fay (her own
  // first, and a blank disc after three, once she taps too) — and bob sees them all with carol. On alice's rich story
  // strangers and bob tapped, carol among them with the note she left there. Each rang already (rangAt), and no
  // bell row is seeded: the installed apps would draw its type as a raw string, and alice's bell screen stays as it was.
  const readers = [
    { uid: 'eli', accent: 'oklch(90% 0.05 160)' },
    { uid: 'fay', accent: 'oklch(90% 0.05 20)' },
    { uid: 'gus', accent: 'oklch(90% 0.05 250)' },
    { uid: 'hana', accent: 'oklch(90% 0.05 330)' },
  ];
  for (const r of readers) {
    await db.doc(`users/${r.uid}`).set({
      handle: r.uid, handleLower: r.uid, bio: `${r.uid} 的測試帳號`, region: 'TW', primaryLocale: 'zh-TW', verified: false,
      avatarSeed: String(r.uid.charCodeAt(0) * 7), initials: r.uid.slice(0, 2).toUpperCase(), accentColor: r.accent,
      joinedAt: at(60 * 24 * 20), handleChangedAt: at(60 * 24 * 20),
    });
    await db.doc(`handles/${r.uid}`).set({ uid: r.uid, handle: r.uid, reservedAt: at(60 * 24 * 20) });
  }
  for (const other of ['dora', 'eli', 'fay']) {
    await db.doc(`connections/alice_${other}`).set({ userIds: ['alice', other], establishedAt: at(60 * 24 * 3) });
  }
  const tapped = (cardId: string, uid: string, minutesAgo: number) =>
    db.doc(`resonanceTaps/${cardId}_${uid}`).set({ cardId, userId: uid, on: true, at: at(minutesAgo), rangAt: at(minutesAgo) });
  for (const [uid, m] of [['dora', 8], ['carol', 12], ['eli', 18], ['fay', 22]] as const) await tapped('rain-walk', uid, m);
  for (const [uid, m] of [['gus', 9], ['carol', 48], ['hana', 30], ['bob', 35]] as const) await tapped('rich-story', uid, m);
  // Their picks among its passages (round 27 §V1; taps-author-list): gus and bob the first, carol the second (her note
  // shows under it), hana none.
  {
    const items = ((await db.doc('cards/rich-story').get()).get('tapPassages.items') ?? []) as { id: string; text: string }[];
    for (const [uid, i] of [['gus', 0], ['carol', 1], ['bob', 0]] as const) {
      if (items[i]) await db.doc(`resonanceTaps/rich-story_${uid}`).update({ passage: items[i] });
    }
  }
  // The end row's screens (round 26 §V4, scripts/visual/screens.ts card-tapped, card-note-open, taps-list): alice
  // resonated with bob's first coffee, after her connections dora, eli and fay — her face first, then dora's and
  // eli's, a blank disc for fay. (bob's walk stays untapped by her: the tap flows tap it there.)
  for (const [uid, m] of [['alice', 6], ['dora', 14], ['eli', 26], ['fay', 40]] as const) await tapped('first-coffee', uid, m);
  // card-note-wait: dora left carol three notes she hasn't answered, so on carol's named cards dora may leave no
  // more until she does (CardDetail.tap.mayNote false; letters/*, lib/api/v1/conversations).
  await db.doc('letters/dora_carol').set({ from: 'dora', to: 'carol', count: 3, at: at(70), cardId: 'carol-note' });

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

  // Round 26 (§V3, §A1.9): every published card read as the emulators read one — the fixed offline reading and
  // vectors derived from the card's id (lib/recommend/offline), as indexCard writes them with no model to ask — so
  // the emulator's picks, cold start, related cards and landing film have a pool to work with.
  await seedReadings(db);

  // SEED_PICKS=none (the release screenshots, scripts/visual/stack.ts): nobody has picks or gets any built, so home
  // shows the latest cards on every platform and run (scripts/visual/noPicks.ts says why). Manual testing keeps picks.
  if (process.env.SEED_PICKS === 'none') {
    const { noPicks } = await import('./visual/noPicks');
    for (const u of SEED_USERS) await db.doc(`recommendations/${u.uid}`).set(noPicks());
  }

  console.log(`Seeded ${SEED_USERS.length} users into ${EMULATOR_PROJECT_ID}.`);
}

/** The offline reading of every published card, and its parts' vectors (what indexCard writes under the emulators). */
async function seedReadings(db: import('firebase-admin/firestore').Firestore) {
  const { FieldValue } = await import('firebase-admin/firestore');
  const { offlineReading, offlineEmbedding, OFFLINE_MODEL } = await import('../src/lib/recommend/offline');
  const { listedForStrangers } = await import('../src/lib/recommend/signature');
  const { indexContentHash, INDEX_VERSION } = await import('../src/lib/recommend/indexCard');
  const { blankCard, thinCard } = await import('../src/lib/cards/blank');
  const { FirestoreVectorStore } = await import('../src/lib/recommend/vectorStore/firestore');
  const store = new FirestoreVectorStore(db);
  const cards = await db.collection('cards').get();
  for (const doc of cards.docs) {
    const card = doc.data();
    if (card.publishedAt == null) continue;
    const title = String(card.thoughtCore ?? '');
    const story = String(card.story ?? '');
    if (blankCard({ thoughtCore: title, story }) || thinCard({ thoughtCore: title, story })) continue;
    const reading = offlineReading(doc.id, title, story);
    const visibility = card.trashedAt != null ? 'private' : card.visibility === 'public' || card.visibility === 'connections' ? card.visibility : 'private';
    await db.doc(`cardSignatures/${doc.id}`).set({
      authorId: String(card.authorId), version: INDEX_VERSION, model: OFFLINE_MODEL, embedModel: OFFLINE_MODEL, ...reading,
      listedForStrangers: listedForStrangers(reading), templated: false, rewritten: false, error: null,
      usage: { input: 0, output: 0, reasoning: 0, embed: 0 }, updatedAt: FieldValue.serverTimestamp(),
    });
    await doc.ref.update({
      signature: { coreInsight: reading.throughLine, placeholder: false, contentHash: indexContentHash(title, story) },
      indexedAt: card.publishedAt,
    });
    await store.upsert(
      offlineEmbedding(doc.id, reading).map(({ part, vector }) => ({
        cardId: doc.id, authorId: String(card.authorId), visibility, channel: part.channel, part: part.part, vector, embedModel: OFFLINE_MODEL,
        insightScore: reading.insightScore, coreInsight: part.insight, situation: part.situation, lifeDomain: reading.lifeDomain, span: part.span,
      })),
    );
  }
}

// Run as a script, unless a process loads it to call `seedWorld` itself (SEED_LIBRARY=1: scripts/visual/seedServer.ts).
if (process.env.SEED_LIBRARY !== '1') {
  seedWorld().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Times the write paths a person waits on (round 32 §P6) — and the reads a notification's target opens first (§P7): publish for every
 * audience, a draft's save, an edit applied, 共振 (tap + pick), a note, a reply
 * card, a chat message — the server's work up to its answer, step by step, and
 * the work done after it. Against the Firestore emulator only:
 *
 *   EMULATOR_AUTH_PORT=9403 EMULATOR_FIRESTORE_PORT=8403 npm run emulators:at -- "npx tsx scripts/perf/write-paths.ts"
 *
 * `PROBE_RTT_MS` (default 0) adds that much to every awaited repository call and
 * to each transaction's commit, to show how the serial steps add up at the
 * latency of a real function → Firestore hop (a few to some tens of ms; not measured here).
 * `PROBE_SLUG_MS` (default 1500) is the slug model's simulated answer time for a
 * title not in Latin script. Prints one table per path; writes nothing outside
 * the emulator.
 */
import { getAdminDb } from '@/lib/db/firestore/admin';
import { passagesHash } from '@/lib/cards/tapPassages';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { ServerCtx } from '@/server/ctx';
import { publishCardIn } from '@/server/app/publish';
import { putPendingEditIn, saveDraftIn } from '@/server/app/writer';
import { applyCardEditIn } from '@/server/app/edits';
import { setTapIn, setTapPassageIn } from '@/server/app/taps';
import { sendMessageIn, sendNoteIn, budgetFirst } from '@/server/app/conversations';
import { resonateWithIn } from '@/server/app/resonate';
import { getConversationIn, listBellIn, listThreadIn } from '@/server/app/inbox';
import { getCardDetail } from '@/server/app/cardsRead';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run under the emulators (npm run emulators:at).');

const RTT = Number(process.env.PROBE_RTT_MS ?? 0);
const SLUG_MS = Number(process.env.PROBE_SLUG_MS ?? 1500);
const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 5);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Span { name: string; t0: number; t1: number }
let spans: Span[] = [];
let origin = 0;
const now = () => performance.now() - origin;

/** Every promise-returning method of `o` timed (and delayed by RTT, as a network hop would be). */
function timed<T extends object>(o: T, prefix: string): T {
  return new Proxy(o, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function' || typeof prop !== 'string') return v;
      return (...args: unknown[]) => {
        const t0 = now();
        const out = (v as (...a: unknown[]) => unknown).apply(target, args);
        if (!(out instanceof Promise)) return out;
        return out.then(async (value) => {
          if (RTT) await sleep(RTT);
          spans.push({ name: `${prefix}.${prop}`, t0, t1: now() });
          return value;
        }, async (e) => {
          if (RTT) await sleep(RTT);
          spans.push({ name: `${prefix}.${prop} ✗`, t0, t1: now() });
          throw e;
        });
      };
    },
  });
}

const after: (() => unknown)[] = [];
function probeCtx(): ServerCtx {
  const base = ctxFor(getAdminDb());
  const data = Object.fromEntries(Object.entries(base.data).map(([k, repo]) => [k, timed(repo as object, k)])) as unknown as ServerCtx['data'];
  return {
    ...base,
    data,
    limits: timed(base.limits, 'limits'),
    vectors: timed(base.vectors, 'vectors'),
    realtime: timed(base.realtime, 'realtime'),
    uow: {
      run: async (fn, opts) => {
        const t0 = now();
        const out = await base.uow.run((tx) => fn(Object.fromEntries(Object.entries(tx).map(([k, r]) => [k, timed(r as object, `tx.${k}`)])) as never), opts);
        if (RTT) await sleep(RTT); // the commit
        spans.push({ name: `uow(${opts?.label ?? '?'})`, t0, t1: now() });
        return out;
      },
    },
    later: {
      later: (fn) => void after.push(fn),
      soon: async (fn) => void after.push(fn),
    },
    pages: { revalidate: () => [] },
    push: base.push,
  };
}

const db = getAdminDb();
const at = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const STORY = '那天傍晚下起雨。我在車站等了很久，想起你說過的話。\n\n雨停的時候，我才明白有些等待是值得的。\n\n後來我們再也沒有見過面，但那句話一直留著。';

async function seed() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT ?? 'demo-resonance'}/databases/(default)/documents`, { method: 'DELETE' });
  const user = (id: string) => db.doc(`users/${id}`).set({ handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarSeed: '1', joinedAt: at(9999) });
  await Promise.all(['alice', 'bob', 'carol', 'dora', 'erin'].map(user));
  await Promise.all(['bob', 'carol', 'dora', 'erin'].map((o) => db.doc(`connections/alice_${o}`).set({ userIds: ['alice', o], establishedAt: at(60 * 24) })));
  await db.doc('conversations/alice_bob').set({ participants: ['alice', 'bob'], createdAt: at(300), lastMessageAt: at(200) });
  await db.doc('cards/orig').set({
    authorId: 'bob', thoughtCore: '一場雨', story: STORY, tags: [], visibility: 'public', anonymous: false, publishedAt: at(100), slug: 'bobs-rain',
    tapPassages: { of: passagesHash(STORY), items: [{ id: 'p1', text: '雨停的時候，我才明白有些等待是值得的。' }, { id: 'p2', text: '後來我們再也沒有見過面，但那句話一直留著。' }] },
  });
}

const slugBase = async (title: string) => {
  if (/^[\x20-\x7e]+$/.test(title)) return title.toLowerCase().replace(/\W+/g, '-');
  await sleep(SLUG_MS);
  return `slug-${Math.random().toString(36).slice(2, 8)}`;
};

let n = 0;
const nid = () => `probe${String(++n).padStart(15, '0')}`;

type Run = () => Promise<unknown>;
const rows: { path: string; answer: number[]; afterMs: number[]; steps: string }[] = [];

async function measure(path: string, setup: () => Promise<Run>) {
  const answers: number[] = [];
  const afters: number[] = [];
  let steps = '';
  for (let i = 0; i < ROUNDS; i++) {
    const run = await setup();
    // The budgets aren't what is measured: each round starts with them unspent.
    const limits = await db.collection('rateLimits').listDocuments();
    await Promise.all(limits.map((d) => d.delete()));
    spans = [];
    after.length = 0;
    origin = performance.now();
    await run();
    const answered = now();
    const a0 = performance.now();
    await Promise.all(after.splice(0).map(async (fn) => { try { await fn(); } catch { /* after-work logs */ } }));
    afters.push(performance.now() - a0);
    answers.push(answered);
    if (i === ROUNDS - 1) {
      steps = spans
        .filter((s) => s.t0 <= answered)
        .sort((a, b) => a.t0 - b.t0)
        .map((s) => `    ${s.t0.toFixed(0).padStart(5)}→${s.t1.toFixed(0).padStart(5)} ms  ${s.name}`)
        .join('\n');
    }
  }
  rows.push({ path, answer: answers, afterMs: afters, steps });
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function draftFor(visibility: string, anonymous: boolean, title = '安靜的夜晚', extra: Record<string, unknown> = {}) {
  const id = nid();
  await db.doc(`cards/${id}`).set({ authorId: 'alice', thoughtCore: title, story: STORY, tags: [], visibility, anonymous, publishedAt: null, draftRev: 3, createdAt: at(10), updatedAt: at(1), ...extra });
  return id;
}

async function main() {
  await seed();
  const ctx = probeCtx();
  const spent = (bucket: Parameters<ServerCtx['limits']['spend']>[1]) => ctx.limits.spend('alice', bucket);

  for (const [label, visibility, anonymous] of [['公開', 'public', false], ['連結的人', 'connections', false], ['匿名公開', 'public', true]] as const) {
    for (const [tl, title] of [['Chinese title', '安靜的夜晚'], ['Latin title', 'A quiet night']] as const) {
      await measure(`publish ${label} (${tl})`, async () => {
        const id = await draftFor('private', false, title);
        return async () => {
          // What the web's submit sends: the step's audience saved (PATCH …/draft), then POST …/publish.
          await saveDraftIn(ctx, 'alice', id, { rev: 4, visibility, anonymous } as never);
          const s = spent('publish');
          await budgetFirst(s, () => publishCardIn(ctx, 'alice', id, slugBase, { spent: s }));
        };
      });
    }
  }
  await measure('私人卡 儲存 (draft save)', async () => {
    const id = await draftFor('private', false);
    return () => saveDraftIn(ctx, 'alice', id, { rev: 4, story: `${STORY}\n\n多一句。` } as never);
  });
  await measure('publish only (POST …/publish, Chinese title)', async () => {
    const id = await draftFor('connections', false);
    return async () => {
      const s = spent('publish');
      await budgetFirst(s, () => publishCardIn(ctx, 'alice', id, slugBase, { spent: s }));
    };
  });
  await measure('edit: PUT edits/current + apply (調整封面 / 儲存修改)', async () => {
    const id = await draftFor('public', false, '安靜的夜晚', { publishedAt: at(50), slug: `s-${nid()}` });
    return async () => {
      await putPendingEditIn(ctx, 'alice', id, { thoughtCore: '安靜的夜晚', story: `${STORY}\n\n改過。`, tags: [], visibility: 'public', anonymous: false, accentHue: null, rev: 1 } as never);
      await applyCardEditIn(ctx, 'alice', id);
    };
  });
  await measure('edit apply moving 私人卡 → 連結的人', async () => {
    const id = await draftFor('private', false, '安靜的夜晚', { publishedAt: at(50), slug: `s-${nid()}` });
    return async () => {
      await putPendingEditIn(ctx, 'alice', id, { thoughtCore: '安靜的夜晚', story: STORY, tags: [], visibility: 'connections', anonymous: false, accentHue: null, rev: 1 } as never);
      await applyCardEditIn(ctx, 'alice', id);
    };
  });
  await measure('共振 tap (PUT …/tap)', async () => {
    await db.doc('resonanceTaps/orig_alice').delete();
    return async () => {
      const s = spent('tap');
      await budgetFirst(s, () => setTapIn(ctx, 'alice', 'orig', true, Date.now(), s));
    };
  });
  await measure('共振 pick (PUT …/tap/passage)', async () => {
    return async () => {
      // As the route sends it (round 32: the budget beside the reads).
      const s = spent('tap');
      await budgetFirst(s, () => setTapPassageIn(ctx, 'alice', 'orig', 'p1', s));
    };
  });
  await measure('note (POST /notes)', async () => {
    return () => sendNoteIn(ctx, 'alice', { cardId: 'orig', text: '謝謝你寫下這個', clientId: `note_${nid()}` } as never, spent('note'));
  });
  await measure('reply card: publish a resonance (connects + bell)', async () => {
    const id = await draftFor('private', false, '回應那場雨', { referenceCardId: 'orig' });
    await db.doc('connections/alice_bob').delete();
    return async () => {
      await saveDraftIn(ctx, 'alice', id, { rev: 4, visibility: 'public', anonymous: false } as never);
      const s = spent('publish');
      await budgetFirst(s, () => publishCardIn(ctx, 'alice', id, slugBase, { spent: s }));
    };
  });
  await measure('reply card: an existing card (POST …/resonances)', async () => {
    const id = await draftFor('public', false, 'An answer', { publishedAt: at(40), slug: `s-${nid()}` });
    // One answer per reader and card: a fresh original each round.
    const target = nid();
    await db.doc(`cards/${target}`).set({ authorId: 'bob', thoughtCore: '另一場雨', story: STORY, tags: [], visibility: 'public', anonymous: false, publishedAt: at(90), slug: `s-${target}` });
    return async () => {
      const s = ctx.limits.spend('alice', 'resonate');
      await budgetFirst(s, () => resonateWithIn(ctx, 'alice', target, id, s));
    };
  });
  await measure('chat message (POST /messages)', async () => {
    return () => sendMessageIn(ctx, 'alice', { to: 'bob', text: '晚安', clientId: `msg_${nid()}` } as never, spent('message'));
  });

  // What a notification's target opens first (round 32 §P7): bob opens alice's message, her note's bell, a card.
  await Promise.all(Array.from({ length: 40 }, (_, i) => db.doc(`conversations/alice_bob/messages/m${String(i).padStart(3, '0')}`).set({ senderId: i % 2 ? 'alice' : 'bob', text: `第 ${i} 句`, sentAt: at(200 - i), createdAt: at(200 - i) })));
  await Promise.all(Array.from({ length: 20 }, (_, i) => db.doc(`notifications/n${i}`).set({ userId: 'bob', type: 'note', payload: { fromUserId: 'alice', cardId: 'orig' }, createdAt: at(100 - i), readAt: null })));
  const opened = await listThreadIn(ctx, 'bob', 'alice_bob', { limit: 50, changes: '1' });
  await measure('open: GET conversations/{pair}', async () => () => getConversationIn(ctx, 'bob', 'alice_bob'));
  await measure('open: GET …/messages (newest 50)', async () => () => listThreadIn(ctx, 'bob', 'alice_bob', { limit: 50, changes: '1' }));
  await measure('open: GET …/messages (refresh after the cache)', async () => () => listThreadIn(ctx, 'bob', 'alice_bob', { limit: 50, updatedAfter: opened.updatedCursor ?? null }));
  await measure('open: GET me/bell (30)', async () => () => listBellIn(ctx, 'bob', 30, null, { changes: true }));
  await measure('open: GET cards/{id} (the card page)', async () => () => getCardDetail(ctx, 'alice', 'orig', new Set(['resonances', 'related', 'embeds'] as never)));

  console.log(`\nwrite paths — emulator, PROBE_RTT_MS=${RTT}, slug model ${SLUG_MS} ms, ${ROUNDS} rounds (median; last round's steps)\n`);
  for (const r of rows) {
    console.log(`${r.path}: answer ${median(r.answer).toFixed(0)} ms · after the answer ${median(r.afterMs).toFixed(0)} ms`);
    console.log(r.steps);
  }
  console.log('\nsummary');
  for (const r of rows) console.log(`| ${r.path} | ${median(r.answer).toFixed(0)} ms |`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

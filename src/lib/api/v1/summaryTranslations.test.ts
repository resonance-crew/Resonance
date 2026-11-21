import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';

// A feed card's title and excerpt translated by AI (round 25 §F7): made after
// a card is published or an edit applied — never fetched by a list — stored
// on the card server-only, and carried by its FeedCard only while they still
// describe it. A private card carries none, a stale set is dropped, and what
// an author's own write holds is never taken for them.

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/server/infra/firestore/rateLimit', () => ({ firestoreRateLimiter: () => ({ spend: async () => {}, spendAll: async () => {}, limited: async () => null }) }));
vi.mock('@/server/app/pushAfter', () => ({ ringAfterIn: () => {}, announceNewCardIn: async () => {} }));
vi.mock('@/lib/recommend/indexCard', () => ({ indexCard: async () => ({ indexed: true }) }));
vi.mock('@/server/app/links', async (orig) => ({ ...(await orig<object>()), unfurlCardLinksIn: async () => {} }));
/** Publishing itself is the publish suites' (apiV1Publish); here it stamps the card as the service would. */
vi.mock('@/server/app/publish', async (orig) => ({
  ...(await orig<object>()),
  publishCardIn: async (_ctx: unknown, _uid: string, id: string) => {
    await fake.db.doc(`cards/${id}`).update({ publishedAt: Timestamp.fromDate(new Date('2026-11-15T00:00:00Z')) });
    return { id, slug: 'grandmas-plums', firstPublish: false, notificationId: null, pendingSlug: null };
  },
}));
const chatJSON = vi.fn();
vi.mock('@/lib/ai/openai', async (orig) => ({ ...(await orig<typeof import('@/lib/ai/openai')>()), chatJSON: (...a: unknown[]) => chatJSON(...a) }));

const { POST: publish } = await import('@/app/api/v1/cards/[key]/publish/route');
const { presentSummaryTranslations, summaryHash } = await import('./summaryTranslations');
const { makeSummaryTranslations } = await import('./summaryTranslationsMake');
const { toFeedCard } = await import('./present');
const { listCard, summarize } = await import('./summary');

const ZH_TITLE = '外婆的醃梅子';
const ZH_STORY = '每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬太陽。我總是蹲在旁邊看。';
const EN_TITLE = 'Rain on the bridge';
const EN_STORY = 'We stood on the old bridge and watched the rain, saying nothing.';

const draft = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: ZH_TITLE,
  story: ZH_STORY,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: null,
  ...extra,
});

/** The model's answer: each language asked for, its title and excerpt marked with the language. */
function answerFor(messages: { role: string; content: string }[]) {
  const input = JSON.parse(messages[1].content) as { title: string; excerpt: string };
  const out: Record<string, { title: string; excerpt: string }> = {};
  for (const lang of ['en', 'zh-TW']) if (messages[0].content.includes(`"${lang}" =`)) out[lang] = { title: `[${lang}] ${input.title}`, excerpt: `[${lang}] ${input.excerpt}` };
  return out;
}

beforeEach(() => {
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  chatJSON.mockReset().mockImplementation(async (messages: { role: string; content: string }[]) => answerFor(messages));
  fake = fakeAdminDb({
    'users/alice': { handle: 'alice' },
    'cards/zh1': draft(),
    'cards/en1': draft({ thoughtCore: EN_TITLE, story: EN_STORY }),
    'cards/priv1': draft({ visibility: 'private' }),
  });
});
afterEach(() => vi.unstubAllEnvs());

const publishIt = async (id: string) => {
  const res = await publish(new Request(`http://localhost/api/v1/cards/${id}/publish`, { method: 'POST' }), { params: Promise.resolve({ key: id }) });
  expect(res.status).toBe(200);
  await Promise.all(afterWork);
};
const feedCardOf = (id: string) => toFeedCard(listCard(id, fake.docs[`cards/${id}`]), fake.docs['users/alice']);

describe("a card's translated title and excerpt", () => {
  it('are made after it is published — into English for a Chinese story, into 繁體中文 for a Latin-script one — and arrive with its FeedCard', async () => {
    await publishIt('zh1');
    const excerpt = summarize(ZH_STORY).excerpt;
    expect(fake.docs['cards/zh1'].summaryTranslations).toEqual({
      of: summaryHash(ZH_TITLE, excerpt),
      en: { title: `[en] ${ZH_TITLE}`, excerpt: `[en] ${excerpt}` },
    });
    expect(feedCardOf('zh1').summaryTranslations).toEqual({ en: { title: `[en] ${ZH_TITLE}`, excerpt: `[en] ${excerpt}` } });

    await publishIt('en1');
    expect(feedCardOf('en1').summaryTranslations).toEqual({
      'zh-TW': { title: `[zh-TW] ${EN_TITLE}`, excerpt: `[zh-TW] ${summarize(EN_STORY).excerpt}` },
    });
    // One small call each, with a timeout, never the story itself.
    expect(chatJSON).toHaveBeenCalledTimes(2);
    for (const [messages, opts] of chatJSON.mock.calls as [{ content: string }[], { signal?: AbortSignal }][]) {
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      expect(Object.keys(JSON.parse(messages[1].content))).toEqual(['title', 'excerpt']);
    }
  });

  it('are asked of the model again only when the title or excerpt changed', async () => {
    await publishIt('zh1');
    expect(await makeSummaryTranslations(fake.db, 'zh1')).toBe('unchanged');
    expect(chatJSON).toHaveBeenCalledTimes(1);
    // A cover, the tags, the story past the excerpt: nothing a list shows in words.
    fake.docs['cards/zh1'].tags = ['家'];
    expect(await makeSummaryTranslations(fake.db, 'zh1')).toBe('unchanged');
    fake.docs['cards/zh1'].thoughtCore = '外婆的梅子';
    expect(await makeSummaryTranslations(fake.db, 'zh1')).toBe('made');
    expect(chatJSON).toHaveBeenCalledTimes(2);
  });

  it('are dropped from the FeedCard as soon as the card no longer reads as they were made from', async () => {
    await publishIt('zh1');
    expect(feedCardOf('zh1').summaryTranslations).not.toBeNull();
    // An edit saved by a build that makes none (the web's older editor writes the story from the browser).
    fake.docs['cards/zh1'].story = '另一個故事，從頭開始寫。';
    expect(feedCardOf('zh1').summaryTranslations).toBeNull();
    fake.docs['cards/zh1'].story = ZH_STORY;
    fake.docs['cards/zh1'].thoughtCore = '新的標題';
    expect(feedCardOf('zh1').summaryTranslations).toBeNull();
  });

  it('are never made for a card that is not public, and are removed — and never shown — once it is private or in the trash', async () => {
    await publishIt('priv1');
    expect(chatJSON).not.toHaveBeenCalled();
    expect(fake.docs['cards/priv1'].summaryTranslations).toBeUndefined();

    await publishIt('zh1');
    const made = fake.docs['cards/zh1'].summaryTranslations;
    fake.docs['cards/zh1'].trashedAt = Timestamp.now();
    expect(feedCardOf('zh1').summaryTranslations).toBeNull();
    delete fake.docs['cards/zh1'].trashedAt;
    fake.docs['cards/zh1'].visibility = 'connections';
    expect(feedCardOf('zh1').summaryTranslations).toBeNull();
    expect(await makeSummaryTranslations(fake.db, 'zh1')).toBe('removed');
    expect(fake.docs['cards/zh1'].summaryTranslations).toBeUndefined();
    expect(made).toBeDefined();
  });

  it("never take an author's own words for them: a set that wasn't made from the card as it is shows nothing", () => {
    const data = {
      ...draft({ publishedAt: Timestamp.now() }),
      // As if a client had got one past the rules (they take it from none: rules.emulator.test.ts).
      summaryTranslations: { of: 'made-up', en: { title: 'Buy now', excerpt: 'click here' } },
    };
    expect(presentSummaryTranslations(listCard('x', data), ZH_TITLE, summarize(ZH_STORY).excerpt)).toBeNull();
  });

  it('never fail the publish when the model does, and leave the card without any', async () => {
    chatJSON.mockRejectedValue(new Error('OpenAI chat failed: 500'));
    await publishIt('zh1');
    expect(fake.docs['cards/zh1'].publishedAt).toBeInstanceOf(Timestamp);
    expect(fake.docs['cards/zh1'].summaryTranslations).toBeUndefined();
    expect(feedCardOf('zh1').summaryTranslations).toBeNull();
  });

  it('ask no model against the emulators, and keep what the seed wrote', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8457');
    fake.docs['cards/zh1'].publishedAt = Timestamp.now();
    expect(await makeSummaryTranslations(fake.db, 'zh1')).toBe('offline');
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it('skip the model when the budget says no (an applied edit spends the reindex budget)', async () => {
    fake.docs['cards/zh1'].publishedAt = Timestamp.now();
    expect(await makeSummaryTranslations(fake.db, 'zh1', { mayCall: async () => false })).toBe('over-budget');
    expect(chatJSON).not.toHaveBeenCalled();
  });
});

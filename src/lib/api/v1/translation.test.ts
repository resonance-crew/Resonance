import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';

// POST /api/v1/cards/{key}/translation (round 25 §F5): a published public
// story — named or anonymous — translated into the reader's interface
// language. Anything else is the missing card's 404; a story over 30 000
// characters 413; the budget 429; a model that failed 503 with nothing kept.
// A translation kept for the card as it is answers without a model call or
// any budget; the answer never says who wrote the card.

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));
const spend = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));
const translateStory = vi.fn();
vi.mock('@/lib/ai/translate', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/translate')>()),
  translateStory: (...a: unknown[]) => translateStory(...a),
}));

const { POST } = await import('@/app/api/v1/cards/[key]/translation/route');
const { ApiFailure } = await import('./http');
const { translationHash } = await import('./translation');
const { TranslationResponse } = await import('./schemas');

const TITLE = '外婆的醃梅子';
const STORY = '每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬太陽。';
const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: TITLE,
  story: STORY,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')),
  slug: 'grandmas-plums',
  ...extra,
});

beforeEach(() => {
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
  getCurrentUser.mockReset().mockResolvedValue({ id: 'carol' });
  spend.mockReset().mockResolvedValue(undefined);
  translateStory.mockReset().mockImplementation(async ({ title, story }: { title: string; story: string }) => ({ title: `EN ${title}`, story: `EN ${story}` }));
  fake = fakeAdminDb({
    'users/alice': { handle: 'alice' },
    'cards/pub1': card(),
    'cards/anon1': card({ anonymous: true, slug: 'anon-plums' }),
    'cards/priv1': card({ visibility: 'private', slug: 'p1' }),
    'cards/conn1': card({ visibility: 'connections', slug: 'c1' }),
    'cards/draft1': card({ publishedAt: null, slug: undefined }),
    'cards/trash1': card({ visibility: 'private', trashedAt: Timestamp.now(), slug: 't1' }),
    'cards/long1': card({ story: '字'.repeat(30_001), slug: 'l1' }),
    'cards/en1': card({ thoughtCore: 'Rain', story: 'We stood on the bridge and watched the rain.', slug: 'rain' }),
    'connections/alice_carol': { userIds: ['alice', 'carol'] },
  });
});
afterEach(() => vi.unstubAllEnvs());

const ask = (key: string, body: unknown = { to: 'en' }) =>
  POST(new Request(`http://localhost/api/v1/cards/${key}/translation`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ key }),
  });

describe('POST /api/v1/cards/{key}/translation', () => {
  it("translates a published public story by slug or id, keeps it, and answers the title and story alone — never the author", async () => {
    const res = await ask('grandmas-plums');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({ to: 'en', title: `EN ${TITLE}`, story: `EN ${STORY}` });
    expect(TranslationResponse.safeParse(body).success).toBe(true);
    expect(spend).toHaveBeenCalledWith(fake.db, 'carol', 'translate');
    expect(fake.docs['cards/pub1/translations/en']).toMatchObject({ title: `EN ${TITLE}`, story: `EN ${STORY}`, hash: translationHash(TITLE, STORY) });
    expect(typeof fake.docs['cards/pub1/translations/en'].model).toBe('string');

    const anon = await (await ask('anon1')).json();
    expect(Object.keys(anon).sort()).toEqual(['story', 'title', 'to']);
    expect(JSON.stringify(anon)).not.toContain('alice');
  });

  it('answers a kept translation of the card as it is without a model call or any budget, and makes a new one once the card changed', async () => {
    await ask('pub1');
    translateStory.mockClear();
    spend.mockClear();
    expect((await (await ask('pub1')).json()).title).toBe(`EN ${TITLE}`);
    expect(translateStory).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();

    fake.docs['cards/pub1'].story = `${STORY}後來她走了。`;
    expect((await (await ask('pub1')).json()).story).toBe(`EN ${STORY}後來她走了。`);
    expect(translateStory).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledTimes(1);
  });

  it("is the missing card's 404 for anything but a published public card the reader may read — a connection's card, a draft, the trash, someone's 私人卡 included", async () => {
    for (const key of ['priv1', 'conn1', 'draft1', 'trash1', 'nope', 'p1']) {
      const res = await ask(key);
      expect(res.status, key).toBe(404);
      expect((await res.json()).error.code).toBe('not_found');
    }
    // An anonymous card is reached by its id alone, never its slug (cardKey: anonymousBySlug).
    expect((await ask('anon-plums')).status).toBe(404);
    expect(translateStory).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  });

  it('is 413 for a story over 30 000 characters and 400 for one already in that language, before any budget', async () => {
    expect((await ask('long1')).status).toBe(413);
    const same = await ask('rain');
    expect(same.status).toBe(400);
    expect((await ask('rain', { to: 'zh-TW' })).status).toBe(200);
    expect((await ask('pub1', { to: 'ja' })).status).toBe(400);
    expect((await ask('pub1', {})).status).toBe(400);
    expect(spend).toHaveBeenCalledTimes(1);
  });

  it('is 429 once the reader spent their translations for the day, asking no model', async () => {
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    const res = await ask('pub1');
    expect(res.status).toBe(429);
    expect(translateStory).not.toHaveBeenCalled();
  });

  it('is 503 when the model fails or runs out of time, keeping nothing', async () => {
    translateStory.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const res = await ask('pub1');
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).not.toMatch(/timed out/);
    expect(fake.docs['cards/pub1/translations/en']).toBeUndefined();
  });

  it('asks no model against the emulators: a kept translation answers, any other is 503', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8457');
    fake.docs['cards/pub1/translations/en'] = { title: 'Seeded', story: 'Seeded story', hash: translationHash(TITLE, STORY), model: 'seed' };
    expect((await (await ask('pub1')).json()).title).toBe('Seeded');
    expect((await ask('rain', { to: 'zh-TW' })).status).toBe(503);
    expect(translateStory).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  });

  it('is 401 for no one signed in', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await ask('pub1')).status).toBe(401);
  });
});

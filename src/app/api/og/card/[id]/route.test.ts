import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import { buildCardMetadata, imageVersion } from '@/lib/og';
import { coverVersion, drawnCard, drawnCardVersion } from '@/lib/linkImage/model';
import { forgetShareImages } from '@/lib/api/shareImage';
import { readCardForPage } from '@/app/[locale]/(app)/card/[slug]/cardPageData';

// The share images behind og:image: a public card's link-preview image — its
// cover cropped to 1200 × 630, or without one the card itself drawn at that
// size — and a person's profile photo (a JPEG at most 1200 px a side), read
// from storage by key: the stored AVIF or WebP isn't shown by every platform.
// Anything that isn't a public, published card gets the platform cover; an
// anonymous card's author is never read. Each image has one URL, and only it
// is made — once per instance for a while, two at a time.

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
const objects = new Map<string, Uint8Array>();
const getObject = vi.fn(async (key: string) => objects.get(key) ?? null);
vi.mock('@/lib/storage', () => ({ getStorageProvider: () => ({ getObject: (key: string) => getObject(key) }) }));

const { GET: cardImage } = await import('./route');
const { GET: userImage } = await import('../../user/[id]/route');

const BASE = 'https://img.example';
/** The host the storage was served from before (R2_FORMER_PUBLIC_BASES): it serves the same keys. */
const FORMER = 'https://pub-0123.r2.dev';
const COVER = `${BASE}/image/uid-author/2026-10/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.avif`;
const AVATAR = `${BASE}/image/uid-author/2026-10/5d6e7f80-1a2b-4c3d-8e9f-0a1b2c3d4e5f.webp`;
const storageKey = (url: string) => url.slice(BASE.length + 1);

const stored = new Map<string, Uint8Array>();
beforeAll(async () => {
  vi.stubEnv('R2_PUBLIC_BASE', BASE);
  vi.stubEnv('R2_FORMER_PUBLIC_BASES', `${FORMER}/`);
  stored.set(storageKey(COVER),
    await sharp({ create: { width: 2000, height: 1000, channels: 4, background: { r: 200, g: 80, b: 60, alpha: 0.5 } } }).avif().toBuffer());
  stored.set(storageKey(AVATAR), await sharp({ create: { width: 256, height: 256, channels: 3, background: '#357' } }).webp().toBuffer());
});
afterAll(() => vi.unstubAllEnvs());

const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'uid-author',
  visibility: 'public',
  publishedAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
  media: { type: 'image', url: COVER },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  forgetShareImages();
  objects.clear();
  for (const [key, bytes] of stored) objects.set(key, bytes);
  fake = fakeAdminDb({
    'users/uid-author': { handle: 'quiet-walker', avatarUrl: AVATAR },
    'users/no-photo': { handle: 'plain' },
    'cards/pub1': card(),
    'cards/anon1': card({ anonymous: true }),
    'cards/priv1': card({ visibility: 'private' }),
    'cards/conn1': card({ visibility: 'connections' }),
    'cards/draft1': card({ publishedAt: null }),
    'cards/bare1': card({ media: null, slug: 'grandmas-plums', thoughtCore: '外婆的醃梅子', story: '每年五月，外婆都會把青梅一顆顆擦乾。' }),
    'cards/video1': card({ media: { type: 'video', url: 'https://img.example/v.mp4' }, thoughtCore: 'A walk', story: 'We walked.' }),
    'cards/anonbare1': card({ media: null, anonymous: true, thoughtCore: '沒說出口的話', story: '有些話一直沒有說出口。' }),
    'cards/nobody1': card({ media: null, authorId: 'uid-gone', thoughtCore: 'Left behind', story: 'A card whose author is gone.' }),
    'cards/former1': card({ media: { type: 'image', url: COVER.replace(BASE, FORMER) } }),
    'cards/elsewhere1': card({ media: { type: 'image', url: 'https://evil.example/x.jpg' } }),
    'cards/lookalike1': card({ media: { type: 'image', url: `${BASE}/image/../../secrets/key.png` } }),
    'cards/gone1': card({ media: { type: 'image', url: `${BASE}/image/uid-author/2026-10/missing.avif` } }),
  });
});

const get = (id: string, v?: string) =>
  cardImage(new Request(`http://localhost/api/og/card/${id}${v ? `?v=${v}` : ''}`), { params: Promise.resolve({ id }) });
/** A request for `pathAndQuery` as written, which Next routes to the card `id`. */
const getAt = (id: string, pathAndQuery: string) =>
  cardImage(new Request(`http://localhost${pathAndQuery}`), { params: Promise.resolve({ id }) });

/** Asked for anything but its one URL, a share image is sent there, by a redirect no cache keeps. */
function expectSentOn(res: Response, location: string) {
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe(location);
  expect(res.headers.get('cache-control')).toBe('no-store');
}

async function expectJpeg(res: Response, width: number, height: number) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(res.headers.get('content-length')).toBe(String(bytes.byteLength));
  expect(await sharp(bytes).metadata()).toMatchObject({ format: 'jpeg', width, height });
}

function expectPlatformCover(res: Response) {
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/og-cover.jpg');
  expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
}

describe('GET /api/og/card/{id}', () => {
  it("serves a public card's AVIF cover as a 1200 × 630 JPEG, cached by the CDN for a day under its version", async () => {
    const res = await get('pub1', coverVersion(COVER));
    await expectJpeg(res, 1200, 630);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=86400');
    expect(getObject).toHaveBeenCalledWith(storageKey(COVER));
  });

  it('reads a cover still on the former storage host by the same key', async () => {
    await expectJpeg(await get('former1', coverVersion(COVER.replace(BASE, FORMER))), 1200, 630);
    expect(getObject).toHaveBeenCalledWith(storageKey(COVER));
  });

  it('sends any other version on to the current one, drawing nothing for it', async () => {
    // An older cover's URL (the page predates the new cover), the version from before covers were
    // cropped, none, or a made-up one.
    for (const v of [coverVersion(`${BASE}/image/uid-author/2026-09/old.avif`), imageVersion(COVER), undefined, 'made-up']) {
      expectSentOn(await get('pub1', v), `/api/og/card/pub1?v=${coverVersion(COVER)}`);
    }
    expect(getObject).not.toHaveBeenCalled();
  });

  // The CDN keys its copy on the whole URL: were any of these made, each would be a fresh decode
  // under a cache key of its own, as often as anyone cares to ask.
  it('sends the current version with anything else in the URL on to its one URL, decoding nothing for it', async () => {
    const v = coverVersion(COVER);
    for (const variant of [
      `/api/og/card/pub1?v=${v}&n=1`,
      `/api/og/card/pub1?n=1&v=${v}`,
      `/api/og/card/pub1?v=${v}&v=${v}`,
      `/api/og/card/pub1?v=${v}&`,
      `/api/og/card/pub1?%76=${v}`,
      `/api/og/card/pub%31?v=${v}`,
    ]) {
      expectSentOn(await getAt('pub1', variant), `/api/og/card/pub1?v=${v}`);
    }
    expect(getObject).not.toHaveBeenCalled();
  });

  // Next hands a route the URL it normalised: `?%76=`, `&nxtPx=1` or `&_rsc=1` arrive as the URL
  // itself, under cache keys of their own. What an instance made, it serves again.
  it('decodes a cover once however often its URL reaches the route, and once for asks that arrive together', async () => {
    const v = coverVersion(COVER);
    await expectJpeg(await get('pub1', v), 1200, 630);
    await expectJpeg(await get('pub1', v), 1200, 630);
    expect(getObject).toHaveBeenCalledTimes(1);
    forgetShareImages();
    getObject.mockClear();
    const together = await Promise.all([get('pub1', v), get('pub1', v), get('pub1', v)]);
    for (const res of together) await expectJpeg(res, 1200, 630);
    expect(getObject).toHaveBeenCalledTimes(1);
  });

  it('makes two images at a time, lets eight more wait, and tells the rest to come back — kept by no cache', async () => {
    const small = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#a53' } }).avif().toBuffer();
    const covers = Array.from({ length: 11 }, (_, i) => `${BASE}/image/uid-author/2026-10/0b9c6a2e-1f43-4c55-9d8e-${String(i).padStart(12, '0')}.avif`);
    covers.forEach((url, i) => {
      fake.docs[`cards/many${i}`] = card({ media: { type: 'image', url } });
      objects.set(storageKey(url), small);
    });
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    getObject.mockImplementation(async (key: string) => {
      await gate;
      return objects.get(key) ?? null;
    });
    const asked = covers.map((url, i) => get(`many${i}`, coverVersion(url)));
    let answers: Response[];
    try {
      // The two being made hold their slots until the stored pictures arrive; every ask has reached its turn by then.
      await vi.waitFor(() => expect(getObject).toHaveBeenCalledTimes(2));
      const busy = await Promise.race(asked);
      expect(busy.status).toBe(503);
      expect(busy.headers.get('cache-control')).toBe('no-store');
      expect(busy.headers.get('retry-after')).toBe('5');
    } finally {
      open();
      answers = await Promise.all(asked);
      getObject.mockImplementation(async (key: string) => objects.get(key) ?? null);
    }
    expect(answers.map((r) => r.status).sort()).toEqual([...Array(10).fill(200), 503]);
    expect(getObject).toHaveBeenCalledTimes(10);
    // Being busy says nothing about the picture: asked again, it is made.
    const turnedAway = covers[answers.findIndex((r) => r.status === 503)];
    const again = await get(`many${covers.indexOf(turnedAway)}`, coverVersion(turnedAway));
    await expectJpeg(again, 1200, 630);
  });

  it("serves an anonymous card's cover without reading anything about its author", async () => {
    await expectJpeg(await get('anon1', coverVersion(COVER)), 1200, 630);
    expect(fake.reads).toEqual(['cards/anon1']);
  });

  it.each([
    ['a private card', 'priv1'],
    ['a connections-only card', 'conn1'],
    ['a draft', 'draft1'],
    ['no such card', 'nope'],
    ['a stored picture that is gone', 'gone1'],
  ])('sends %s to the platform cover', async (_, id) => {
    expectPlatformCover(await get(id, id === 'gone1' ? coverVersion(`${BASE}/image/uid-author/2026-10/missing.avif`) : undefined));
  });

  it('never reads a picture that is not on our storage, or only looks like it', async () => {
    expectPlatformCover(await get('elsewhere1'));
    expectPlatformCover(await get('lookalike1'));
    expect(getObject).not.toHaveBeenCalled();
  });

  it('reads nothing for an id that is not one', async () => {
    expectPlatformCover(await get('..%2Fusers%2Fuid-author'));
    expectPlatformCover(await get('a/b'));
    expect(fake.reads).toEqual([]);
  });

  // Firestore refuses to read a document id shaped `__x__` (it keeps them for itself): asked, it would throw — a 500.
  it('sends an id Firestore keeps for itself to the platform cover without reading it', async () => {
    expectPlatformCover(await get('__x__'));
    expectPlatformCover(await get('__name__'));
    expect(fake.reads).toEqual([]);
  });
});

describe('GET /api/og/card/{id} for a card without a cover', () => {
  /** The version the card page's og:image names, built as the page builds it (its own server read). */
  async function pageVersion(key: string): Promise<string> {
    const loaded = await readCardForPage(fake.db, key);
    const meta = buildCardMetadata({ card: loaded.card!, author: loaded.author, locale: 'zh-TW', base: 'https://site.example', anonymousLabel: '匿名' });
    const image = (meta.openGraph?.images as { url: string; width?: number; height?: number }[])[0];
    expect(image).toMatchObject({ width: 1200, height: 630 });
    return new URL(image.url).searchParams.get('v')!;
  }

  // A day would keep a card's pen name in the CDN a day after the card was made anonymous; five
  // minutes is as long as the card page itself may lag.
  it('draws the card at 1200 × 630 under the version its page names, cached five minutes since it names its author', async () => {
    const v = await pageVersion('grandmas-plums');
    fake.reads.length = 0;
    const res = await get('bare1', v);
    await expectJpeg(res, 1200, 630);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    // The card and its author's byline, nothing else; the photo from our storage by its key.
    expect(fake.reads).toEqual(['cards/bare1', 'users/uid-author']);
    expect(getObject).toHaveBeenCalledWith(storageKey(AVATAR));
  }, 30_000);

  it('sends any other version on to the current drawing without drawing it', async () => {
    const v = await pageVersion('bare1');
    for (const other of [coverVersion(COVER), undefined, 'made-up']) {
      expectSentOn(await get('bare1', other), `/api/og/card/bare1?v=${v}`);
    }
    for (const variant of [`/api/og/card/bare1?v=${v}&n=1`, `/api/og/card/bare1?%76=${v}`, `/api/og/card/bare%31?v=${v}`]) {
      expectSentOn(await getAt('bare1', variant), `/api/og/card/bare1?v=${v}`);
    }
    expect(getObject).not.toHaveBeenCalled();
  });

  it('draws a card once however often its URL reaches the route, and once for asks that arrive together', async () => {
    const v = await pageVersion('bare1');
    const together = await Promise.all([get('bare1', v), get('bare1', v)]);
    for (const res of together) await expectJpeg(res, 1200, 630);
    await expectJpeg(await get('bare1', v), 1200, 630);
    // The photo is read once, for the one drawing.
    expect(getObject).toHaveBeenCalledTimes(1);
  }, 30_000);

  // Undone within the redirects' life, a change would leave vA → vB and vB → vA both kept: a loop.
  it('sends an old version on to the current one again when an edit is undone', async () => {
    const before = await pageVersion('bare1');
    fake.docs['cards/bare1'] = { ...fake.docs['cards/bare1'], thoughtCore: '外婆的梅子' };
    const during = await pageVersion('bare1');
    expectSentOn(await get('bare1', before), `/api/og/card/bare1?v=${during}`);
    fake.docs['cards/bare1'] = { ...fake.docs['cards/bare1'], thoughtCore: '外婆的醃梅子' };
    expect(await pageVersion('bare1')).toBe(before);
    expectSentOn(await get('bare1', during), `/api/og/card/bare1?v=${before}`);
  });

  it('draws a new version when what the card shows changes', async () => {
    const before = await pageVersion('bare1');
    fake.docs['users/uid-author'] = { ...fake.docs['users/uid-author'], handle: 'quiet-walker-2' };
    const after = await pageVersion('bare1');
    expect(after).not.toBe(before);
    expect((await get('bare1', before)).headers.get('location')).toBe(`/api/og/card/bare1?v=${after}`);
  });

  it("draws an anonymous card from the card alone: its author is never read, nor their photo", async () => {
    const v = await pageVersion('anonbare1');
    fake.reads.length = 0;
    const res = await get('anonbare1', v);
    await expectJpeg(res, 1200, 630);
    // It names no one: kept a day, as a cover is.
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=86400');
    expect(fake.reads).toEqual(['cards/anonbare1']);
    expect(getObject).not.toHaveBeenCalled();
    // Its version is the one an image without any author would have.
    const data = { ...fake.docs['cards/anonbare1'], publishedAt: new Date('2026-09-01T00:00:00Z') };
    expect(v).toBe(drawnCardVersion(drawnCard({ id: 'anonbare1', ...data } as never, null)));
  }, 30_000);

  it('draws a card with a video, or whose author is gone, too', async () => {
    await expectJpeg(await get('video1', await pageVersion('video1')), 1200, 630);
    await expectJpeg(await get('nobody1', await pageVersion('nobody1')), 1200, 630);
  }, 30_000);

  it("draws the initials when the author's photo can't be read", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    objects.set(storageKey(AVATAR), new Uint8Array([1, 2, 3]));
    await expectJpeg(await get('bare1', await pageVersion('bare1')), 1200, 630);
    expect(logged).toHaveBeenCalledWith('[og] drawn card photo', expect.anything());
    forgetShareImages();
    objects.delete(storageKey(AVATAR));
    await expectJpeg(await get('bare1', await pageVersion('bare1')), 1200, 630);
    logged.mockRestore();
  }, 30_000);
});

describe('GET /api/og/user/{id}', () => {
  const user = (id: string, v?: string) =>
    userImage(new Request(`http://localhost/api/og/user/${id}${v ? `?v=${v}` : ''}`), { params: Promise.resolve({ id }) });

  it("serves a person's profile photo as a JPEG", async () => {
    const res = await user('uid-author', imageVersion(AVATAR));
    await expectJpeg(res, 256, 256);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=86400');
  });

  it('sends someone without a photo, or gone, to the platform cover', async () => {
    expectPlatformCover(await user('no-photo'));
    expectPlatformCover(await user('nobody'));
  });

  it('sends an id Firestore keeps for itself to the platform cover without reading it', async () => {
    expectPlatformCover(await user('__x__'));
    expect(fake.reads).toEqual([]);
  });
});

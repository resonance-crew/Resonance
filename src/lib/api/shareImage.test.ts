import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import { coverVersion, LINK_IMAGE_SIZE } from '@/lib/linkImage/model';
import { forgetShareImages, toShareJpeg } from './shareImage';

// A framed cover's og image (round 25 §G1): the share picture behind og:image
// is cut where the card's author framed the cover — the same crop every other
// shape takes from the frame (lib/images/coverFrame) — and a cover framed
// again is a new URL, while one never framed keeps the URL it had.

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
const objects = new Map<string, Uint8Array>();
vi.mock('@/lib/storage', () => ({ getStorageProvider: () => ({ getObject: async (key: string) => objects.get(key) ?? null }) }));

const { GET } = await import('@/app/api/og/card/[id]/route');

const BASE = 'https://img.example';
const COVER = `${BASE}/image/uid-author/2026-11/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.webp`;
const RED = { r: 220, g: 30, b: 30 };
const BLUE = { r: 30, g: 30, b: 220 };

/** A 2000 × 1000 picture: its left half red, its right half blue. */
async function halves(): Promise<Buffer> {
  const half = (c: typeof RED) => sharp({ create: { width: 1000, height: 1000, channels: 3, background: c } }).png().toBuffer();
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: RED } })
    .composite([
      { input: await half(RED), left: 0, top: 0 },
      { input: await half(BLUE), left: 1000, top: 0 },
    ])
    .webp({ lossless: true })
    .toBuffer();
}

/** How red and how blue a JPEG is, on average (0–255). */
async function tint(jpeg: Uint8Array) {
  const { channels } = await sharp(jpeg).stats();
  return { red: channels[0].mean, blue: channels[2].mean };
}

const LEFT = { cx: 0.25, cy: 0.5, zoom: 2, ar: 2 };
const RIGHT = { cx: 0.75, cy: 0.5, zoom: 2, ar: 2 };

let picture: Buffer;
beforeAll(async () => {
  vi.stubEnv('R2_PUBLIC_BASE', BASE);
  picture = await halves();
});
afterAll(() => vi.unstubAllEnvs());

beforeEach(() => {
  forgetShareImages();
  objects.clear();
  objects.set(COVER.slice(BASE.length + 1), picture);
  const card = (frame?: unknown) => ({
    authorId: 'uid-author',
    visibility: 'public',
    publishedAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')),
    media: { type: 'image', url: COVER, ...(frame ? { frame } : {}) },
  });
  fake = fakeAdminDb({ 'cards/left1': card(LEFT), 'cards/right1': card(RIGHT), 'cards/plain1': card(), 'cards/bad1': card({ cx: 9, cy: 0.5, zoom: 1, ar: 2 }) });
});

const og = (id: string, version: string) =>
  GET(new Request(`http://localhost/api/og/card/${id}?v=${version}`), { params: Promise.resolve({ id }) });

describe("a framed cover's share image", () => {
  it('is cut on its frame: the half its author framed, at 1200 × 630', async () => {
    const left = await toShareJpeg(picture, { ...LINK_IMAGE_SIZE, frame: LEFT });
    const meta = await sharp(left).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    const l = await tint(left);
    expect(l.red).toBeGreaterThan(200);
    expect(l.blue).toBeLessThan(50);
    const r = await tint(await toShareJpeg(picture, { ...LINK_IMAGE_SIZE, frame: RIGHT }));
    expect(r.blue).toBeGreaterThan(200);
    expect(r.red).toBeLessThan(50);
    // Without one, the centre, as ever: both halves.
    const c = await tint(await toShareJpeg(picture, LINK_IMAGE_SIZE));
    expect(c.red).toBeGreaterThan(90);
    expect(c.blue).toBeGreaterThan(90);
  });

  it('is what GET /api/og/card/{id} serves, at a URL of its own for each frame', async () => {
    const leftV = coverVersion(COVER, LEFT);
    const rightV = coverVersion(COVER, RIGHT);
    expect(leftV).not.toBe(rightV);
    // A cover never framed keeps the address it had before frames were (no platform fetches it again).
    expect(coverVersion(COVER, null)).toBe(coverVersion(COVER));

    const res = await og('left1', leftV);
    expect(res.status).toBe(200);
    expect((await tint(new Uint8Array(await res.arrayBuffer()))).red).toBeGreaterThan(200);
    const right = await og('right1', rightV);
    expect((await tint(new Uint8Array(await right.arrayBuffer()))).blue).toBeGreaterThan(200);
    // The old address of a cover framed since is sent on to the new one.
    const moved = await og('left1', coverVersion(COVER));
    expect(moved.status).toBe(302);
    expect(moved.headers.get('Location')).toBe(`/api/og/card/left1?v=${leftV}`);
  });

  it('reads a malformed frame as the centre', async () => {
    const res = await og('bad1', coverVersion(COVER));
    expect(res.status).toBe(200);
    const t = await tint(new Uint8Array(await res.arrayBuffer()));
    expect(t.red).toBeGreaterThan(90);
    expect(t.blue).toBeGreaterThan(90);
    expect((await og('plain1', coverVersion(COVER))).status).toBe(200);
  });
});

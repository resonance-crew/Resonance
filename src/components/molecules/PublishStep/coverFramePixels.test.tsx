// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { renderWithIntl, screen } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { SharedCardContent } from '@/components/molecules/SharedCard/SharedCard';
import type { StagePicture } from '@/components/molecules/CropStage/CropStage';
import type { Card } from '@/lib/db/types';
import { coverCrop, type CoverFrame } from '@/lib/images/coverFrame';
import { coverFrameOfView } from '@/lib/images/cropFrame';
import { COVER_FRAME_RATIO, CoverFrameModal } from './CoverFrameModal';

/**
 * Round 33 §Q4 (the owner: 「AI 封面：预览与调整框基准框统一…像素一致性测试（1536×1024 横图与直式照片）」): a framed cover
 * shows, in the box that is seen, exactly the part of the picture the 調整封面 window's frame showed. The cause on
 * the Pixel: the cover drew its picture `imageBleed` larger than its box for the wobbly clip and cut the frame's crop
 * for that larger box, so the preview was tighter than the window (≈1.1× at zoom 1, ≈1.28× at 1.5). Here both are
 * drawn as the user sees them — the window's stage (CropStage under CoverFrameModal, its picture's transform) and the
 * feed card's cover (OrganicImage at 0.62, its picture placed in its box) — and the picture's pixel under a few points
 * of the frame is compared, in the preview's own pixels.
 */

const PREVIEW_W = 360;
/** The points of the frame compared: its corners' neighbourhood, its middle, two edges' middles. */
const POINTS: [number, number][] = [
  [0.05, 0.05],
  [0.95, 0.05],
  [0.5, 0.5],
  [0.05, 0.95],
  [0.95, 0.95],
  [0.5, 0.02],
  [0.02, 0.5],
];

function picture(width: number, height: number): StagePicture {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return { el, width, height };
}

/** The picture's pixel under each frame point in the 調整封面 window, as its stage draws it. */
function inWindow(pic: StagePicture, frame: CoverFrame | null): [number, number][] {
  const view = renderWithIntl(<CoverFrameModal picture={pic} frame={frame} onCancel={vi.fn()} onDone={vi.fn()} />, {
    locale: 'zh-TW',
    messages: zhMessages,
  });
  const stage = screen.getByRole('group');
  const holder = stage.querySelector<HTMLElement>('[style*="transform"]')!;
  const m = holder.style.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/)!;
  const [tx, ty, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const width = Number.parseFloat(stage.style.width);
  const height = Number.parseFloat(stage.style.height);
  // The frame: the stage less its 20 of dimmed picture on every side, 0.62 of its width tall, centred.
  const frameW = width - 40;
  const frameH = frameW * COVER_FRAME_RATIO;
  const fx = (width - frameW) / 2;
  const fy = (height - frameH) / 2;
  const out = POINTS.map(([u, v]): [number, number] => [(fx + u * frameW - tx) / s, (fy + v * frameH - ty) / s]);
  view.unmount();
  return out;
}

/** …and on the feed card's cover: the picture's pixel under each point of the box that is seen, and its scale. */
function inPreview(pic: StagePicture, frame: CoverFrame | null): { at: [number, number][]; pxPerPicturePx: number } {
  const H = Math.round(PREVIEW_W * COVER_FRAME_RATIO);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(PREVIEW_W);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(H);
  const { container, unmount } = render(<OrganicImage src="https://img.example.com/image/cover.avif" ratio={COVER_FRAME_RATIO} frame={frame} />);
  const box = container.firstElementChild as HTMLElement;
  const bled = box.firstElementChild as HTMLElement;
  const bleed = -Number.parseFloat(bled.style.inset);
  expect(bleed).toBeGreaterThan(0); // the cover does bleed past its box for the wobble
  if (!frame) {
    // No frame: the picture's shape comes from its load (naturalWidth × naturalHeight).
    const loading = container.querySelector('img')!;
    expect(loading).not.toHaveAttribute('data-frame'); // until then, as ever: covering the box and its bleed
    Object.defineProperty(loading, 'naturalWidth', { value: pic.width });
    Object.defineProperty(loading, 'naturalHeight', { value: pic.height });
    act(() => {
      fireEvent.load(loading);
    });
  }
  const img = container.querySelector<HTMLImageElement>('img[data-frame]')!;
  // The box the picture is placed in, in the seen box's coordinates: the bled wrapper, back in by its own inset.
  const holder = img.parentElement as HTMLElement;
  const back = holder === bled ? 0 : Number.parseFloat(holder.style.inset);
  const origin = back - bleed; // the placing box's left/top from the seen box's
  const boxW = PREVIEW_W + 2 * bleed - 2 * back;
  const boxH = H + 2 * bleed - 2 * back;
  const pct = (v: string) => Number.parseFloat(v) / 100;
  const left = origin + pct(img.style.left) * boxW;
  const top = origin + pct(img.style.top) * boxH;
  const drawnW = pct(img.style.width) * boxW;
  const drawnH = pct(img.style.height) * boxH;
  const at = POINTS.map(([u, v]): [number, number] => [((u * PREVIEW_W - left) / drawnW) * pic.width, ((v * H - top) / drawnH) * pic.height]);
  unmount();
  vi.restoreAllMocks();
  return { at, pxPerPicturePx: drawnW / pic.width };
}

afterEach(() => vi.restoreAllMocks());

describe('a framed cover shows what the 調整封面 window framed (round 33 §Q4)', () => {
  const cases: [string, number, number, { z: number; ox: number; oy: number }][] = [
    // 3 : 2 at zoom 1: no room across, a little up and down — moved as far down as it goes
    ['1536 × 1024, zoom 1, off-centre', 1536, 1024, { z: 1, ox: 0, oy: 0.03 }],
    ['1536 × 1024, zoom 1.5, off-centre', 1536, 1024, { z: 1.5, ox: -0.2, oy: 0.12 }],
    // a portrait photo: room only up and down at zoom 1
    ['1024 × 1536, zoom 1, off-centre', 1024, 1536, { z: 1, ox: 0, oy: -0.25 }],
    ['1024 × 1536, zoom 1.5, off-centre', 1024, 1536, { z: 1.5, ox: 0.18, oy: 0.4 }],
  ];

  it.each(cases)('%s: the same picture region, within a pixel of the preview', (_, w, h, view) => {
    const pic = picture(w, h);
    const frame = coverFrameOfView(pic, COVER_FRAME_RATIO, view);
    const windowAt = inWindow(pic, frame);
    const { at: previewAt, pxPerPicturePx } = inPreview(pic, frame);
    const worst = Math.max(...POINTS.map((_, i) => Math.hypot(windowAt[i][0] - previewAt[i][0], windowAt[i][1] - previewAt[i][1]) * pxPerPicturePx));
    // The frame's numbers are rounded to 4 places when kept: far under a pixel of the preview.
    expect(worst).toBeLessThan(1);
  });

  // The lead (overriding "no frame unchanged"): a cover with no frame — an AI cover, or one after 重設 — is the
  // centred frame at zoom 1 cut for the seen box, as the window shows it at its start; it was the picture covering
  // the box and its bleed, ≈1.1× tighter.
  it.each([
    [1536, 1024],
    [1024, 1536],
  ])('%i × %i with no frame: the preview is the window at its start', (w, h) => {
    const pic = picture(w, h);
    const windowAt = inWindow(pic, null);
    const { at: previewAt, pxPerPicturePx } = inPreview(pic, null);
    const worst = Math.max(...POINTS.map((_, i) => Math.hypot(windowAt[i][0] - previewAt[i][0], windowAt[i][1] - previewAt[i][1]) * pxPerPicturePx));
    expect(worst).toBeLessThan(1);
  });

  it('would catch the Pixel’s drift: the crop cut for the bled box lands many pixels off', () => {
    // The bug as numbers: the same frame cut for the box and its bleed (≈ 21 a side at 360 × 223), drawn over that
    // larger box — the window's corner lands ≈ 20 preview pixels from where the window showed it.
    const pic = picture(1536, 1024);
    const frame = coverFrameOfView(pic, COVER_FRAME_RATIO, { z: 1.5, ox: -0.2, oy: 0.12 });
    const windowAt = inWindow(pic, frame);
    const H = Math.round(PREVIEW_W * COVER_FRAME_RATIO);
    const b = Math.ceil(Math.min(PREVIEW_W, H) * 0.05 + 6 + 4); // OrganicImage's bleed
    const r = coverCrop(frame.ar, frame, (H + 2 * b) / (PREVIEW_W + 2 * b));
    const [u, v] = POINTS[0];
    const wrong = [(r.x + ((u * PREVIEW_W + b) / (PREVIEW_W + 2 * b)) * r.w) * pic.width, (r.y + ((v * H + b) / (H + 2 * b)) * r.h) * pic.height];
    const scale = (PREVIEW_W + 2 * b) / (r.w * pic.width);
    expect(Math.hypot(wrong[0] - windowAt[0][0], wrong[1] - windowAt[0][1]) * scale).toBeGreaterThan(10);
  });
});

describe('a card shared in a thread cuts its frame for the box that is seen (round 33 §Q4)', () => {
  const card: Card = {
    id: 'c1',
    authorId: 'u1',
    thoughtCore: '橋',
    story: '一段。',
    tags: [],
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-10-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    media: { type: 'image', url: 'https://img.example.com/bridge.webp', frame: { cx: 0.3, cy: 0.6, zoom: 1.5, ar: 1.5 } },
  };

  it('places the crop in the container’s width, the bleed past it on either side', () => {
    const W = 300;
    const BLEED = 4;
    const H = Math.round((W + 2 * BLEED) / 1.91);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(W + 2 * BLEED);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(H);
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, p) => {
      const cs = real(el, p);
      return (el as HTMLElement).dataset?.coverSeen == null && (el as HTMLElement).className?.toString().includes('cover')
        ? ({ ...cs, marginLeft: `-${BLEED}px` } as CSSStyleDeclaration)
        : cs;
    });
    const { container } = renderWithIntl(<SharedCardContent card={card} author={null} />);
    const seen = container.querySelector<HTMLElement>('[data-cover-seen]')!;
    expect(seen.style.left).toBe(`${BLEED}px`);
    expect(seen.style.right).toBe(`${BLEED}px`);
    const img = seen.querySelector('img')!;
    // drawn in the picture's own shape in the seen box (W × H): its aspect is the frame's
    const pct = (v: string) => Number.parseFloat(v) / 100;
    const aspect = (pct(img.style.width) * W) / (pct(img.style.height) * H);
    expect(Math.abs(aspect / 1.5 - 1)).toBeLessThan(0.001);
  });

  // Post-merge review: an unframed chat-card cover covered the bled span; it covers the seen box now (the centred
  // zoom-1 crop of what is seen), the same element in the same box as a framed one.
  it('covers the container’s width with no frame — the centred crop of the seen box', () => {
    const W = 300;
    const BLEED = 4;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(W + 2 * BLEED);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(Math.round((W + 2 * BLEED) / 1.91));
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, p) => {
      const cs = real(el, p);
      return (el as HTMLElement).dataset?.coverSeen == null && (el as HTMLElement).className?.toString().includes('cover')
        ? ({ ...cs, marginLeft: `-${BLEED}px` } as CSSStyleDeclaration)
        : cs;
    });
    const { container } = renderWithIntl(<SharedCardContent card={{ ...card, media: { type: 'image', url: card.media!.url } }} author={null} />);
    const img = container.querySelector('img')!;
    expect(img).not.toHaveAttribute('data-frame');
    const seen = img.parentElement!;
    expect(seen).toHaveAttribute('data-cover-seen');
    expect([seen.style.left, seen.style.right]).toEqual([`${BLEED}px`, `${BLEED}px`]);
  });
});

// Post-merge review (round 33): the unframed cover's <img> was unmounted right after its load — the shape read put
// it in a new frame box — so its blur-to-sharp reveal was lost and it popped ≈11 % smaller.
describe('an unframed cover as its shape arrives', () => {
  it('is the same element in the same box, at the same scale, before and after its load', () => {
    const W = 360;
    const H = Math.round(W * COVER_FRAME_RATIO);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(W);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(H);
    const { container } = render(<OrganicImage src="https://img.example.com/image/ai.avif" ratio={COVER_FRAME_RATIO} />);
    const before = container.querySelector('img')!;
    const box = before.parentElement!;
    expect(box).toHaveAttribute('data-frame-box');
    // Before the shape: covering the seen box (the centred zoom-1 crop of it).
    expect([before.style.width, before.style.height, before.style.objectFit]).toEqual(['100%', '100%', 'cover']);
    Object.defineProperty(before, 'naturalWidth', { value: 1536 });
    Object.defineProperty(before, 'naturalHeight', { value: 1024 });
    act(() => {
      fireEvent.load(before);
    });
    const after = container.querySelector('img')!;
    expect(after).toBe(before); // never remounted: its reveal runs on
    expect(after.parentElement).toBe(box);
    expect(after).toHaveAttribute('data-frame');
    // A 3 : 2 picture covering the 0.62 box is as wide as the box: the placed one is too — no change of scale.
    expect(after.style.width).toBe('100%');
    expect(Number.parseFloat(after.style.height)).toBeCloseTo((100 * (1 / 1.5)) / COVER_FRAME_RATIO, 2);
  });
});

import { describe, expect, it } from 'vitest';
import { STICKER_PACKS, stickerOf } from '@/lib/stickers/catalog';
import { STICKER_ART } from '@/lib/stickers/catalog.generated';
import { QUOTE_FILL, STICKER_TRIM_MARGIN, stickerArtTop, stickerFitTransform, stickerQuoteFit, stickerTrim } from './stickerBox';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.0002);

// Round 24 (the owner's: 點點 stood under half its square — empty paper over a sticker in the thread, and low in a
// quote's frame): the thread lays a sticker out by its drawing, a quote centres its key frame.
describe('a sticker laid out by its drawing', () => {
  it('trims the empty paper over and under the drawing, 2 % kept each side, the width the square’s', () => {
    // 點點's 哈哈: its top 28 % empty.
    const haha = stickerOf('pip', 'haha')!;
    expect(haha.box).toEqual([0.037, 0.278, 0.965, 0.972]);
    const trim = stickerTrim(haha.box);
    near(trim.top, 0.278 - STICKER_TRIM_MARGIN);
    near(trim.height, 0.972 - 0.278 + 2 * STICKER_TRIM_MARGIN);
    // At 144: 37 off the top, the box 106 tall — the drawing 2.9 inside it at both ends.
    expect(Math.round(trim.top * 144)).toBe(37);
    expect(Math.round(trim.height * 144)).toBe(106);
    // Every frame lies inside the layout box.
    expect(haha.box[1]).toBeGreaterThanOrEqual(trim.top);
    expect(haha.box[3]).toBeLessThanOrEqual(trim.top + trim.height + 1e-9);
  });

  it('never reaches past the square, and leaves a sticker without numbers as its square', () => {
    // 牽牽's 在嗎？ starts 1.9 % down: the box starts at the square's top.
    const anyone = stickerTrim(stickerOf('twine', 'anyone-there')!.box);
    expect(anyone.top).toBe(0);
    expect(anyone.height).toBeLessThanOrEqual(1);
    expect(stickerTrim([0, 0, 1, 1])).toEqual({ top: 0, height: 1 });
    expect(stickerTrim(undefined)).toEqual({ top: 0, height: 1 });
    expect(stickerTrim([0, 0.5, 1, 0.4])).toEqual({ top: 0, height: 1 });
    expect(stickerTrim([0, Number.NaN, 1, 1])).toEqual({ top: 0, height: 1 });
  });

  it('says where the key frame starts in the layout box, for coming up over a quote by the drawing', () => {
    // 點點's 嗨！ rests lower than its animation reaches.
    const hi = stickerOf('pip', 'hi')!;
    near(stickerArtTop(hi.box, hi.poseBox), hi.poseBox[1] - (hi.box[1] - STICKER_TRIM_MARGIN));
    // Its key frame as high as its frames: the margin alone.
    const haha = stickerOf('pip', 'haha')!;
    near(stickerArtTop(haha.box, haha.box), STICKER_TRIM_MARGIN);
    expect(stickerArtTop([0, 0, 1, 1], [0, 0, 1, 1])).toBe(0);
  });

  it('lays every sticker of the catalog out with its drawing whole — every frame and the key frame inside its box', () => {
    // The key frame's numbers come from its own file (the 256² thumb) and every number is rounded to three places,
    // so the key frame may stand up to a pixel of the thumb (tuck/morning: 0.004) past the animation's union.
    const POSE_SLACK = 1 / 256 + 0.001;
    // The room may end a hair past the square's foot (a drawing whose foot is under 2 % from it): never more.
    const FOOT_SLACK = 0.002;
    const eps = 1e-9;
    let count = 0;
    for (const pack of STICKER_PACKS) {
      for (const { id } of pack.stickers) {
        const where = `${pack.id}/${id}`;
        // Every sticker the catalog lists has its numbers (none falls back to the whole square).
        const art = STICKER_ART[where];
        expect(art?.box, where).toBeDefined();
        expect(art?.poseBox, where).toBeDefined();
        const st = stickerOf(pack.id, id)!;
        const [l, t, r, b] = st.box;
        const [pl, pt, pr, pb] = st.poseBox;
        // Real boxes: inside the square, of some size.
        for (const n of [...st.box, ...st.poseBox]) expect(n, where).toBeGreaterThanOrEqual(0);
        for (const n of [...st.box, ...st.poseBox]) expect(n, where).toBeLessThanOrEqual(1);
        expect(r, where).toBeGreaterThan(l);
        expect(b, where).toBeGreaterThan(t);
        expect(pr, where).toBeGreaterThan(pl);
        expect(pb, where).toBeGreaterThan(pt);
        // The key frame is one of the frames: inside their union, give or take the rounding.
        expect(pl, where).toBeGreaterThanOrEqual(l - POSE_SLACK);
        expect(pt, where).toBeGreaterThanOrEqual(t - POSE_SLACK);
        expect(pr, where).toBeLessThanOrEqual(r + POSE_SLACK);
        expect(pb, where).toBeLessThanOrEqual(b + POSE_SLACK);

        const trim = stickerTrim(st.box);
        const top = trim.top;
        const foot = trim.top + trim.height;
        // Rule 1: 2 % over the drawing (never above the square), 4 % more than the drawing in all (never taller).
        near(trim.top, Math.max(0, t - STICKER_TRIM_MARGIN));
        near(trim.height, Math.min(1, b - t + 2 * STICKER_TRIM_MARGIN));
        expect(trim.height, where).toBeLessThanOrEqual(1);
        expect(foot, where).toBeLessThanOrEqual(1 + FOOT_SLACK);
        // Nothing is cut: every frame lies inside the layout box…
        expect(t, where).toBeGreaterThanOrEqual(top - eps);
        expect(b, where).toBeLessThanOrEqual(foot + eps);
        // …and so does the key frame, the one the thread shows at rest.
        expect(pt, where).toBeGreaterThanOrEqual(top - POSE_SLACK);
        expect(pb, where).toBeLessThanOrEqual(foot + POSE_SLACK);
        // Answering a quote it comes up by its key frame's drawing: that drawing starts inside its box.
        const art0 = stickerArtTop(st.box, st.poseBox);
        expect(art0, where).toBeGreaterThanOrEqual(0);
        near(art0, Math.max(0, pt - top));
        expect(art0, where).toBeLessThan(trim.height);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe('a sticker quoted small', () => {
  it('centres its key frame and draws it as large as 92 % of the frame', () => {
    // 點點's 嗨！ at rest: low in its square, under half of it.
    const pose = stickerOf('pip', 'hi')!.poseBox;
    const fit = stickerQuoteFit(pose);
    const [l, t, r, b] = pose;
    near(fit.scale, QUOTE_FILL / Math.max(r - l, b - t));
    // The key frame's box, moved and grown: centred, its longer side 92 % of the frame.
    const at = (v: number, off: number) => off + v * fit.scale;
    near((at(l, fit.x) + at(r, fit.x)) / 2, 0.5);
    near((at(t, fit.y) + at(b, fit.y)) / 2, 0.5);
    near(Math.max(at(r, fit.x) - at(l, fit.x), at(b, fit.y) - at(t, fit.y)), QUOTE_FILL);
    expect(at(t, fit.y)).toBeGreaterThanOrEqual(0.04 - 1e-4);
    expect(at(b, fit.y)).toBeLessThanOrEqual(0.96 + 1e-4);
  });

  it('never draws a key frame smaller than its square, centring it all the same', () => {
    const fit = stickerQuoteFit([0, 0.02, 0.96, 0.98]);
    expect(fit.scale).toBe(1);
    near(fit.x, 0.02);
    near(fit.y, 0);
    expect(stickerQuoteFit([0, 0, 1, 1])).toEqual({ scale: 1, x: 0, y: 0 });
    expect(stickerQuoteFit(undefined)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('writes the fit as a transform from the top-left, none for the square as it is', () => {
    expect(stickerFitTransform({ scale: 1, x: 0, y: 0 })).toBeUndefined();
    expect(stickerFitTransform({ scale: 1.5, x: -0.25, y: 0.1 })).toBe('translate(-25%, 10%) scale(1.5)');
  });
});

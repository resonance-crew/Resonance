// @vitest-environment jsdom
/**
 * What a puppet holds (round 5, the owner: 「那個卡片看起來是從…這隻臂下穿過去，而且截斷了他的肩膀」): the paper is
 * drawn over the body and both arms with only the gripping mitten over it, and it ends beyond the mitten as the arm
 * goes out — swinging round it for a toss, sliding straight for a card brought in to the chest.
 */
import { describe, expect, it } from 'vitest';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { SLIP_H, SLIP_W } from './props';
import { MITTEN_FROM, StickerPuppet, type Slug } from './puppet';
import { armAngle, gripAnchor, holdOffset, slipGripped, slipInHand, writePose } from './write';

const manifest = (slug: Slug) => MASCOT_CAST.find((c) => c.slug === slug)!.manifest as never;
const ghost = (slug: Slug) => new StickerPuppet(null, null, { slug, k: 1 }, manifest(slug), '');
const live = (slug: Slug) => {
  const root = document.createElement('div');
  document.body.append(root);
  return new StickerPuppet(document, root, { slug, k: 0.3 }, manifest(slug), '/mascots/');
};
/** The slip's middle on the body for a held slip (rig units). */
const middle = (h: { at: readonly [number, number]; rot: number; scale: number; anchor?: readonly [number, number] }) => {
  const [ax, ay] = h.anchor!;
  const r = (h.rot * Math.PI) / 180;
  const dx = (SLIP_W / 2 - ax) * h.scale;
  const dy = (SLIP_H / 2 - ay) * h.scale;
  return [h.at[0] + dx * Math.cos(r) - dy * Math.sin(r), h.at[1] + dx * Math.sin(r) + dy * Math.cos(r)] as const;
};

describe('what a puppet holds', () => {
  it('is drawn over its body and both arms, each mitten again over it — shown only while that mitten grips', () => {
    for (const slug of ['tuck', 'card', 'dot', 'tag'] as const) {
      const P = live(slug);
      const body = P.bodyEl!;
      const kids = [...body.children];
      const hand = P.handLayer()!;
      const at = kids.indexOf(hand);
      // the hand layer after every part of the body, then the two mitten copies
      expect(kids.length - at, slug).toBe(3);
      const [mL, mR] = kids.slice(at + 1) as HTMLImageElement[];
      const arm = (sd: 'L' | 'R') => kids.find((k) => k !== mL && k !== mR && (k as HTMLImageElement).src?.includes(`${P.rig.arms[sd].name}.`)) as HTMLImageElement;
      expect(mL.src).toBe(arm('L').src);
      expect(mR.src).toBe(arm('R').src);
      // an arm kept in front lands under the hand layer, never over what it holds
      P.pose.keepL = P.pose.keepR = true;
      P.render();
      const now = [...body.children];
      expect(now.indexOf(arm('L')), slug).toBeLessThan(now.indexOf(hand));
      expect(now.indexOf(arm('R')), slug).toBeLessThan(now.indexOf(hand));
      expect(now.slice(-2)).toEqual([mL, mR]);
      // no grip: no copy; a grip: that mitten's copy, turned as its arm, cut across the arm where the mitten begins
      expect(mL.style.visibility).toBe('hidden');
      expect(mR.style.visibility).toBe('hidden');
      P.pose.gripR = true;
      P.setLift('R', 70);
      P.render();
      expect(mR.style.visibility).toBe('');
      expect(mL.style.visibility).toBe('hidden');
      expect(mR.style.transform).toBe(arm('R').style.transform);
      expect(mR.style.getPropertyValue('clip-path')).toMatch(/^polygon\(/);
      expect(MITTEN_FROM[slug]).toBeGreaterThan(0.4);
      expect(MITTEN_FROM[slug]).toBeLessThan(0.6);
      // the next pose starts with nothing gripped
      P.base();
      expect(P.pose.gripL || P.pose.gripR).toBe(false);
    }
  });

  it('takes a slip by the edge away from where it lies', () => {
    // the slip to the mitten's right: held by its left edge; under it: by its top
    expect(gripAnchor(0)[0]).toBeCloseTo(1.2, 6);
    expect(gripAnchor(0)[1]).toBeCloseTo(SLIP_H / 2, 6);
    expect(gripAnchor(90)[1]).toBeCloseTo(1.2, 6);
    expect(gripAnchor(180)[0]).toBeCloseTo(SLIP_W - 1.2, 6);
    expect(gripAnchor(-90)[1]).toBeCloseTo(SLIP_H - 1.2, 6);
  });

  it('is as the hold was found while in front of the chest, and straight beyond the mitten once the arm is out', () => {
    for (const [slug, hold, pen, opts] of [
      ['tuck', 'R', 'L', {}],
      ['card', 'R', 'L', { grow: 1.5 }],
      ['card', 'L', 'R', { penless: true, grow: 1.5 }],
      ['tag', 'R', 'L', { penless: true, grow: 1.3 }],
    ] as const) {
      const P = ghost(slug);
      const wp = writePose(P, hold, pen, opts);
      P.setLift(hold, wp.hold);
      const held = slipInHand(P, wp, hold);
      expect(held.anchor![0], slug).toBeCloseTo(wp.anchor[0], 4);
      expect(held.anchor![1], slug).toBeCloseTo(wp.anchor[1], 4);
      expect(held.scale).toBe(wp.scale);
      for (const way of ['swing', 'slide'] as const) {
        // the arm out to its own side and up, the slip come all the way out: its middle on the arm's line, past the mitten
        P.setLift(hold, 120);
        const out = slipInHand(P, wp, hold, 1, 0.6, way);
        const a = P.rig.arms[hold];
        const [mx, my] = middle(out);
        const along = (armAngle(hold, 120) * Math.PI) / 180;
        const dx = mx - out.at[0];
        const dy = my - out.at[1];
        const d = Math.hypot(dx, dy);
        expect(d, `${slug} ${way}`).toBeGreaterThan(0.3 * SLIP_W * out.scale);
        // (the slip leans −1…−5°, so its middle is a few degrees off the arm's line)
        expect((dx * Math.cos(along) + dy * Math.sin(along)) / d, `${slug} ${way}`).toBeGreaterThan(0.99);
        // farther from the brad than the mitten is: never back over the sleeve and the shoulder
        expect(Math.hypot(mx - a.pivot[0], my - a.pivot[1]), `${slug} ${way}`).toBeGreaterThan(Math.hypot(out.at[0] - a.pivot[0], out.at[1] - a.pivot[1]));
        expect(out.scale).toBeCloseTo(0.6 * wp.scale, 6);
      }
    }
  });

  it('swings round the mitten for a toss, and slides straight for a card brought in', () => {
    const P = ghost('card');
    const wp = writePose(P, 'R', 'L', { grow: 1.5 });
    const at: [number, number] = [0, 0];
    const arm0 = armAngle('R', wp.hold);
    // half way out: a swing has turned half its offset; a slide's grip is half way between the two edges
    const swing = slipGripped(wp, 'R', at, arm0 - 60, 0.5, 1, 'swing');
    const [sx, sy] = middle(swing);
    expect((Math.atan2(sy, sx) * 180) / Math.PI - wp.rot).toBeCloseTo(((arm0 - 60 + holdOffset(wp, 'R') / 2 - wp.rot + 540) % 360) - 180, 4);
    const slide = slipGripped(wp, 'R', at, arm0 - 60, 0.5, 1, 'slide');
    const beyond = gripAnchor(arm0 - 60 - wp.rot);
    expect(slide.anchor![0]).toBeCloseTo((wp.anchor[0] + beyond[0]) / 2, 6);
    expect(slide.anchor![1]).toBeCloseTo((wp.anchor[1] + beyond[1]) / 2, 6);
    // a given point of the slip (a friend holds it out: taken by whatever edge is in reach) is where it starts from
    const taken = slipGripped(wp, 'R', at, arm0 - 60, 1, 0.56, [10, 6]);
    expect(taken.anchor).toEqual([10, 6]);
  });
});

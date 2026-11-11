import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ghostPuppet } from '../runtime/actors';
import { MITTEN_MIDDLE, type StickerPuppet } from '../kit/puppet';
import { BEATS, BRIDGE_IN, FADE, MEET_RESTS, MEET_RIPPLES, MEET_WALK, meetClock, meetStart, PASS_SIZE, READ_RESTS, READ_RIPPLES, R1, CATCH, restClock, restStart, RIPPLE_LIFE, W1, Y1, ghost, type ActorPose, type BeatCtx, type SlotId, type SlotPose } from './beats';
import { WALK_FOOT, WALK_RISE, groundAt } from './ground';
import { WATER_Y } from './world';
import { computeLayout, finishLayout } from './layout';
import { EDGE_PX, HEADER_CLEAR, HELD_TOP, NIGHT_ROW_PALS, SKY_CARDS, SWING_PX, camOf, journeyCamEnd, placeOf, type PalSlug } from './marks';
import { SEGMENTS, SEG, smooth, span, type SceneN, type SegId } from './timeline';

/** A stage without a DOM: every card, actor and prop a frame places, recorded; the puppets are ghosts. */
function stage(w: number, h: number) {
  const L = computeLayout(w, h);
  // the night's puppets as the CSS draws them (--pal-4): smaller on a phone too narrow for their row
  const L4 = { ...L, pal: Math.min(L.pal, (w - 2 * (EDGE_PX + SWING_PX)) / NIGHT_ROW_PALS) };
  // the journey's world, drawn larger on a tall screen (the CSS's --zoom-2: 1.4 on a phone, 1.36 on a tablet)
  const zoom2 = L.name === 'wide' ? 1 : L.tablet ? 1.36 : 1.4;
  const L2 = finishLayout({ ...L, u: L.u * zoom2, pal: L.pal * (1 + (zoom2 - 1) * 0.85) });
  const lay = (n?: SceneN | 'carrier') => (n === 4 ? L4 : n === 2 ? L2 : L);
  const slots = new Map<SlotId, SlotPose>();
  const actors = new Map<string, ActorPose & { screen: [number, number] }>();
  const props = new Map<string, { x: number; y: number; layer: boolean; o: { k?: number; rot?: number; anchor?: unknown; w?: number } }>();
  const ghosts = new Map<string, StickerPuppet>();
  // the cards as the landing page's StoryCard lays them out (round 3), at the slots' CSS widths: the written card and the
  // one the wind carries are the same card (same size); the answer a little taller (a longer title)
  const cw = L.name === 'wide' ? 320 : L.tablet ? 340 : Math.min(300, w - 48);
  const ch = Math.round(150 + 0.9 * cw);
  const size: Record<SlotId, [number, number]> = {
    story: [cw, ch],
    a: [cw, ch],
    b: [cw, ch + 24],
    wave: [L.name === 'wide' || L.tablet ? 53 : 44, L.name === 'wide' || L.tablet ? 40 : 33],
    wave2: [L.name === 'wide' ? 61 : 76, L.name === 'wide' ? 46 : 57],
    cta: [L.name === 'wide' ? 380 : L.tablet ? 360 : Math.min(330, w - 48), L.name === 'wide' ? 450 : 410],
    sky0: [220, 351],
    sky1: [220, 351],
    sky2: [220, 376],
  };
  // a scene's camera at s: the journey's runs on to its end (the director's `cam`)
  const camAt = (n: SceneN, s: number) => (n === 2 ? camOf(2, L2) + (journeyCamEnd(L2) - camOf(2, L2)) * smooth(span(s, SEG.journey.t0, SEG.journey.t1)) : camOf(n, L));
  const screenAt =
    (s: number) =>
    (n: SceneN, x: number, y: number): [number, number] => {
      const M = lay(n);
      return [M.w / 2 + (x - camAt(n, s)) * M.u, M.groundY + (y - 885) * M.u];
    };
  const ctx = (s: number): BeatCtx => ({
    s,
    layout: L,
    layoutOf: (n) => lay(n),
    now: 0,
    resting: true,
    hero: { x: 20, y: 96, w: Math.min(L.w - 40, 520), h: L.name === 'wide' ? 0.3 * L.h : 230 },
    slot: (id) => ({ id, w: size[id][0], h: size[id][1], place: (p) => slots.set(id, p) }),
    actor: (scene, slug) => ({
      key: `${scene}:${slug}`,
      slug,
      place: (p) => actors.set(`${scene}:${slug}`, { ...p, screen: screenAt(s)(scene, p.x, p.y ?? groundAt(placeOf(scene, L), p.x)) }),
    }),
    carrier: (slug) => ({ key: `carrier:${slug}`, slug, place: (p) => actors.set(`carrier:${slug}`, { ...p, screen: [p.x, p.y ?? 0] }) }),
    toScreen: (n, x, y) => screenAt(s)(n, x, y),
    toWorld: (n, px, py) => [(px - lay(n).w / 2) / lay(n).u + camAt(n, s), (py - lay(n).groundY) / lay(n).u + 885],
    groundY: (n, x) => groundAt(placeOf(n, L), x),
    ghost: (slug: PalSlug, tag = '', n?: SceneN | 'carrier') => {
      const pal = lay(n).pal;
      const id = `${slug}|${tag}|${pal}`;
      let g = ghosts.get(id);
      if (!g) ghosts.set(id, (g = ghostPuppet(slug, pal)));
      return g;
    },
    props: {
      get: (name) => {
        let layer = false;
        const p = {
          at: (x: number, y: number, o: { k?: number; rot?: number; anchor?: unknown; w?: number } = {}) => {
            props.set(name, { x, y, layer, o });
            return p as never;
          },
          ink: () => p as never,
          into: (l: HTMLElement | null) => {
            layer = l != null;
            return p as never;
          },
          size: [30, 44] as const,
        };
        return p;
      },
    },
    epoch: 1,
    held: () => ({ dy: 0, alpha: 1 }),
    actorShift: () => ({ dy: 0, alpha: 1 }),
  });
  const frame = (seg: SegId, x: number) => {
    slots.clear();
    actors.clear();
    props.clear();
    const S = SEG[seg];
    const s = S.kind === 'act' ? S.t0 + x : S.kind === 'hold' ? S.t0 : S.t0 + x * (S.t1 - S.t0);
    BEATS[seg](x, ctx(s));
    return { slots: new Map(slots), actors: new Map(actors), props: new Map(props) };
  };
  return { L, L2, L4, frame, ctx, size };
}

const finite = (...v: (number | undefined)[]) => v.every((n) => n == null || Number.isFinite(n));
/** A slip as a frame placed it (held by an anchor at k px a unit, or flying by its middle at w px wide): its middle and its size. */
type Placed = { x: number; y: number; o: { k?: number; rot?: number; anchor?: unknown; w?: number } };
function paperOf(p: Placed): { cx: number; cy: number; w: number; h: number } {
  if (p.o.w != null) return { cx: p.x, cy: p.y, w: p.o.w, h: (p.o.w * 44) / 30 };
  const k = p.o.k ?? 1;
  const [ax, ay] = Array.isArray(p.o.anchor) ? (p.o.anchor as [number, number]) : [15, 22];
  const r = ((p.o.rot ?? 0) * Math.PI) / 180;
  const dx = (15 - ax) * k;
  const dy = (22 - ay) * k;
  return { cx: p.x + dx * Math.cos(r) - dy * Math.sin(r), cy: p.y + dx * Math.sin(r) + dy * Math.cos(r), w: 30 * k, h: 44 * k };
}
const samples = (seg: SegId) => {
  const S = SEG[seg];
  const n = 24;
  const max = S.kind === 'act' ? S.dur : S.kind === 'hold' ? 0 : 1;
  return Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
};

describe('the beats, acted by ghosts', () => {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ]) {
    it(`place every card, puppet and prop somewhere real in every segment (${w}×${h})`, () => {
      const { frame } = stage(w, h);
      for (const seg of SEGMENTS) {
        for (const x of samples(seg.id)) {
          const f = frame(seg.id, x);
          for (const [id, p] of f.slots) expect(finite(p.cx, p.cy, p.scale, p.sx, p.rot, p.alpha), `${seg.id} ${x} ${id}`).toBe(true);
          for (const [id, p] of f.actors) expect(finite(p.x, p.y, ...p.screen), `${seg.id} ${x} ${id}`).toBe(true);
          for (const [id, p] of f.props) expect(finite(p.x, p.y), `${seg.id} ${x} ${id}`).toBe(true);
        }
      }
    });
  }

  // round 3 (the owner: 「它拋向空中，然後卡片慢慢的那一張慢慢的變大」): no turn, no flip — a toss, and the card grows
  it('writes, tosses the slip up and lets the card grow out of it: the slip and pencil while writing, the card face-on after', () => {
    const { frame, size } = stage(390, 844);
    const T = W1.toss;
    const writing = frame('write', 2);
    expect([...writing.props.keys()].sort()).toEqual(['pencil-write', 'slip-write']);
    expect(writing.slots.has('story')).toBe(false);
    // tossed: the slip alone in the air, rising, slowing to the top
    const at = (A: number) => frame('write', A).props.get('slip-write')!;
    expect(frame('write', T.release + 0.3).props.has('pencil-write')).toBe(false);
    expect(at(T.release + 0.3).y).toBeLessThan(at(T.release + 0.05).y);
    expect(at(T.top - 0.1).y).toBeLessThan(at(T.release + 0.3).y);
    expect(Math.abs(at(T.top).y - at(T.top - 0.1).y)).toBeLessThan(Math.abs(at(T.release + 0.4).y - at(T.release + 0.3).y));
    // the card appears where the paper hangs, at its size, never turned edge-on or squashed
    const start = frame('write', T.become + 0.05).slots.get('story')!;
    const paper = frame('write', T.become + 0.05).props.get('slip-write')!;
    expect(Math.hypot(start.cx - paper.x, start.cy - paper.y)).toBeLessThan(6);
    expect((start.scale ?? 1) * size.story[0]).toBeLessThan(80);
    for (let A = T.become; A <= SEG.write.dur; A += 0.1) {
      const c = frame('write', A).slots.get('story')!;
      expect(c.sx ?? 1, `${A}`).toBe(1);
      expect(c.sy ?? 1, `${A}`).toBe(1);
    }
    // it grows slowly (over 1.2–1.8 s), then holds still for a while: room to read it
    expect(T.grown - T.become).toBeGreaterThanOrEqual(1.2);
    expect(T.grown - T.become).toBeLessThanOrEqual(1.8);
    const grown = frame('write', T.grown).slots.get('story')!;
    const end = frame('write', SEG.write.dur).slots.get('story')!;
    expect(grown).toEqual(end);
    expect(SEG.write.dur - (W1.wave + 1)).toBeGreaterThanOrEqual(1.2);
  });

  // round 3's art review: the card appeared growing and moving while the paper still showed — a double image
  it('lets the card take over from the paper exactly where it hangs: on it through the crossfade, growing only after', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame, size } = stage(w, h);
      for (const [seg, T, slot, prop] of [
        ['write', W1.toss, 'story', 'slip-write'],
        ['reply', R1.toss, 'b', 'slip-reply'],
        ['yours', Y1.toss, 'cta', 'blank-cta'],
      ] as const) {
        let seen = 0;
        for (let A = T.become + 0.01; A < T.become + FADE; A += 0.05) {
          const f = frame(seg, A);
          const card = f.slots.get(slot)!;
          const paper = f.props.get(prop)!;
          const tag = `${w}×${h} ${seg} ${A.toFixed(2)}`;
          expect(paper, tag).toBeTruthy();
          expect(Math.hypot(card.cx - paper.x, card.cy - paper.y), tag).toBeLessThan(0.5);
          expect(Math.abs((card.scale ?? 1) * size[slot][0] - paper.o.w!), tag).toBeLessThan(0.5);
          expect(Math.abs((card.rot ?? 0) - (paper.o.rot ?? 0)), tag).toBeLessThan(0.01);
          seen++;
        }
        expect(seen).toBeGreaterThan(3);
        // and then it grows
        const later = frame(seg, T.become + FADE + 0.5).slots.get(slot)!;
        const at = frame(seg, T.become + FADE).slots.get(slot)!;
        expect((later.scale ?? 1) > (at.scale ?? 1), `${seg}`).toBe(true);
      }
    }
  });

  // round 3: 「他的筆首先沒有接在手上」 — a writing arm near its rest slipped behind the body, under the slip it wrote on
  it('keeps the writing arm in front while the pencil is in its mitten, the pencil gone before the arm comes down', () => {
    for (const [w, h] of [
      [390, 844],
      [820, 1180],
      [1440, 900],
    ]) {
      const { frame, ctx } = stage(w, h);
      for (const [seg, R, slug, scene, name] of [
        ['write', W1, 'tuck', 1, 'pencil-write'],
        ['reply', R1, 'card', 2, 'pencil-reply'],
      ] as const) {
        let shown = 0;
        for (let A = R.pen[0]; A <= R.penAway[1] + 0.4; A += 0.05) {
          const f = frame(seg, A);
          const pencil = f.props.get(name);
          const P = ctx(SEG[seg].t0 + A).ghost(slug, '', scene);
          const tag = `${w}×${h} ${seg} ${A.toFixed(2)}`;
          if (pencil) {
            shown++;
            expect(P.pose.keepL || P.pose.keepR, tag).toBe(true);
          }
          // gone 0.3 s into the writing's end, while the mitten is still up
          if (A >= R.penAway[0] + 0.31) expect(pencil, tag).toBeUndefined();
        }
        expect(shown, `${w}×${h} ${seg}`).toBeGreaterThan(20);
      }
    }
  });

  it('holds the slip by its edge below the face, and the pencil in the other mitten with its point on the line (round 3)', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame, ctx } = stage(w, h);
      for (const A of [1.2, 2, 2.8, 3.4]) {
        const f = frame('write', A);
        // the puppet the frame posed (a ghost here: no live puppet, so the props are on the stage)
        const P = ctx(A).ghost('tuck', '', 1);
        const tag = `${w}×${h} ${A}`;
        const slip = f.props.get('slip-write')!;
        const pencil = f.props.get('pencil-write')!;
        const k = slip.o.k!;
        const [ax, ay] = slip.o.anchor as [number, number];
        // the slip's top (it is turned only a little) below the mouth: the face wholly in view
        const mouth = P.rig.parts.get('mouth')!;
        const mouthFoot = P.pagePoint(mouth.x + mouth.w / 2, mouth.y + mouth.h)[1];
        expect(slip.y - ay * k * Math.cos(((slip.o.rot ?? 0) * Math.PI) / 180) - 0.2 * ax * k, tag).toBeGreaterThan(mouthFoot);
        // each in a mitten: the slip's held edge in one, the pencil's grip in the other
        const near = (a: [number, number], x: number, y: number) => Math.hypot(a[0] - x, a[1] - y);
        const ms = (['L', 'R'] as const).map((sd) => P.mitten(sd, MITTEN_MIDDLE));
        expect(Math.min(...ms.map((m) => near([m[0], m[1]], slip.x, slip.y))), tag).toBeLessThan(0.08 * P.rig.height * P.k);
        expect(Math.min(...ms.map((m) => near([m[0], m[1]], pencil.x, pencil.y))), tag).toBeLessThan(0.08 * P.rig.height * P.k);
        // a third of the way from its cap, give or take
        const [, gy] = pencil.o.anchor as [number, number];
        expect((gy - 2) / 52, tag).toBeGreaterThan(0.2);
        expect((gy - 2) / 52, tag).toBeLessThan(0.45);
      }
    }
  });

  it('puts 點點 on the chip for the journey, and on the ground beside 聆聆 once it has caught it', () => {
    const { frame } = stage(1440, 900);
    expect(frame('journey', 0.5).actors.has('carrier:dot')).toBe(true);
    const caught = frame('catch', 2.2);
    expect(caught.actors.has('carrier:dot')).toBe(false);
    const dot = caught.actors.get('2:dot')!;
    const nod = caught.actors.get('2:card')!;
    expect(dot.screen[0]).toBeGreaterThan(nod.screen[0] + 40);
  });

  // round 5 (the owner: 「這個卡他拿到手上的時候是不是要縮成一張很小的呢？」): in a hand a card is a small paper
  it('holds the card it reads as a small paper in its left mitten, in front of its chest: the card itself away, its face clear', () => {
    for (const [w, h] of [
      [390, 844],
      [820, 1180],
      [1440, 900],
    ]) {
      const { frame, L2: L } = stage(w, h);
      for (const [seg, x] of [
        ['catch', 3.2],
        ['read', 0.5],
        ['read', 1.5],
        ['read', 3.2],
      ] as const) {
        const f = frame(seg, x);
        const tag = `${w}×${h} ${seg} ${x}`;
        expect(f.slots.has('a'), tag).toBe(false);
        const slip = paperOf(f.props.get('slip-a')!);
        const n = f.actors.get('2:card')!;
        const g = ghostPuppet('card', L.pal);
        g.x = n.screen[0];
        g.y = n.screen[1];
        // small: under half its body's width
        expect(slip.w, tag).toBeLessThan(0.5 * g.rig.torso.w * g.k);
        expect(slip.w, tag).toBeGreaterThan(16);
        // under its face, on its left half, whole in the view
        const [, fy] = g.pagePoint(g.rig.face[0], g.rig.face[1]);
        expect(slip.cy - slip.h / 2, tag).toBeGreaterThan(fy);
        expect(slip.cx, tag).toBeLessThan(n.screen[0]);
        expect(slip.cx - slip.w / 2, tag).toBeGreaterThan(0);
      }
    }
  });

  it('lands the card in the mitten as that paper, and lets it go as the card again: one on the other as they change over', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame, size } = stage(w, h);
      const same = (f: ReturnType<typeof frame>, tag: string) => {
        const a = f.slots.get('a')!;
        const slip = paperOf(f.props.get('slip-a')!);
        expect(Math.hypot(a.cx - slip.cx, a.cy - slip.cy), tag).toBeLessThan(0.5);
        expect(slip.w, tag).toBeCloseTo(size.a[0] * a.scale!, 3);
        expect(a.alpha ?? 1, tag).toBeLessThan(1);
      };
      // the flight: the card alone, then card and paper together, then the paper alone in the mitten
      const early = frame('catch', 0.4);
      expect(early.slots.get('a')?.alpha ?? 1).toBe(1);
      expect(early.props.has('slip-a')).toBe(false);
      same(frame('catch', 1.1), `${w}×${h} catch`);
      const landed = frame('catch', 1.7);
      expect(landed.slots.has('a')).toBe(false);
      expect(landed.props.has('slip-a')).toBe(true);
      // where the flight ended is where the mitten has it
      const before = paperOf(frame('catch', 1.59).props.get('slip-a')!);
      const after = paperOf(landed.props.get('slip-a')!);
      expect(Math.hypot(before.cx - after.cx, before.cy - after.cy)).toBeLessThan(0.12 * Math.min(w, h));
      // the reading's paper is where the reply's card starts from
      const read = paperOf(frame('read', SEG.read.dur).props.get('slip-a')!);
      const first = frame('reply', 0);
      const a0 = first.slots.get('a')!;
      expect(Math.hypot(a0.cx - read.cx, a0.cy - read.cy)).toBeLessThan(3);
      same(frame('reply', R1.rise / 2), `${w}×${h} reply`);
      const risen = frame('reply', R1.rise + 0.05);
      expect(risen.props.has('slip-a')).toBe(false);
      expect(risen.slots.get('a')?.alpha ?? 1).toBe(1);
    }
  });

  it('answers with ripples of the ≋ while reading, and with its own card after', () => {
    const { frame } = stage(390, 844);
    const reading = frame('read', 2.0);
    expect([...reading.props.keys()].some((k) => k.startsWith('ripple-read'))).toBe(true);
    const replied = frame('reply', R1.wave[1]);
    expect(replied.slots.get('b')?.sx ?? 1).toBe(1);
    expect(replied.slots.get('wave')?.draw).toBe(1);
    // 聆聆 writes on the slip in its own mitten (round 4), 點點 beside it
    const writing = frame('reply', 3);
    expect(writing.props.has('slip-reply')).toBe(true);
    expect(writing.props.has('pencil-reply')).toBe(true);
  });

  it('sends the ≋ out one wave at a time: never two marks over a head at once (round 4)', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame } = stage(w, h);
      for (const [seg, name, waves] of [
        ['read', 'ripple-read', READ_RIPPLES],
        ['meet', 'ripple-meet', MEET_RIPPLES],
      ] as const) {
        const seen = new Set<string>();
        for (let A = 0; A <= SEG[seg].dur; A += 1 / 24) {
          const marks = [...frame(seg, A).props].filter(([k]) => k.startsWith(name));
          for (const [k] of marks) seen.add(k);
          // (a wave's last faint twelfth may meet the next one's first)
          const clear = marks.filter(([, m]) => ((m.o as { alpha?: number }).alpha ?? 1) > 0.12);
          expect(clear.length, `${seg} @ ${A.toFixed(2)}`).toBeLessThanOrEqual(1);
        }
        expect(seen.size).toBe(waves.length);
        // each leaves only once the one before has gone
        for (let i = 1; i < waves.length; i++) expect(waves[i] - waves[i - 1]).toBeGreaterThanOrEqual(RIPPLE_LIFE - 0.06);
      }
      // the reading's last wave has gone by the act's end (its quiet moments counted): none is cut off as the reply begins
      expect(restStart(READ_RIPPLES[READ_RIPPLES.length - 1], READ_RESTS) + RIPPLE_LIFE).toBeLessThanOrEqual(SEG.read.dur + 1e-6);
      expect(meetStart(MEET_RIPPLES[MEET_RIPPLES.length - 1]) + RIPPLE_LIFE).toBeLessThanOrEqual(SEG.meet.dur + 1e-6);
    }
  });

  it('has 點點 bring a small slip out and hand it over in the gap between them: 聆聆 brings it in to write on, then hands it back for the toss', () => {
    for (const [w, h] of [
      [390, 844],
      [820, 1180],
      [1440, 900],
    ]) {
      const { frame, L2: L } = stage(w, h);
      const at = (A: number) => {
        const f = frame('reply', A);
        const slip = f.props.get('slip-reply');
        return { slip: slip ? paperOf(slip) : undefined, pencil: f.props.has('pencil-reply'), nod: f.actors.get('2:card')!.screen, dot: f.actors.get('2:dot')!.screen };
      };
      const tag = `${w}×${h}`;
      // behind 點點's back: no slip yet (the card is still on its way up)
      expect(at(R1.fetch[0]).slip).toBeUndefined();
      // held out: between the two, small, and over neither shoulder — 聆聆's right brad is clear of it
      const offered = at(R1.pass[0]);
      const written = at((R1.ink[0] + R1.ink[1]) / 2);
      expect(offered.pencil).toBe(false);
      expect(offered.slip!.cx, tag).toBeGreaterThan(offered.nod[0]);
      expect(offered.slip!.cx, tag).toBeLessThan(offered.dot[0]);
      expect(offered.slip!.w, tag).toBeCloseTo(PASS_SIZE * written.slip!.w, 3);
      const g = ghostPuppet('card', L.pal);
      g.x = offered.nod[0];
      g.y = offered.nod[1];
      const [bx, by] = g.pagePoint(...g.rig.arms.R.pivot);
      expect(Math.abs(bx - offered.slip!.cx) > offered.slip!.w / 2 || Math.abs(by - offered.slip!.cy) > offered.slip!.h / 2, tag).toBe(true);
      // it changes hands where it is: no move from one mitten to the other
      const taken = at(R1.pass[1]);
      expect(Math.hypot(taken.slip!.cx - offered.slip!.cx, taken.slip!.cy - offered.slip!.cy), tag).toBeLessThan(3);
      // written on: over 聆聆's own body — nearer its middle than 點點's — open to its full size, the pencil in its other mitten
      expect(written.pencil).toBe(true);
      expect(Math.abs(written.slip!.cx - written.nod[0])).toBeLessThan(Math.abs(written.slip!.cx - written.dot[0]));
      expect(written.slip!.cx).toBeLessThan(offered.slip!.cx - 6);
      // handed back before the toss: where it was offered, small again, the pencil gone
      const back = at(R1.toss.lift);
      expect(back.pencil).toBe(false);
      expect(back.slip!.w, tag).toBeCloseTo(offered.slip!.w, 3);
      expect(Math.hypot(back.slip!.cx - offered.slip!.cx, back.slip!.cy - offered.slip!.cy), tag).toBeLessThan(3);
      // it goes straight in and out: no jump from one twelfth to the next, and never down under 聆聆's feet's line
      const far = Math.hypot(offered.slip!.cx - written.slip!.cx, offered.slip!.cy - written.slip!.cy);
      let last: { cx: number; cy: number } | null = null;
      for (let A = R1.pass[0]; A <= R1.toss.lift; A += 1 / 12) {
        const p = at(A).slip!;
        if (last) expect(Math.hypot(p.cx - last.cx, p.cy - last.cy), `${tag} @ ${A.toFixed(2)}`).toBeLessThan(0.5 * far + 4);
        expect(p.cy, `${tag} @ ${A.toFixed(2)}`).toBeLessThan(Math.max(offered.slip!.cy, written.slip!.cy) + 0.25 * written.slip!.h);
        last = p;
      }
      // in order, with room for each step
      expect(R1.rise).toBeLessThan(R1.up);
      expect(R1.fetch[0]).toBeLessThan(R1.out[0]);
      expect(R1.pass[1]).toBeLessThanOrEqual(R1.hold[0]);
      expect(R1.penAway[1]).toBeLessThanOrEqual(R1.offer[0]);
      expect(R1.back[1]).toBeLessThanOrEqual(R1.toss.lift);
      expect(R1.wave[1]).toBeLessThan(SEG.reply.dur);
    }
  });

  it('swings a tossed paper round its mitten, ahead of the arm: let go above the tosser, never trailing back over it', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame, L, L4 } = stage(w, h);
      for (const [seg, name, actor, T, pal] of [
        ['write', 'slip-write', '1:tuck', W1.toss, L.pal],
        ['yours', 'blank-cta', '4:tag', Y1.toss, L4.pal],
      ] as const) {
        const f = frame(seg, T.release - 1 / 12);
        const p = paperOf(f.props.get(name)!);
        const who = f.actors.get(actor)!;
        const g = ghostPuppet(actor.split(':')[1] as PalSlug, pal);
        g.x = who.screen[0];
        g.y = who.screen[1];
        // above its shoulders as it leaves the mitten
        const [, sy] = g.pagePoint(...g.rig.arms.R.pivot);
        expect(p.cy, `${w}×${h} ${seg}`).toBeLessThan(sy);
      }
    }
  });

  it('keeps the ≋ between the two cards as they go up over the bridge: it never leaves them for the bridge (round 4)', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame } = stage(w, h);
      for (let v = 0; v <= 1.0001; v += 1 / 24) {
        const f = frame('bridge', Math.min(1, v));
        const a = f.slots.get('a')!;
        const b = f.slots.get('b')!;
        const waves = (['wave', 'wave2'] as const).map((id) => f.slots.get(id)).filter((p): p is SlotPose => !!p);
        expect(waves, `v ${v.toFixed(2)}`).toHaveLength(1);
        const wv = waves[0];
        expect(wv.cx).toBeGreaterThan(Math.min(a.cx, b.cx));
        expect(wv.cx).toBeLessThan(Math.max(a.cx, b.cx));
        expect(Math.abs(wv.cy - (a.cy + b.cy) / 2)).toBeLessThan(40);
        expect(wv.alpha ?? 1).toBe(1);
        expect(wv.sx ?? 1).toBe(1);
        expect(wv.draw).toBe(1);
      }
    }
    // the bridge itself comes from under the river: its whole arch below the water as its segment begins
    expect(BRIDGE_IN.drop).toBeGreaterThan(WATER_Y - (WALK_FOOT - WALK_RISE.wide) + 12);
    expect(BRIDGE_IN.rise[0]).toBeGreaterThanOrEqual(0);
    expect(BRIDGE_IN.rise[1]).toBeLessThanOrEqual(1);
  });

  it('meets on the bridge a little apart, never overlapping, on a phone and on a desktop', () => {
    for (const [w, h] of [
      [390, 844],
      [1440, 900],
    ]) {
      const { frame, L } = stage(w, h);
      // the bow's bottom (acting 4.75): after the walk up and the moment they face each other
      const m = frame('meet', meetStart(4.75));
      const t = m.actors.get('3:tuck')!;
      const n = m.actors.get('3:card')!;
      const tuck = ghostPuppet('tuck', L.pal);
      const nod = ghostPuppet('card', L.pal);
      const gap = n.screen[0] - t.screen[0] - (tuck.rig.torso.w / 2) * tuck.k - (nod.rig.torso.w / 2) * nod.k;
      expect(gap).toBeGreaterThan(0);
      expect(m.props.has('stroke-t-l')).toBe(true);
    }
  });

  it('walks up the bridge at a walk’s pace (never the meeting’s slower one), then acts the meeting slower', () => {
    // the owner (2026-11-12): 「走的有點像是慢動作」 — the walk ends within 2.7 s of the meeting's start
    expect(MEET_WALK.tuck[1] - MEET_WALK.tuck[0]).toBeLessThanOrEqual(2.3);
    expect(MEET_WALK.nod[1]).toBeLessThanOrEqual(2.8);
    const { frame } = stage(1440, 900);
    const at = (s: number, id: string) => frame('meet', s).actors.get(id)!.screen[0];
    // arrived: no further step after the walk's end
    expect(Math.abs(at(MEET_WALK.tuck[1] + 0.3, '3:tuck') - at(MEET_WALK.tuck[1] + 1, '3:tuck'))).toBeLessThan(0.5);
    expect(Math.abs(at(MEET_WALK.nod[1] + 0.3, '3:card') - at(MEET_WALK.nod[1] + 1, '3:card'))).toBeLessThan(0.5);
    // the acting clock: the segment's own seconds while they walk, then the meeting from its arrival, held at its end
    expect(meetClock(0)).toBe(0);
    expect(meetClock(1.2)).toBeCloseTo(1.2, 6);
    expect(meetClock(MEET_WALK.nod[1] + 1e-6)).toBeCloseTo(3.4, 4);
    expect(meetClock(SEG.meet.dur)).toBe(6.5);
    // and everything in it ends inside the segment, with a moment left after the last wave
    expect(meetStart(6.5)).toBeLessThanOrEqual(SEG.meet.dur - 0.8);
  });

  it('gives the catch, the reading and the meeting their room by holding a pose, never by playing a motion slower', () => {
    // the owner (2026-11-12): 「動畫還有哪裡也有一樣被調慢的問題」 — every clock runs one act second a second, or stands
    for (const [rests, dur] of [
      [CATCH.rests, SEG.catch.dur],
      [READ_RESTS, SEG.read.dur],
      [MEET_RESTS, SEG.meet.dur],
    ] as const) {
      for (let s = 0; s < dur; s += 0.05) {
        const rate = (restClock(s + 0.01, rests) - restClock(s, rests)) / 0.01;
        // (a step straddling a rest's edge runs part of it: between 0 and 1, never above)
        expect(rate, `rate at ${s}`).toBeLessThanOrEqual(1 + 1e-6);
        expect(rate < 1e-6 || Math.abs(rate - 1) < 1e-6 || restClock(s + 0.01, rests) === restClock(s + 0.02, rests) || restClock(s - 0.01, rests) === restClock(s, rests), `rate ${rate} at ${s}`).toBe(true);
      }
      // the quiet moments last a breath, not a stall
      for (const [, rest] of rests) {
        expect(rest).toBeGreaterThanOrEqual(0.3);
        expect(rest).toBeLessThanOrEqual(1);
      }
    }
    // and no rest falls inside a hop (a hop held mid-air would hang): 點點's in the reading (3.0–3.5) and the meeting (5.1–5.6)
    for (const [at] of READ_RESTS) expect(at <= 3.0 || at >= 3.5).toBe(true);
    for (const [at] of MEET_RESTS) expect(at <= 5.1 || at >= 5.6).toBe(true);
  });

  it('lets the valley’s two wait on the banks’ lips until the bridge comes up: in view on a phone as the valley arrives', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 640],
      [820, 1180],
    ]) {
      const { ctx, L } = stage(w, h);
      const base = ctx(SEG.bridge.t0);
      // the bridge's plane still down, as the director keeps it until the bridge rises
      const down = 0.7 * L.lvh;
      const feet = new Map<string, [number, number]>();
      const c: BeatCtx = {
        ...base,
        toScreen: (n, x, y, depth = 1) => {
          const [px, py] = base.toScreen(n, x, y, depth);
          return [px, depth === 0.9 ? py + down : py];
        },
        actor: (scene, slug) => ({ key: `${scene}:${slug}`, slug, place: (p) => feet.set(`${scene}:${slug}`, base.toScreen(scene, p.x, p.y ?? base.groundY(scene, p.x))) }),
      };
      BEATS.c2(1, c);
      for (const slug of ['tuck', 'card']) {
        const at = feet.get(`3:${slug}`);
        expect(at, `${w}×${h} ${slug}`).toBeDefined();
        // on the bank's lip (where any puppet on the ground stands: its feet at the floor's edge), inside the view
        expect(at![1], `${w}×${h} ${slug}`).toBeLessThan(L.groundY + 16);
        expect(at![1], `${w}×${h} ${slug}`).toBeGreaterThan(L.groundY - 20);
        expect(at![0], `${w}×${h} ${slug}`).toBeGreaterThan(0);
        expect(at![0], `${w}×${h} ${slug}`).toBeLessThan(L.w);
      }
    }
  });

  it('keeps every puppet of the night and of the bridge whole and 12 px inside a phone\'s view', () => {
    for (const [w, h] of [
      [320, 640],
      [320, 568],
      [360, 780],
      [390, 844],
      [430, 932],
    ]) {
      const { frame, L, L4 } = stage(w, h);
      const inside = (key: string, sx: number, slug: PalSlug, pal: number, tag: string) => {
        const g = ghostPuppet(slug, pal);
        const l = sx + g.rig.box.l * g.k;
        const r = sx + g.rig.box.r * g.k;
        // wholly out of the view is fine (a puppet waiting off stage); partly is not
        if (r <= 0 || l >= w) return;
        expect(l, `${tag} ${key}`).toBeGreaterThanOrEqual(12);
        expect(r, `${tag} ${key}`).toBeLessThanOrEqual(w - 12);
      };
      for (const A of [0, 1, 1.5, 2.2, 3, 4, 5, 5.4, 6.4, 7.4, 8.4, SEG.yours.dur]) {
        const night = frame('yours', A);
        for (const [key, p] of night.actors) inside(key, p.screen[0], key.split(':')[1] as PalSlug, L4.pal, `${w}×${h} yours ${A}`);
      }
      // the meeting's moments, as its clock reaches them
      for (const A of [0, 1.4, 2.5, meetStart(4.5), meetStart(6)]) {
        const meet = frame('meet', A);
        for (const [key, p] of meet.actors) inside(key, p.screen[0], key.split(':')[1] as PalSlug, L.pal, `${w}×${h} meet ${A}`);
      }
    }
  });

  it('draws the night\'s puppets smaller only on a phone too narrow for their row (the CSS\'s --pal-4 number)', () => {
    const order: PalSlug[] = ['tag', 'tuck', 'dot', 'card', 'night'];
    const g = order.map((sl) => ghostPuppet(sl, 420));
    // the row's span at torsos touching, in 摺摺 heights: the torsos, and the arms beyond the two ends
    const span = (g.reduce((a, p) => a + p.rig.torso.w * p.k, 0) + (-g[0].rig.box.l - g[0].rig.torso.w / 2) * g[0].k + (g[4].rig.box.r - g[4].rig.torso.w / 2) * g[4].k) / 420;
    expect(NIGHT_ROW_PALS).toBeGreaterThanOrEqual(span);
    expect(NIGHT_ROW_PALS - span).toBeLessThan(0.05);
    expect(readFileSync(join(__dirname, '../film.module.css'), 'utf8')).toContain(`(100vw - 36px) / ${NIGHT_ROW_PALS})`);
    expect(2 * (EDGE_PX + SWING_PX)).toBe(36);
  });

  it('stands the five in a row at night without overlapping, and 牽牽 hands over the blank', () => {
    const { frame, L4: L } = stage(390, 844);
    const night = frame('yours', Y1.show[1] + 0.3);
    const order: PalSlug[] = ['tag', 'tuck', 'dot', 'card', 'night'];
    const xs = order.map((sl) => night.actors.get(`4:${sl}`)!.screen[0]);
    for (let i = 1; i < xs.length; i++) {
      const a = ghostPuppet(order[i - 1], L.pal);
      const b = ghostPuppet(order[i], L.pal);
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual((a.rig.torso.w / 2) * a.k + (b.rig.torso.w / 2) * b.k - 0.5);
    }
    expect(night.props.has('blank-cta')).toBe(true);
    // tossed up, it grows into the call to action — face-on all the way
    const cta = frame('yours', Y1.toss.grown).slots.get('cta')!;
    expect(cta.sx ?? 1).toBe(1);
    expect(cta.alpha ?? 1).toBe(1);
  });

  // round 3: the cards are the landing page's StoryCard (a portrait card, not a chip) — each moment re-placed for it
  describe('the story cards over the stage', () => {
    const SIZES = [
      [390, 844],
      [820, 1180],
      [1180, 820],
      [1440, 900],
    ] as const;
    /** A pose's box on the stage (its scaled, turned card's). */
    const rect = (p: SlotPose, [w, h]: [number, number]) => {
      const sc = p.scale ?? 1;
      const r = (Math.abs(p.rot ?? 0) * Math.PI) / 180;
      const hw = ((w * Math.cos(r) + h * Math.sin(r)) * sc * Math.abs(p.sx ?? 1)) / 2;
      const hh = ((h * Math.cos(r) + w * Math.sin(r)) * sc * (p.sy ?? 1)) / 2;
      return { l: p.cx - hw, r: p.cx + hw, t: p.cy - hh, b: p.cy + hh };
    };
    const apart = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;

    // the owner, round 3: 「全部都慢一點…但是像那個卡片，譬如說在移動什麼那種，那種不要變慢好了」 — the film slowed, a card's
    // own move kept round 2's pace: A up beside B in 0.8 s, the pair up over the bridge in 2 s (then at rest)
    it('keeps the cards\' own moves at round 2\'s pace while the film around them slowed', () => {
      expect(R1.up).toBe(0.8);
      for (const [w, h] of SIZES) {
        const { frame } = stage(w, h);
        const tag = `${w}×${h}`;
        const at = (x: number) => frame('bridge', x).slots;
        const end = at(1);
        // in 2 s of the bridge's 2.6 the two are at the top, and stay there for its last 0.6 s
        const done = 2 / SEG.bridge.dur;
        for (const id of ['a', 'b'] as const) {
          const e = end.get(id)!;
          for (const x of [done, (done + 1) / 2]) {
            const p = at(x).get(id)!;
            expect(Math.hypot(p.cx - e.cx, p.cy - e.cy), `${tag} ${id} ${x}`).toBeLessThan(0.5);
          }
          // and still on the way up a little before, where there is a way up (a phone's pair is at the top already)
          const s0 = at(0).get(id)!;
          if (Math.hypot(s0.cx - e.cx, s0.cy - e.cy) > 20) {
            const before = at(done * 0.8).get(id)!;
            expect(Math.hypot(before.cx - e.cx, before.cy - e.cy), `${tag} ${id} before`).toBeGreaterThan(1);
          }
        }
      }
    });

    it('never lets a card over the player at the foot, in any segment', () => {
      for (const [w, h] of SIZES) {
        const { frame, L, size } = stage(w, h);
        for (const seg of SEGMENTS)
          for (const x of samples(seg.id))
            for (const [id, p] of frame(seg.id, x).slots) {
              if (id.startsWith('wave')) continue;
              expect(rect(p, size[id]).b, `${w}×${h} ${seg.id} ${x} ${id}`).toBeLessThanOrEqual(L.h - L.lip);
            }
      }
    });

    it('pops the written card wholly in view under the header, its foot over the puppets\' heads, big enough to read', () => {
      for (const [w, h] of SIZES) {
        const { frame, L, size } = stage(w, h);
        const p = frame('write', W1.toss.grown).slots.get('story')!;
        const r = rect(p, size.story);
        const tag = `${w}×${h}`;
        expect(r.t, tag).toBeGreaterThanOrEqual(HEADER_CLEAR - 0.5);
        expect(r.l, tag).toBeGreaterThanOrEqual(0);
        expect(r.r, tag).toBeLessThanOrEqual(w);
        expect(r.b, tag).toBeLessThanOrEqual(L.groundY - L.pal * 1.12);
        expect(p.scale, tag).toBeGreaterThanOrEqual(0.7);
        // the wind takes the same card on (A's slot is its twin): where it starts is where the story stood
        const a = frame('wind', 0.06).slots.get('a')!;
        expect(Math.hypot(a.cx - p.cx, a.cy - p.cy), tag).toBeLessThan(2);
        expect(Math.abs((a.scale ?? 1) - (p.scale ?? 1)), tag).toBeLessThan(0.01);
      }
    });

    it('seats 點點 on the card\'s top edge as the wind carries it, the card whole in the view', () => {
      for (const [w, h] of SIZES) {
        const { frame, size } = stage(w, h);
        for (const [seg, x] of [
          ['wind', 0.9],
          ['journey', 0.5],
        ] as const) {
          const f = frame(seg, x);
          const a = f.slots.get('a')!;
          const dot = f.actors.get('carrier:dot')!;
          const r = rect(a, size.a);
          const tag = `${w}×${h} ${seg} ${x}`;
          // the card's top edge (turned with it) where 點點 sits on it
          const rot = ((a.rot ?? 0) * Math.PI) / 180;
          const hh = (size.a[1] * (a.scale ?? 1)) / 2;
          const lx = (dot.screen[0] - a.cx - hh * Math.sin(rot)) / Math.cos(rot);
          const edge = a.cy + lx * Math.sin(rot) - hh * Math.cos(rot);
          expect(Math.abs(dot.screen[1] - edge), tag).toBeLessThan(10);
          expect(dot.screen[0], tag).toBeGreaterThan(r.l);
          expect(dot.screen[0], tag).toBeLessThan(r.r);
          expect(r.t, tag).toBeGreaterThanOrEqual(HELD_TOP);
          expect(r.l >= 0 && r.r <= w, tag).toBe(true);
        }
      }
    });

    it('sets A and B side by side under the header (a phone too), apart, clear of the puppets, the ≋ between them', () => {
      for (const [w, h] of SIZES) {
        const { frame, L2, size } = stage(w, h);
        for (const [seg, x] of [
          ['reply', R1.wave[1]],
          ['c2', 0.5],
          ['meet', 3],
        ] as const) {
          const f = frame(seg, x);
          const a = rect(f.slots.get('a')!, size.a);
          const b = rect(f.slots.get('b')!, size.b);
          const tag = `${w}×${h} ${seg} ${x}`;
          expect(a.r, tag).toBeLessThanOrEqual(b.l);
          expect(Math.abs(a.t - b.t), tag).toBeLessThan(1);
          expect(a.t, tag).toBeGreaterThanOrEqual(HELD_TOP);
          expect(a.l >= 0 && b.r <= w, tag).toBe(true);
          // the puppets' heads on the journey (the tallest the pair is shown over)
          expect(Math.max(a.b, b.b), tag).toBeLessThan(L2.groundY - L2.pal * 1.12);
          // covers and titles to know them by: never smaller than half
          expect(f.slots.get('a')!.scale, tag).toBeGreaterThanOrEqual(0.5);
          const wave = f.slots.get(seg === 'meet' ? 'wave2' : 'wave');
          if (wave) {
            expect(wave.cx, tag).toBeGreaterThan(a.r);
            expect(wave.cx, tag).toBeLessThan(b.l);
          }
        }
      }
    });

    it('puts the night sky\'s small cards round the call to action (wide), apart from it and from each other', () => {
      for (const [w, h] of [
        [1180, 820],
        [1440, 900],
        [1366, 768],
      ] as const) {
        const { frame, L4, size } = stage(w, h);
        const f = frame('yours', SEG.yours.dur);
        const cta = rect(f.slots.get('cta')!, size.cta);
        const sky = Array.from({ length: SKY_CARDS }, (_, i) => rect(f.slots.get(`sky${i}` as SlotId)!, size[`sky${i}` as SlotId]));
        const tag = `${w}×${h}`;
        expect(cta.t, tag).toBeGreaterThanOrEqual(HEADER_CLEAR);
        expect(cta.b, tag).toBeLessThan(L4.groundY - L4.pal * 1.12);
        sky.forEach((r, i) => {
          expect(apart(r, cta), `${tag} sky${i}`).toBe(true);
          expect(r.l >= 0 && r.r <= w && r.t >= HELD_TOP, `${tag} sky${i}`).toBe(true);
          expect(r.b, `${tag} sky${i}`).toBeLessThan(L4.groundY - L4.pal * 1.12);
          for (let j = 0; j < i; j++) expect(apart(r, sky[j]), `${tag} sky${i} sky${j}`).toBe(true);
        });
      }
    });
  });

  it('is pure: a ghost frame records the same picture as the frame itself', () => {
    const { frame, ctx } = stage(1440, 900);
    const real = frame('reply', 2.4);
    const g = ghost('reply', 2.4, ctx(SEG.reply.t0 + 2.4));
    expect(g.slots.get('a')).toBeDefined();
    expect(g.slots.get('a')).toEqual(real.slots.get('a'));
    expect(g.actors.get('2:card')?.x).toBe(real.actors.get('2:card')?.x);
  });
});

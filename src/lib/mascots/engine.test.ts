// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEG } from './geometry';
import { MAX_HURRY } from './motion';
import { PENCIL_LEN } from './props';
import type { Puppet } from './puppet';
import { MITTEN_MIDDLE } from './rig';
import { FEED, LEDGES, mountStage, type TestStage } from './stageFixture';
import type { ArmSide, Ledge, PeekLedge, Rect, SpotLedge, StageEvent } from './types';

let mounted: TestStage[] = [];
const mount = (o?: Parameters<typeof mountStage>[0]) => {
  const t = mountStage(o);
  mounted.push(t);
  return t;
};
afterEach(() => {
  for (const t of mounted) t.done();
  mounted = [];
});

const chars = (layer: HTMLElement) => [...layer.querySelectorAll<HTMLElement>('.ms-char')];
const part = (el: HTMLElement, name: string) => el.querySelector<HTMLImageElement>(`img[src$="/${name}.png"]`);

/** Is this element, or anything between it and the character's root, set hidden? */
function hiddenIn(el: Element, root: HTMLElement): boolean {
  for (let e: Element | null = el; e && e !== root.parentElement; e = e.parentElement) {
    if (e instanceof HTMLElement && e.style.visibility === 'hidden') return true;
  }
  return false;
}

/**
 * Where each character's drawing is on the page: the visible part images (the shadow on the ground left out) placed
 * by the root's translate and pop-up scale. Body turns are a few degrees and are left out, as is a cover's clip.
 */
function drawnBoxes(layer: HTMLElement): Rect[] {
  return chars(layer).map(el => {
    const m = /translate3d\((-?[\d.]+)px,(-?[\d.]+)px,0\)(?: scale\((-?[\d.]+),(-?[\d.]+)\))?/.exec(el.style.transform);
    const ox = m ? Number(m[1]) : 0;
    const oy = m ? Number(m[2]) : 0;
    const sx = m && m[3] ? Number(m[3]) : 1;
    const sy = m && m[4] ? Number(m[4]) : 1;
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const im of el.querySelectorAll('img')) {
      if (im.src.endsWith('/shadow.png') || hiddenIn(im, el)) continue;
      const x = parseFloat(im.style.left);
      const y = parseFloat(im.style.top);
      l = Math.min(l, ox + x * sx);
      r = Math.max(r, ox + (x + parseFloat(im.style.width)) * sx);
      t = Math.min(t, oy + y * sy);
      b = Math.max(b, oy + (y + parseFloat(im.style.height)) * sy);
    }
    return { x: l, y: t, w: r - l, h: b - t };
  });
}
const shared = (a: Rect, c: Rect) =>
  Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));

/** Frames (1/12 s) in which two characters cover each other by more than 15% of the smaller, outside a meeting. */
function overlapsOutsideMeetings(t: TestStage, secs: number): number {
  let n = 0;
  for (let i = 0; i < secs * 12; i++) {
    t.stage.advance(1 / 12);
    const boxes = drawnBoxes(t.layer);
    if (boxes.length !== 2 || t.stage.visitors().some(v => v.mode === 'duet' || v.mode === 'duet-walk')) continue;
    const [a, b] = boxes;
    if (shared(a, b) > 0.15 * Math.min(a.w * a.h, b.w * b.h)) n++;
  }
  return n;
}

/** Steps until an event matching `match` arrives (at most `limit` seconds); returns it. */
function until(t: TestStage, match: (e: StageEvent) => boolean, limit = 30): StageEvent {
  const seen = t.events.length;
  for (let i = 0; i < limit * 24; i++) {
    const e = t.events.slice(seen).find(match);
    if (e) return e;
    t.stage.advance(1 / 24);
  }
  throw new Error('no such event');
}

const acts = (t: TestStage) => t.events.flatMap(e => (e.type === 'act' ? [e.act] : []));

describe('mascot stage', () => {
  it('never draws two characters over each other outside a meeting', () => {
    let visits = 0;
    let pairs = 0;
    for (const [seed, view] of [[1, undefined], [2, undefined], [3, undefined], [4, FEED]] as const) {
      const t = mount({ seed, view });
      let together = 0;
      const n = overlapsOutsideMeetings(t, 120);
      expect(n, `seed ${seed}`).toBe(0);
      visits += t.events.filter(e => e.type === 'enter').length;
      together += t.events.filter(e => e.type === 'act' && e.pair).length;
      pairs += together;
    }
    // they did come, and often two at once: the count above is not an empty stage's zero
    expect(visits).toBeGreaterThan(20);
    expect(pairs).toBeGreaterThan(2);
  }, 20_000);   // eight minutes of the stage, read every frame: the resting characters keep moving (jsdom's styles are slow)

  it('has two on screen meet or greet each other within a minute', () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const t = mount({ seed });
      t.stage.advance(60);
      const met = t.events.filter(e => e.type === 'meet' || (e.type === 'act' && e.act === 'greet'));
      expect(met.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const e of met) kinds.add(e.type);
    }
    // both ways happen on their own: a guest walking up (meet), and two greeting from their places (an act)
    expect([...kinds].sort()).toEqual(['act', 'meet']);
  });

  it('sends a guest to the place across, and the two greet from afar', () => {
    const t = mount({ seed: 5 });
    expect(t.stage.visit({ ledge: 'headline-l', slug: 'tuck', acts: ['look'] })).toBe(true);
    t.stage.advance(2.6);
    expect(t.stage.meet()).toBe(true);
    const greet = until(t, e => e.type === 'act' && e.act === 'greet', 15);
    expect(greet).toMatchObject({ pair: true });
    const where = t.stage.visitors().map(v => v.ledge).sort();
    expect(where).toEqual(['headline-l', 'headline-r']);
    // waves pulse between them while they greet
    t.stage.advance(1.5);
    expect(t.layer.querySelectorAll('.ms-prop path.w0')).toHaveLength(1);
  });

  it('walks a guest up to someone on the wave: they meet, resonate and touch mittens', () => {
    const t = mount({ seed: 7 });
    t.stage.visit({ ledge: 'hero-wave', slug: 'tuck', acts: ['look', 'look', 'look'] });
    until(t, e => e.type === 'arrive', 10);   // standing there before anyone walks up
    t.stage.advance(1.5);
    expect(t.stage.meet('five')).toBe(true);
    const meet = until(t, e => e.type === 'meet', 20);
    expect(meet.type === 'meet' && meet.with).toBeTruthy();
    until(t, e => e.type === 'act' && e.act === 'five', 10);
    expect(acts(t)).toContain('resonate');
    until(t, e => e.type === 'leave' && !!e.pair, 10);
    t.stage.advance(9);   // each walks off at a walk, not a scurry
    expect(t.stage.visitors()).toHaveLength(0);
  });

  it('hides the face, arms and bow while the tag shows its back', () => {
    const t = mount({ seed: 3 });
    t.stage.visit({ ledge: 'hero-wave', slug: 'tag', acts: ['reveal'] });
    until(t, e => e.type === 'act' && e.act === 'reveal', 10);
    const [el] = chars(t.layer);
    const face = el.querySelector<HTMLElement>('.ms-face');
    if (!face) throw new Error('no face');
    const shown = (name: string) => {
      const im = part(el, name);
      return !!im && !hiddenIn(im, el);
    };
    expect(shown('torso')).toBe(true);
    expect(face.style.visibility).toBe('');
    t.stage.advance(1.5);   // halfway through turning round
    expect(shown('torso-alt')).toBe(true);
    expect(shown('torso')).toBe(false);
    expect(face.style.visibility).toBe('hidden');
    for (const name of ['arm-l', 'arm-r', 'deco']) expect(shown(name), name).toBe(false);
    t.stage.advance(1.6);   // turned back
    expect(shown('torso')).toBe(true);
    expect(face.style.visibility).toBe('');
    for (const name of ['arm-l', 'arm-r', 'deco']) expect(shown(name), name).toBe(true);
  });

  it('shows one still character with reduced motion, and asks for no frames', () => {
    const t = mount({ reducedMotion: true, autoplay: true });
    const [one, ...rest] = t.stage.visitors();
    expect(rest).toHaveLength(0);
    expect(one).toMatchObject({ slug: 'tuck', mode: 'still' });
    const [el] = chars(t.layer);
    const at = el.style.transform;
    t.screen.run(3000);
    t.stage.advance(3);
    expect(t.screen.calls).toEqual({ raf: 0, timers: 0 });
    expect(t.screen.pending()).toBe(0);
    expect(el.style.transform).toBe(at);
    expect(t.stage.visit({ slug: 'tag' })).toBe(false);
    expect(t.stage.meet()).toBe(false);
    expect(getComputedStyle(el.querySelector('.ms-hit') as Element).pointerEvents).toBe('none');
  });

  it('stops while the page is hidden and goes on when it shows again', () => {
    const t = mount({ seed: 2, autoplay: true });
    t.screen.run(2000);
    const ran = t.stage.time;
    expect(ran).toBeGreaterThan(1.8);
    const hide = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      hide(true);
      expect(t.screen.pending()).toBe(0);
      t.screen.run(3000);
      expect(t.stage.time).toBe(ran);
      hide(false);
      t.screen.run(1000);
      expect(t.stage.time).toBeGreaterThan(ran + 0.8);
    } finally {
      Reflect.deleteProperty(document, 'hidden');
    }
  });

  it('steps poses 12 times a second and positions 24 times a second', () => {
    const t = mount({ seed: 1 });
    t.stage.visit({ ledge: 'hero-wave', slug: 'tuck' });
    const [el] = chars(t.layer);
    const leg = part(el, 'leg-l');
    if (!leg) throw new Error('no leg');
    t.stage.advance(1 / 24);   // the first step draws everything
    let moves = 0;
    let poses = 0;
    for (let i = 0; i < 24; i++) {   // a second of walking in
      const [at, pose] = [el.style.transform, leg.style.transform];
      t.stage.advance(1 / 24);
      if (el.style.transform !== at) moves++;
      if (leg.style.transform !== pose) poses++;
    }
    expect(t.stage.visitors()[0].mode).toBe('enter');
    expect(moves).toBe(24);
    expect(poses).toBe(12);
    t.stage.setOptions({ fps: 0 });   // smooth: both every step
    poses = 0;
    for (let i = 0; i < 30; i++) {
      const pose = leg.style.transform;
      t.stage.advance(1 / 60);
      if (leg.style.transform !== pose) poses++;
    }
    expect(poses).toBeGreaterThan(25);
  });

  it('does what a visit asks first and drops the acts it does not know', () => {
    const t = mount({ seed: 4 });
    expect(t.stage.visit({ ledge: 'qr-point', slug: 'tuck', acts: ['bogus', 'point', 'toString', 'wave'] })).toBe(true);
    t.stage.advance(8);
    expect(acts(t).slice(0, 2)).toEqual(['point', 'wave']);
    expect(acts(t)).not.toContain('bogus');
    expect(acts(t)).not.toContain('toString');
    expect(t.stage.visitors()[0]).toMatchObject({ slug: 'tuck', ledge: 'qr-point' });
  });

  it('lets only the torso take the pointer, and not while it covers words or a button', () => {
    const t = mount({ seed: 6 });
    t.stage.visit({ ledge: 'hero-wave', slug: 'tuck', acts: ['look', 'look', 'look'] });
    until(t, e => e.type === 'arrive', 10);
    const [el] = chars(t.layer);
    const hit = el.querySelector<HTMLElement>('.ms-hit');
    if (!hit) throw new Error('no hit shape');
    const takes = (e: Element) => getComputedStyle(e).pointerEvents !== 'none';
    // nothing of the drawing takes it: not the arms, legs, bow or face, nor the stage itself
    expect(takes(t.layer.querySelector('.ms-stage') as Element)).toBe(false);
    const imgs = [...el.querySelectorAll('img')];
    expect(imgs.length).toBeGreaterThan(10);
    for (const im of imgs) expect(takes(im), im.src).toBe(false);
    const boxless = (e: Element) => e.matches('.ms-char, .ms-body, .ms-face');   // 0 × 0 frames: nothing to point at
    const takers = [...el.querySelectorAll('*')].filter(e => e !== hit && !boxless(e) && takes(e));
    expect(takers.map(e => e.className)).toEqual([]);
    // the shape is the torso's own outline over the torso's box
    expect(takes(hit)).toBe(true);
    expect(hit.style.clipPath).toMatch(/^polygon\(/);
    const torso = part(el, 'torso');
    if (!torso) throw new Error('no torso');
    for (const k of ['left', 'top', 'width', 'height'] as const) expect(hit.style[k]).toBe(torso.style[k]);
    // a button slid under the torso: the button keeps its clicks
    const { x, y, h } = t.stage.visitors()[0];
    t.content = [...t.content, { x: x - 10, y: y - h * 0.6, w: 20, h: 20 }];
    t.stage.advance(1 / 12);
    expect(takes(hit)).toBe(false);
    t.content = t.content.slice(0, -1);
    t.stage.advance(1 / 12);
    expect(takes(hit)).toBe(true);
    // a poke reaches it: a happy hop, then a second one sends it off, shy
    hit.click();
    expect(t.events.at(-1)).toMatchObject({ type: 'act', act: 'hop', cause: 'poke' });
    hit.click();
    expect(t.events.at(-1)).toMatchObject({ type: 'act', act: 'shy', cause: 'poke' });
    t.stage.advance(5);
    expect(t.stage.visitors()).toHaveLength(0);
  });

  it('dims the characters on the dark page, not on the light one', () => {
    const t = mount({ seed: 1 });
    const root = t.layer.querySelector<HTMLElement>('.ms-stage');
    if (!root) throw new Error('no stage');
    expect(root.classList.contains('ms-dim')).toBe(false);
    t.stage.setTheme('dark');
    expect(root.classList.contains('ms-dim')).toBe(true);
    expect(root.style.getPropertyValue('--ms-dim')).toBe('0.9');
    t.stage.setOptions({ nightDim: 1 });
    expect(root.classList.contains('ms-dim')).toBe(false);
  });

  it('sleeps while nobody is on stage: no frame is asked for until the next visitor is due', () => {
    const t = mount({ seed: 2, autoplay: true });
    t.screen.run(1100);   // the first visitor comes 1.2–2.5 s in
    expect(t.screen.calls.raf).toBe(0);
    expect(t.screen.calls.timers).toBe(1);   // one timer, set for when the visitor is due
    expect(t.stage.time).toBeGreaterThan(1.05);   // the stage's own time ran on all the same
    t.screen.run(3000);
    expect(t.events.some(e => e.type === 'enter')).toBe(true);
    expect(t.screen.calls.raf).toBeGreaterThan(30);
    // asked for a visit while asleep, it wakes at once
    const u = mount({ seed: 4, autoplay: true });
    u.screen.run(500);
    expect(u.stage.visit({ ledge: 'hero-wave', slug: 'tuck' })).toBe(true);
    const raf = u.screen.calls.raf;
    u.screen.run(100);
    expect(u.screen.calls.raf).toBeGreaterThan(raf);
  });

  it('stops for good, saying so once, when its frame keeps failing (not 24 errors a second)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const t = mount({ seed: 1, autoplay: true });
      t.stage.visit({ ledge: 'hero-wave', slug: 'tuck' });
      t.screen.run(200);
      t.view = undefined as unknown as Rect;   // a broken page: every step now throws
      t.screen.run(2000);
      expect(errors.mock.calls.map(c => String(c[0]))).toEqual(['[mascots] a frame failed', '[mascots] the stage stopped']);
      expect(t.layer.querySelector('.ms-stage')).toBeNull();
      expect(t.screen.pending()).toBe(0);
    } finally {
      errors.mockRestore();
    }
  });

  it('brings a character only once its parts are loaded and decoded', async () => {
    const proto = HTMLImageElement.prototype as unknown as { decode?: () => Promise<void> };
    const waiting: { src: string; done: () => void }[] = [];
    proto.decode = function (this: HTMLImageElement) {
      return new Promise<void>(done => waiting.push({ src: this.src, done }));
    };
    try {
      const t = mount({ seed: 2, autoplay: true });
      expect(waiting.length).toBeGreaterThan(10);   // two characters' parts, asked for at once
      t.screen.run(4000);   // the first visitor was due, but nobody's parts are in
      expect(t.events.filter(e => e.type === 'enter')).toHaveLength(0);
      const slugOf = (src: string) => /\/mascots\/([^/]+)\//.exec(src)?.[1];
      const first = slugOf(waiting[0].src);
      for (const w of waiting.filter(x => slugOf(x.src) === first)) w.done();
      await new Promise(r => setTimeout(r, 0));   // the decodes' promises settle
      t.screen.run(200);
      const enter = t.events.find(e => e.type === 'enter');
      expect(enter?.slug).toBe(first);   // the one that is ready, at once
      // every part it shows was among those decoded ahead
      const decoded = new Set(waiting.map(w => w.src));
      const shown = [...t.layer.querySelectorAll('.ms-char img')].map(im => (im as HTMLImageElement).src);
      expect(shown.length).toBeGreaterThan(10);
      for (const src of shown) expect(decoded.has(src), src).toBe(true);
    } finally {
      delete proto.decode;
    }
  });

  it('sends off a visitor the view’s top edge leaves mostly hidden (a fixed header over its body)', () => {
    const t = mount({ seed: 3 });
    t.stage.visit({ ledge: 'qr-point', slug: 'tuck', acts: ['look', 'look', 'look'] });
    until(t, e => e.type === 'arrive', 10);
    const { y, h } = t.stage.visitors()[0];
    t.view = { ...t.view, y: y - h * 0.75 };   // a quarter hidden: it stays
    t.stage.advance(1);
    expect(t.stage.visitors()[0].mode).not.toBe('exit');
    t.view = { ...t.view, y: y - h * 0.45 };   // more than half hidden, its feet still in view: it goes
    t.stage.advance(1 / 12);
    expect(t.stage.visitors()[0].mode).toBe('exit');
    t.stage.advance(3);
    expect(t.stage.visitors().filter(v => v.slug === 'tuck')).toHaveLength(0);
  });

  it('with reduced motion, moves the still one when the view’s top hides any of it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const t = mount({ reducedMotion: true });
      const before = t.stage.visitors()[0];
      t.view = { ...t.view, y: t.view.y + (before.y - before.h - t.view.y) + 12 };   // its head 12 px under the top
      document.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(300);
      const after = t.stage.visitors()[0];
      expect(after.ledge).not.toBe(before.ledge);
      expect(after.y - after.h).toBeGreaterThanOrEqual(t.view.y);
    } finally {
      vi.useRealTimers();
    }
  });

  it('points at a store badge without its mitten touching it, and waves with the arm away from it', () => {
    /** How far the arm's tip is inside `r` (px; below 0 it is outside). */
    const depth = (ch: Puppet, side: ArmSide, r: Rect) => {
      const a = ch.arm(side);
      const lift = side === 'L' ? ch.pose.liftL : ch.pose.liftR;
      const ang = ((side === 'L' ? 90 + lift : 90 - lift) + ch.pose.tilt) * DEG;
      const [bx, by] = ch.pagePoint(...a.pivot);
      const x = bx + Math.cos(ang) * a.len * ch.k;
      const y = by + Math.sin(ang) * a.len * ch.k;
      return Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y);
    };
    const badge = { x: 714, y: 583, w: 148, h: 44 };
    /** The deepest the left mitten went into the badge during the first act, and how high that arm was lifted. */
    const deepest = (ledges: Ledge[], acts: string[], seed: number, slug = 'tuck') => {
      const t = mount({ seed, ledges });
      t.stage.visit({ ledge: 'badges', slug, acts });
      until(t, e => e.type === 'act', 10);
      let d = -Infinity;
      let lift = -Infinity;
      for (let i = 0; i < 24 * 2.4; i++) {
        t.stage.advance(1 / 24);
        const ch = t.engine.chars[0];
        d = Math.max(d, depth(ch, 'L', badge));
        lift = Math.max(lift, ch.pose.liftL - ch.arm('L').rest);
      }
      return { d, lift };
    };
    // as the prototype had it (the body kept clear, not the arm): the pointing mitten lands well inside Google Play's
    const prototype = LEDGES.map(l => (l.id === 'badges' ? { ...l, reach: undefined, clear: undefined } : l));
    expect(deepest(prototype, ['point'], 3).d).toBeGreaterThan(8);
    for (const slug of ['tuck', 'dot']) {   // (牽牽 is too tall for this spot, under the paragraph)
      const { d, lift } = deepest(LEDGES, ['point'], 3, slug);
      expect(d, slug).toBeLessThan(-4);   // standing an arm's reach off, it points with its mitten short of the badge
      expect(lift, slug).toBeGreaterThan(40);   // and does point: the arm raised toward it
    }
    for (const seed of [1, 2, 3, 4]) expect(deepest(LEDGES, ['wave'], seed).d, `seed ${seed}`).toBeLessThan(0);
  });

  it('climbs onto a card under words already sitting, never taller than its seat', () => {
    const above = { x: 140, y: 1150, w: 340, h: 20 };   // the words of whatever is over the card
    const withWords = LEDGES.map(l => (l.id === 'card-1-top' ? { ...l, clear: [above] } : l));
    /** The highest a character's drawing reaches while it climbs on and sits (its parts' boxes, page px). */
    const highest = (ledges: Ledge[]) => {
      const t = mount({ seed: 5, ledges, view: FEED });
      expect(t.stage.visit({ ledge: 'card-1-top', slug: 'tag', acts: ['look', 'look'] })).toBe(true);
      let top = Infinity;
      for (let i = 0; i < 24 * 3; i++) {
        t.stage.advance(1 / 24);
        top = Math.min(top, drawnBoxes(t.layer)[0].y);
      }
      const seated = drawnBoxes(t.layer)[0].y;
      return { top, seated };
    };
    const plain = highest(LEDGES);
    expect(plain.top).toBeLessThan(plain.seated - 20);   // the first row's climb stands up tall on the edge first
    const capped = highest(withWords);
    expect(capped.top).toBeGreaterThanOrEqual(capped.seated - 1);
    expect(Math.abs(capped.seated - plain.seated)).toBeLessThan(1);   // and sits in the same place
  });

  it('moves a visitor with its place when the page moves it up or down, and sends it off when it moves sideways', () => {
    const ledges = [...LEDGES];
    const t = mount({ seed: 3, ledges });
    expect(t.stage.visit({ ledge: 'qr-point', slug: 'tuck', acts: ['look', 'look', 'look', 'look'] })).toBe(true);
    until(t, e => e.type === 'arrive', 10);
    t.stage.advance(1);
    const i = ledges.findIndex(l => l.id === 'qr-point');
    const spot = ledges[i] as SpotLedge;
    const [before] = t.stage.visitors();
    // the window made taller: the hero, centred in it, moves down
    const down = (l: SpotLedge, dx: number, dy: number): SpotLedge => ({
      ...l, x: l.x + dx, y: l.y + dy, target: l.target && [l.target[0] + dx, l.target[1] + dy],
    });
    ledges[i] = down(spot, 0, 30);
    t.stage.relayout();
    t.stage.advance(0.5);
    const [after] = t.stage.visitors();
    expect(after.slug).toBe('tuck');   // the same one, still at it: never gone on the spot for another to come
    expect(after.mode).toBe('act');
    expect(after.y).toBeCloseTo(before.y + 30, 5);
    expect(after.x).toBeCloseTo(before.x, 5);
    ledges[i] = down(spot, 80, 30);   // moved sideways: it can't follow, so it leaves as it would for a scroll
    t.stage.relayout();
    t.stage.advance(1 / 24);
    expect(t.stage.visitors()[0]?.mode).toBe('exit');
  });

  it('writes with the pencil in its mitten: the point on the slip, slanting out to the pencil’s side', () => {
    const ledges = LEDGES.map(l => (l.id === 'avatars-end' ? { ...l, target: [760, 700] as const } : l));
    const transform = (el: Element) => {
      const m = /translate\((-?[\d.]+)px,(-?[\d.]+)px\) rotate\((-?[\d.]+)deg\) scale\(([\d.]+)\) translate\((-?[\d.]+)px,(-?[\d.]+)px\)/
        .exec((el as HTMLElement).style.transform);
      if (!m) throw new Error('no transform');
      const [x, y, r, k, ax, ay] = m.slice(1).map(Number);
      return { x, y, r: r * DEG, k, ax: -ax, ay: -ay };
    };
    const prop = (t: TestStage, box: string) => {
      const el = [...t.layer.querySelectorAll('.ms-prop')].find(p => p.querySelector(`svg[viewBox="0 0 ${box}"]`));
      if (!el) throw new Error(`no ${box} prop`);
      return transform(el);
    };
    for (const slug of ['tuck', 'tag', 'dot']) {
      const t = mount({ seed: 2, ledges });
      expect(t.stage.visit({ ledge: 'avatars-end', slug, acts: ['write'] })).toBe(true);
      until(t, e => e.type === 'act' && e.act === 'write', 12);
      const ch = t.engine.chars[0];
      const pen: ArmSide = 760 < ch.x ? 'R' : 'L';
      const s = pen === 'R' ? 1 : -1;
      for (const at of [1.4, 1.9, 2.5]) {   // through the three lines
        t.stage.advance(at - (t.engine.time - t.events.find(e => e.type === 'act' && e.act === 'write')!.t));
        const pencil = prop(t, '12 56');
        const paper = prop(t, '40 30');
        const tip = [pencil.x, pencil.y];
        // on the slip: the point, read back into the slip's own drawing
        const dx = tip[0] - paper.x;
        const dy = tip[1] - paper.y;
        const qx = (dx * Math.cos(paper.r) + dy * Math.sin(paper.r)) / paper.k + paper.ax;
        const qy = (-dx * Math.sin(paper.r) + dy * Math.cos(paper.r)) / paper.k + paper.ay;
        expect(qx, `${slug} at ${at}s: the point on the slip`).toBeGreaterThan(4);
        expect(qx).toBeLessThan(36);
        expect(qy).toBeGreaterThan(4);
        expect(qy).toBeLessThan(26);
        // in the mitten: the mitten on the pencil's shaft, between its point and its top
        const up = [Math.sin(pencil.r), -Math.cos(pencil.r)];   // from the point toward the top
        const len = PENCIL_LEN * pencil.k;
        const [mx, my] = ch.mitten(pen, MITTEN_MIDDLE);
        const along = (mx - tip[0]) * up[0] + (my - tip[1]) * up[1];
        const off = Math.abs((mx - tip[0]) * up[1] - (my - tip[1]) * up[0]);
        expect(along / len, `${slug} at ${at}s: held up the shaft`).toBeGreaterThan(0.18);
        expect(along / len).toBeLessThan(0.9);
        expect(off / len, `${slug} at ${at}s: held on the shaft`).toBeLessThan(0.12);
        // slanting: its top out toward the pencil arm's side, as a pencil is held
        const slant = Math.atan2(s * up[0], -up[1]) / DEG;
        expect(slant, `${slug} at ${at}s: slant`).toBeGreaterThan(10);
        expect(slant).toBeLessThan(65);
      }
    }
  });

  it('peeks out past a side far enough that both eyes show', () => {
    const qr = LEDGES.find((l): l is PeekLedge => l.id === 'qr-left' && l.kind === 'peek')!;
    for (const slug of ['tuck', 'tag', 'dot']) {
      const t = mount({ seed: 4 });
      if (!t.stage.visit({ ledge: 'qr-left', slug, acts: ['look', 'look'] })) continue;   // too tall to hide there
      until(t, e => e.type === 'arrive', 10);
      const ch = t.engine.chars[0];
      const far = Math.max(...ch.rig.eyes.map(([x, y]) => ch.pagePoint(x, y)[0]));
      expect(far, slug).toBeLessThan(qr.cover.x - 12 * ch.k);
    }
  });

  it('falls back onto the page as a sheet of paper falls: slowly at first, then flat, in about a second', () => {
    const t = mount({ seed: 6 });
    expect(t.stage.visit({ ledge: 'pill-top', slug: 'tuck', acts: ['look'] })).toBe(true);
    const left = until(t, e => e.type === 'leave', 20).t;
    const root = chars(t.layer)[0];
    const height = () => Number(/scale\([\d.]+,([\d.]+)\)/.exec(root.style.transform)?.[1] ?? 1);
    t.stage.advance(0.4);
    expect(height()).toBeGreaterThan(0.85);   // tipping back, still nearly upright
    t.stage.advance(0.45);
    expect(height()).toBeLessThan(0.5);   // and faster as it goes
    while (t.stage.visitors().length) t.stage.advance(1 / 24);
    expect(t.engine.time - left).toBeGreaterThan(0.95);
  });

  it('rests between two activities without freezing: it settles first, and keeps breathing and swaying', () => {
    const t = mount({ seed: 8 });
    expect(t.stage.visit({ ledge: 'badges', slug: 'tuck', acts: ['look', 'look'] })).toBe(true);
    const arrived = until(t, e => e.type === 'arrive', 10).t;
    const body = chars(t.layer)[0].querySelector<HTMLElement>('.ms-body')!;
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      t.stage.advance(1 / 12);
      seen.add(body.style.transform);
    }
    expect(seen.size).toBeGreaterThan(3);   // moving, if only a little
    const first = until(t, e => e.type === 'act', 5).t;
    expect(first - arrived).toBeGreaterThan(0.65);
    const second = t.events.length;
    until(t, e => e.type === 'act', 10);
    const acts2 = t.events.slice(second).filter(e => e.type === 'act');
    expect(acts2.length).toBeGreaterThan(0);
    expect(acts2[0].t - first).toBeGreaterThan(2.8 + 1.25);   // a look takes 2.8 s; then at least the shortest rest
  });

  it('stays down once it has fallen over, parting from a meeting with no way to walk off', () => {
    const t = mount({ seed: 7 });
    // by the badges: the badges block the way left, so the one on the left falls back onto the page as they part
    t.stage.visit({ ledge: 'badges', slug: 'tuck', acts: ['look', 'look', 'look'] });
    until(t, e => e.type === 'arrive', 10);
    t.stage.advance(1.5);
    expect(t.stage.meet('none')).toBe(true);
    const duet = t.engine.chars[0].duet;
    expect(duet).toBeTruthy();
    if (duet) duet.together = false;   // each its own way (they leave together by chance otherwise)
    until(t, e => e.type === 'leave' && !!e.pair, 30);
    const fallen = new Set<string>();
    let standingAgain = 0;
    for (let i = 0; i < 24 * 12 && t.engine.chars.length; i++) {
      t.stage.advance(1 / 24);
      for (const ch of t.engine.chars) {
        const height = Number(/scale\([\d.]+,([\d.]+)\)/.exec(ch.el.style.transform)?.[1] ?? 1);
        const shows = ch.el.style.opacity !== '0';
        if (height < 0.1) fallen.add(ch.slug);
        else if (fallen.has(ch.slug) && shows && height > 0.5) standingAgain++;   // up again after lying flat (not the landing's little bounce)
      }
    }
    expect(fallen.size).toBeGreaterThan(0);   // someone did fall over
    expect(standingAgain).toBe(0);
    expect(t.engine.chars).toHaveLength(0);
  });

  it('walks within about 1.3× of each other, and never more than a brisk walk', () => {
    const t = mount({ seed: 9 });
    const paces: number[] = [];
    for (const slug of ['tuck', 'tag', 'dot']) {
      expect(t.stage.visit({ ledge: 'hero-wave', slug, acts: ['look'] })).toBe(true);
      const ch = t.engine.chars[0];
      paces.push(ch.pace());
      t.stage.advance(1 / 24);   // put at the side of the view: a jump, not a step
      const from = ch.x;
      let secs = 0;
      for (; secs < 12 && ch.mode === 'enter'; secs += 1 / 24) t.stage.advance(1 / 24);
      const speed = Math.abs(ch.x - from) / secs;   // the whole way in (a hop is quicker in the air than on average)
      expect(speed, slug).toBeGreaterThan(0.5 * ch.pace());
      expect(speed, slug).toBeLessThan(ch.pace() * MAX_HURRY * 1.25);
    }
    expect(Math.max(...paces) / Math.min(...paces)).toBeLessThan(1.35);
  });
});

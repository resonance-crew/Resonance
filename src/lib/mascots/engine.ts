/**
 * The landing page's paper puppets: a small stage engine, no framework, no dependencies.
 *
 *   const stage = createStage(env, cast, { size: 1, fps: 12, onEvent });
 *
 * The env is everything the engine knows about the page (types.ts: the layer it draws in, the ledges, the view, the
 * words and buttons to keep off); a cast entry is a character's manifest and where its part images are. Visitors come
 * one or two at a time to a ledge in view, do a few things there and go; two on screen may greet from afar or meet.
 * Poses step 12 times a second by default (cut-paper stop motion) while positions move 24 times a second; fps 0 is
 * smooth. Only an invisible shape over each torso takes the pointer. The stage stops while the tab is hidden or the
 * layer is out of view, sleeps on one timer while nobody is on it, and with reduced motion one character stands still
 * somewhere in view. A character comes only once its parts are loaded and decoded (never a torso without its eyes),
 * and one whose place is mostly out of view — under a fixed header the view leaves out, say — goes.
 */
import { ACT_STANCE, isActName } from './acts';
import { clamp, overlaps, pathY, seeded, topY } from './geometry';
import { idle, quick } from './motion';
import { Prop, type PropKind, type PropOwner } from './props';
import { Puppet } from './puppet';
import { duet, greetFromAfar, leave, shy, visit, type GreetShared } from './scenes';
import type {
  ActName, CastEntry, Cover, Duet, Ledge, LineLedge, MeetVariant, Plan, Rect, Side, StageApi, StageClock, StageEnv,
  StageEventDetail, StageOptions, StageSettings, Theme, VisitRequest,
} from './types';

export const DEFAULT_OPTIONS: Readonly<StageOptions> = {
  size: 1, fps: 12, moveFps: 24, heightCurve: 0.75, first: [1.2, 2.5], visit: [9, 16], dwell: 4.5, gap: [3, 7],
  meetChance: 0.45, pairChance: 0.2, meetEvery: 60, greetChance: 0.85, greetEvery: 20, farWalk: 340, walkLimit: 2.6,
  nightDim: 0.9,
};

const STYLE = `
.ms-stage{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:clip;contain:layout style;
  --ms-ink-dark:oklch(32% 0.02 60);--ms-ink-light:oklch(93% 0.02 80)}
.ms-char{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}
.ms-char img{position:absolute;display:block;max-width:none;margin:0;padding:0;border:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
.ms-char .ms-hit{position:absolute;display:block;pointer-events:auto;cursor:default;background:transparent;-webkit-tap-highlight-color:transparent}
.ms-body,.ms-face{position:absolute;left:0;top:0;width:0;height:0}
.ms-blush{position:absolute;display:block;opacity:0;border-radius:50%;background:radial-gradient(closest-side,oklch(66% 0.13 40/.75),oklch(66% 0.13 40/0))}
.ms-stage.ms-dim .ms-char img{filter:brightness(var(--ms-dim)) saturate(calc(var(--ms-dim) + .02))}
.ms-stage.ms-dim .ms-char img.ms-glow{filter:none}
.ms-prop{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;z-index:40;will-change:transform,opacity}
.ms-prop svg{display:block;overflow:visible}
.ms-prop path{transform-box:fill-box;transform-origin:left center}
`;

/** The stages on each document: the style goes with the last of them. */
const styled = new WeakMap<Document, number>();

/** A character's parts being fetched and decoded before it may come; `at`: when (clock seconds) it last failed. */
interface Warm {
  state: 'loading' | 'ready' | 'failed';
  /** Held so the decoded pictures stay in the document's list of available images: a part's <img> is then drawn at once. */
  imgs: HTMLImageElement[];
  at: number;
  then: (() => void)[];
}

/** Seconds before a character whose parts failed to load is tried again. */
const WARM_RETRY = 20;
/** A stage whose frame fails this many times in a row stops for good (one bad frame never stops it). */
const MAX_FAILS = 3;
/** Of a character at its place, at least this much shows (the rest under the view's top edge) or it goes. */
const SHOWN_ENOUGH = 0.6;

/** Who comes next and when: a visitor, two walking in to meet, or a guest for `host`. */
type Schedule =
  | { type: 'visit'; at: number }
  | { type: 'pair'; at: number }
  | { type: 'meet'; at: number; until: number; host: Puppet };

interface Greeting {
  a: Puppet;
  b: Puppet;
  sure: boolean;
  go: boolean;
  started: boolean;
  until: number;
}

type Timers = NonNullable<StageClock['timers']>;

/** Drops undefined values, so `{ size: undefined }` keeps the default rather than erasing it. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export class Stage {
  readonly env: StageEnv;
  readonly doc: Document;
  readonly cast: CastEntry[];
  readonly o: StageOptions;
  readonly rand: () => number;
  readonly root: HTMLDivElement;
  readonly props = new Set<Prop>();
  theme: Theme;
  reduced: boolean;
  /** The stage's own time and the current step, seconds. */
  time = 0;
  dt = 0;
  vp: Rect;
  chars: Puppet[] = [];

  private clock: StageClock;
  private timers: Timers | null;
  private acc = 0;
  private last: number | null = null;
  private tick = 0;
  private duets: Duet[] = [];
  private lastSlug: string | null = null;
  private lastLedge: string | null = null;
  private plan: Schedule | null = null;
  private slots = [false, false];
  private visits = 0;
  private lastMeetAt = -Infinity;
  private lastGreetAt = -Infinity;
  private greet: Greeting | null = null;
  private greetPending: { a: Puppet; b: Puppet } | null = null;
  private variant: MeetVariant | null = null;
  private statsAcc = { n: 0, sum: 0, max: 0, steps: 0 };
  private hold = { user: true, hidden: false, off: false };
  private running = false;
  private raf = 0;
  private timer = 0;
  /** Since when (clock ms) the loop sleeps on its timer, nobody on stage; null while it steps. */
  private napping: number | null = null;
  private fails = 0;
  private destroyed = false;
  private readonly warm = new Map<string, Warm>();
  /** A visitor was due while nobody's parts were ready: it comes as soon as someone's are. */
  private partsWanted = false;
  /** The browser can load and decode a picture ahead (img.decode): characters wait for their parts. */
  private readonly decodes: boolean;
  private scrollT: number | undefined;
  private io: IntersectionObserver | undefined;
  private readonly frameFn: (now: number) => void;
  private readonly onVis: () => void;
  private readonly onScroll: () => void;

  constructor(env: StageEnv, cast: readonly CastEntry[], opts: Partial<StageOptions> = {}) {
    this.env = env;
    this.doc = env.document || env.layer.ownerDocument;
    this.cast = cast.filter(c => c && c.manifest);
    this.o = { ...DEFAULT_OPTIONS, ...defined(opts) };
    this.rand = env.random || (opts.seed != null ? seeded(opts.seed) : Math.random);
    const W = this.doc.defaultView;
    this.clock = env.clock || {
      now: () => performance.now(), raf: f => requestAnimationFrame(f), caf: id => cancelAnimationFrame(id),
    };
    this.timers = env.clock ? env.clock.timers || null
      : W ? { set: (f, ms) => W.setTimeout(f, ms), clear: id => W.clearTimeout(id) } : null;
    this.theme = env.theme === 'dark' ? 'dark' : 'light';
    this.reduced = !!env.reducedMotion;
    const Img = (W as (Window & typeof globalThis) | null)?.Image;
    this.decodes = !!Img && typeof Img.prototype.decode === 'function';
    // nothing to wait for where nothing can be decoded ahead: everyone is ready, their parts come as they come
    if (!this.decodes) for (const c of this.cast) this.warm.set(c.slug, { state: 'ready', imgs: [], at: 0, then: [] });
    styled.set(this.doc, (styled.get(this.doc) ?? 0) + 1);
    if (!this.doc.getElementById('ms-style')) {
      const st = this.doc.createElement('style');
      st.id = 'ms-style';
      st.textContent = STYLE;
      this.doc.head.append(st);
    }
    this.root = this.doc.createElement('div');
    this.root.className = 'ms-stage';
    this.root.setAttribute('aria-hidden', 'true');
    env.layer.append(this.root);
    this.setTheme(this.theme);
    this.frameFn = now => this.frame(now);
    this.vp = env.viewport();
    // pause while the tab is hidden or the stage is scrolled away
    this.onVis = () => {
      this.hold.hidden = this.doc.hidden;
      this.wake();
    };
    this.doc.addEventListener('visibilitychange', this.onVis);
    if (W && typeof W.IntersectionObserver === 'function' && opts.observe !== false) {
      this.io = new W.IntersectionObserver(es => {
        this.hold.off = !es[es.length - 1].isIntersecting;
        this.wake();
      });
      this.io.observe(env.layer);
    }
    // reduced motion: when scrolling stops with the still character out of view, it is simply somewhere in view
    this.onScroll = () => {
      if (!this.reduced || !W) return;
      W.clearTimeout(this.scrollT);
      this.scrollT = W.setTimeout(() => this.restill(), 250);
    };
    this.doc.addEventListener('scroll', this.onScroll, true);
    if (W) W.addEventListener('resize', this.onScroll);
    if (this.reduced) this.still();
    else {
      this.plan = { at: this.between(this.o.first), type: 'visit' };
      this.warmAhead(2);   // the first visitor's parts, and the next one's, load during the first wait
    }
    if (opts.autoplay !== false) this.start();
  }

  /** Px per rig unit for a character 420 units tall. */
  get k(): number {
    return ((this.env.unitHeight || 120) * this.o.size) / 420;
  }
  between([a, b]: readonly [number, number]): number {
    return this.time + a + this.rand() * (b - a);
  }
  emit(ch: Puppet, detail: StageEventDetail): void {
    if (this.o.onEvent) this.o.onEvent({ ...detail, slug: ch.slug, name: ch.name, t: this.time });
  }
  ledges(): readonly Ledge[] {
    const l = this.env.ledges;
    return (typeof l === 'function' ? l() : l) || [];
  }
  content(): readonly Rect[] {
    const c = this.env.content;
    return (typeof c === 'function' ? c() : c) || [];
  }
  /** Just past the side of the view. */
  offX(ch: Puppet, side: Side): number {
    const vp = this.vp;
    return side === 'left' ? vp.x - ch.halfW - 24 : vp.x + vp.w + ch.halfW + 24;
  }
  /** The pencil props near this character take: its ledge says which reads on its background, else the theme's. */
  inkOf(ch: Puppet | null): 'light' | 'dark' {
    const ink = ch && ch.plan && ch.plan.ledge.ink;
    const v = ink && ink[this.theme];
    return v === 'light' || v === 'dark' ? v : this.theme === 'dark' ? 'light' : 'dark';
  }
  /**
   * A prop's centre moved up until its box (w × h) is off every word, button and card it would cover (the elements
   * characters hide behind count too); null if that takes more than `limit` px.
   */
  clearOf(x: number, y: number, w: number, h: number, limit = Infinity): [number, number] | null {
    const rects: Cover[] = [...this.content()];
    for (const l of this.ledges()) if ((l.kind === 'edge' || l.kind === 'peek') && l.cover) rects.push(l.cover);
    const y0 = y;
    for (let i = 0; i < 5; i++) {
      const box = { x: x - w / 2, y: y - h / 2, w, h };
      const r = rects.find(q => overlaps(box, q, 3));
      if (!r) return y0 - y > limit ? null : [x, y];
      y = Math.min(y, (r.top && r.top.length ? Math.min(r.y, ...r.top.map(q => q[1])) : r.y) - h / 2 - 6);
    }
    return null;
  }
  /** Where (and how big) the three waves go between two faces apart, or null if there is no room. */
  wavesBetween(L: Puppet, R: Puppet): [number, number, number] | null {
    const [ax, ay] = L.facePage();
    const [bx, by] = R.facePage();
    const k = (L.k + R.k) / 2;
    const s = clamp((((bx - ax) / k) * 0.5) / 85, 1, 1.9);
    const w = 100 * k * s;
    const h = 44 * k * s;
    const at = this.clearOf((ax + bx) / 2, (ay + by) / 2 - 6 * k, w, h, Math.max(L.h, R.h) * 0.75);
    return at && [at[0], at[1], k * s];
  }

  api(): StageApi {
    const now = () => this.time + this.napped();
    return {
      start: () => this.start(),
      stop: () => this.stopUser(),
      pause: () => this.stopUser(),
      resume: () => this.start(),
      next: () => {
        this.next();
        this.poke();
      },
      meet: variant => {
        const ok = this.meet(variant);
        this.poke();
        return ok;
      },
      canMeet: () => !!this.meetLedge(),
      visit: (o = {}) => {
        const ok = this.visitNow(o);
        this.poke();
        return ok;
      },
      setOptions: o => this.setOptions(o),
      setTheme: t => this.setTheme(t),
      setReducedMotion: v => this.setReduced(v),
      advance: sec => this.advance(sec),
      refresh: () => {
        this.vp = this.env.viewport();
        this.update(0);
      },
      visitors: () => this.chars.map(c => ({
        slug: c.slug, name: c.name, x: c.x, y: c.y, mode: c.mode, ledge: c.plan ? c.plan.ledge.id : null, h: c.h,
      })),
      stats: () => ({ ...this.statsAcc, avgMs: this.statsAcc.n ? this.statsAcc.sum / this.statsAcc.n : 0 }),
      resetStats: () => {
        this.statsAcc = { n: 0, sum: 0, max: 0, steps: 0 };
      },
      destroy: () => this.destroy(),
      get time() {
        return now();
      },
    };
  }

  // --- the clock ---
  // stepped mode: an update every 1/24 s (poses change on every other one), woken by a timer just before it is due
  // and drawn on the next animation frame, so the page idles in between; smooth mode: every animation frame
  private stepSec(): number {
    return this.o.fps ? 1 / (this.o.fps * this.every()) : 0;
  }
  private every(): number {
    return this.o.fps ? Math.max(1, Math.round((this.o.moveFps || this.o.fps) / this.o.fps)) : 1;
  }
  start(): void {
    this.hold.user = false;
    this.wake();
  }
  private stopUser(): void {
    this.hold.user = true;
    this.wake();
  }
  /** Starts or stops the frame loop to match the holds (user pause, hidden tab, off screen, reduced motion). */
  private wake(): void {
    const run = !this.hold.user && !this.hold.hidden && !this.hold.off && !this.destroyed && !this.reduced;
    if (run && !this.running) {
      this.running = true;
      this.last = null;
      this.loop();
    }
    if (!run && this.running) {
      this.running = false;
      if (this.raf) this.clock.caf(this.raf);
      if (this.timer && this.timers) this.timers.clear(this.timer);
      this.raf = this.timer = 0;
      this.settleNap();   // from here time stands still while stopped, as it does for a hidden tab
    }
  }
  /**
   * Seconds the loop may sleep: nobody on stage, nothing in the air, the next visitor not due for a while. While it
   * sleeps no frame is asked for (the page's main thread and a phone's battery are left alone).
   */
  private napFor(): number {
    if (this.reduced || !this.timers || this.chars.length || this.duets.length || this.props.size || !this.plan) return 0;
    const left = this.plan.at - this.time;
    return left > 0.25 ? left : 0;
  }
  /** Seconds slept so far (the stage's clock runs on while nobody is on it). */
  private napped(): number {
    return this.napping != null ? Math.max(0, (this.clock.now() - this.napping) / 1000) : 0;
  }
  private settleNap(): void {
    this.time += this.napped();
    this.napping = null;
  }
  /** The sleep is over (its timer, or something put on stage meanwhile): the stage's clock catches up, frames resume. */
  private endNap(): void {
    if (this.napping == null) return;
    this.settleNap();
    this.last = null;
    this.acc = 0;
    if (this.timer && this.timers) this.timers.clear(this.timer);
    this.timer = 0;
    this.loop();
  }
  /** Something changed that the sleeping loop should see now (an API call, a character's parts ready). */
  private poke(): void {
    if (this.napping != null) this.endNap();
  }
  /** Schedules the next frame, unless something stopped the loop meanwhile. */
  private loop(): void {
    if (!this.running || this.raf || this.timer) return;
    const timers = this.timers;
    const nap = this.napFor();
    if (nap && timers) {
      this.napping = this.clock.now();
      this.timer = timers.set(() => {
        this.timer = 0;
        this.endNap();
      }, nap * 1000);
      return;
    }
    const step = this.stepSec();
    if (step && timers && this.last != null) {
      const wait = (step - this.acc) * 1000 - 6;   // wake a little early: the frame itself waits for the screen
      if (wait > 2) {
        this.timer = timers.set(() => {
          this.timer = 0;
          if (this.running) this.raf = this.clock.raf(this.frameFn);
        }, wait);
        return;
      }
    }
    this.raf = this.clock.raf(this.frameFn);
  }
  private frame(now: number): void {
    this.raf = 0;
    try {
      const t0 = this.clock.now();
      const real = this.last == null ? 0 : Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const step = this.stepSec();
      if (step) {
        this.acc += real;
        if (this.acc >= step - 0.017) {   // due within a screen frame: step now (the difference carries over)
          const n = Math.max(1, Math.round(this.acc / step));
          this.acc = Math.max(-0.017, this.acc - n * step);
          for (let i = 0; i < n; i++) this.update(step);
          this.statsAcc.steps++;
        }
      } else if (real > 0) {
        this.update(real);
        this.statsAcc.steps++;
      }
      const ms = this.clock.now() - t0;
      const s = this.statsAcc;
      s.n++;
      s.sum += ms;
      s.max = Math.max(s.max, ms);
      this.fails = 0;
    } catch (e) {
      // one bad frame never stops the stage; the same failure frame after frame does (said once, not 24 times a second)
      if (++this.fails === 1) console.error('[mascots] a frame failed', e);
      if (this.fails >= MAX_FAILS) {
        console.error('[mascots] the stage stopped');
        this.destroy();
      }
    } finally {
      this.loop();
    }
  }
  /** Runs the stage for `sec` seconds of its own time, now (for tests and stills). */
  advance(sec: number): void {
    const napping = this.napping != null;
    if (napping) {   // wake first: the steps below may put someone on stage
      if (this.timer && this.timers) this.timers.clear(this.timer);
      this.timer = 0;
      this.settleNap();
    }
    const step = this.stepSec() || 1 / 60;
    for (let t = 0; t < sec - 1e-9; t += step) this.update(step);
    if (napping) {
      this.last = null;
      this.loop();
    }
  }

  private update(dt: number): void {
    this.dt = dt;
    this.time += dt;
    this.vp = this.env.viewport();
    this.tick = (this.tick + 1) % this.every();
    const full = this.tick === 0 || !this.o.fps;
    if (!this.reduced) this.schedule();
    for (const ch of this.chars) ch.base();
    if (!this.reduced) this.greetCheck();
    for (const ch of this.chars) ch.run();
    for (const d of this.duets) {
      if (!d.gen || d.gen.next().done) d.done = true;
      else if (d.met && !this.inView(d.a, 0) && !this.inView(d.b, 0)) {
        this.dropProps(d);
        d.done = true;
        d.a.gone = d.b.gone = true;
      }
    }
    this.duets = this.duets.filter(d => !d.done);
    for (const ch of this.chars) {
      ch.overlay(dt);
      ch.render(full);
    }
    if (full) for (const p of this.props) p.flush();
    if (!this.reduced) this.watch();
    for (const ch of this.chars.filter(c => c.gone || (!c.tasks.length && !c.duet && !c.still))) this.remove(ch);
  }

  // --- who comes, when, and where ---
  private schedule(): void {
    const pl = this.plan;
    if (!pl || this.time < pl.at) return;
    if (pl.type === 'meet') {
      const host = pl.host;
      if (!this.chars.includes(host) || host.gone || host.duet || host.mode === 'exit' || this.time > pl.until) {
        this.plan = null;
        return;
      }
      if (host.mode === 'enter' || !host.between) {   // still arriving, or busy
        pl.at = this.time + 0.1;
        return;
      }
      this.plan = null;
      if (this.chars.length !== 1 || !this.inView(host, 0)) return;
      if (this.canJoin(host) && !(host.plan?.ledge.partner && this.rand() < 0.35)) {
        this.join(host);
        this.lastMeetAt = this.time;
      } else if (this.across(host) || (this.canJoin(host) && this.join(host))) this.lastMeetAt = this.time;
      return;
    }
    if (this.chars.length >= 2) {
      pl.at = this.time + 0.5;
      return;
    }
    if (pl.type === 'pair') {
      if (this.chars.length) {
        pl.at = this.time + 0.3;
        return;
      }
      this.plan = null;
      this.pairUp();
      return;
    }
    const ch = this.spawn(this.pickCast(), null, { first: this.visits === 0, with: this.chars[0] });
    if (!ch || !ch.plan) {
      pl.at = this.time + 1.5;
      return;
    }
    this.plan = null;
    if (this.chars.length === 1 && this.o.pairChance + this.o.meetChance > 0) {
      const r = this.rand();
      const l = ch.plan.ledge;
      const mc = l.meetChance ?? this.o.meetChance;
      const meetable = (l.meet && ch.plan.stance === 'stand') || l.partner;
      if (meetable && r < mc && this.time - this.lastMeetAt >= this.o.meetEvery) {
        this.plan = { at: this.time + 3.5 + this.rand() * 2.5, until: this.time + 14, type: 'meet', host: ch };
      } else if (r < mc + this.o.pairChance) this.plan = { at: this.between([4, 7]), type: 'visit' };
    }
  }

  /** Someone free to come (not on stage, not `exclude`d) whose parts are ready: not the last visitor if anyone else is. */
  private pickCast(exclude: readonly string[] = []): CastEntry | null {
    const busy = new Set([...this.chars.map(c => c.slug), ...exclude]);
    const free = this.cast.filter(c => !busy.has(c.slug) && this.isReady(c));
    let pool = free.filter(c => c.slug !== this.lastSlug);
    if (!pool.length) pool = free;
    if (!pool.length) {
      this.warmAhead(1);   // nobody ready yet (a slow network): the first to be comes at once
      this.partsWanted = true;
      return null;
    }
    return this.weighted(pool);
  }
  private weighted(pool: readonly CastEntry[], rand = this.rand): CastEntry {
    const w = pool.map(c => (c.traits && c.traits.often && c.traits.often[this.theme]) || 1);
    let r = rand() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < pool.length; i++) if ((r -= w[i]) <= 0) return pool[i];
    return pool[pool.length - 1];
  }

  // --- the parts, loaded before a character comes ---
  /** The clock's time, seconds (runs while the stage is paused or still, unlike the stage's own time). */
  private secs(): number {
    return this.clock.now() / 1000;
  }
  private isReady(entry: CastEntry): boolean {
    return this.warm.get(entry.slug)?.state === 'ready';
  }
  /**
   * Loads and decodes a character's parts; `then` runs once they are ready. Where the browser can't decode ahead (no
   * img.decode, as in jsdom) a character is ready at once and its parts come as they come.
   */
  private warmUp(entry: CastEntry, then?: () => void): void {
    const known = this.warm.get(entry.slug);
    if (known && (known.state !== 'failed' || this.secs() - known.at < WARM_RETRY)) {
      if (then && known.state === 'ready') then();
      else if (then && known.state === 'loading') known.then.push(then);
      return;
    }
    const Img = this.decodes ? (this.doc.defaultView as Window & typeof globalThis).Image : null;
    if (!Img) {
      this.warm.set(entry.slug, { state: 'ready', imgs: [], at: 0, then: [] });
      then?.();
      return;
    }
    const imgs = entry.manifest.parts.filter(p => p.w).map(p => {
      const im = new Img();
      im.decoding = 'async';
      im.src = entry.base + p.img;
      return im;
    });
    const w: Warm = { state: 'loading', imgs, at: this.secs(), then: then ? [then] : [] };
    this.warm.set(entry.slug, w);
    Promise.all(imgs.map(im => im.decode())).then(() => {
      if (this.destroyed || this.warm.get(entry.slug) !== w) return;
      w.state = 'ready';
      const fns = w.then.splice(0);
      for (const fn of fns) fn();
      if (this.partsWanted && this.plan && this.plan.type !== 'meet') {   // a visitor was due but nobody was ready
        this.plan.at = Math.min(this.plan.at, this.time + this.napped());
      }
      this.partsWanted = false;
      this.poke();
    }, () => {
      if (this.warm.get(entry.slug) !== w) return;
      w.state = 'failed';
      w.at = this.secs();
      w.imgs = [];
      w.then = [];
    });
  }
  /** Starts loading `n` more characters nobody has loaded yet (by the cast's own weights), one ahead of their visit. */
  private warmAhead(n: number): void {
    for (let i = 0; i < n; i++) {
      const cold = this.cast.filter(c => {
        const w = this.warm.get(c.slug);
        return !w || (w.state === 'failed' && this.secs() - w.at >= WARM_RETRY);
      });
      if (!cold.length) return;
      this.warmUp(this.weighted(cold, Math.random));   // never the stage's seeded dice: a seed replays the same visits
    }
  }
  private freeSlot(): number {
    const i = this.slots.indexOf(false);
    if (i < 0) return -1;
    this.slots[i] = true;
    return i;
  }

  private spawn(entry: CastEntry | null, only: ((l: Ledge) => boolean) | null, o?: PlaceHints): Puppet | null {
    if (!entry) return null;
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const ch = new Puppet(this, entry, slot);
    const pl = this.place(ch, only, o);
    if (!pl) {
      ch.destroy();
      this.slots[slot] = false;
      return null;
    }
    this.begin(ch, pl);
    ch.push(visit(this, ch, pl));
    this.visits++;
    return ch;
  }
  private begin(ch: Puppet, pl: Plan): void {
    ch.plan = pl;
    ch.surface = pl.surface;
    ch.y = pl.y;
    ch.x = pl.x;
    ch.noShadow = !!pl.noShadow;
    ch.sitU = 0;
    ch.floorU = 0;
    ch.base();
    if (pl.how === 'pop') ch.pose.popY = 0.02;
    this.chars.push(ch);
    this.lastSlug = ch.slug;
    this.lastLedge = pl.ledge.id;
    this.emit(ch, { type: 'enter', how: pl.how, side: pl.side, ledge: pl.ledge.id, label: pl.ledge.label });
    this.warmAhead(1);   // one more of the cast ready by the time the next comes
  }
  private remove(ch: Puppet): void {
    ch.destroy();
    this.slots[ch.slot] = false;
    this.chars = this.chars.filter(c => c !== ch);
    if (!this.chars.length && !this.reduced && (!this.plan || this.plan.type === 'meet')) {
      this.plan = { at: this.between(this.o.gap), type: 'visit' };
    }
  }

  /**
   * A plan for `ch` at a random ledge in view (null if none fits): where it stands, how it gets there, how long. A
   * spot, a peek or an edge holds one character, and a group (the headline's two ends) one at a time; nobody stands
   * where another stands or is heading, nor walks in through them; not the same place twice in a row.
   */
  private place(ch: Puppet, only: ((l: Ledge) => boolean) | null, o: PlaceHints = {}): Plan | null {
    const vp = this.vp;
    const cands: [number, Plan][] = [];
    const taken = new Set<string>();
    const groups = new Set<string>();
    for (const c of this.chars) {
      if (c !== ch && c.plan) {
        taken.add(c.plan.ledge.id);
        if (c.plan.ledge.group) groups.add(c.plan.ledge.group);
      }
    }
    for (const l of this.ledges()) {
      if (only && !only(l)) continue;
      if (l.kind !== 'line' && taken.has(l.id)) continue;
      if (!only && l.avoid && l.avoid.includes(ch.slug)) continue;   // e.g. a pale character on a pale background
      if (!only && l.group && groups.has(l.group)) continue;
      let pl = this.fit(ch, l, vp);
      if (!pl) continue;
      if (this.collides(ch, pl)) {   // in the way: come from the other side, or pop up where the walk would cross someone
        if (pl.how === 'walk' && l.kind === 'line') {
          pl = { ...pl, side: pl.side === 'left' ? 'right' : 'left' };
          pl.exitSide = pl.side;
        } else if (pl.how === 'walk' && pl.far) pl = { ...pl, how: 'pop' };
        if (this.collides(ch, pl)) continue;
      }
      let w = (l.weight ?? 1) * (l.prefer && l.prefer.includes(ch.slug) ? 5 : 1) * (l.kind === 'line' ? 1.4 : 1);
      if (o.first && (l.meet || l.partner)) w *= 3;   // the first visitor of the page goes where a meeting can happen
      const mate = o.with && o.with.plan;   // a second visitor goes where the two can see each other: across, or level
      if (mate && mate.ledge.partner === l.id) w *= 4;
      else if (o.with && mate && Math.abs(pl.y - mate.y) < Math.max(ch.h, o.with.h) * 0.6
        && Math.abs(pl.x - mate.x) > ch.halfW + o.with.halfW + 20) w *= 2;
      const zw = ch.traits.zones && ch.traits.zones[this.theme];
      if (zw && l.zone && zw[l.zone] != null) w *= zw[l.zone] ?? 1;
      cands.push([w, pl]);
    }
    const fresh = cands.filter(c => c[1].ledge.id !== this.lastLedge);
    const pool = !only && fresh.length ? fresh : cands;
    if (!pool.length) return null;
    let r = this.rand() * pool.reduce((s, c) => s + c[0], 0);
    const pl = (pool.find(c => (r -= c[0]) <= 0) || pool[pool.length - 1])[1];
    if (pl.how === 'walk') pl.speed = quick(ch, Math.abs(pl.x - this.offX(ch, pl.side ?? 'left')), this.o.walkLimit);
    const dur = this.o.visit[0] + this.rand() * (this.o.visit[1] - this.o.visit[0]);
    const out = pl.how === 'walk' ? Math.min(pl.x - vp.x, vp.x + vp.w - pl.x) + ch.halfW : 0;
    pl.endAt = this.time + dur;
    pl.exitDur = pl.how === 'walk' ? Math.min(this.o.walkLimit, out / (ch.pace() * quick(ch, out, this.o.walkLimit) * 1.3)) + 0.4
      : pl.how === 'pop' ? 0.5 : 1.2;
    return pl;
  }
  /** Is `pl` where someone else stands or is heading, or is its way in through someone on the same level? */
  private collides(ch: Puppet, pl: Plan): boolean {
    for (const o of this.chars) {
      if (o === ch || o.gone) continue;
      const tall = Math.max(o.h, ch.h);
      const room = o.halfW + ch.halfW + 24;
      const where: [number, number][] = [[o.x, o.y]];
      if (o.plan) where.push([o.plan.x, o.plan.y]);
      for (const [ox, oy] of where) if (Math.abs(ox - pl.x) < room && Math.abs(oy - pl.y) < tall) return true;
      if (pl.how === 'walk') {
        const x0 = this.offX(ch, pl.side ?? 'left');
        const lo = Math.min(x0, pl.x);
        const hi = Math.max(x0, pl.x);
        const a = o.mode === 'enter' && o.plan ? Math.min(o.x, o.plan.x) : o.x;
        const b = o.mode === 'enter' && o.plan ? Math.max(o.x, o.plan.x) : o.x;
        if (b + o.halfW > lo - ch.halfW && a - o.halfW < hi + ch.halfW && Math.abs(o.y - pl.y) < tall * 0.8) return true;
      }
    }
    return false;
  }
  /** Which side to walk off: the nearer, unless someone stands that way on the same level (null: both ways blocked). */
  exitSide(ch: Puppet, pl: Plan): Side | null {
    const vp = this.vp;
    const near: Side = pl.exitSide || (ch.x - vp.x < vp.x + vp.w - ch.x ? 'left' : 'right');
    const blocked = (side: Side) => !this.pathClear(ch, ch.x, this.offX(ch, side))
      || this.chars.some(o => o !== ch && !o.gone && !o.duet && Math.abs(o.y - ch.y) < Math.max(o.h, ch.h) * 0.8
        && (side === 'left' ? o.x < ch.x && o.x + o.halfW > vp.x - 40 : o.x > ch.x && o.x - o.halfW < vp.x + vp.w + 40));
    if (!blocked(near)) return near;
    const other: Side = near === 'left' ? 'right' : 'left';
    return blocked(other) ? (ch.stance === 'stand' || ch.stance === 'floor' ? null : near) : other;
  }
  /**
   * Can ch walk from x0 to x1 at its level without crossing words or a button (the QR card, the badges, a line of
   * text)? Only what lies ahead of it counts.
   */
  pathClear(ch: Puppet, x0: number, x1: number): boolean {
    const dir = Math.sign(x1 - x0) || 1;
    const y0 = ch.y - ch.h * 0.85;
    const y1 = ch.y - ch.h * 0.1;
    const from = x0 + dir * ch.halfW * 0.3;
    const to = x1 + dir * ch.halfW;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return !this.content().some(r => r.x < hi && r.x + r.w > lo && r.y < y1 && r.y + r.h > y0);
  }
  fit(ch: Puppet, l: Ledge, vp: Rect): Plan | null {
    const k = ch.k;
    const m = 10;
    const top = vp.y + m;
    const bottom = vp.y + vp.h - m;
    const H = ch.h;
    const halfW = ch.halfW;
    const R = ch.rig;
    const inX = (x: number, half = halfW) => x - half >= vp.x + 4 && x + half <= vp.x + vp.w - 4;
    if (l.kind === 'line' || l.kind === 'edge') {
      const stance = l.kind === 'edge' ? l.stance || 'sit' : 'stand';
      const inset = l.kind === 'edge' ? halfW * (stance === 'sit' ? 0.6 : 0.15) : 0;
      const pts = l.points;
      const x0 = Math.max(pts[0][0] + inset, vp.x + halfW + 16);
      const x1 = Math.min(pts[pts.length - 1][0] - inset, vp.x + vp.w - halfW - 16);
      if (x1 < x0) return null;
      const foot = (R.hipX + 24) * k;
      for (let i = 0; i < 6; i++) {
        let x = x0 + this.rand() * (x1 - x0);
        if (l.kind === 'line') {   // within ~40% of the view's width from one side or the other: shorter walks in and out
          const reach = Math.min(x1 - x0, vp.w * 0.4) * this.rand();
          x = this.rand() < 0.5 ? x0 + reach : x1 - reach;
        }
        const y = l.kind === 'edge' ? topY(pts, x - foot, x + foot) : pathY(pts, x);
        const up = stance === 'sit' ? (R.bodyH + R.decoH0 - 3) * k : H;
        const down = stance === 'sit' ? (R.hipY - R.tp[1] + 3 + 0.86 * R.legLen) * k : 0;
        if (y - up < top || y + Math.max(0, down) > bottom) continue;
        if (l.ceiling != null && y - up < l.ceiling) continue;
        if (l.clear && l.clear.length) {   // words or an arrow right above (the card over this one): keep the body off them
          const half = stance === 'sit' ? ch.halfWFor('sit') : halfW * 0.8;
          const box = { x: x - half, y: y - up, w: half * 2, h: up };
          if (l.clear.some(r => overlaps(box, r, 2))) continue;
        }
        if (l.kind === 'line') {
          const side: Side = x - vp.x < vp.x + vp.w - x ? 'left' : 'right';
          return { ledge: l, how: 'walk', side, x, y, stance: 'stand', surface: xx => pathY(pts, xx), endAt: 0, exitDur: 0 };
        }
        if (l.enter === 'pop') return { ledge: l, how: 'pop', x, y, stance, surface: () => y, endAt: 0, exitDur: 0 };
        return { ledge: l, how: 'climb', x, y, stance, cover: l.cover, surface: xx => pathY(pts, xx), endAt: 0, exitDur: 0 };
      }
      return null;
    }
    if (l.kind === 'spot') {
      // keep clear of the ledge's `clear` rects (the button beside it, a line of text above): a wide character
      // stands a little further off
      const stance = l.stance || 'stand';
      const half = ch.halfWFor(stance);
      const tall = stance === 'floor' ? H - (R.gy - R.tp[1] - 4) * k : H;
      let x = l.x;
      for (const r of l.clear || []) {
        if (l.y - tall > r.y + r.h || l.y < r.y) continue;
        const before = l.x <= r.x + r.w / 2;   // the rect is to the right
        // `reach`: its arm on that side, held out, still 6 px short of it (a mitten pointing at a store badge)
        const keep = l.reach ? Math.max(half, ch.reach(before ? 'R' : 'L') + 6) : half;
        x = before ? Math.min(x, r.x - keep - 4) : Math.max(x, r.x + r.w + keep + 4);
      }
      if (!inX(x, half) || l.y - tall < top || l.y > bottom) return null;
      if (l.ceiling != null && l.y - tall < l.ceiling) return null;
      const side: Side = l.from === 'left' || l.from === 'right' ? l.from : x - vp.x < vp.x + vp.w - x ? 'left' : 'right';
      // a long way in from the side: pop up there instead, more often than not (a walk eats the visit)
      const far = Math.abs(x - this.offX(ch, side)) > this.o.farWalk;
      const how = l.enter === 'pop' || (far && l.enter !== 'walk' && this.rand() < 0.6) ? 'pop' : 'walk';
      return { ledge: l, how, far, side, exitSide: side, x, y: l.y, stance, target: l.target, surface: () => l.y, endAt: 0, exitDur: 0 };
    }
    // a peek
    const c = l.cover;
    const g = l.ground ?? c.y + c.h;
    if (l.side === 'top') {
      const x = l.x ?? c.x + c.w / 2;
      if (!inX(x)) return null;
      const cy = c.top && c.top.length ? pathY(c.top, x) : c.y;
      // show no more than fits under the ledge's ceiling (the line of text above), and at least the eyes
      let show = l.show ?? 0.6;
      if (l.ceiling != null) show = Math.min(show, ((cy - l.ceiling) / k - ch.decoH) / R.height);
      if (show < 1 - (R.gy - Math.max(R.eyes[0][1], R.eyes[1][1])) / R.height + 0.06) return null;   // eyes over the edge
      const rise1 = (g - cy) / k - (1 - show) * R.height;
      const rise0 = (g - cy) / k - R.height - ch.decoH - 8;
      if (cy - show * R.height * k - ch.decoH * k < top || g > bottom + 40) return null;
      if (x - halfW < c.x - 2 || x + halfW > c.x + c.w + 2) return null;   // wider than what hides it
      return {
        ledge: l, how: 'rise', x, y: g, stance: 'peek', cover: c, show, rise0, rise1, noShadow: true, target: l.target,
        surface: () => g, endAt: 0, exitDur: 0,
      };
    }
    const vis = l.reveal ?? 0.6;
    const W2 = halfW * 2;
    const dir = l.side === 'left' ? -1 : 1;
    const edgeX = l.side === 'left' ? c.x : c.x + c.w;
    const x = edgeX + dir * (vis * W2 - halfW);
    const x0 = edgeX - dir * (halfW + 4);
    if (x - halfW < vp.x + 2 || x + halfW > vp.x + vp.w - 2) return null;
    if (g - H < Math.max(top, c.y - 30) || g > bottom) return null;
    return {
      ledge: l, how: 'slide', x, x0, y: g, ground: g, stance: 'peek', cover: c, target: l.target,
      hidden: l.side === 'left' ? 'R' : 'L', surface: () => g, endAt: 0, exitDur: 0,
    };
  }
  /**
   * The top and foot (page px) of what of `ch` shows at its place when standing at `y`: the whole of a stander, a
   * sitter's body above its seat (the legs hanging below don't count), the part of a peeker over what hides it.
   */
  extentAt(ch: Puppet, pl: Plan, y: number): [number, number] {
    const k = ch.k;
    const R = ch.rig;
    if (pl.how === 'rise') {
      const c = pl.cover;
      const cy = c ? (c.top && c.top.length ? pathY(c.top, pl.x) : c.y) : y;
      return [cy - ((pl.show ?? 0.6) * R.height + ch.decoH) * k, cy];
    }
    if (pl.stance === 'sit') return [y - (R.bodyH + R.decoH0 - 3) * k, y];
    if (pl.stance === 'floor') return [y - (ch.h - (R.gy - R.tp[1] - 4) * k), y];
    return [y - ch.h, y];
  }
  /** How much of ch at (`pl`, `y`) is below the view's top edge: 1 all of it, 0 (or less) none. */
  shownBelowTop(ch: Puppet, pl: Plan, y: number): number {
    const [top, foot] = this.extentAt(ch, pl, y);
    return foot - top > 0 ? (foot - Math.max(top, this.vp.y)) / (foot - top) : 1;
  }
  inView(ch: Puppet, margin = 0): boolean {
    const vp = this.vp;
    return ch.x + ch.halfW > vp.x - margin && ch.x - ch.halfW < vp.x + vp.w + margin
      && ch.y > vp.y - margin && ch.y - ch.h < vp.y + vp.h + margin;
  }

  /** What a character does next at its place: the plan's first acts, else one its place, stance and parts allow. */
  pickAct(ch: Puppet, pl: Plan, last: string | null, n: number): ActName {
    while (pl.first && pl.first.length) {
      const a = pl.first.shift();
      if (a && isActName(a)) return a;
    }
    const stance = pl.stance === 'peek' ? 'peek' : ch.stance;
    const R = ch.rig;
    const likes = ch.traits.likes || [];
    const allowed = ACT_STANCE[stance];
    let acts = (pl.ledge.acts || ['look', 'wave']).filter((a): a is ActName => isActName(a) && allowed.includes(a));
    acts = acts.filter(a => (a !== 'reveal' || R.has('torso-alt')) && (a !== 'twinkle' || R.has('stars'))
      && (a !== 'nap' || ch.traits.naps || (pl.ledge.prefer || []).includes(ch.slug))
      && (!['point', 'beckon', 'lean', 'write'].includes(a) || pl.target) && (a !== 'deco' || R.deco) && (a !== 'point' || pl.how !== 'rise')
      // over the top of what it peeks from, only if a mitten can show
      && (!['wave', 'beckon'].includes(a) || pl.how !== 'rise' || ch.waveArm('L')));
    if (!acts.length) acts = ['look'];
    const left = pl.endAt - pl.exitDur - this.time;
    const w = acts.map(a => (a === last ? 0.05 : 1) * (likes.includes(a) ? 3 : 1) * (n === 0 && a === 'wave' ? 2 : 1)
      * (a === 'nap' ? 4 : 1) * (left < 2.5 && ['read', 'nap', 'lean', 'write'].includes(a) ? 0.2 : 1));
    let r = this.rand() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < acts.length; i++) if ((r -= w[i]) <= 0) return acts[i];
    return acts[acts.length - 1];
  }

  /**
   * A character whose place scrolled away hurries off (or simply goes, if nobody can see it) — and so does one left
   * mostly above the view's top: on the real page that is under the fixed header, where only its legs would show.
   * Two meeting go together once neither shows enough.
   */
  private watch(): void {
    const vp = this.vp;
    for (const ch of this.chars) {
      if (ch.mode === 'exit' || ch.gone || ch.still || ch.duet) continue;
      const pl = ch.plan;
      const spotIn = pl && pl.x > vp.x - 20 && pl.x < vp.x + vp.w + 20 && this.shownBelowTop(ch, pl, pl.y) >= SHOWN_ENOUGH
        && pl.y - ch.h < vp.y + vp.h + 10;
      if (spotIn || (ch.mode === 'enter' && this.inView(ch, 200))) continue;
      if (!this.inView(ch, 4)) {
        ch.gone = true;
        continue;
      }
      this.leaveSoon(ch, {});
    }
    for (const d of [...this.duets]) {
      const shows = (c: Puppet) => !!c.plan && !c.gone && this.shownBelowTop(c, c.plan, c.y) >= SHOWN_ENOUGH;
      if (d.met && !shows(d.a) && !shows(d.b)) this.endDuet(d);   // once they have met: walking in, they come on
    }
  }
  leaveSoon(ch: Puppet, { shy: isShy }: { shy?: boolean } = {}): void {
    if (ch.duet) this.endDuet(ch.duet, ch);
    ch.fx = [];
    this.dropProps(ch);
    ch.between = false;
    const pl = ch.plan;
    ch.tasks = [(function* (S: Stage) {
      if (isShy) yield* shy(S, ch);
      if (pl) yield* leave(S, ch, pl, 1.7);
    })(this)];
    ch.mode = 'exit';
  }
  private endDuet(d: Duet, except?: Puppet): void {
    d.done = true;
    this.dropProps(d);
    this.duets = this.duets.filter(x => x !== d);
    for (const ch of [d.a, d.b]) {
      ch.duet = null;
      if (ch === except || ch.gone || !ch.plan) continue;
      ch.plan.how = 'walk';
      const pl = ch.plan;
      const look = ch === d.a ? 8 : -8;
      ch.tasks = [(function* (S: Stage) {
        yield* idle(S, ch, 0.6, look);
        yield* leave(S, ch, pl, 1.4);
      })(this)];
    }
  }

  // --- greetings from afar: two characters on screen, each at its own place ---
  private greetCheck(): void {
    if (this.chars.length !== 2 || this.duets.length) {
      this.greet = null;
      return;
    }
    const [c0, c1] = this.chars;
    if (c0.mode !== 'act' || c1.mode !== 'act' || c0.still || c1.still) return;
    let g = this.greet;
    if (!g || !((g.a === c0 && g.b === c1) || (g.a === c1 && g.b === c0))) {   // a new pair: decide once
      const p = this.greetPending;
      const sure = !!(p && [c0, c1].includes(p.a) && [c0, c1].includes(p.b));
      g = this.greet = {
        a: c0, b: c1, sure,
        go: sure || (this.time - this.lastGreetAt >= this.o.greetEvery && this.rand() < this.o.greetChance),
        started: false, until: this.time + 7,
      };
      this.greetPending = null;
    }
    if (!g.go || g.started || this.time > g.until) return;
    if (!c0.between || !c1.between) return;
    const vp = this.vp;
    // in sight of each other: both in view, apart but not across the whole page, about level, and room for the waves
    // between them that covers no words, button or card
    const tall = Math.max(c0.h, c1.h);
    const dx = Math.abs(c0.x - c1.x);
    const [L, R] = c0.x < c1.x ? [c0, c1] : [c1, c0];
    const ok = this.inView(c0, -8) && this.inView(c1, -8) && dx > c0.halfW + c1.halfW + 16 && dx < Math.min(vp.w * 0.92, tall * 6)
      && Math.abs(c0.facePage()[1] - c1.facePage()[1]) < tall * 0.9 && this.wavesBetween(L, R);
    if (!ok) {
      g.go = false;
      return;
    }
    g.started = true;
    this.lastGreetAt = this.time;
    const sh: GreetShared = {};
    L.push(greetFromAfar(this, L, R, sh, 1));
    R.push(greetFromAfar(this, R, L, sh, -1));
    this.emit(L, { type: 'act', act: 'greet', pair: true, with: R.slug });
  }
  /** A greeting is decided for ch's pair but hasn't started: ch waits for the other a moment. */
  greetWait(ch: Puppet): boolean {
    const g = this.greet;
    return !!(g && g.go && !g.started && (g.a === ch || g.b === ch) && this.time < g.until);
  }

  // --- meetings ---
  private meetLedge(): LineLedge | undefined {
    const vp = this.vp;
    return this.ledges().find((l): l is LineLedge => !!l.meet && l.kind === 'line' && (() => {
      const ys = [vp.x + vp.w * 0.3, vp.x + vp.w / 2, vp.x + vp.w * 0.7].map(x => pathY(l.points, x));
      return ys.every(y => y - 1.6 * this.k * 420 > vp.y && y < vp.y + vp.h - 8);
    })());
  }
  /** Can a guest walk up to `host` and stand beside it, in view, on the open side? */
  private canJoin(host: Puppet): boolean {
    const pl = host.plan;
    if (!pl) return false;
    const l = pl.ledge;
    const vp = this.vp;
    if (!l.meet || pl.stance !== 'stand' || !['walk', 'pop'].includes(pl.how) || (l.kind !== 'line' && l.kind !== 'spot')) return false;
    const right = l.kind === 'spot' && l.from ? l.from === 'right' : vp.x + vp.w - host.x > host.x - vp.x;
    const need = host.halfW * 3.6 + 16;   // a guest about the host's size, half a body apart, inside the view
    return right ? host.x + need < vp.x + vp.w : host.x - need > vp.x;
  }
  /** Too narrow to walk up (a phone, the headline): a guest comes to the place across and they greet from afar. */
  private across(host: Puppet): boolean {
    const partner = host.plan?.ledge.partner;
    if (!partner) return false;
    const entry = this.pickCast([host.slug]);
    if (!entry) return false;
    const ch = this.spawn(entry, x => x.id === partner);
    if (!ch) return false;
    this.greetPending = { a: host, b: ch };
    return true;
  }
  /** A guest walks up to `host`, who stands on a ledge both can walk along. */
  private join(host: Puppet): boolean {
    const hp = host.plan;
    if (!hp) return false;
    const entry = this.pickCast([host.slug]);
    if (!entry) return false;
    const slot = this.freeSlot();
    if (slot < 0) return false;
    const g = new Puppet(this, entry, slot);
    const vp = this.vp;
    const l = hp.ledge;
    const surface = hp.surface;
    // the guest comes from the open side of a stand spot, else from the side with more room
    const right = l.kind === 'spot' && l.from ? l.from === 'right' : vp.x + vp.w - host.x > host.x - vp.x;
    const x = this.offX(g, right ? 'right' : 'left');
    const pl: Plan = { ledge: l, how: 'walk', side: right ? 'right' : 'left', x, y: 0, stance: 'stand', surface, endAt: 0, exitDur: 0 };
    pl.y = surface(pl.x);
    this.begin(g, pl);
    g.mode = 'duet-walk';
    host.tasks = [];
    host.mode = 'duet';
    host.between = false;
    this.dropProps(host);
    if (hp.how === 'pop') hp.how = 'walk';   // they leave walking
    this.startDuet({ a: right ? host : g, b: right ? g : host, host, mode: 'host' });
    return true;
  }
  private pairUp(l = this.meetLedge()): boolean {
    if (!l) return false;
    const e1 = this.pickCast();
    const e2 = e1 && this.pickCast([e1.slug]);
    if (!e1 || !e2) return false;
    const surface = (x: number) => pathY(l.points, x);
    const mk = (entry: CastEntry, side: Side) => {
      const ch = new Puppet(this, entry, this.freeSlot());
      const x = this.offX(ch, side);
      this.begin(ch, { ledge: l, how: 'walk', side, x, y: surface(x), stance: 'stand', surface, endAt: 0, exitDur: 0 });
      ch.mode = 'duet-walk';
      return ch;
    };
    const a = mk(e1, 'left');
    const b = mk(e2, 'right');
    this.startDuet({ a, b, mode: 'pair' });
    this.lastMeetAt = this.time;
    return true;
  }
  private startDuet(d: Duet): void {
    d.a.duet = d.b.duet = d;
    if (this.variant) {
      d.variant = this.variant;
      this.variant = null;
    }
    d.gen = duet(this, d);
    for (const ch of [d.a, d.b]) {
      ch.tasks = [(function* () {
        while (ch.duet) yield;
      })()];
    }
    this.duets.push(d);
  }
  /** variant: 'none' | 'note' | 'five' (by chance otherwise). */
  private meet(variant?: MeetVariant): boolean {
    if (this.reduced) return false;
    this.variant = variant || null;
    const host = this.chars.find(c => c.mode === 'act' && !c.duet && this.inView(c, 0));
    if (host && this.chars.length === 1) {
      if (this.canJoin(host)) {
        this.join(host);
        return true;
      }
      if (this.across(host)) {
        this.variant = null;
        return true;
      }
    }
    if (!this.meetLedge()) return false;
    for (const ch of this.chars) if (ch.mode !== 'exit') this.leaveSoon(ch);
    this.plan = { at: this.time, type: 'pair' };
    return true;
  }
  /** A visitor now: this character (by slug) at this ledge (by id), if it fits in view; acts: what it does first. */
  private visitNow({ ledge, slug, acts }: VisitRequest = {}): boolean {
    if (this.reduced) return false;
    this.clearAll();
    this.plan = null;
    this.vp = this.env.viewport();
    // asked for by name (a test, devtools), it comes at once, ready or not
    const named = slug ? this.cast.find(c => c.slug === slug) : undefined;
    if (named) this.warmUp(named);
    const entry = named || this.pickCast();
    const ch = this.spawn(entry, ledge ? l => l.id === ledge : null);
    if (ch && ch.plan && acts) ch.plan.first = acts.filter(isActName);
    if (!ch) this.plan = { at: this.time + 0.5, type: 'visit' };
    return !!ch;
  }
  private next(): void {
    if (this.reduced) return;
    for (const ch of this.chars) if (ch.mode !== 'exit') this.leaveSoon(ch);
    this.plan = { at: this.time + 0.3, type: 'visit' };
  }

  // --- options ---
  private setOptions(settings: StageSettings): void {
    const { theme, reducedMotion, ...rest } = settings;
    const o = defined(rest);
    const size = (o.size != null && o.size !== this.o.size) || (o.heightCurve != null && o.heightCurve !== this.o.heightCurve);
    Object.assign(this.o, o);
    if (size) {
      for (const ch of this.chars) {
        ch.scaleBy();
        ch.layout();
        ch.render(true);
      }
    }
    if (theme || o.nightDim != null) this.setTheme(theme || this.theme);
    if (reducedMotion != null) this.setReduced(reducedMotion);
  }
  setTheme(t: Theme): void {
    this.theme = t === 'dark' ? 'dark' : 'light';
    this.root.classList.toggle('ms-dark', this.theme === 'dark');
    // on the dark page the light papers would outshine every word: dim the characters a touch (not the stars' glow)
    const dim = this.theme === 'dark' && this.o.nightDim < 1;
    this.root.classList.toggle('ms-dim', dim);
    if (dim) this.root.style.setProperty('--ms-dim', String(this.o.nightDim));
    else this.root.style.removeProperty('--ms-dim');
    for (const ch of this.chars) ch.render(true);
  }
  private setReduced(v: boolean): void {
    v = !!v;
    if (v === this.reduced) return;
    this.reduced = v;
    this.clearAll();
    if (v) this.still();
    else this.plan = { at: this.between(this.o.first), type: 'visit' };
    this.wake();
  }
  private clearAll(): void {
    for (const ch of this.chars) {
      ch.destroy();
      this.slots[ch.slot] = false;
    }
    this.chars = [];
    this.duets = [];
    this.greet = null;
    this.greetPending = null;
    for (const p of [...this.props]) p.remove();
  }
  /**
   * Reduced motion: one character standing still somewhere in view (a stand spot, an edge, the wave, a seat on a
   * card, peeking — in that order, nearest the upper middle of the view first), nothing moving.
   */
  private still(): void {
    this.vp = this.env.viewport();
    const entry = this.cast.find(c => c.slug === 'tuck') || this.cast[0];
    if (!entry) return;
    if (!this.isReady(entry)) {   // stands there once its parts are in, never assembling itself piece by piece
      this.warmUp(entry, () => {
        if (this.reduced && !this.destroyed && !this.chars.length) this.still();
      });
      return;
    }
    const ch = new Puppet(this, entry, this.freeSlot());
    const vp = this.vp;
    const rank = (l: Ledge) => (l.kind === 'spot' && (l.stance || 'stand') === 'stand' ? 0 : l.kind === 'edge' && l.stance === 'stand' ? 1
      : l.kind === 'line' ? 2 : l.kind === 'edge' ? 3 : l.kind === 'peek' ? 4 : 5);
    const ly = (l: Ledge) => (l.kind === 'spot' ? l.y : l.kind === 'peek' ? l.ground ?? l.cover.y : l.points[l.points.length >> 1][1]);
    const mid = vp.y + vp.h * 0.6;
    const ledges = [...this.ledges()].filter(l => rank(l) < 5)
      .sort((a, b) => rank(a) - rank(b) || Math.abs(ly(a) - mid) - Math.abs(ly(b) - mid));
    let pl: Plan | null = null;
    for (const l of ledges) {
      pl = this.fit(ch, l, vp);
      if (pl) break;
    }
    if (!pl) {
      ch.destroy();
      this.slots[ch.slot] = false;
      return;
    }
    ch.plan = pl;
    ch.x = pl.x;
    ch.y = pl.y;
    ch.surface = pl.surface;
    ch.still = true;
    ch.mode = 'still';
    ch.noShadow = !!pl.noShadow;
    if (pl.stance === 'sit') {
      ch.sitU = 1;
      ch.stance = 'sit';
    }
    if (pl.stance === 'floor') {
      ch.floorU = 1;
      ch.stance = 'floor';
    }
    if (pl.how === 'rise') {
      ch.baseRise = pl.rise1 ?? 0;
      if (pl.cover) ch.goBehind(pl.cover, pl.rise0 ?? 0);
    }
    if (pl.how === 'slide') {
      ch.y = pl.ground ?? pl.y;
      if (pl.cover) ch.goBehind(pl.cover, 0);
    }
    this.chars.push(ch);
    ch.base();
    ch.overlay(0);
    ch.render(true);
  }
  private restill(): void {
    if (!this.reduced || this.destroyed) return;
    this.vp = this.env.viewport();
    const ch = this.chars[0];
    // stays where it is in view and none of it is above the view's top (not its legs below a fixed header)
    if (ch && ch.plan && this.inView(ch, -ch.h * 0.25) && this.extentAt(ch, ch.plan, ch.y)[0] >= this.vp.y) return;
    this.clearAll();
    this.still();
  }

  prop(kind: PropKind, owner: PropOwner, inkFrom: Puppet): Prop {
    const p = new Prop(this, kind, owner, inkFrom);
    this.props.add(p);
    return p;
  }
  dropProps(owner: PropOwner): void {
    for (const p of [...this.props]) if (p.owner === owner) p.remove();
  }

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wake();
    this.warm.clear();
    const n = (styled.get(this.doc) ?? 1) - 1;
    if (n > 0) styled.set(this.doc, n);
    else {   // the last stage on this page: its style goes with it
      styled.delete(this.doc);
      this.doc.getElementById('ms-style')?.remove();
    }
    this.doc.removeEventListener('visibilitychange', this.onVis);
    this.doc.removeEventListener('scroll', this.onScroll, true);
    const W = this.doc.defaultView;
    if (W) {
      W.removeEventListener('resize', this.onScroll);
      W.clearTimeout(this.scrollT);
    }
    if (this.io) this.io.disconnect();
    this.clearAll();
    this.root.remove();
  }
}

/** What place() is told: the page's first visitor, and who is already on stage. */
interface PlaceHints {
  first?: boolean;
  with?: Puppet;
}

/** A stage over the page `env` describes, with these characters. Starts at once unless `autoplay: false`. */
export function createStage(env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>): StageApi {
  return new Stage(env, cast, options).api();
}

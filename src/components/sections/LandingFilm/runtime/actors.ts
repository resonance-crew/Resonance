/**
 * The cast on the stage (SPEC §5.2, §7.3, §10). Every puppet the film shows is an Actor the beats place each frame, by
 * its `data-actor` key — `<scene>:<slug>` inside its scene set's ground plane (so it rides its plane through every
 * change), `carrier:<slug>` in the carrier layer above the cards. Each starts as the server's still; once its
 * character's parts are decoded (`goLive`, in the loading order of runtime/index.ts) a live StickerPuppet is mounted in
 * the same element and the still is hidden (the stills stay in the HTML and the book).
 *
 * A live actor is posed by the beats on twos (they skip the pose while its step key is unchanged) and drawn here after
 * the frame, with the idle layer on top (wall clock, 12 fps: breath and blinks on a lattice; off while resting or under
 * reduced motion). What a frame doesn't place is hidden by `endFrame` (only when that changes).
 */
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { STILL_HEIGHT_CURVE } from '@/lib/mascots/pals/still';
import type { Actor, ActorPose } from '../script/beats';
import { groundAt } from '../script/ground';
import { PLACE_OF, type PalSlug } from '../script/marks';
import type { SceneN } from '../script/timeline';
import { StickerPuppet, type StickerPose } from '../kit/puppet';

export interface CastActor extends Actor {
  readonly el: HTMLElement;
  readonly scene: SceneN | 'carrier';
  /** Shown this frame (set by place, read by endFrame). */
  placed: boolean;
}

/** Px per rig unit for a character of rig height `h`, when 摺摺 stands `pal` px tall (the stills' height curve). */
export const kFor = (h: number, pal: number) => (pal * (h / 420) ** STILL_HEIGHT_CURVE) / h;

const ENTRY = new Map(MASCOT_CAST.map((c) => [c.slug as PalSlug, c]));

/** A ghost of a character (no DOM): where its mittens and face would be at a pose. */
export function ghostPuppet(slug: PalSlug, pal: number): StickerPuppet {
  const e = ENTRY.get(slug)!;
  return new StickerPuppet(null, null, { slug, k: kFor(e.manifest.height ?? 420, pal) }, e.manifest, e.base);
}

/** A cheap hash in [0, 1). */
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** An actor: the still, until its live puppet is ready. */
export class StageActor implements CastActor {
  readonly key: string;
  readonly slug: PalSlug;
  readonly scene: SceneN | 'carrier';
  placed = false;
  /** The live puppet, once its parts are decoded (null: the still stands). */
  pup: StickerPuppet | null = null;
  /** The beats' pose step this pose was made at; the drawn step (with the idle layer's). */
  poseKey = '';
  private drawnKey = '';
  private shown: boolean | null = null;
  private last = '';
  private mounted: StickerPuppet | null = null;
  readonly slotN: number;

  constructor(
    readonly el: HTMLElement,
    private readonly x0: number,
    slotN: number,
  ) {
    this.key = el.dataset.actor ?? '';
    const [scene, slug] = this.key.split(':');
    this.scene = scene === 'carrier' ? 'carrier' : (Number(scene) as SceneN);
    this.slug = slug as PalSlug;
    this.slotN = slotN;
  }

  place(p: ActorPose) {
    this.placed = true;
    let key: string;
    if (this.scene === 'carrier') {
      const x = p.x.toFixed(1);
      const y = (p.y ?? 0).toFixed(1);
      key = `${x},${y},${p.alpha ?? 1},${p.flip ? 1 : 0}`;
      if (key !== this.last) {
        this.el.style.transform = `translate3d(${x}px,${y}px,0)`;
        this.el.style.opacity = String(p.alpha ?? 1);
      }
    } else {
      const y = p.y ?? groundAt(PLACE_OF[this.scene], p.x);
      key = `${p.x.toFixed(1)},${y.toFixed(1)},${p.alpha ?? 1},${p.flip ? 1 : 0}`;
      if (key !== this.last) {
        this.el.style.setProperty('--ax', (p.x - this.x0).toFixed(1));
        this.el.style.setProperty('--ay', y.toFixed(1));
        this.el.style.opacity = p.alpha == null || p.alpha >= 1 ? '' : String(p.alpha);
      }
    }
    if (key !== this.last) {
      // a still turns about its middle; a live puppet never flips (its face looks the way it goes)
      this.el.toggleAttribute('data-flip', !!p.flip && !this.pup);
      this.last = key;
    }
    this.show(true);
  }

  show(on: boolean) {
    if (this.shown === on) return;
    this.shown = on;
    if (this.scene === 'carrier') this.el.style.display = on ? 'block' : 'none';
    else this.el.hidden = !on;
  }

  /** Builds the live puppet in this element (hidden until `goLive`). */
  mount(pal: number): StickerPuppet {
    if (this.mounted) return this.mounted;
    const e = ENTRY.get(this.slug)!;
    this.mounted = new StickerPuppet(this.el.ownerDocument, this.el, { slug: this.slug, k: kFor(e.manifest.height ?? 420, pal) }, e.manifest, e.base);
    return this.mounted;
  }

  goLive() {
    if (!this.mounted || this.pup) return;
    this.pup = this.mounted;
    this.poseKey = '';
    this.drawnKey = '';
    this.el.removeAttribute('data-flip');
    this.el.setAttribute('data-live', '');
  }

  resize(pal: number) {
    const p = this.mounted;
    if (!p) return;
    p.k = kFor(p.rig.height, pal);
    p.layout();
    this.poseKey = '';
    this.drawnKey = '';
  }

  /** As the server drew it: the live puppet unmounted, the still standing at its mark. */
  reset() {
    this.mounted?.el?.remove();
    this.mounted = null;
    this.pup = null;
    this.poseKey = '';
    this.drawnKey = '';
    this.last = '';
    this.shown = null;
    for (const k of ['--ax', '--ay', 'transform', 'opacity', 'display']) this.el.style.removeProperty(k);
    this.el.hidden = false;
    this.el.removeAttribute('data-live');
    this.el.removeAttribute('data-flip');
  }

  /** Draws the live pose with the idle layer (breath, a blink) on top, when either changed. */
  draw(now: number, idle: boolean) {
    const p = this.pup;
    if (!p) return;
    const step = idle ? Math.floor(now * 12) : -1;
    const key = `${this.poseKey}|${step}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const keep = p.pose;
    if (idle) {
      const t = step / 12;
      const q: StickerPose = { ...keep };
      q.sy *= 1 + 0.012 * Math.sin(2.1 * t + this.slotN);
      const P = 4.2;
      const n = Math.floor(t / P);
      const at = n * P + hash(this.slotN, n) * (P - 0.3);
      if (q.eyes === 'open' && t >= at && t < at + 0.13) q.eyes = 'shut';
      p.pose = q;
    }
    p.render();
    p.pose = keep;
  }
}

export class Cast {
  readonly actors = new Map<string, StageActor>();
  private readonly ghosts = new Map<PalSlug, StickerPuppet>();
  private readonly loading = new Map<PalSlug, Promise<void>>();
  private pal = 88;
  /** The journey's size (a tall screen draws it larger) and the riding puppet's now. */
  private pal2 = 88;
  /** The night's (smaller on a phone too narrow for its row of five). */
  private pal4 = 88;
  private palCarrier = 88;
  private palOf(a: StageActor) {
    return a.scene === 'carrier' ? this.palCarrier : a.scene === 2 ? this.pal2 : a.scene === 4 ? this.pal4 : this.pal;
  }

  constructor(stage: HTMLElement) {
    let n = 0;
    stage.querySelectorAll<HTMLElement>('[data-actor]').forEach((el) => {
      const plane = el.closest<HTMLElement>('[data-plane]');
      const x0 = plane ? Number(plane.dataset.x0 ?? 0) : 0;
      const a = new StageActor(el, x0, n++ * 1.7);
      this.actors.set(a.key, a);
    });
  }

  actor(scene: SceneN, slug: PalSlug): StageActor | undefined {
    return this.actors.get(`${scene}:${slug}`);
  }

  carrier(slug: PalSlug): StageActor | undefined {
    return this.actors.get(`carrier:${slug}`);
  }

  /** A character's ghost (shared: posed afresh by whoever asks). */
  ghost(slug: PalSlug): StickerPuppet {
    let g = this.ghosts.get(slug);
    if (!g) {
      g = ghostPuppet(slug, this.pal);
      this.ghosts.set(slug, g);
    }
    return g;
  }

  /** A new ghost of a character at today's size (the director keeps one per tag). */
  ghostFresh(slug: PalSlug): StickerPuppet {
    return ghostPuppet(slug, this.pal);
  }

  /** The puppets' size changed (a resize): every live and ghost puppet takes its new k (the journey's and the night's their own). */
  resize(pal: number, pal2 = pal, pal4 = pal) {
    if (Math.abs(pal - this.pal) < 0.01 && Math.abs(pal2 - this.pal2) < 0.01 && Math.abs(pal4 - this.pal4) < 0.01 && this.ghosts.size) return;
    this.pal = pal;
    this.pal2 = pal2;
    this.pal4 = pal4;
    for (const g of this.ghosts.values()) g.k = kFor(g.rig.height, pal);
    for (const a of this.actors.values()) a.resize(this.palOf(a));
  }

  /** The puppet riding the card grows with the world it rides into (the first change, on a tall screen). */
  carrierSize(pal: number) {
    if (Math.abs(pal - this.palCarrier) < 0.01) return;
    this.palCarrier = pal;
    for (const a of this.actors.values()) if (a.scene === 'carrier') a.resize(pal);
  }

  /** Mounts a character's live puppets everywhere it plays and swaps them in once every part is decoded. */
  goLive(slug: PalSlug): Promise<void> {
    let p = this.loading.get(slug);
    if (p) return p;
    const mine = [...this.actors.values()].filter((a) => a.slug === slug);
    const pups = mine.map((a) => a.mount(this.palOf(a)));
    // every part of every one of its puppets (each is its own <img>): none is swapped in with a part still missing
    const imgs = pups.flatMap((pup) => pup.images());
    p = Promise.all(imgs.map((im) => im.decode().then(() => true, () => false))).then((ok) => {
      // a part that won't load keeps the still standing
      if (ok.every(Boolean)) for (const a of mine) a.goLive();
    });
    this.loading.set(slug, p);
    return p;
  }

  /** Every actor back to its still (the film stopped). */
  destroy() {
    for (const a of this.actors.values()) a.reset();
    this.loading.clear();
  }

  isLive(slug: PalSlug) {
    return [...this.actors.values()].some((a) => a.slug === slug && a.pup);
  }

  beginFrame() {
    for (const a of this.actors.values()) a.placed = false;
  }

  /** Draw the live ones the frame placed; hide whoever it didn't. */
  endFrame(now: number, idle: boolean) {
    for (const a of this.actors.values()) {
      if (!a.placed) a.show(false);
      else a.draw(now, idle);
    }
  }
}

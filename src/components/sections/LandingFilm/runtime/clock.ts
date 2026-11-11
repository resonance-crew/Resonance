/**
 * The film's two clocks (SPEC §7.1–7.2). The scenery clock s follows the scroll (its target from the track position,
 * a 50 ms time constant; exact while ▶ or a glide drives the page). Each act keeps its own act time A: it plays at 1×
 * once s has reached the act, is never behind the scroll's floor, rewinds at 3× when the visitor scrolls back above
 * it, and is a pure scrub while the film rests. Pure state, no DOM: the director ticks it each frame.
 */
import { SEGMENTS, span, type Segment } from '../script/timeline';

/** An act's floor: where the scroll alone puts it. */
export const floorOf = (seg: Segment, s: number) => span(s, seg.t0, seg.t1) * seg.dur;

/**
 * One act clock step (§7.2). `held`: ❚❚ pressed while an act plays on its own (WCAG 2.2.2) — no act moves by itself
 * (none plays on, none rewinds); a scroll still scrubs it (never behind the scroll's floor; above it, at its floor).
 */
export function stepAct(seg: Segment, A: number, s: number, dt: number, resting: boolean, held = false): number {
  const floor = floorOf(seg, s);
  if (resting) return floor;
  if (held) return s >= seg.t0 ? Math.min(seg.dur, Math.max(A, floor)) : floor;
  if (s >= seg.t0) return Math.min(seg.dur, Math.max(A + dt, floor));
  return Math.max(0, A - 3 * dt);
}

/**
 * The owner rule: actors are posed by the latest segment the film has reached (k with s ≥ k.t0) — or, while it
 * rewinds, by the act right after it (scrolled back just above an act, its actors stay until its A is back at 0).
 * Only the next act: a long jump back (from the bridge to the opening) never leaves a far-off act owning an empty
 * stage while it rewinds out of sight.
 */
export function ownerOf(s: number, acts: ReadonlyMap<number, number>, segments: readonly Segment[] = SEGMENTS): Segment {
  let owner = segments[0];
  for (const seg of segments) if (s >= seg.t0) owner = seg;
  const next = segments[owner.index + 1];
  if (next && next.kind === 'act' && (acts.get(next.index) ?? 0) > 0) return next;
  return owner;
}

export interface ClockState {
  s: number;
  sTarget: number;
  owner: Segment;
  /** The owner's x: A for an act, v (or p) for a travel (or change), 0 for the hold. */
  x: number;
  /** Some act is playing on its own (ahead of the scroll, or rewinding). */
  acting: boolean;
}

export class FilmClock {
  s = 0;
  sTarget = 0;
  /**
   * ❚❚ while an act played on its own: the acts hold still (stepAct `held`) until ▶ — or until the visitor's scroll
   * reaches another act, which plays as any act a scroll reaches does (their own motion, started by them).
   */
  held = false;
  private heldAct = -1;
  /** Hold the acts where they are (❚❚). */
  hold() {
    this.held = true;
    this.heldAct = ownerOf(this.s, this.acts, this.segments).index;
  }
  /** Let them play on (▶). */
  release() {
    this.held = false;
    this.heldAct = -1;
  }
  /** Act time by segment index. */
  readonly acts = new Map<number, number>();
  private readonly segments: readonly Segment[];

  constructor(segments: readonly Segment[] = SEGMENTS) {
    this.segments = segments;
    for (const seg of segments) if (seg.kind === 'act') this.acts.set(seg.index, 0);
  }

  /** A jump (the hash, back navigation, ?t=, the progress line's press and its ticks, the lab's seek): s lands at once, every act at its floor there. */
  jump(sTarget: number, { complete = false }: { complete?: boolean } = {}) {
    this.sTarget = sTarget;
    this.s = sTarget;
    for (const seg of this.segments) if (seg.kind === 'act') this.acts.set(seg.index, complete ? seg.dur : floorOf(seg, sTarget));
  }

  /**
   * One frame: `dt` seconds of wall clock (0 while the tab is hidden), the scroll's target, whether ▶ or a glide is
   * driving (s then equals its target, and a glide keeps every act at its floor), whether the film rests.
   */
  tick(sTarget: number, dt: number, { driving = false, scrub = false, resting = false }: { driving?: boolean; scrub?: boolean; resting?: boolean } = {}): ClockState {
    this.sTarget = sTarget;
    if (driving || scrub) this.s = sTarget;
    else {
      const k = 1 - Math.exp(-dt / 0.05);
      this.s += (sTarget - this.s) * k;
      if (Math.abs(sTarget - this.s) < 1e-4) this.s = sTarget;
    }
    // held, until the scroll brings another act (it then plays, as any act a scroll reaches does)
    if (this.held) {
      const o = ownerOf(this.s, this.acts, this.segments);
      if (o.kind === 'act' && o.index !== this.heldAct) this.release();
    }
    for (const seg of this.segments) {
      if (seg.kind !== 'act') continue;
      const A = this.acts.get(seg.index) ?? 0;
      this.acts.set(seg.index, scrub ? floorOf(seg, this.s) : stepAct(seg, A, this.s, dt, resting, this.held));
    }
    return this.state(resting);
  }

  state(resting = false): ClockState {
    const owner = ownerOf(this.s, this.acts, this.segments);
    const x = owner.kind === 'act' ? (this.acts.get(owner.index) ?? 0) : owner.kind === 'hold' ? 0 : span(this.s, owner.t0, owner.t1);
    let acting = false;
    if (!resting && !this.held) {
      for (const seg of this.segments) {
        if (seg.kind !== 'act') continue;
        const A = this.acts.get(seg.index) ?? 0;
        // reached but not finished: it plays on; scrolled back above it but not yet rewound: it rewinds
        if ((this.s >= seg.t0 && A < seg.dur) || (this.s < seg.t0 && A > 0)) acting = true;
      }
    }
    return { s: this.s, sTarget: this.sTarget, owner, x, acting };
  }
}

/**
 * What moves the page by itself — and only this (SPEC §7): ▶'s play-through (the page scrolled at film speed, holding
 * 1.5 s at the end of 寫下, of the reply, of the meeting and of the night, stopping where the stage lets go), the glides of ← →, the
 * progress line's ticks and 重看一次, and the jumps (the hash, the way back, the progress line pressed or dragged,
 * which then leaves the page to the visitor). Any wheel, touch, scroll key, press on the scrollbar, or the page moving
 * more than 3 px from where we last put it hands control straight back. Writes are `behavior: 'instant'` (the site's
 * html has smooth scrolling, which would turn every per-frame write into a smooth scroll).
 */
import { FILM_END, SEG, TRACK_SVH, easeInOut, yOfS } from '../script/timeline';

export type DriveMode = 'browse' | 'play' | 'glide';

export interface Track {
  /** The film's top in page px. */
  top(): number;
  /** 1svh in px. */
  svh(): number;
}

/** Where ▶ pauses for a breath: the end of 寫下, of the reply, of the meeting, of the night. */
export const HOLDS = [SEG.write.t1, SEG.reply.t1, SEG.meet.t1, SEG.yours.t1];
const HOLD_S = 1.5;
const TAIL_S = 1.2;
/** How fast ▶ catches the scenery up to an act that has already played ahead of the scroll (film s per second). */
const CATCH_UP = 5;

export class Drive {
  mode: DriveMode = 'browse';
  private sPlay = 0;
  /** Where the play-through catches up to at CATCH_UP× before playing at 1× (an act already played on its own). */
  private catchTo = 0;
  private hold = 0;
  private held = new Set<number>();
  private tail = -1;
  private glide: { from: number; to: number; t: number; dur: number; then?: () => void } | null = null;
  private lastWritten = -1;

  constructor(
    private readonly track: Track,
    private readonly onMode: (m: DriveMode) => void,
  ) {}

  private setMode(m: DriveMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.onMode(m);
  }

  /** ▶ is holding its breath at the end of an act (the page still). */
  get holding(): boolean {
    return this.mode === 'play' && this.hold > 0;
  }

  /** The page's y within the film, px. */
  y(): number {
    return window.scrollY - this.track.top();
  }

  /** Writes the scroll (whole px: rounded, or `up` to the next one — ▶'s last write lands on the track's end, never short). */
  private write(yFilm: number, up = false) {
    const top = (up ? Math.ceil : Math.round)(this.track.top() + yFilm - (up ? 1e-6 : 0));
    this.lastWritten = top;
    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
  }

  /**
   * ▶ from film time `s` (from the start again when the film is over). `from` is where the scenery is now: when an act
   * has already played ahead of the scroll (s > from), the scenery catches up quickly instead of standing on a finished
   * act; every pause up to `s` counts as done (the act it waits on has played).
   */
  play(s: number, from = s) {
    if (s >= FILM_END - 0.01) {
      this.glideTo(0, () => this.play(0), 2);
      return;
    }
    this.sPlay = Math.min(from, s);
    this.catchTo = s;
    this.hold = 0;
    this.tail = -1;
    this.held = new Set(HOLDS.filter((h) => h <= s + 1e-3 && h > 0 && s > 0));
    this.glide = null;
    this.lastWritten = -1;
    this.setMode('play');
  }

  /** ❚❚, or the visitor's own input: the page is theirs again. */
  handBack() {
    this.glide = null;
    this.setMode('browse');
  }

  /** Glide the page to a track position (px within the film) over at most `max` seconds, eased. */
  glideTo(yFilm: number, then?: () => void, max = 1.2) {
    const from = this.y();
    const dist = Math.abs(yFilm - from) / Math.max(1, this.track.svh() * 100);
    this.glide = { from, to: yFilm, t: 0, dur: Math.min(max, 0.35 + dist * 0.5), then };
    this.lastWritten = -1;
    this.setMode('glide');
  }

  /** Jump the page (no glide). */
  jumpTo(yFilm: number) {
    this.glide = null;
    this.write(yFilm);
    this.setMode('browse');
  }

  /**
   * One frame: advance the play-through or the glide and write the scroll. Answers whether the page is being driven
   * (the clock then takes s exactly) and whether that is a glide (every act at its floor meanwhile). `dt` is the wall
   * clock since the last frame (seconds): a glide and ▶ keep to it even on a device that drops frames — only the acts'
   * clocks cap a long frame (the caller's), so a glide takes its time and ▶ plays at 1×, never slower.
   */
  step(dt: number): { driving: boolean; scrub: boolean } {
    if (this.mode === 'browse') return { driving: false, scrub: false };
    if (this.lastWritten >= 0 && Math.abs(window.scrollY - this.lastWritten) > 3) {
      this.handBack();
      return { driving: false, scrub: false };
    }
    const svh = this.track.svh();
    if (this.mode === 'glide' && this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / g.dur);
      this.write(g.from + (g.to - g.from) * easeInOut(g.t));
      if (g.t >= 1) {
        this.glide = null;
        this.setMode('browse');
        g.then?.();
      }
      return { driving: true, scrub: true };
    }
    // the play-through
    if (this.tail >= 0) {
      this.tail = Math.min(1, this.tail + dt / TAIL_S);
      this.write((SEG.rest.y0 + (TRACK_SVH - SEG.rest.y0) * easeInOut(this.tail)) * svh, this.tail >= 1);
      if (this.tail >= 1) this.setMode('browse');
      return { driving: true, scrub: false };
    }
    if (this.hold > 0) {
      this.hold = Math.max(0, this.hold - dt);
      if (this.hold === 0 && this.sPlay >= FILM_END) this.tail = 0;
      return { driving: true, scrub: false };
    }
    const rate = this.sPlay < this.catchTo - 1e-3 ? CATCH_UP : 1;
    const next = Math.min(FILM_END, rate > 1 ? Math.min(this.catchTo, this.sPlay + dt * rate) : this.sPlay + dt);
    const h = HOLDS.find((x) => !this.held.has(x) && this.sPlay < x && next >= x);
    this.sPlay = h ?? next;
    if (h != null) {
      this.held.add(h);
      this.hold = HOLD_S;
    }
    this.write(yOfS(this.sPlay) * svh);
    return { driving: true, scrub: false };
  }
}

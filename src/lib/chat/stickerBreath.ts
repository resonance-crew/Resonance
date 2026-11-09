/**
 * Which of the sticker picker's cells are moving (round 23, the owner's: 「預覽的時候就讓它會動，只有在視線範圍內的這些會動」):
 * "breathing". A cell mostly in view (the picker says which) plays its file once — the file's two baked loops —
 * then rests on its key frame (its thumb, the pose the file starts and ends on, so the swap never shows) for 1.5 to
 * 3 s, chosen afresh each time, and plays again. At most {@link StickerBreath.max} play at once; cells waiting for a
 * turn take a free one in reading order (`order`), one start every {@link BREATH_STAGGER_MS}, none while the grid is
 * being scrolled (`hold`). A cell leaving the view stops at once and gives its turn up.
 *
 * The picker's own: never the thread's `stickerPlayback`, so the two never stop each other's stickers. Times come
 * from the window's timers (fake ones in tests).
 */
export const BREATH_STAGGER_MS = 80;
/** How long a cell rests on its key frame between two plays: at least, at most. */
export const BREATH_REST_MS: readonly [number, number] = [1500, 3000];
/** Past a play's two loops, a little longer before it counts as done (the last frame drawn). */
const PLAY_TAIL_MS = 120;

/** What a cell does when its turn comes: plays its file (two loops of `loopMs` each), or goes back to its key frame. */
export interface BreathingCell {
  play(): void;
  stop(): void;
  /** One loop of its file (the catalog's `durationMs`). */
  loopMs: number;
}

type State = 'hidden' | 'waiting' | 'playing' | 'resting';

interface Entry {
  cell: BreathingCell;
  order: number;
  state: State;
  timer: ReturnType<typeof setTimeout> | null;
}

export class StickerBreath {
  private cells = new Map<string, Entry>();
  private held = false;
  private disposed = false;
  private lastStart = -Infinity;
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    /** How many may play at once (the web's phone panel 6, a tablet's panel and the popover 12). */
    readonly max: number,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** A cell of the grid, in reading order: what its turn does. Hidden until {@link see} says it is in view. */
  add(key: string, order: number, cell: BreathingCell): void {
    const known = this.cells.get(key);
    if (known) {
      known.cell = cell;
      known.order = order;
      return;
    }
    this.cells.set(key, { cell, order, state: 'hidden', timer: null });
  }

  /** A cell leaves the grid: stopped if it was moving. */
  remove(key: string): void {
    const entry = this.cells.get(key);
    if (!entry) return;
    this.see(key, false);
    this.cells.delete(key);
  }

  /** A cell is now mostly in view, or no longer. */
  see(key: string, visible: boolean): void {
    const entry = this.cells.get(key);
    if (!entry || this.disposed) return;
    if (visible) {
      if (entry.state !== 'hidden') return;
      entry.state = 'waiting';
      // On the next turn of the loop: cells coming into view together (one watcher's batch) start in reading order.
      this.later(0);
      return;
    }
    if (entry.state === 'hidden') return;
    const wasPlaying = entry.state === 'playing';
    this.clear(entry);
    entry.state = 'hidden';
    if (wasPlaying) {
      entry.cell.stop();
      this.pump();
    }
  }

  /** The grid is being scrolled: no new plays until it stops (those playing go on). */
  hold(scrolling: boolean): void {
    if (this.held === scrolling) return;
    this.held = scrolling;
    if (!scrolling) this.pump();
  }

  /** The picker goes: everything back on its key frame, nothing more starts. */
  dispose(): void {
    this.disposed = true;
    if (this.pumpTimer != null) clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
    for (const entry of this.cells.values()) {
      const wasPlaying = entry.state === 'playing';
      this.clear(entry);
      entry.state = 'hidden';
      if (wasPlaying) entry.cell.stop();
    }
  }

  /** The keys playing now. */
  get playing(): string[] {
    return [...this.cells].filter(([, e]) => e.state === 'playing').map(([k]) => k);
  }

  /** The keys waiting for a turn, in the order they will take one. */
  get waiting(): string[] {
    return this.queue().map(([k]) => k);
  }

  private queue(): [string, Entry][] {
    return [...this.cells].filter(([, e]) => e.state === 'waiting').sort((a, b) => a[1].order - b[1].order);
  }

  private clear(entry: Entry) {
    if (entry.timer != null) clearTimeout(entry.timer);
    entry.timer = null;
  }

  /** Starts the next waiting cell when a turn is free, one every BREATH_STAGGER_MS. */
  private pump(): void {
    if (this.disposed || this.held || this.pumpTimer != null) return;
    if (this.playing.length >= this.max) return;
    const next = this.queue()[0];
    if (!next) return;
    const wait = this.lastStart + BREATH_STAGGER_MS - this.now();
    if (wait > 0) {
      this.later(wait);
      return;
    }
    const [key, entry] = next;
    entry.state = 'playing';
    this.lastStart = this.now();
    entry.cell.play();
    entry.timer = setTimeout(() => this.played(key), entry.cell.loopMs * 2 + PLAY_TAIL_MS);
    this.pump();
  }

  /** Pumps again after `ms` (once: a pump already due stands). */
  private later(ms: number): void {
    if (this.disposed || this.pumpTimer != null) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.pump();
    }, ms);
  }

  /** A play ran its two loops: back on its key frame, its turn free, and after a rest it waits again. */
  private played(key: string): void {
    const entry = this.cells.get(key);
    if (!entry || entry.state !== 'playing') return;
    entry.cell.stop();
    entry.state = 'resting';
    const [lo, hi] = BREATH_REST_MS;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.state !== 'resting') return;
      entry.state = 'waiting';
      this.pump();
    }, lo + this.random() * (hi - lo));
    this.pump();
  }
}

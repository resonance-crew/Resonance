/**
 * Which of the sticker picker's cells are moving (round 23, the owner's: 「預覽的時候就讓它會動，只有在視線範圍內的這些會動」):
 * "breathing". A cell mostly in view (the picker says which) plays its file once — the file's two baked loops —
 * then rests on its key frame (its thumb, the pose the file starts and ends on, so the swap never shows) for 1.5 to
 * 3 s, chosen afresh each time, and plays again. At most {@link StickerBreath.max} play at once; cells waiting for a
 * turn take a free one first come, first served — the one waiting longest (since it came into view, or since its rest
 * ended), reading order (`order`) only among those that began waiting at the same moment (the first batch) — one
 * start every {@link BREATH_STAGGER_MS}, none while the grid is being scrolled (`hold`). A play outlasts the longest
 * rest, so turns handed out in reading order alone would go round the first cells for ever, the rest never moving. A
 * play's two loops are timed from when its file is showing (a first fetch may take a while); one that can't be shown
 * gives its turn up. A cell leaving the view stops at once and gives its turn up.
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
  /**
   * Shows its file: answers once it is showing (its two loops are timed from then), or fails when it can't be — the
   * turn is given up. Answering nothing, it shows at once. Once `stop` is called, a file still on its way is never
   * shown (the cell's to see to).
   */
  play(): Promise<unknown> | void;
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
  /** When it began waiting for its turn (first come, first served). */
  since: number;
  /** Its plays, counted: what an answer from an earlier play (its file arriving late) is told apart by. */
  turn: number;
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
    this.cells.set(key, { cell, order, state: 'hidden', timer: null, since: 0, turn: 0 });
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
      entry.since = this.now();
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

  /** Those waiting, the one waiting longest first; reading order among those that began waiting together. */
  private queue(): [string, Entry][] {
    return [...this.cells].filter(([, e]) => e.state === 'waiting').sort((a, b) => a[1].since - b[1].since || a[1].order - b[1].order);
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
    const turn = ++entry.turn;
    this.lastStart = this.now();
    const length = entry.cell.loopMs * 2 + PLAY_TAIL_MS;
    // Until its file is showing the turn is held, but no longer than a play would last: one that never comes gives
    // its turn up then.
    entry.timer = setTimeout(() => this.played(key, turn), length);
    const showing = entry.cell.play();
    if (showing && typeof showing.then === 'function') {
      const current = () => this.cells.get(key) === entry && entry.state === 'playing' && entry.turn === turn;
      showing.then(
        () => {
          if (!current()) return;
          // Showing now: its two loops from here.
          this.clear(entry);
          entry.timer = setTimeout(() => this.played(key, turn), length);
        },
        // A file that couldn't be shown (offline, the site failing) holds its turn the play's whole length, as one
        // that never comes does: given up at once, the turns would go round failing cells as fast as they free up —
        // a fetch every 80 ms for as long as the picker is open.
        () => {},
      );
    }
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

  /** A play ran its two loops (or couldn't be shown): back on its key frame, its turn free, and after a rest it waits again. */
  private played(key: string, turn: number): void {
    const entry = this.cells.get(key);
    if (!entry || entry.state !== 'playing' || entry.turn !== turn || this.disposed) return;
    this.clear(entry);
    entry.cell.stop();
    entry.state = 'resting';
    const [lo, hi] = BREATH_REST_MS;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.state !== 'resting') return;
      entry.state = 'waiting';
      entry.since = this.now();
      this.pump();
    }, lo + this.random() * (hi - lo));
    this.pump();
  }
}

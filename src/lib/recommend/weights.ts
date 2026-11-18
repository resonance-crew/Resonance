/**
 * What a reader's own actions say about their taste (round 26 §A3.1) — the
 * table, in one place, and how it adds up per card. Pure: the reads that
 * gather the actions are ./signals `readerEvents`.
 *
 * The weights describe the reader, never a card: nothing here is counted
 * across readers, and no card's standing for anyone else moves with them
 * (docs/product-design-principles.md; ./noPopularity.test.ts).
 *
 * Start values (read to the end = 1), from the two research notes:
 *
 * | the reader                                     | weight                         |
 * |------------------------------------------------|--------------------------------|
 * | replied with a card                            | 5                              |
 * | sent a note (that one was sent — never its text) | 4                            |
 * | tapped 共振 (and it is still on)                | 3                              |
 * | saved it, and read it to the end               | 3                              |
 * | saved it, not read to the end                  | 1                              |
 * | wrote it (their own)                           | 3, decaying to a floor of 1    |
 * | shared it                                      | 2                              |
 * | read it again (a re-read)                      | 1.5 each, 2 at most            |
 * | read it to the end                             | 1                              |
 * | read part of it                                | 0.5 × min(progress, active ÷ expected) |
 * | opened it and left (a report: < 10 s, < 0.1)   | −0.3                           |
 * | opened it, no report (an old app, killed)      | 0 (C7)                         |
 * | shown in their picks 3 times, never opened     | −0.2, and not shown for 14 days |
 *
 * Per card, the positive and the negative sums each decay (λ = 0.01 a day,
 * a half-life of about 69 days), then w = ln(1 + s⁺) − ln(1 + s⁻). Taking a
 * tap or a save back takes its weight away; nothing goes negative for it.
 */

export const W = {
  replied: 5,
  noted: 4,
  tapped: 3,
  savedRead: 3,
  savedUnread: 1,
  wrote: 3,
  wroteFloor: 1,
  shared: 2,
  reread: 1.5,
  rereadsCounted: 2,
  readToEnd: 1,
  readPart: 0.5,
  bounced: -0.3,
  ignored: -0.2,
} as const;

/** λ: how fast an action's weight fades, a day. */
export const DECAY_PER_DAY = 0.01;
/** A report this short in time… */
export const BOUNCE_SECONDS = 10;
/** …and in how far it read is opening a card and leaving it. */
export const BOUNCE_PROGRESS = 0.1;
/** Shown in the reader's picks this many times, on days they opened them, and never opened. */
export const IGNORED_AFTER = 3;
/** Such a card isn't shown again for this long after the last time. */
export const IGNORED_PAUSE_DAYS = 14;
/** A card read without any of the deliberate acts may come back after this long (C5). */
export const READ_RETURN_DAYS = 30;
/** How many of a reader's positive cards make their taste (C2). */
export const TASTE_MAX = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What one reader did with one card (times in ms; absent: never). */
export interface CardEvents {
  cardId: string;
  /** Their own card, published then. */
  wrote?: number;
  /** They replied to it with a card (published), then. */
  replied?: number;
  /** They left a note on it, the latest then. */
  noted?: number;
  /** Their 共振 on it is on, since then. */
  tapped?: number;
  /** They tapped it once, on or since taken back (it was seen and judged: never shown again). */
  tappedEver?: boolean;
  /** It is in their card box, since then. */
  saved?: number;
  /** How they read it (lib/api/v1/reading's record). */
  reading?: {
    lastAt: number;
    reachedEndAt: number | null;
    rereads: number;
    rereadAt: number | null;
    shared: boolean;
    activeSeconds: number;
    maxProgress: number;
    /** The story's reading time when it was read (unrounded seconds); unknown on older records. */
    expectedSeconds: number | null;
  };
  /** How often it was in their picks on days they opened them, and the last such day (UTC). */
  shown?: { n: number; lastDay: string };
}

const decay = (at: number | null | undefined, now: number) => (at == null ? 1 : Math.exp((-DECAY_PER_DAY * Math.max(0, now - at)) / DAY_MS));
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Whether a reading record says the card was opened and left at once (a report there, and short). */
export function bounced(reading: NonNullable<CardEvents['reading']>): boolean {
  return reading.reachedEndAt == null && reading.rereads === 0 && reading.activeSeconds < BOUNCE_SECONDS && reading.maxProgress < BOUNCE_PROGRESS;
}

/** Whether the card was shown often enough, never opened, to count against it. */
function ignored(e: CardEvents): boolean {
  return !!e.shown && e.shown.n >= IGNORED_AFTER && !e.reading && !deliberate(e);
}

/** A deliberate act on the card: a reply, a note, a tap, a save. */
export function deliberate(e: CardEvents): boolean {
  return e.replied != null || e.noted != null || e.tapped != null || e.tappedEver === true || e.saved != null;
}

/** The decayed sums s⁺ and s⁻ of one card's actions at `now`. */
export function sums(e: CardEvents, now: number): { positive: number; negative: number } {
  let positive = 0;
  let negative = 0;
  if (e.wrote != null) positive += Math.max(W.wroteFloor, W.wrote * decay(e.wrote, now));
  if (e.replied != null) positive += W.replied * decay(e.replied, now);
  if (e.noted != null) positive += W.noted * decay(e.noted, now);
  if (e.tapped != null) positive += W.tapped * decay(e.tapped, now);
  const r = e.reading;
  if (e.saved != null) positive += (r?.reachedEndAt != null ? W.savedRead : W.savedUnread) * decay(e.saved, now);
  if (r) {
    if (r.shared) positive += W.shared * decay(r.lastAt, now);
    if (r.rereads > 0) positive += W.reread * Math.min(r.rereads, W.rereadsCounted) * decay(r.rereadAt ?? r.lastAt, now);
    if (r.reachedEndAt != null) positive += W.readToEnd * decay(r.reachedEndAt, now);
    else if (bounced(r)) negative += Math.abs(W.bounced) * decay(r.lastAt, now);
    else {
      const share = r.expectedSeconds && r.expectedSeconds > 0 ? Math.min(r.maxProgress, r.activeSeconds / r.expectedSeconds) : r.maxProgress;
      positive += W.readPart * Math.max(0, Math.min(1, share)) * decay(r.lastAt, now);
    }
  }
  if (ignored(e)) negative += Math.abs(W.ignored) * decay(dayMs(e.shown!.lastDay), now);
  return { positive, negative };
}

/** One card's weight for the reader: w = ln(1 + s⁺) − ln(1 + s⁻). */
export function cardWeight(e: CardEvents, now: number): number {
  const { positive, negative } = sums(e, now);
  return Math.log1p(positive) - Math.log1p(negative);
}

/**
 * Why a card is not to be picked for the reader now (§A3.5), or null:
 * their own card never; one they replied to, noted, tapped or saved never;
 * one read without any of those for READ_RETURN_DAYS after the reading; one
 * shown IGNORED_AFTER times and never opened for IGNORED_PAUSE_DAYS.
 */
export function heldBack(e: CardEvents, now: number): 'own' | 'answered' | 'read' | 'paused' | null {
  if (e.wrote != null) return 'own';
  if (deliberate(e)) return 'answered';
  if (e.reading && now - e.reading.lastAt < READ_RETURN_DAYS * DAY_MS) return 'read';
  if (ignored(e) && now - dayMs(e.shown!.lastDay) < IGNORED_PAUSE_DAYS * DAY_MS) return 'paused';
  return null;
}

export interface Taste {
  /** The reader's strongest positive cards (TASTE_MAX at most), weight first. */
  positive: { cardId: string; weight: number }[];
  /** The cards that count against what is near them. */
  negative: { cardId: string; weight: number }[];
}

/** A reader's taste from what they did: the top TASTE_MAX positive cards by weight, and the negative ones. */
export function tasteOf(events: CardEvents[], now: number): Taste {
  const weighed = events.map((e) => ({ cardId: e.cardId, weight: cardWeight(e, now) }));
  const order = (a: { cardId: string; weight: number }, b: { cardId: string; weight: number }) =>
    Math.abs(b.weight) - Math.abs(a.weight) || (a.cardId < b.cardId ? -1 : 1);
  return {
    positive: weighed.filter((x) => x.weight > 0).sort(order).slice(0, TASTE_MAX),
    negative: weighed.filter((x) => x.weight < 0).sort(order).slice(0, TASTE_MAX),
  };
}

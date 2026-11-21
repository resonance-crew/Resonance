import { blocksOf, placeInBlocks } from '@/lib/cards/tapPassages';

/**
 * The author's picked sentences (round 29 §P1, 「作者自己看的故事本文里，那一句
 * 或是那一段话旁边加入小头」): on the author's own card page, every sentence a
 * reader picked after 共振 that is still in the story wears a faint wash, and
 * its pickers stand as small faces beside it. Only the author's answer
 * carries them (`CardTap.picked`, src/server/app/taps.ts).
 *
 * These are the pure rules, with no Firestore import: which stored picks are
 * sentences of the story as it is now (read as a pick is read when it is
 * made — `placeInBlocks`, shared with `verifyPassages` — whether or not the
 * sentence is still one of the card's options), grouped by sentence, in the
 * story's order, each with its pickers newest first.
 */

/** Taps the author's answer reads at most for its picked sentences: one page, newest first. */
export const PICKED_SCAN = 90;
/** Pickers of one sentence whose blocks and profiles are read: the newest of them. */
export const PICKED_CANDIDATES = 6;
/** Faces a picked sentence shows at most; `more` says there are others (a boolean, never a count). */
export const PICKED_FACES_MAX = 3;

/** A tap that is on, with its pick as stored (lib/api/v1/taps; ports/repos/taps `Tapper`). */
export interface PickingTapper {
  uid: string;
  /** When the tap last turned on (epoch ms). */
  at: number;
  passage?: { id: string; text: string } | null;
}

/** One sentence of the story some tappers picked. */
export interface PickedSentence<T extends PickingTapper = PickingTapper> {
  /** The passage id the picks carry. */
  id: string;
  /** The sentence, whitespace read as one space (as the pick was kept). */
  text: string;
  /** Which of the story's blocks holds it (`blocksOf`), and where it starts there. */
  block: number;
  start: number;
  /** Who picked it, newest first (ties by uid, as the list orders them). */
  pickers: T[];
}

/**
 * The sentences `tappers` picked that are in `story` now, in the story's
 * order (the block, then where it starts there), each with its pickers newest
 * first. A pick whose words left the story is left out; one whose sentence
 * is still there is kept, whether or not the card offers it today. Picks of
 * one id are one sentence (the id is the hash of its words).
 */
export function pickedIn<T extends PickingTapper>(story: string, tappers: readonly T[]): PickedSentence<T>[] {
  const groups = new Map<string, { text: string; pickers: T[] }>();
  for (const t of tappers) {
    const p = t.passage;
    if (!p || typeof p.id !== 'string' || !p.id || typeof p.text !== 'string') continue;
    const g = groups.get(p.id);
    if (g) g.pickers.push(t);
    else groups.set(p.id, { text: p.text, pickers: [t] });
  }
  if (!groups.size) return [];
  const blocks = blocksOf(story);
  const out: PickedSentence<T>[] = [];
  for (const [id, g] of groups) {
    const place = placeInBlocks(blocks, g.text);
    if (!place) continue;
    const pickers = [...g.pickers].sort((a, b) => b.at - a.at || (a.uid < b.uid ? 1 : a.uid > b.uid ? -1 : 0));
    out.push({ id, text: place.text, block: place.block, start: place.start, pickers });
  }
  out.sort((a, b) => a.block - b.block || a.start - b.start || (a.id < b.id ? -1 : 1));
  return out;
}

/**
 * One sentence's faces from its candidates (its newest PICKED_CANDIDATES
 * pickers) once the reads are in: those who `qualifies` (a profile, no block
 * either way), newest first, at most PICKED_FACES_MAX; `more` when another
 * candidate qualifies, when it had pickers past its candidates, or when the
 * scan came back full (older taps may hold more). Null when no one qualifies.
 */
export function pickedFaces<T extends PickingTapper, F>(
  sentence: PickedSentence<T>,
  faceOf: (uid: string) => F | null,
  scanFull: boolean,
): { people: F[]; more: boolean } | null {
  const candidates = sentence.pickers.slice(0, PICKED_CANDIDATES);
  const known = candidates.map((c) => faceOf(c.uid)).filter((f): f is F => f != null);
  if (!known.length) return null;
  return {
    people: known.slice(0, PICKED_FACES_MAX),
    more: known.length > PICKED_FACES_MAX || sentence.pickers.length > candidates.length || scanFull,
  };
}

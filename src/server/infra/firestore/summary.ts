import { after } from 'next/server';
import { FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { thinCard, wordless } from '@/lib/cards/blank';
import { summarize, type ListCard, type StorySummary } from '@/server/domain/summary';
import { mapCard } from './mapper';

// The Firestore half of a card's list summary (src/lib/api/v1/summary.ts
// tells the whole story and re-exports these): the fields a server write
// stores (server stamps, FieldValue), whether a stored summary is still
// current (Timestamps to the nanosecond), and the lists' batched story read
// with its after-response keep — moved here as they were.

/**
 * The summary fields a server write stores beside the story it leaves on the
 * card — in the same write as its `updatedAt: serverTimestamp()`, so the two
 * stamps are equal.
 */
export function summaryFields(story: unknown): StorySummary & { excerptAt: FieldValue } {
  return { ...summarize(story), excerptAt: FieldValue.serverTimestamp() };
}

/**
 * Whether lists may show a card, as the server stamps it in the same write
 * that saves a published story (publish, an applied edit): `thin` when its
 * words are too few (thinCard), else the field removed.
 */
export function listingFields(card: { thoughtCore?: unknown; story?: unknown }): { thin: true | FieldValue } {
  return { thin: thinCard(card) ? true : FieldValue.delete() };
}

/** a > b, to the nanosecond (Date would drop the microseconds). */
function later(a: Timestamp, b: Timestamp): boolean {
  return a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
}

/** The stored summary, while it still describes the story; else null. */
export function storedSummary(data: DocumentData | undefined): StorySummary | null {
  if (!data) return null;
  const { excerpt: text, readMinutes: minutes, excerptAt, updatedAt } = data;
  if (typeof text !== 'string' || !Number.isInteger(minutes) || minutes < 1 || !(excerptAt instanceof Timestamp)) return null;
  // A story written since (or an updatedAt that isn't a server stamp) leaves it behind.
  if (updatedAt != null && (!(updatedAt instanceof Timestamp) || later(updatedAt, excerptAt))) return null;
  return { excerpt: text, readMinutes: minutes };
}

/**
 * Whether a card read with SUMMARY_FIELDS (not its story) is blank
 * (lib/cards/blank) — no title, or a current stored summary with no words. A
 * summary its story has outrun says nothing of the story, so such a card
 * counts as not blank: every server write that publishes or changes a story
 * stores a new one, so only older builds' writes leave one behind.
 */
export function blankBySummary(data: DocumentData | undefined): boolean {
  const stored = storedSummary(data);
  return wordless(data?.thoughtCore, stored ? stored.excerpt : 'unknown');
}

export function listCard(id: string, data: DocumentData): ListCard {
  const card: ListCard = mapCard(id, data);
  const stored = storedSummary(data);
  if (stored) card.listing = stored;
  if (data.updatedAt instanceof Timestamp) card.editedAt = data.updatedAt.toDate();
  return card;
}

/**
 * Gives every card that was read without its story and has no current stored
 * summary its story — one batched read of just that field — so summaryOf()
 * is right for each. Cards it is given are completed in place.
 */
export async function withStories<T extends ListCard>(db: Firestore, cards: T[]): Promise<T[]> {
  const need = cards.filter((c) => typeof c.story !== 'string' && !c.listing);
  const ids = [...new Set(need.map((c) => c.id))].filter((id) => id && !id.includes('/'));
  if (!ids.length) return cards;
  const snaps = await db.getAll(...ids.map((id) => db.doc(`cards/${id}`)), { fieldMask: ['story'] });
  const stories = new Map(snaps.map((s) => [s.id, s.get('story')]));
  for (const c of need) {
    const story = stories.get(c.id);
    c.story = typeof story === 'string' ? story : '';
  }
  keepSummaries(snaps);
  return cards;
}

const pendingKeeps = new Set<Promise<unknown>>();

/** For tests: every summary write withStories started has settled. */
export async function summaryKeepsSettled(): Promise<void> {
  while (pendingKeeps.size) await Promise.allSettled([...pendingKeeps]);
}

/**
 * The summaries withStories just worked out from the stories, kept on their
 * cards after the answer (B6) — `{excerpt, readMinutes, excerptAt}`, as
 * publishing stores them — so the next list reads them rather than the story
 * again: an app's autosaved draft or private card moves `updatedAt` at every
 * save, and its card box would otherwise read every such story at every
 * open. Each write holds only if the card is unchanged since its story was
 * read here (`lastUpdateTime`): a save in between is newer than what was
 * summarised, and that card waits for the next list. Never `updatedAt`, nor
 * anything a client writes; a write that fails changes nothing.
 */
function keepSummaries(snaps: DocumentSnapshot[]) {
  const due = snaps.filter((s) => s.exists && s.updateTime);
  if (!due.length) return;
  const write = async () =>
    Promise.all(
      due.map((s) =>
        s.ref
          .update({ ...summarize(s.get('story')), excerptAt: FieldValue.serverTimestamp() }, { lastUpdateTime: s.updateTime! })
          .catch(() => {}),
      ),
    );
  const run = () => {
    const p = write().finally(() => pendingKeeps.delete(p));
    pendingKeeps.add(p);
    return p;
  };
  try {
    // After the response: the reader never waits for it.
    after(run);
  } catch {
    // Outside a request (a script, a test): now, unawaited.
    void run();
  }
}

import { PASSAGES_MAX, PASSAGES_MIN, passagesHash, type StoredTapPassages } from '@/lib/cards/tapPassages';
import type { TapPassageBody } from './schemas';

/**
 * Reading a card's tap passages (round 27; lib/cards/tapPassages says what
 * they are): `CardDetail.tap.passages` for a reader, and the check of a pick
 * (PUT /cards/{id}/tap/passage). No model import — GET /cards/{key}, the tap
 * and its list run in hkg1; making them is ./tapPassagesMake.
 */

/**
 * The passages a card offers now: its stored ones while they were made from
 * the story as it is and there are at least PASSAGES_MIN; else none. A stale
 * or half-made value is never shown.
 */
export function presentTapPassages(card: { story?: unknown; tapPassages?: unknown }): TapPassageBody[] {
  const stored = card.tapPassages as StoredTapPassages | undefined;
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.items)) return [];
  const story = typeof card.story === 'string' ? card.story : '';
  if (stored.of !== passagesHash(story)) return [];
  const items = stored.items
    .filter((i): i is TapPassageBody => !!i && typeof i.id === 'string' && typeof i.text === 'string' && i.text.length > 0)
    .slice(0, PASSAGES_MAX)
    .map((i) => ({ id: i.id, text: i.text }));
  return items.length >= PASSAGES_MIN ? items : [];
}

/** A pick as the tap document keeps it (`passage: { id, text }`), or null. */
export function storedPick(v: unknown): { id: string; text: string } | null {
  if (!v || typeof v !== 'object') return null;
  const { id, text } = v as Record<string, unknown>;
  return typeof id === 'string' && typeof text === 'string' && text ? { id, text } : null;
}

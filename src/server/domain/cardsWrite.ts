import { restorableVisibility, type TrashedFrom } from '@/lib/cards/trash';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card } from '@/lib/db/types';

// Pure policy of the card box's writes (src/server/app/{cards,publish,edits,trash}.ts), on cards as
// stored — times as Date (ports/repos/cards.ts CardRow). The three resonance tests are those of
// src/lib/api/v1/resonate.ts (graph lane), stated here on plain rows so the services import no SDK;
// both must say the same.

type Row = Record<string, unknown>;

/** A document id that can be put in a path (a stored field could hold anything). */
export const pathId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('/');

/** pathId, and not an id Firestore keeps for itself. */
export const docId = (v: unknown): v is string => pathId(v) && !isReservedId(v);

/** Whether a resonance may reach the original's author at all: shown publicly under its writer's name (resonate `reachable`). */
export function reachable(card: Row | undefined): boolean {
  return card?.visibility === 'public' && card.anonymous !== true;
}

/** Whether `before` → `after` made a published resonance reachable (resonate `becameReachable`). */
export function becameReachable(before: Row, after: Row): boolean {
  return before.publishedAt != null && pathId(after.referenceCardId) && !reachable(before) && reachable(after);
}

/** Whether a card is a published resonance its original's list doesn't show under its writer's name (resonate `hiddenResonance`). */
export function hiddenResonance(card: Row): boolean {
  return card.publishedAt != null && pathId(card.referenceCardId) && !reachable(card);
}

/** When a stored card went into the trash, in ms; null for one that isn't there (or an odd value, read as not there). */
export function trashedMs(row: Row | undefined): number | null {
  const at = row?.trashedAt;
  return at instanceof Date ? at.getTime() : null;
}

/** A stored `trashedFrom` as the trash reads it: what restoring brings back. */
export function trashedFromOf(row: Row): TrashedFrom {
  const from = row.trashedFrom && typeof row.trashedFrom === 'object' ? (row.trashedFrom as Row) : {};
  return {
    visibility: restorableVisibility(from.visibility),
    referenceCardId: docId(from.referenceCardId) ? from.referenceCardId : null,
  };
}

/** A profile row has a pen name (src/lib/api/v1/conversations.ts hasPenName, on a row). */
export function hasPenNameRow(row: Row | null | undefined): boolean {
  const handle = row ? row.handle : null;
  return typeof handle === 'string' && handle.trim().length > 0;
}

function nullableDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

/** A stored card as the app's Card (src/server/infra/firestore/mapper.ts mapCard, on a row whose times are Date already). */
export function cardOf(id: string, row: Row): Card {
  return { ...(row as Omit<Card, 'id' | 'publishedAt'>), id, publishedAt: nullableDate(row.publishedAt) };
}

/** A view of a row as a snapshot's `get` (for helpers that read one, e.g. inTrash refuseInTrash). */
export const asSnap = (row: Row) => ({ get: (field: string) => field.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Row)[k] : undefined), row) });

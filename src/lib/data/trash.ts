'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSWRConfig } from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import type { RestoredCardBody, TrashedCardBody } from '@/lib/api/v1/schemas';
import type { Card } from '@/lib/db/types';
import type { CardBoxShelfData } from './hooks';
import {
  deleteCardForever,
  emptyTrash as emptyTrashOnServer,
  restoreCard as restoreOnServer,
  trashCard as trashOnServer,
} from '@/lib/db/firestore/client/cards';
import { cardKey } from './cardPrefill';
import { dependsOnConnections, resonanceKeys } from './resonate';

/**
 * The trash's moves from the web — move a card there, bring it back, delete
 * it for good, empty it — each through the server (POST …/trash, …/restore,
 * DELETE …?onlyIfTrashed=true, DELETE /me/trash), then everything this
 * browser holds that showed the card where it was read again: the card box's
 * shelves (the trash among them), the viewer's profile lists, the thought
 * map, the card's own page. A resonance going in or coming back can end or
 * keep a connection with its original's author, and changes what shows the
 * link between the two: what turns on connections is read again too.
 *
 * Moving a card to the trash and deleting it for good take it off the card
 * box's shelves at once, before the server answers (`hide`): the rest close
 * up without a skeleton, and a refusal puts it back where it was.
 *
 * What to say about it (the toast, the banner, a dialog) is the caller's.
 */

/** A card as the trash's moves need it: its id, its slug, and the card it answers (or answered, before the trash parked it). */
export interface TrashCardRef {
  id: string;
  slug?: string;
  referenceCardId?: string;
}

export interface TrashActions {
  trash: (card: TrashCardRef) => Promise<TrashedCardBody>;
  restore: (card: TrashCardRef) => Promise<RestoredCardBody>;
  /** For good, and only while it is still in the trash (a card restored meanwhile is a 409 and stays). */
  deleteForever: (card: TrashCardRef) => Promise<void>;
  /** The trash shelf shows empty at once; a failure puts its cards back (and reads the shelf again). */
  emptyTrash: () => Promise<{ deleted: number; remaining: number }>;
  /** Read again what showed the card (after a failure too: the shelf then shows what is really there). */
  refresh: (card?: TrashCardRef) => void;
}

export function useTrashActions(): TrashActions {
  const { user } = useAuth();
  const { mutate, cache } = useSWRConfig();
  const uid = user?.id;

  // Cards off the card-box shelves this browser holds, at once — one card from every shelf, or every card of
  // one shelf; what it answers puts them back as they were.
  const hideWhere = useCallback(
    (drop: (key: string, card: Card) => boolean) => {
      const kept = new Map<string, CardBoxShelfData>();
      if (uid) {
        for (const key of cache.keys()) {
          if (!key.startsWith(`cardbox:${uid}:`)) continue;
          const shelf = cache.get(key)?.data as CardBoxShelfData | undefined;
          if (!Array.isArray(shelf?.cards) || !shelf.cards.some((c) => drop(key, c))) continue;
          kept.set(key, shelf);
          void mutate(key, { ...shelf, cards: shelf.cards.filter((c) => !drop(key, c)) }, { revalidate: false });
        }
      }
      return () => kept.forEach((shelf, key) => void mutate(key, shelf, { revalidate: false }));
    },
    [cache, mutate, uid],
  );
  const hide = useCallback((id: string) => hideWhere((_key, c) => c.id === id), [hideWhere]);

  const refresh = useCallback(
    (card?: TrashCardRef) => {
      if (!uid) return;
      const own = (key: string) =>
        key.startsWith(`cardbox:${uid}:`) ||
        key === `profileCards:${uid}` ||
        (key.startsWith('profilePage:') && key.endsWith(`:${uid}`)) ||
        key === `thoughtmap:${uid}`;
      const named = new Set(
        card
          ? [
              cardKey(card.id, uid),
              ...(card.slug && card.slug !== card.id ? [cardKey(card.slug, uid)] : []),
              `cardPage:${card.id}:${uid}`,
              ...(card.referenceCardId ? resonanceKeys(uid, card.referenceCardId, card) : []),
            ]
          : [],
      );
      const connections = card?.referenceCardId ? dependsOnConnections(uid) : null;
      // One pass, so a key named twice is read again once.
      void mutate((key) => typeof key === 'string' && (own(key) || named.has(key) || !!connections?.(key)));
    },
    [mutate, uid],
  );

  return useMemo<TrashActions>(
    () => ({
      async trash(card) {
        const putBack = hide(card.id);
        try {
          return await trashOnServer(card.id);
        } catch (e) {
          putBack();
          throw e;
        } finally {
          refresh(card);
        }
      },
      async restore(card) {
        try {
          const restored = await restoreOnServer(card.id);
          // Coming back as a resonance, it shows the link again where the original shows it.
          refresh({ ...card, referenceCardId: restored.card?.referenceCardId ?? card.referenceCardId });
          return restored;
        } catch (e) {
          refresh(card);
          throw e;
        }
      },
      async deleteForever(card) {
        const putBack = hide(card.id);
        try {
          await deleteCardForever(card.id, { onlyIfTrashed: true });
        } catch (e) {
          putBack();
          throw e;
        } finally {
          refresh(card);
        }
      },
      async emptyTrash() {
        const putBack = hideWhere((key) => key === `cardbox:${uid}:trash`);
        try {
          return await emptyTrashOnServer();
        } catch (e) {
          putBack();
          throw e;
        } finally {
          refresh();
        }
      },
      refresh,
    }),
    [hide, hideWhere, refresh, uid],
  );
}

/**
 * Who reads a card that came back from the trash, as its toast says it (round
 * 11 §7: the trash's rows no longer warn that restoring makes a card public
 * again, so the toast does) — read off the restore's answer, never guessed
 * from the trash row: a 私人卡 (kept private, or never published), public,
 * public and anonymous, or for connections only.
 */
export type RestoredAs = 'private' | 'public' | 'anonymous' | 'connections';

export function restoredAs(card: { publishedAt?: unknown; visibility?: string | null; anonymous?: boolean | null }): RestoredAs {
  if (!card.publishedAt || card.visibility === 'private') return 'private';
  if (card.visibility === 'connections') return 'connections';
  return card.anonymous ? 'anonymous' : 'public';
}

/** The toast's key under `me.actions` for a card restored as {@link restoredAs} says. */
export const RESTORED_TOAST = {
  private: 'restoredPrivate',
  public: 'restoredPublic',
  anonymous: 'restoredAnonymous',
  connections: 'restoredConnections',
} as const satisfies Record<RestoredAs, string>;

// "This card is back, but no longer resonates with the card it answered":
// said in a dialog, which must outlive the control that restored the card —
// the toast's 復原 does it after the card's own ⋯ has left the page with the
// card. So whether it is up is kept here, and each page that can restore a
// card draws it once (RestoredAloneNotice).
let droppedNotice = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Say that a restored resonance came back on its own (RestoredAloneNotice shows it). */
export function announceRestoredAlone(): void {
  droppedNotice = true;
  emit();
}

/** Take the notice down. */
export function closeRestoredAlone(): void {
  if (!droppedNotice) return;
  droppedNotice = false;
  emit();
}

/** Whether the notice is up, and the way to close it. */
export function useRestoredAloneNotice(): [boolean, () => void] {
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => droppedNotice,
    () => false,
  );
  return [open, closeRestoredAlone];
}

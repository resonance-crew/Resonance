import { cache } from 'react';
import { toCardSeed, type CardSeed } from '@/lib/data/cardSeed';
import { readCardForPage as readCardForPageIn, type LoadedCard } from '@/server/app/cardsRead';
import { serverCtx } from '@/server/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';

export type { LoadedCard };

/**
 * The card a URL segment names, as the world sees it (src/server/app/cardsRead.ts
 * readCardForPage): only what a signed-out reader may read — published and
 * public — since the result becomes cached HTML served to everyone. Kept with
 * this signature for its importers (the emulator suites, /api/cards/view).
 */
export function readCardForPage(db: AdminDb, key: string): Promise<LoadedCard> {
  return readCardForPageIn(ctxFor(db), key);
}

/**
 * {@link readCardForPage} once per render (React `cache`: the page's <head>
 * and its body share it). Null when the read failed: the page then resolves
 * the URL in the browser, as it did before the server read existed.
 */
export const loadCard = cache(async (key: string): Promise<LoadedCard | null> => {
  try {
    return await readCardForPageIn(serverCtx(), key);
  } catch (e) {
    console.error('card page: server read failed', e);
    return null;
  }
});

/** What the card page hands the browser (see CardSeed), or null when the server couldn't tell. */
export async function loadCardSeed(key: string): Promise<CardSeed | null> {
  const loaded = await loadCard(key);
  return loaded && toCardSeed(loaded.id, loaded.card, loaded.author);
}

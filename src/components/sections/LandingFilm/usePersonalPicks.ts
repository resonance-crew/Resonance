'use client';

/**
 * The end's list for whoever is reading: the server's picks (one recommendation for everyone, in the page's HTML) —
 * and, once Auth has restored a signed-in reader, their own recommended stories in its place (the owner, round 4:
 * 「有登錄當然可以有他個人化的推薦，但沒有的話就是一個統一的這種推薦」).
 *
 * - Signed out, or while Auth restores: the server's list, and nothing is loaded or asked for this.
 * - Signed in: one request (personalPicks.ts, imported then). The server's list stays until it answers, and for good
 *   if it fails or brings nothing.
 * - The count never changes: fewer picks of the reader's than the list holds are followed by the server's (none
 *   twice), so the grid's rows stay whole.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { CARD_COLOUR_WINDOW, CARD_FAMILY_ORDER } from '@/lib/design/cardColours';
import { PICKS, type FilmTile } from './model';

/**
 * Two lists joined: a tile wearing the colour family of one of the three before it moves to the nearest free one
 * (cardPalettes' rule, from the family each tile already wears).
 */
function keptApart(tiles: FilmTile[]): FilmTile[] {
  const worn: number[] = [];
  return tiles.map((t) => {
    const near = worn.slice(-CARD_COLOUR_WINDOW);
    const family = near.includes(t.family) ? CARD_FAMILY_ORDER[t.family]?.find((f) => !near.includes(f)) ?? t.family : t.family;
    worn.push(family);
    return family === t.family ? t : { ...t, family };
  });
}

/** The reader's picks first, then the server's that aren't among them — as many as the server's list holds. */
export function mergedPicks(mine: FilmTile[], server: FilmTile[]): FilmTile[] {
  if (!mine.length) return server;
  const count = server.length || PICKS;
  const own = mine.slice(0, count);
  const rest = server.filter((s) => !own.some((m) => m.id === s.id));
  return keptApart([...own, ...rest].slice(0, count));
}

export function usePersonalPicks(server: FilmTile[]): FilmTile[] {
  const { user, loading } = useAuth();
  const uid = !loading && user ? user.id : null;
  const [mine, setMine] = useState<{ uid: string; tiles: FilmTile[] } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    import('./personalPicks')
      .then((m) => m.readPersonalPicks(PICKS))
      .then((tiles) => {
        if (live && tiles.length) setMine({ uid, tiles });
      })
      // no picks, signed out meanwhile, offline: the server's list is the list
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uid]);
  return useMemo(() => (uid && mine?.uid === uid ? mergedPicks(mine.tiles, server) : server), [uid, mine, server]);
}

'use client';

import { mutate } from 'swr';
import { mapOpsBusy } from '@/lib/db/firestore/client/thoughtMap';

/**
 * What the writer's side reads again when the viewer's `signals/{uid}` counter for it rises (phase 2b): `map`
 * (a thought map op batch stored, from any device) reads the map again — unless this tab still has changes on
 * their way, whose own touch will come after them (reading now could show the board from before them); `drafts`
 * (a draft or a pending edit saved) reads the card box's own shelves again. The signal listener (lib/data/live,
 * web lane A) calls this; an open editor is never refreshed under the writer — it copied its card once.
 */
export function onWriterSignal(topic: 'map' | 'drafts', uid: string): void {
  if (topic === 'map') {
    if (!mapOpsBusy()) void mutate(`thoughtmap:${uid}`);
    return;
  }
  const own = new Set(['published', 'private', 'draft'].map((shelf) => `cardbox:${uid}:${shelf}`));
  void mutate((key) => typeof key === 'string' && own.has(key));
}

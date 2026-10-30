import type { ChatMessage } from './message';

/**
 * Several pictures sent together (round 22 §3): each is a message of its own,
 * sharing `album: { id, index, count }`. The thread draws one sender's run of
 * an album's pictures as one grid — the twin of the apps' AlbumGroups.
 */

/** A picture that can stand in its album's grid: delivered or on its way, not unsent, not failed. */
function inGrid(m: ChatMessage): boolean {
  return !!m.album && !!m.image && !m.unsentAt && m.delivery !== 'failed';
}

export interface CollapsedAlbums {
  /** The thread's messages with each album's grid standing as its first picture (`members` names the rest). */
  messages: ChatMessage[];
  /** By the standing message's key: every picture of its grid, in the album's order (2 at least). */
  members: Map<string, ChatMessage[]>;
}

/** An unsent message keeps nothing but who sent it and when (the server strips its album with the rest). */
const unsentBy = (m: ChatMessage, senderId: string) => !!m.unsentAt && m.senderId === senderId;

/**
 * Collapses each album into the message that stands for its grid: from its
 * first picture on, every later message of that album from the same sender
 * joins the grid. One of them failed, or unsent (which no longer says it was
 * in the album), is drawn on its own right after the grid (its line, its
 * retry) while the album goes on after it — an unsent message of the same
 * sender belongs to the run only when the album continues past it. A missing
 * picture just leaves the grid smaller; a grid of one is a picture alone.
 * `messages` oldest first, as held.
 */
export function collapseAlbums(messages: readonly ChatMessage[]): CollapsedAlbums {
  const out: ChatMessage[] = [];
  const members = new Map<string, ChatMessage[]>();
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (!m.album || !m.image) {
      out.push(m);
      i++;
      continue;
    }
    const album = m.album.id;
    const sender = m.senderId;
    const ofAlbum = (x: ChatMessage | undefined) => !!x && x.album?.id === album && x.senderId === sender;
    let j = i;
    const grid: ChatMessage[] = [];
    const apart: ChatMessage[] = [];
    for (;;) {
      if (ofAlbum(messages[j])) {
        (inGrid(messages[j]) ? grid : apart).push(messages[j]);
        j++;
        continue;
      }
      // Unsent messages of the same sender, with the album going on after them: pictures of it, unsent.
      let k = j;
      while (k < messages.length && unsentBy(messages[k], sender)) k++;
      if (k === j || !ofAlbum(messages[k])) break;
      apart.push(...messages.slice(j, k));
      j = k;
    }
    grid.sort((a, b) => a.album!.index - b.album!.index);
    if (grid.length >= 2) {
      out.push(grid[0]);
      members.set(grid[0].key, grid);
      out.push(...apart);
    } else {
      out.push(...messages.slice(i, j));
    }
    i = j;
  }
  return { messages: out, members };
}

/** The message whose row draws `id`: the grid's first picture for any picture of an album, else itself. */
export function standingFor(collapsed: CollapsedAlbums, id: string): string {
  for (const grid of collapsed.members.values()) if (grid.some((x) => x.id === id)) return grid[0].id;
  return id;
}

/** One row of an album's grid: how many pictures stand side by side in it, and its height. */
export interface AlbumRow {
  count: number;
  height: number;
}

/** The space between two pictures of a grid (the bubble's fill shows through). */
export const ALBUM_GAP = 2;

/**
 * How `count` pictures are laid out in a grid `width` wide (round 22 §3): two
 * side by side, three as one big and two under it, four two by two, five to
 * ten in rows of three (the last row's pictures sharing its width). Each row's
 * height, so the grid's place is known before any picture loads.
 */
export function albumRows(count: number, width: number): AlbumRow[] {
  const cell = (n: number) => (width - ALBUM_GAP * (n - 1)) / n;
  if (count <= 1) return [{ count: 1, height: Math.round(width * 0.75) }];
  if (count === 2) return [{ count: 2, height: Math.round(cell(2) * 1.3) }];
  if (count === 3) return [{ count: 1, height: Math.round(width * 0.62) }, { count: 2, height: Math.round(cell(2)) }];
  if (count === 4) return [{ count: 2, height: Math.round(cell(2)) }, { count: 2, height: Math.round(cell(2)) }];
  const rows: AlbumRow[] = [];
  for (let left = count; left > 0; left -= 3) rows.push({ count: Math.min(3, left), height: Math.round(cell(3)) });
  return rows;
}

/** The grid's whole height. */
export function albumHeight(count: number, width: number): number {
  const rows = albumRows(count, width);
  return rows.reduce((h, r) => h + r.height, 0) + ALBUM_GAP * (rows.length - 1);
}

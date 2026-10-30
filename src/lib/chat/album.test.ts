import { describe, expect, it } from 'vitest';
import { ALBUM_GAP, albumHeight, albumRows, collapseAlbums, standingFor } from './album';
import type { ChatMessage } from './message';

const t = (n: number) => new Date(Date.UTC(2026, 9, 31, 8, 0, n));
let seq = 0;
function m(senderId: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  const id = extra.id ?? `m${++seq}`;
  return { id, key: id, senderId, text: '', sentAt: t(seq), delivery: 'delivered', ...extra };
}
const pic = (senderId: string, album: string, index: number, count: number, extra: Partial<ChatMessage> = {}) =>
  m(senderId, { image: { id: `img-${album}-${index}`, width: 800, height: 600 }, album: { id: album, index, count }, ...extra });
const keys = (list: ChatMessage[]) => list.map((x) => x.key);

// Round 22 §3: one sender's run of an album's pictures is drawn as one grid; a missing picture (still to come,
// failed, unsent) just leaves the grid smaller.
describe('collapseAlbums', () => {
  it('stands an album for its first picture, every picture of it named with it in order', () => {
    const before = m('bob', { text: 'look' });
    const a = [pic('me', 'A', 0, 3, { text: 'rain' }), pic('me', 'A', 1, 3), pic('me', 'A', 2, 3)];
    const after = m('bob', { text: 'wow' });
    const { messages, members } = collapseAlbums([before, ...a, after]);
    expect(keys(messages)).toEqual([before.key, a[0].key, after.key]);
    expect(keys(members.get(a[0].key)!)).toEqual(keys(a));
  });

  // The server's unsend leaves a message nothing but who sent it and when ({ senderId, sentAt, unsentAt }): no
  // picture, no album. It stands apart, right after the grid, and the album goes on past it.
  const unsent = (senderId: string, extra: Partial<ChatMessage> = {}) => m(senderId, { unsentAt: new Date(), ...extra });

  it('keeps an album whole past a picture unsent in its middle, the unsent line right after the grid', () => {
    const a0 = pic('me', 'A', 0, 4, { text: 'rain' });
    const a1 = unsent('me');
    const a2 = pic('me', 'A', 2, 4);
    const a3 = pic('me', 'A', 3, 4);
    const { messages, members } = collapseAlbums([a0, a1, a2, a3]);
    expect(keys(messages)).toEqual([a0.key, a1.key]);
    expect(keys(members.get(a0.key)!)).toEqual([a0.key, a2.key, a3.key]);
    expect(messages[0].text).toBe('rain');
  });

  it('draws a failed picture on its own after the grid, and one still on its way in it', () => {
    const a0 = pic('me', 'A', 0, 4);
    const a1 = unsent('me');
    const a2 = pic('me', 'A', 2, 4, { delivery: 'failed' });
    const a3 = pic('me', 'A', 3, 4, { delivery: 'sending' });
    const { messages, members } = collapseAlbums([a0, a1, a2, a3]);
    expect(keys(messages)).toEqual([a0.key, a1.key, a2.key]);
    expect(keys(members.get(a0.key)!)).toEqual([a0.key, a3.key]);
  });

  it('leaves an unsent message that the album doesn’t go on past where it is, and a lone picture as itself', () => {
    // The album's last picture unsent, then another of the sender's messages unsent: drawn after the grid, in order.
    const a0 = pic('me', 'A', 0, 3);
    const a1 = pic('me', 'A', 1, 3);
    const gone = unsent('me');
    const later = unsent('me');
    const words = m('me', { text: 'and this' });
    const run = collapseAlbums([a0, a1, gone, later, words]);
    expect(keys(run.messages)).toEqual([a0.key, gone.key, later.key, words.key]);
    expect(keys(run.members.get(a0.key)!)).toEqual([a0.key, a1.key]);

    // Someone else's unsent message is not the sender's picture: the album ends there.
    const b0 = pic('me', 'B', 0, 3);
    const theirs = unsent('bob');
    const b2 = pic('me', 'B', 2, 3);
    const split = collapseAlbums([b0, theirs, b2]);
    expect(keys(split.messages)).toEqual([b0.key, theirs.key, b2.key]);
    expect(split.members.size).toBe(0);

    // Only one of an album left in the grid: a picture alone, nothing collapsed.
    const c0 = pic('me', 'C', 0, 2);
    const c1 = unsent('me');
    const lone = collapseAlbums([c0, c1]);
    expect(keys(lone.messages)).toEqual([c0.key, c1.key]);
    expect(lone.members.size).toBe(0);
  });

  it('names the row that draws any picture of an album', () => {
    const a = [pic('me', 'A', 0, 3), pic('me', 'A', 1, 3), pic('me', 'A', 2, 3)];
    const plain = m('bob', { text: 'hi' });
    const collapsed = collapseAlbums([...a, plain]);
    expect(a.map((x) => standingFor(collapsed, x.id))).toEqual([a[0].id, a[0].id, a[0].id]);
    expect(standingFor(collapsed, plain.id)).toBe(plain.id);
  });

  it('ends an album at a message of anyone else, and keeps two albums apart', () => {
    const a0 = pic('me', 'A', 0, 3);
    const theirs = m('bob', { text: 'oh' });
    const a1 = pic('me', 'A', 1, 3);
    const a2 = pic('me', 'A', 2, 3);
    const b0 = pic('me', 'B', 0, 2);
    const b1 = pic('me', 'B', 1, 2);
    const { messages, members } = collapseAlbums([a0, theirs, a1, a2, b0, b1]);
    expect(keys(messages)).toEqual([a0.key, theirs.key, a1.key, b0.key]);
    expect(members.has(a0.key)).toBe(false);
    expect(keys(members.get(a1.key)!)).toEqual([a1.key, a2.key]);
    expect(keys(members.get(b0.key)!)).toEqual([b0.key, b1.key]);
  });

  it('orders a grid by the album, whatever order the pictures arrived in, and leaves plain pictures alone', () => {
    const late = pic('me', 'A', 1, 2);
    const first = pic('me', 'A', 0, 2);
    const plain = m('me', { image: { id: 'p', width: 1, height: 1 } });
    const { messages, members } = collapseAlbums([late, first, plain]);
    expect(keys(messages)).toEqual([first.key, plain.key]);
    expect(keys(members.get(first.key)!)).toEqual([first.key, late.key]);
  });
});

describe('albumRows', () => {
  it('lays two side by side, three as one big and two, four two by two, five to ten in rows of three', () => {
    const counts = (n: number) => albumRows(n, 280).map((r) => r.count);
    expect(counts(2)).toEqual([2]);
    expect(counts(3)).toEqual([1, 2]);
    expect(counts(4)).toEqual([2, 2]);
    expect(counts(5)).toEqual([3, 2]);
    expect(counts(7)).toEqual([3, 3, 1]);
    expect(counts(10)).toEqual([3, 3, 3, 1]);
  });

  it('knows the grid’s height before any picture comes', () => {
    const rows = albumRows(4, 280);
    const cell = (280 - ALBUM_GAP) / 2;
    expect(rows.map((r) => r.height)).toEqual([Math.round(cell), Math.round(cell)]);
    expect(albumHeight(4, 280)).toBe(Math.round(cell) * 2 + ALBUM_GAP);
  });
});

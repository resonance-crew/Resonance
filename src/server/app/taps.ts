import { NOTE_REQUEST_MAX, noPenName } from '@/lib/api/v1/conversations';
import { ApiFailure } from '@/lib/api/v1/http';
import { cardVisible, trashedAtOf } from '@/lib/api/v1/present';
import { TAP_FACES_MAX, type AuthorBody, type CardTapBody, type TapListBody, type TapPassageResponseBody, type TapPersonBody, type TapPickedBody } from '@/lib/api/v1/schemas';
import { PICKED_CANDIDATES, PICKED_SCAN, pickedFaces, pickedIn } from '@/lib/cards/tapPicked';
import { presentTapPassages } from '@/lib/api/v1/tapPassages';
import type { Card } from '@/lib/db/types';
import type { ServerCtx } from '@/server/ctx';
import { TAP_PAGE, noteExcerpt, type TapOutcome } from '@/server/domain/taps';
import type { TapPick, Tapper } from '@/server/ports/repos/taps';
import type { PageCursor } from '@/server/ports/time';

// The resonance tap (共振, round 26) as an application service: what each
// answer checks, in which order, and what it writes. Why: the module comment
// of src/lib/api/v1/taps.ts (the legacy facades, which call these on ctxFor(db)).

const notFound = () => new ApiFailure('not_found', 'No such card.');

const published = (card: Card) => !!card.publishedAt && trashedAtOf(card) == null && card.trashedAt == null;

/** A card a reader may tap as they read it now: published, out of the trash, not theirs. */
function tappable(card: Card | null, uid: string): card is Card {
  return !!card && published(card) && card.authorId !== uid;
}

/** See src/lib/api/v1/taps.ts `setTap`. */
export async function setTapIn(ctx: ServerCtx, uid: string, cardId: string, on: boolean, now = ctx.clock.now(), spent?: Promise<void>): Promise<TapOutcome> {
  const taps = ctx.data.taps;
  const card = await taps.visibleCard(uid, cardId);
  if (!published(card)) throw notFound();
  if (card.authorId === uid) throw new ApiFailure('invalid_request', 'You cannot resonate with your own card.');
  const author = card.authorId;
  if (on) {
    // Read alike for every card, whatever stands between the two: only a named card's answer turns on them.
    const gate = await taps.tapGate(uid, author);
    if (!gate.penName) throw noPenName();
    if (card.anonymous !== true && gate.blocked) throw new ApiFailure('blocked', 'You cannot resonate with this card.');
  }
  return ctx.uow.run(
    async (tx) => {
      const [tap, fresh, linked] = await Promise.all([tx.taps.getTap(card.id, uid), tx.taps.getTapCard(card.id), tx.taps.connected(uid, author)]);
      // The budget answers before anything is written.
      await spent;
      if (!tappable(fresh, uid) || fresh.authorId !== author || !cardVisible(fresh, uid, () => linked)) throw notFound();
      const wasOn = tap?.on === true;
      if (wasOn === on) return { on, changed: false, ring: false };
      if (!on) {
        tx.taps.turnTapOff(card.id, uid);
        return { on: false, changed: true, ring: false };
      }
      const rangAt = tap?.rangAt ?? null;
      tx.taps.putTapOn(card.id, uid, new Date(now), rangAt);
      return { on: true, changed: true, ring: rangAt == null };
    },
    { label: 'setTap' },
  );
}

/** See src/lib/api/v1/taps.ts `deleteTapsOn`. */
export function deleteTapsOnIn(ctx: ServerCtx, cardId: string): Promise<void> {
  return ctx.data.taps.deleteTapsOn(cardId);
}

// --- who resonated -------------------------------------------------------------------------------------------------

/**
 * The author's own people: a page of `limit` taps that are on, newest first,
 * from `after` — minus the author and anyone with a block between them and
 * the author, either way (`blocked`: the author's blocks, read once by the
 * caller, B5). With `passage`, only the taps whose pick has that id (round 29).
 */
async function authorPeople(ctx: ServerCtx, card: Card, limit: number, after: PageCursor | undefined, blocked: ReadonlySet<string>, passage?: string) {
  const page = await ctx.data.taps.tapsOnPage(card.id, limit, after, passage);
  const tappers = page.tappers.filter((t) => t.uid !== card.authorId && !blocked.has(t.uid));
  const blockers = await ctx.data.taps.blockersOf(tappers.map((t) => t.uid), card.authorId);
  return { people: tappers.filter((t) => !blockers.has(t.uid)), next: page.next, full: page.full };
}

/**
 * Who of `tappers` a reader may see (Wave 2 #3b, the owner: 「像按讚一樣大家都可以看到誰按」): never the author
 * and never the reader (their own row is put first by the caller), never anyone with a block between them and the
 * reader either way — on every card, the reader's own blocks being the reader's to know — and on a named card never
 * anyone with a block between them and the author either way, as the author's own list reads. On an anonymous card
 * nothing here reads the author's blocks: what a reader sees there must not change with whom its author blocked
 * (safety.md, the tap), or a face missing from it would name the author.
 */
async function readerVisible(ctx: ServerCtx, viewerId: string, card: Card, tappers: Tapper[], blocks: ReaderBlocks): Promise<Tapper[]> {
  const taps = ctx.data.taps;
  const named = card.anonymous !== true;
  const viewerBlocks = await blocks.viewer;
  const first = tappers.filter((t) => t.uid !== card.authorId && t.uid !== viewerId && !viewerBlocks.has(t.uid));
  if (!first.length) return [];
  const authorBlocks = named ? await blocks.author() : null;
  const head = authorBlocks ? first.filter((t) => !authorBlocks.has(t.uid)) : first;
  if (!head.length) return [];
  const uids = head.map((t) => t.uid);
  const [blockViewer, blockAuthor] = await Promise.all([
    taps.blockersOf(uids, viewerId),
    named ? taps.blockersOf(uids, card.authorId) : Promise.resolve(new Set<string>()),
  ]);
  return head.filter((t) => !blockViewer.has(t.uid) && !blockAuthor.has(t.uid));
}

/** The blocks a reader's view turns on: theirs, and — read once, only when asked, on a named card — its author's. */
interface ReaderBlocks {
  viewer: Promise<ReadonlySet<string>>;
  author: () => Promise<ReadonlySet<string>>;
}

function readerBlocks(ctx: ServerCtx, viewerId: string, card: Card, viewerBlocks?: Promise<ReadonlySet<string>>): ReaderBlocks {
  let author: Promise<ReadonlySet<string>> | null = null;
  return {
    viewer: viewerBlocks ?? ctx.data.taps.blockedBy(viewerId),
    author: () => (author ??= ctx.data.taps.blockedBy(card.authorId)),
  };
}

/**
 * One page of the people a reader sees (`readerVisible`), newest first, from `after`; on the first page the reader
 * themselves first while their tap is on (with `passage`, while their pick is that one). With `passage`, only the
 * taps whose pick has that id (the author's `?passage=` alike, round 29).
 */
async function readerPage(
  ctx: ServerCtx,
  viewerId: string,
  card: Card,
  own: { on: boolean; passage: TapPick | null },
  blocks: ReaderBlocks,
  limit: number,
  after?: PageCursor,
  passage?: string,
): Promise<{ people: Tapper[]; next: PageCursor | null; full: boolean }> {
  const page = await ctx.data.taps.tapsOnPage(card.id, limit, after, passage);
  const people = await readerVisible(ctx, viewerId, card, page.tappers, blocks);
  const first = after == null;
  const mineHere = own.on && (!passage || own.passage?.id === passage);
  return {
    people: first && mineHere ? [{ uid: viewerId, at: Number.MAX_SAFE_INTEGER, passage: own.passage }, ...people] : people,
    next: page.next,
    full: page.full,
  };
}

/** Taps a reader's answer reads at most for its faces and picked sentences: one page, newest first. */
export const READER_SCAN = 30;

/**
 * What a reader sees of who resonated (Wave 2 #3b), from one page of the newest READER_SCAN taps that are on: the
 * faces — themselves first when their tap is on, then the others `readerVisible` lets through, newest first, with a
 * profile — and the picked sentences, each with its newest PICKED_CANDIDATES pickers let through the same way, the
 * reader's own pick laid first whatever its age (so it shows the moment they pick). Only the people the answer can
 * show are asked about blocks and profiles: the first few faces and each sentence's candidates.
 */
async function readerView(
  ctx: ServerCtx,
  viewerId: string,
  card: Card,
  own: { on: boolean; passage: TapPick | null },
  blocks: ReaderBlocks,
): Promise<{ faces: AuthorBody[]; more: boolean; picked: TapPickedBody[] }> {
  const taps = ctx.data.taps;
  const scan = await taps.tapsOnPage(card.id, READER_SCAN);
  const viewerBlocks = await blocks.viewer;
  const others = scan.tappers.filter((t) => t.uid !== viewerId && t.uid !== card.authorId && !viewerBlocks.has(t.uid));
  const faceHead = others.slice(0, TAP_FACES_MAX + 4);
  const story = typeof card.story === 'string' ? card.story : '';
  const mine: Tapper[] = own.on && own.passage ? [{ uid: viewerId, at: Number.MAX_SAFE_INTEGER, passage: own.passage }] : [];
  const sentences = story.trim() ? pickedIn(story, [...mine, ...others.filter((t) => t.passage)]) : [];
  const asked = [...new Map([...faceHead, ...sentences.flatMap((x) => x.pickers.slice(0, PICKED_CANDIDATES))].map((t) => [t.uid, t])).values()];
  const visible = await readerVisible(ctx, viewerId, card, asked, blocks);
  const allowed = new Set(visible.map((t) => t.uid));
  const found = await taps.profiles([...(own.on ? [viewerId] : []), ...allowed]);
  if (own.on) allowed.add(viewerId);
  const faceOf = (uid: string) => (allowed.has(uid) ? (found.get(uid) ?? null) : null);

  const known = [...(own.on ? [viewerId] : []), ...faceHead.map((t) => t.uid)].map(faceOf).filter((f): f is AuthorBody => f != null);
  const faces = known.slice(0, TAP_FACES_MAX);
  const more = known.length > TAP_FACES_MAX || others.length > faceHead.length || scan.full;

  const picked: TapPickedBody[] = [];
  for (const x of sentences) {
    const got = pickedFaces(x, faceOf, scan.full);
    if (got) picked.push({ id: x.id, text: x.text, people: got.people, more: got.more });
  }
  return { faces, more, picked };
}

/** On a named card: whether a block stands between reader and author, and whether POST /notes would take a note now. */
async function readerStanding(ctx: ServerCtx, viewerId: string, card: Card): Promise<{ blocked: boolean; mayNote: boolean }> {
  const s = await ctx.data.taps.readerStanding(viewerId, card.authorId);
  return { blocked: s.blocked, mayNote: s.connected || s.requestFrom === card.authorId || s.lettersLeft < NOTE_REQUEST_MAX };
}

/** Who may see a card's taps, and as whom: its author, a reader who may tap it, or no one (null). */
async function tapViewOf(ctx: ServerCtx, viewerId: string, card: Card): Promise<'author' | 'reader' | null> {
  if (!published(card)) return null;
  if (card.authorId === viewerId) return 'author';
  if (card.anonymous !== true && (await ctx.data.taps.blockedEitherWay(viewerId, card.authorId))) return null;
  return 'reader';
}

/** The first `n` people with a profile, in order, and whether more than `n` are left. */
async function firstFaces(ctx: ServerCtx, people: Tapper[], n: number): Promise<{ faces: AuthorBody[]; more: boolean }> {
  const head = people.slice(0, n + 4);
  const found = await ctx.data.taps.profiles(head.map((p) => p.uid));
  const known = head.filter((p) => found.has(p.uid));
  const faces = known.slice(0, n).map((p) => found.get(p.uid)!);
  // More than the faces: another known one in the head, or anyone past it.
  return { faces, more: known.length > n || people.length > head.length };
}

/**
 * The author's picked sentences (round 29 §P1): one page of the newest
 * PICKED_SCAN taps that are on (billed by what it finds), their picks that
 * are sentences of the story now (`pickedIn`), and for each its newest
 * PICKED_CANDIDATES pickers — the only people whose blocks and profiles are
 * read. The author's people as `authorPeople` reads them: never the author,
 * never anyone with a block between them either way, only people with a
 * profile. A sentence none of whose candidates qualifies is left out.
 */
async function authorPicked(ctx: ServerCtx, card: Card, blocked: ReadonlySet<string>): Promise<TapPickedBody[]> {
  const story = typeof card.story === 'string' ? card.story : '';
  if (!story.trim()) return [];
  const page = await ctx.data.taps.tapsOnPage(card.id, PICKED_SCAN);
  const tappers = page.tappers.filter((t) => t.passage && t.uid !== card.authorId && !blocked.has(t.uid));
  const sentences = pickedIn(story, tappers);
  if (!sentences.length) return [];
  const uids = [...new Set(sentences.flatMap((s) => s.pickers.slice(0, PICKED_CANDIDATES).map((p) => p.uid)))];
  const [blockers, found] = await Promise.all([ctx.data.taps.blockersOf(uids, card.authorId), ctx.data.taps.profiles(uids)]);
  const faceOf = (uid: string) => (blockers.has(uid) ? null : (found.get(uid) ?? null));
  const out: TapPickedBody[] = [];
  for (const s of sentences) {
    const faces = pickedFaces(s, faceOf, page.full);
    if (faces) out.push({ id: s.id, text: s.text, people: faces.people, more: faces.more });
  }
  return out;
}

/** See src/lib/api/v1/taps.ts `cardTap`. */
export async function cardTapIn(
  ctx: ServerCtx,
  viewerId: string,
  card: Card,
  opts: { pass: boolean; blocked?: Promise<ReadonlySet<string>> },
): Promise<CardTapBody | null> {
  if (opts.pass) return null;
  if (!published(card)) return null;
  if (card.authorId === viewerId) {
    // One more than the faces, past the blocks: enough to say whether there are others.
    const blocked = await (opts.blocked ?? ctx.data.taps.blockedBy(card.authorId));
    let people: Tapper[] = [];
    let after: PageCursor | undefined;
    for (let pages = 0; pages < 5 && people.length <= TAP_FACES_MAX; pages++) {
      const page = await authorPeople(ctx, card, 10, after, blocked);
      people = [...people, ...page.people];
      if (!page.full || !page.next) break;
      after = page.next;
    }
    const [{ faces, more }, picked] = await Promise.all([firstFaces(ctx, people, TAP_FACES_MAX), authorPicked(ctx, card, blocked)]);
    // Picked sentences (round 29): only where there is one to show, so every other answer is as it was.
    return { mine: false, faces, more, mayNote: false, ...(picked.length ? { picked } : {}) };
  }
  // A reader: on a named card, the blocks either way and whether a note would be taken in one read, beside their people.
  const named = card.anonymous !== true;
  const blocks = readerBlocks(ctx, viewerId, card, opts.blocked);
  const [standing, own] = await Promise.all([
    named ? readerStanding(ctx, viewerId, card) : { blocked: false, mayNote: true },
    ctx.data.taps.ownTap(card.id, viewerId),
  ]);
  if (standing.blocked) return null;
  const mayNote = standing.mayNote;
  const mine = own.on;
  const pick = own.passage;
  const { faces, more, picked } = await readerView(ctx, viewerId, card, own, blocks);
  // Picked sentences (Wave 2 #3b: every reader sees them, as the author does): only where there is one to show.
  const withPicked = picked.length ? { picked } : {};
  // The card's passages (round 27): the same for every reader, on the story alone; their own pick while it is one.
  // Both absent while the card offers none: a short card's answer is as it was before passages.
  const passages = presentTapPassages(card);
  if (!passages.length) return { mine, faces, more, mayNote, ...withPicked };
  const passage = pick && passages.some((p) => p.id === pick.id) ? pick.id : null;
  return { mine, faces, more, mayNote, passages, passage, ...withPicked };
}

/** The excerpt of the latest note each of `uids` left the author on the card; notes with no words left out. */
async function latestNotes(ctx: ServerCtx, cardId: string, author: string, uids: string[]): Promise<Map<string, string>> {
  const notes = await ctx.data.taps.latestNotesTo(cardId, author, uids);
  return new Map([...notes].map(([uid, text]) => [uid, noteExcerpt(text)] as [string, string]).filter(([, excerpt]) => excerpt.length > 0));
}

/** See src/lib/api/v1/taps.ts `listTaps`. */
export async function listTapsIn(ctx: ServerCtx, viewerId: string, cardId: string, pageToken?: string | null, passage?: string | null): Promise<TapListBody> {
  const taps = ctx.data.taps;
  const card = await taps.visibleCard(viewerId, cardId);
  const view = await tapViewOf(ctx, viewerId, card);
  if (!view) throw notFound();
  // A reader (Wave 2 #3b): pages of everyone they may see, each row with its pick, never a note; `passage` filters
  // to one picked sentence's people, as the author's.
  if (view === 'reader') {
    const blocks = readerBlocks(ctx, viewerId, card);
    const own = await taps.ownTap(card.id, viewerId);
    const page = await readerPage(ctx, viewerId, card, own, blocks, TAP_PAGE, pageToken || undefined, passage || undefined);
    const found = await taps.profiles(page.people.map((p) => p.uid));
    return {
      people: page.people
        .filter((p) => found.has(p.uid))
        .map((p) => ({ author: found.get(p.uid)!, note: null, ...(p.passage ? { passage: { text: p.passage.text } } : {}) })),
      nextPageToken: page.full ? page.next : null,
    };
  }
  const page = await authorPeople(ctx, card, TAP_PAGE, pageToken || undefined, await taps.blockedBy(card.authorId), passage || undefined);
  const uids = page.people.map((p) => p.uid);
  const [found, notes] = await Promise.all([
    taps.profiles(uids),
    card.anonymous === true ? new Map<string, string>() : latestNotes(ctx, card.id, card.authorId, uids),
  ]);
  const people: TapPersonBody[] = page.people
    .filter((p) => found.has(p.uid))
    .map((p) => ({
      author: found.get(p.uid)!,
      note: notes.has(p.uid) ? { excerpt: notes.get(p.uid)! } : null,
      // A pick only where there is one (absent reads as null).
      ...(p.passage ? { passage: { text: p.passage.text } } : {}),
    }));
  return { people, nextPageToken: page.full ? page.next : null };
}

// --- the passage a reader picked (round 27) --------------------------------------------------------------------------

/** See src/lib/api/v1/taps.ts `setTapPassage`. */
export async function setTapPassageIn(ctx: ServerCtx, uid: string, cardId: string, passage: string | null): Promise<TapPassageResponseBody> {
  const card = await ctx.data.taps.visibleCard(uid, cardId);
  if ((await tapViewOf(ctx, uid, card)) !== 'reader') throw notFound();
  return ctx.uow.run(
    async (tx) => {
      const [tap, fresh, linked] = await Promise.all([tx.taps.getTap(card.id, uid), tx.taps.getPassageCard(card.id), tx.taps.connected(uid, card.authorId)]);
      if (!tappable(fresh, uid) || fresh.authorId !== card.authorId || !cardVisible(fresh, uid, () => linked)) throw notFound();
      if (tap?.on !== true) throw new ApiFailure('conflict', 'Resonate with this card first.');
      if (passage === null) {
        tx.taps.setTapPassage(card.id, uid, null);
        return { passage: null };
      }
      const chosen = presentTapPassages(fresh).find((p) => p.id === passage);
      if (!chosen) throw new ApiFailure('invalid_request', 'Not a passage this card offers.');
      tx.taps.setTapPassage(card.id, uid, { id: chosen.id, text: chosen.text });
      return { passage: chosen.id };
    },
    { label: 'setTapPassage' },
  );
}

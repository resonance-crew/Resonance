import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb } from '@/../test/fakeAdminDb';

vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => { throw new Error('not in this suite'); } }));

import { PICK_HALF_LIFE_DAYS, PICK_RECENCY, fallbackModel, filmCards, recommendedIds, taipeiDayIndex, type Row } from './data';
import { toModel } from './tiles';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The end's list (the owner, round 4): the recommended stories as they come — one recommendation for every visitor
// who isn't signed in, decided here from the window the film already reads.

const BASE = 'https://img.resonance.channel';
const NOW = new Date('2026-11-10T04:00:00Z');
const DAY = taipeiDayIndex(NOW);
/** The Taipei day's last moment: ages are counted to it. */
const DAY_END = (DAY + 1) * 86_400_000 - 8 * 3_600_000;
const daysAgo = (n: number) => Timestamp.fromMillis(DAY_END - n * 86_400_000);
const STORY = `A walk by the sea at dawn, and what it taught me about being alone with myself. ${'More of the story follows here, line after line. '.repeat(4)}`;

/** A published public card as Firestore holds it (its list summary current). */
const doc = (author: string, score: number | null, age: number, over: Record<string, unknown> = {}) => {
  const at = daysAgo(age);
  return {
    authorId: author,
    thoughtCore: 'A walk by the sea',
    story: STORY,
    tags: ['sea'],
    visibility: 'public',
    publishedAt: at,
    updatedAt: at,
    excerptAt: at,
    excerpt: STORY.slice(0, 96),
    readMinutes: 2,
    anonymous: false,
    readCount: 7,
    ...(score == null ? {} : { signature: { coreInsight: 'SECRET-INSIGHT', placeholder: false } }),
    ...over,
  };
};
/** The cards' readings (server-only `cardSignatures`, round 26): the insight score and whether strangers may be shown it. */
const readingsOf = (docs: Record<string, Record<string, unknown>>, scores: Record<string, number | null>) =>
  Object.fromEntries(
    Object.keys(docs)
      .map((path) => path.split('/')[1])
      .filter((id) => scores[id] != null)
      .map((id) => [`cardSignatures/${id}`, { authorId: 'x', insightScore: scores[id], listedForStrangers: true, insights: [{ evidence: 'SECRET-EVIDENCE' }] }]),
  );
const profile = (handle: string) => ({ handle, initials: handle[0].toUpperCase(), avatarSeed: '7' });

const CARDS: Record<string, Record<string, unknown>> = {
  // the film's one lead (a cover on our storage, a high score): the film's A — and a pick like any other
  'cards/lead': doc('u1', 0.95, 2.5, { slug: 'lead-slug', media: { type: 'image', url: `${BASE}/covers/lead.webp` } }),
  // the best score of all, but two months old: a newer story a little under it stands before it
  'cards/old-great': doc('u2', 0.99, 60.5, { slug: 'old-great-slug' }),
  'cards/new-good': doc('u3', 0.9, 0.5, { slug: 'new-good-slug' }),
  // a second card by u3: one per named author while there are others
  'cards/u3-second': doc('u3', 0.89, 0.5),
  // anonymous cards: never counted with their author's (u-secret also wrote none of the named ones; u3's is beside
  // u3's named card), two at most while there are others
  'cards/anon-1': doc('u-secret', 0.97, 1.5, { anonymous: true, slug: 'slug-with-a-pen-name' }),
  'cards/anon-2': doc('u3', 0.8, 3, { anonymous: true }),
  'cards/anon-3': doc('u-secret', 0.78, 3, { anonymous: true }),
  'cards/u4-card': doc('u4', 0.6, 10),
  // a named card whose author has no profile: never shown (it would read as an anonymous one)
  'cards/ghost': doc('u-ghost', 0.5, 5),
  // not indexed yet: counts 0, only its newness
  'cards/unindexed': doc('u5', null, 0.5),
  // never for a list: thin, a placeholder, blank, in the trash, private
  'cards/thin': doc('u6', 0.99, 0.1, { thin: true }),
  'cards/placeholder': doc('u7', 0.99, 0.1, { signature: { insightScore: 0.99, placeholder: true } }),
  'cards/blank': doc('u8', 0.99, 0.1, { thoughtCore: '   ' }),
  'cards/binned': doc('u9', 0.99, 0.1, { trashedAt: daysAgo(0.05) }),
  'cards/private': doc('u10', 0.99, 0.1, { visibility: 'private' }),
};
const SCORES: Record<string, number | null> = {
  lead: 0.95, 'old-great': 0.99, 'new-good': 0.9, 'u3-second': 0.89, 'anon-1': 0.97, 'anon-2': 0.8, 'anon-3': 0.78, 'u4-card': 0.6, ghost: 0.5,
  unindexed: null, thin: 0.99, placeholder: 0.99, blank: 0.99, binned: 0.99, private: 0.99,
};
const READINGS = readingsOf(CARDS, SCORES);
const USERS = Object.fromEntries(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u-secret'].map((id) => [`users/${id}`, profile(`pen-${id}`)]));

const rowsOf = (docs: Record<string, Record<string, unknown>>, scores: Record<string, number | null> = SCORES): Row[] =>
  Object.entries(docs).map(([path, d]) => {
    const id = path.split('/')[1];
    return { id, d, reading: scores[id] == null ? undefined : { insightScore: scores[id], listed: true } };
  });

describe("the film's recommended stories (signed out: one list for everyone)", () => {
  it('ranks listed cards by insight with a light lift for new ones, one per named author, two anonymous at most', async () => {
    const fake = fakeAdminDb({ ...CARDS, ...READINGS, ...USERS });
    const f = await filmCards(ctxFor(fake.db).data, { storageBases: [BASE], now: NOW });
    expect(f).not.toBeNull();
    // value = insight + 0.15 × 0.5^(days ÷ 14): anon-1 1.109, lead 1.083, new-good 1.046, (u3-second 1.036: u3 has
    // one), old-great 0.998, anon-2 0.929, (anon-3 0.909: the third anonymous), u4-card 0.691, (ghost: no byline)
    expect(f!.picks.map((c) => c.id)).toEqual(['anon-1', 'lead', 'new-good', 'old-great', 'anon-2', 'u4-card']);
    // the film's own cards are picked as before, and its lead is in the list like any card
    expect([f!.written.id, f!.answer, f!.relation]).toEqual(['lead', null, 'alone']);

    // what the page may hold of them: an anonymous card names no author — never its uid, never a slug — and no card
    // carries what ranked it
    const anon = f!.picks[0];
    expect([anon.authorId, anon.anonymous]).toEqual(['', true]);
    expect(fake.reads).not.toContain('users/u-secret');
    for (const c of f!.picks) {
      expect(c).not.toHaveProperty('signature');
      expect(c).not.toHaveProperty('thin');
    }
    const model = toModel({ written: f!.written, answer: f!.answer, relation: f!.relation, sky: f!.sky, picks: f!.picks, authors: f!.authors });
    expect(model.picks.map((t) => [t.href, t.author?.name])).toEqual([
      ['/card/anon-1', undefined],
      ['/card/lead-slug', 'pen-u1'],
      ['/card/new-good-slug', 'pen-u3'],
      ['/card/old-great-slug', 'pen-u2'],
      ['/card/anon-2', undefined],
      ['/card/u4-card', 'pen-u4'],
    ]);
    const json = JSON.stringify(model);
    for (const word of ['insightScore', 'signature', 'SECRET-INSIGHT', 'SECRET-EVIDENCE', 'listedForStrangers', 'readCount', 'u-secret', 'slug-with-a-pen-name', '0.97']) expect(json).not.toContain(word);
  });

  it('costs no query of its own: the window the film reads, the leads\' card read and byline read', async () => {
    const fake = fakeAdminDb({ ...CARDS, ...READINGS, ...USERS });
    await filmCards(ctxFor(fake.db).data, { storageBases: [BASE], now: NOW });
    const queries = fake.reads.filter((r) => r.startsWith('cards?'));
    // the window and latestForLanding's (the sky): as before the picks
    expect(queries).toHaveLength(2);
    // each candidate's card once, and none of the cards a list never shows
    const cardReads = fake.reads.filter((r) => r.startsWith('cards/'));
    expect(new Set(cardReads).size).toBe(cardReads.length);
    expect(cardReads.length).toBeLessThanOrEqual(10);
    for (const id of ['thin', 'placeholder', 'blank', 'binned', 'private']) expect(cardReads).not.toContain(`cards/${id}`);
  });

  it('is the same list all through a Taipei day, and lets a second card per author in only to fill it', () => {
    const rows = rowsOf(CARDS).filter((r) => r.d.visibility === 'public');
    const order = recommendedIds(rows, DAY);
    expect(order).toEqual(['anon-1', 'lead', 'new-good', 'old-great', 'anon-2', 'u4-card', 'ghost', 'unindexed', 'u3-second', 'anon-3']);
    // the rows in any order, at any hour of the day: the same answer
    expect(recommendedIds([...rows].reverse(), taipeiDayIndex(new Date('2026-11-10T15:59:00Z')))).toEqual(order);
    expect(taipeiDayIndex(new Date('2026-11-09T16:00:00Z'))).toBe(DAY);
    // the formula itself: a card's value is its score plus the lift, halved every two weeks
    expect(PICK_RECENCY * 0.5 ** (14 / PICK_HALF_LIFE_DAYS)).toBeCloseTo(0.075);
    // three cards by one author and nothing else: two of them, best first — never a third
    const one = rowsOf({ 'cards/a': doc('u1', 0.5, 1), 'cards/b': doc('u1', 0.9, 1), 'cards/c': doc('u1', 0.7, 1) }, { a: 0.5, b: 0.9, c: 0.7 });
    expect(recommendedIds(one, DAY)).toEqual(['b', 'c']);
    // equal in every way: the newer first, then by id
    const tie = rowsOf({ 'cards/y': doc('u1', 0.5, 1), 'cards/x': doc('u2', 0.5, 1), 'cards/z': doc('u3', 0.5, 1) }, { x: 0.5, y: 0.5, z: 0.5 });
    expect(recommendedIds(tie, DAY)).toEqual(['x', 'y', 'z']);
  });

  it('falls back to the landing grid\'s newest six', async () => {
    const fake = fakeAdminDb({ ...CARDS, ...READINGS, ...USERS });
    const model = await fallbackModel(ctxFor(fake.db).data);
    // newest first (no rule but the landing grid's): the unlisted, the blank and the binned left out, and a named
    // card without a profile
    expect(model.picks.map((t) => t.id)).toEqual(['new-good', 'u3-second', 'unindexed', 'anon-1', 'lead', 'anon-2']);
    expect(model.picks.find((t) => t.id === 'anon-1')).toMatchObject({ href: '/card/anon-1' });
    expect(model.picks.find((t) => t.id === 'anon-1')?.author).toBeUndefined();
    expect(JSON.stringify(model)).not.toMatch(/insightScore|signature|u-secret/);
  });
});

// Round 26 §A4: the film's score and its strangers' switch are the reading's (server-only `cardSignatures`), and a
// card's vectors are its parts (`cardVectors/{id}__{channel}__{i}`): the film still finds a lead and a kin pair.
describe("the film's leads and kin on round 26's readings", () => {
  const cover = (id: string) => ({ media: { type: 'image', url: `${BASE}/covers/${id}.webp` } });
  const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const vec = (v: number[]) => ({ vector: { toArray: () => unit(v) } });
  const film = {
    'cards/sea': doc('u1', 0.9, 1, cover('sea')),
    'cards/shore': doc('u2', 0.85, 2, cover('shore')),
    'cards/hills': doc('u3', 0.82, 3, cover('hills')),
    'cards/moody': doc('u4', 0.99, 0.5, cover('moody')),
  };
  const readings = {
    ...readingsOf(film, { sea: 0.9, shore: 0.85, hills: 0.82, moody: 0.99 }),
    // Feeling only: read, and not for strangers — never a lead, never a pick.
    'cardSignatures/moody': { authorId: 'u4', insightScore: 0.99, listedForStrangers: false },
  };
  const vectors = {
    // sea's second insight part and shore's first are nearly one (kin by the best pair); hills is elsewhere.
    'cardVectors/sea__insight__0': vec([0, 0, 1, 0]),
    'cardVectors/sea__insight__1': vec([1, 0.05, 0, 0]),
    'cardVectors/shore__insight__0': vec([1, 0.1, 0, 0]),
    'cardVectors/hills__insight__0': vec([0, 1, 0, 0]),
    'cardVectors/moody__insight__0': vec([1, 0.06, 0, 0]),
    'cardVectors/sea__situation__0': vec([0, 0, 0, 1]),
    'cardVectors/shore__situation__0': vec([0, 0.1, 0, 1]),
  };

  it('pairs the two whose nearest parts are close, by the reading’s score, and leaves a card not for strangers out', async () => {
    const fake = fakeAdminDb({ ...film, ...readings, ...vectors, ...USERS });
    const f = await filmCards(ctxFor(fake.db).data, { storageBases: [BASE], now: NOW });
    expect([f!.written.id, f!.answer?.id, f!.relation]).toEqual(['sea', 'shore', 'kin']);
    expect(f!.picks.map((c) => c.id)).not.toContain('moody');
    // The parts are read by id; never a vector search, never the window's popularity.
    expect(fake.reads.some((r) => r.startsWith('cardVectors?'))).toBe(false);
    expect(fake.reads).toContain('cardVectors/sea__insight__1');
  });

  it('plays the best card alone when no two are close enough, and has no lead when no card is read yet', async () => {
    const apart = { ...vectors, 'cardVectors/shore__insight__0': vec([0, 0, 0, 1]), 'cardVectors/sea__insight__1': vec([0, 0, 1, 0.2]) };
    const alone = await filmCards(ctxFor(fakeAdminDb({ ...film, ...readings, ...apart, ...USERS }).db).data, { storageBases: [BASE], now: NOW });
    expect(alone!.relation).toBe('alone');
    expect(alone!.answer).toBeNull();
    expect(await filmCards(ctxFor(fakeAdminDb({ ...film, ...USERS }).db).data, { storageBases: [BASE], now: NOW })).toBeNull();
  });
});

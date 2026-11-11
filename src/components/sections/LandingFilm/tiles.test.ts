import { describe, expect, it } from 'vitest';
import type { Card, User } from '@/lib/db/types';
import { toModel } from './tiles';

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  authorId: `u-${id}`,
  slug: `walk-by-the-sea-${id}`,
  thoughtCore: `Title ${id}`,
  story: `A walk by the sea at dawn, and what it taught me about being alone with myself. ${'More of the story follows here, line after line. '.repeat(6)}THE-STORY-ENDS-HERE`,
  tags: [],
  media: { type: 'image', url: `https://img.resonance.channel/covers/${id}.webp` },
  originalLocale: 'zh-TW',
  translations: {},
  visibility: 'public',
  publishedAt: new Date(0),
  readCount: 42,
  resonanceCount: 0,
  inviteCount: 0,
  accentHue: 40,
  signature: { insightScore: 0.96, coreInsight: 'hidden', placeholder: false } as unknown as Card['signature'],
  ...over,
});
const user = (id: string): User => ({ id, handle: `pen-${id}`, initials: 'P', region: '', primaryLocale: 'zh-TW', autoTranslateTo: [], phoneHash: '', joinedAt: new Date(0), handleChangedAt: new Date(0) }) as unknown as User;

const authors = { 'u-a': user('u-a'), 'u-b': user('u-b'), 'u-s1': user('u-s1') };

describe('the film model (what the page may hold of a card)', () => {
  it('carries no story, slug field, read count or signature', () => {
    const m = toModel({ written: card('a'), answer: card('b'), relation: 'kin', sky: [card('s1'), card('s2', { anonymous: true, authorId: '' })], authors });
    const json = JSON.stringify(m);
    for (const word of ['readCount', 'insightScore', 'coreInsight', 'signature', '"story"', 'slug', 'THE-STORY-ENDS-HERE']) {
      expect(json).not.toContain(word);
    }
    expect(m.a?.excerpt).toContain('A walk by the sea');
  });

  it('links an anonymous card by its id, never its slug, and names no author for it', () => {
    const m = toModel({ written: card('a'), answer: null, relation: 'alone', sky: [card('s2', { anonymous: true, authorId: '' })], authors });
    const anon = m.sky.find((t) => t.id === 's2')!;
    expect(anon.href).toBe('/card/s2');
    expect(anon.author).toBeUndefined();
    expect(m.a?.href).toBe('/card/walk-by-the-sea-a');
    expect(m.a?.author?.name).toBe('pen-u-a');
  });

  // the owner (round 3): the nearest real card is the film's answer card, B — a real resonance, when there is one, still
  // wins (data.ts tier 1); either way B is shown with A, never again among tonight's stories
  it('shows the nearest story as B, as a real resonance is shown, and keeps it out of the sky', () => {
    const kin = toModel({ written: card('a'), answer: card('b'), relation: 'kin', sky: [card('s1'), card('b')], authors });
    expect(kin.relation).toBe('kin');
    expect(kin.b?.id).toBe('b');
    expect(kin.sky.map((t) => t.id)).toEqual(['s1']);
    const real = toModel({ written: card('a'), answer: card('b'), relation: 'resonance', sky: [card('s1')], authors });
    expect(real.relation).toBe('resonance');
    expect(real.b?.id).toBe('b');
    expect(real.sky.map((t) => t.id)).toEqual(['s1']);
    const alone = toModel({ written: card('a'), answer: null, relation: 'kin', sky: [], authors });
    expect(alone.relation).toBe('alone');
    expect(alone.b).toBeNull();
  });

  it('carries the tags the card shows, and the byline\'s wobble — an anonymous card\'s from its id, never its author', () => {
    const m = toModel({ written: card('a', { tags: ['sea', 'dawn'] }), answer: null, relation: 'alone', sky: [card('s2', { anonymous: true, authorId: '' })], authors: { 'u-a': { ...user('u-a'), avatarSeed: '42' } as User } });
    expect(m.a?.tags).toEqual(['sea', 'dawn']);
    expect(m.a?.author?.seed).toBe('42');
    const anon = m.sky[0];
    expect(anon.author).toBeUndefined();
    expect(anon.anonSeed).toBe(String('s'.charCodeAt(0) * 31));
  });

  // the owner (round 4): the end's list is the recommended stories as they come — a list of its own, in its order,
  // whatever the film's leads and the night sky hold
  it('carries the end\'s picks in their order, six at most, apart from the leads and the sky', () => {
    const picks = [card('p1'), card('a'), card('p3', { anonymous: true, authorId: '' }), card('b'), ...Array.from({ length: 5 }, (_, i) => card(`q${i}`))];
    const m = toModel({ written: card('a'), answer: card('b'), relation: 'kin', sky: [card('s1'), card('p1')], picks, authors: { ...authors, 'u-p1': user('u-p1') } });
    expect(m.picks.map((t) => t.id)).toEqual(['p1', 'a', 'p3', 'b', 'q0', 'q1']);
    // the leads and the sky are what they were
    expect([m.a?.id, m.b?.id, m.sky.map((t) => t.id)]).toEqual(['a', 'b', ['s1', 'p1']]);
    // an anonymous pick is authorless and linked by its id; a named one by its slug, under its pen name
    const anon = m.picks[2];
    expect([anon.href, anon.author, anon.anonSeed]).toEqual(['/card/p3', undefined, String('p'.charCodeAt(0) * 31)]);
    expect([m.picks[0].href, m.picks[0].author?.name]).toEqual(['/card/walk-by-the-sea-p1', 'pen-u-p1']);
    // coloured as a list of its own: no card wears the family of the three before it
    const fams = m.picks.map((t) => t.family);
    fams.forEach((f, i) => expect(fams.slice(Math.max(0, i - 3), i)).not.toContain(f));
    // and nothing of what ranked them
    const json = JSON.stringify(m.picks);
    for (const word of ['readCount', 'insightScore', 'coreInsight', 'signature', '"story"', 'slug', 'THE-STORY-ENDS-HERE', 'u-p3']) expect(json).not.toContain(word);
    // no picks given (an older caller): an empty list, never the sky
    expect(toModel({ written: card('a'), answer: null, relation: 'alone', sky: [card('s1')], authors }).picks).toEqual([]);
  });

  // round 3's review: only what the page shows goes into its payload (the night's three)
  it('keeps the sky to five, and gives neighbours different colour families', () => {
    const sky = Array.from({ length: 16 }, (_, i) => card(`s${i}`));
    const m = toModel({ written: card('a'), answer: card('b'), relation: 'kin', sky, authors });
    expect(m.sky).toHaveLength(5);
    const fams = [m.a!, ...m.sky].map((t) => t.family);
    for (let i = 1; i < fams.length; i++) expect(fams[i]).not.toBe(fams[i - 1]);
  });
});

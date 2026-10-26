import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';

let fake: FakeAdminDb;
const suggest = vi.fn(async () => ['alpha', 'beta']);
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: 'writer' }) }));
vi.mock('@/lib/api/rateLimit', () => ({ limited: async () => null }));
vi.mock('@/lib/ai/tasks', () => ({ suggestStoryTags: (input: unknown) => suggest(input as never) }));

import { POST, cardSizedTags } from './route';

const post = (body: unknown) => POST(new Request('http://localhost/api/cards/tags', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  fake = fakeAdminDb({ 'cards/c1': { authorId: 'writer', tags: ['rain'] } });
  suggest.mockClear();
});

// One unit of the tags budget buys one card-sized prompt: a request's tags,
// title and story are held to what a card may carry before they reach the model.
describe('POST /api/cards/tags', () => {
  it('sends the model no more tags than a card may hold, however many are asked about', async () => {
    const res = await post({ thoughtCore: 'A walk', story: 'x', tags: Array.from({ length: 2000 }, (_, i) => `t${i}`.padEnd(500, 'x')) });
    expect(res.status).toBe(200);
    const input = suggest.mock.calls[0][0] as unknown as { existingTags: string[]; title: string; story: string };
    expect(input.existingTags.length).toBeLessThanOrEqual(30);
    expect(input.existingTags.join(' ').length).toBeLessThanOrEqual(1000);
  });

  it('cuts the title and story too', async () => {
    await post({ thoughtCore: 'T'.repeat(5000), story: 'S'.repeat(1_000_000), tags: [] });
    const input = suggest.mock.calls[0][0] as unknown as { title: string; story: string };
    expect(input.title.length).toBe(200);
    expect(input.story.length).toBeLessThanOrEqual(4000);
  });
});

describe('cardSizedTags', () => {
  it('keeps a card-sized list as it is and drops what is not a tag', () => {
    expect(cardSizedTags(['rain', 'walk', 3, '', ' '])).toEqual(['rain', 'walk']);
    expect(cardSizedTags('rain')).toEqual([]);
    expect(cardSizedTags(Array.from({ length: 40 }, (_, i) => `t${i}`))).toHaveLength(30);
  });
});

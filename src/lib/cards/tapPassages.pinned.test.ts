import { describe, expect, it } from 'vitest';
import { offlinePassages } from './tapPassages';
import { RICH_STORY, RICH_STORY_PASSAGES, RICH_STORY_TITLE } from '../../../scripts/seed/pinned';

// The seed writes rich-story's passages out (scripts/seed/pinned.ts) instead of picking them on every seed, so the
// release screenshots never move with the pick. This says when the two part: a change to the pick that changes
// them updates the pinned words in the same change, on purpose, and names the screens in its `Visual:` trailer.
describe('the seed’s pinned tap passages', () => {
  it('are what the offline pick makes of rich-story today', () => {
    expect(offlinePassages(RICH_STORY, { title: RICH_STORY_TITLE })).toEqual(RICH_STORY_PASSAGES);
  });

  it('are whole stored passages: an id and the words, nothing else', () => {
    for (const p of RICH_STORY_PASSAGES) expect(Object.keys(p).sort()).toEqual(['id', 'text']);
  });
});

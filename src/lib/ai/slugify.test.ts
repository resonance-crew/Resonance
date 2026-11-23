import { describe, it, expect } from 'vitest';
import { ensureUniqueSlug, slugify } from './slugify';

describe('slugify', () => {
  it('lowercases, hyphenates, and trims to ASCII words', () => {
    expect(slugify('A Quiet Reconciliation')).toBe('a-quiet-reconciliation');
  });

  it('collapses punctuation and runs of separators', () => {
    expect(slugify('  Being  seen --- matters! ')).toBe('being-seen-matters');
  });

  it('strips diacritics rather than dropping the letter', () => {
    expect(slugify('Café au lait')).toBe('cafe-au-lait');
  });

  it('caps the number of words and overall length', () => {
    const slug = slugify('one two three four five six seven eight nine ten');
    expect(slug.split('-')).toHaveLength(8);
  });

  it('returns empty string when nothing survives normalization', () => {
    expect(slugify('—— 中文標題 ——')).toBe('');
  });
});

describe('ensureUniqueSlug', () => {
  const taken = (set: Set<string>) => async (s: string) => set.has(s);

  it('returns the base when it is free', async () => {
    const out = await ensureUniqueSlug('quiet-night', 'mia', taken(new Set()));
    expect(out).toBe('quiet-night');
  });

  it('falls back to base + handle on collision', async () => {
    const out = await ensureUniqueSlug('quiet-night', 'Mia Chen', taken(new Set(['quiet-night'])));
    expect(out).toBe('quiet-night-mia-chen');
  });

  it('appends a number when base + handle also collides', async () => {
    const out = await ensureUniqueSlug(
      'quiet-night',
      'mia',
      taken(new Set(['quiet-night', 'quiet-night-mia'])),
    );
    expect(out).toBe('quiet-night-mia-2');
  });

  it('keeps incrementing until a free slug is found', async () => {
    const out = await ensureUniqueSlug(
      'quiet-night',
      'mia',
      taken(new Set(['quiet-night', 'quiet-night-mia', 'quiet-night-mia-2', 'quiet-night-mia-3'])),
    );
    expect(out).toBe('quiet-night-mia-4');
  });

  it('substitutes a default when the base is empty', async () => {
    const out = await ensureUniqueSlug('', 'mia', taken(new Set()));
    expect(out).toBe('story');
  });

  // Round 32 §P6: a common title (5 cards already holding its slug) cost one round trip per card that held it.
  describe('round trips', () => {
    /** isTaken over `set`, counting the round trips: calls made while another is in flight share one. */
    function counted(set: Set<string>) {
      let inFlight = 0;
      const trips = { count: 0 };
      const isTaken = async (s: string) => {
        if (inFlight++ === 0) trips.count += 1;
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return set.has(s);
      };
      return { isTaken, trips };
    }

    it('asks the base alone, never waiting for the pen name, when it is free', async () => {
      const { isTaken, trips } = counted(new Set());
      const handle = new Promise<string>(() => {}); // never arrives: not needed
      expect(await ensureUniqueSlug('quiet-night', handle, isTaken)).toBe('quiet-night');
      expect(trips.count).toBe(1);
    });

    it('finds a slug past five taken ones in two round trips, the same one as asking one at a time', async () => {
      const set = new Set(['quiet-night', 'quiet-night-mia', 'quiet-night-mia-2', 'quiet-night-mia-3', 'quiet-night-mia-4', 'quiet-night-mia-5']);
      const { isTaken, trips } = counted(set);
      expect(await ensureUniqueSlug('quiet-night', Promise.resolve('mia'), isTaken)).toBe('quiet-night-mia-6');
      expect(trips.count).toBe(2);
    });

    it('keeps the order: the first free candidate wins, though a later one answered first', async () => {
      const set = new Set(['quiet-night', 'quiet-night-mia']);
      // The numbered ones answer before the handle's: -2 is picked only when -mia is taken.
      const isTaken = async (s: string) => {
        await new Promise((r) => setTimeout(r, s.endsWith('-mia') ? 5 : 1));
        return set.has(s);
      };
      expect(await ensureUniqueSlug('quiet-night', 'mia', isTaken)).toBe('quiet-night-mia-2');
      set.delete('quiet-night-mia');
      expect(await ensureUniqueSlug('quiet-night', 'mia', isTaken)).toBe('quiet-night-mia');
    });

    it('goes on past the first batch, and without a handle starts at the base\'s -2', async () => {
      const set = new Set(['story', ...Array.from({ length: 12 }, (_, i) => `story-${i + 2}`)]);
      const { isTaken, trips } = counted(set);
      expect(await ensureUniqueSlug('', '', isTaken)).toBe('story-14');
      expect(trips.count).toBe(3);
    });
  });
});


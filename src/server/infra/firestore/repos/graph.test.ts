import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { resonanceCardOf } from './graph';

// The cards aggregate composes graph's reach (restoring a resonance from the trash, an edit making it public)
// with its own CardRow, whose times are Dates; a stored card holds Timestamps. Both must read as published —
// read as unpublished, a restored resonance never got its reason back nor rang its original's author.
describe('resonanceCardOf', () => {
  const base = { authorId: 'alice', referenceCardId: 'orig', visibility: 'public', anonymous: false };

  it('reads a stored card’s Timestamp', () => {
    const at = new Date('2026-11-20T03:04:05.123Z');
    expect(resonanceCardOf({ ...base, publishedAt: Timestamp.fromDate(at) }).publishedAt).toEqual(at);
  });

  it('reads a card row’s Date the same way', () => {
    const at = new Date('2026-11-20T03:04:05.123Z');
    expect(resonanceCardOf({ ...base, publishedAt: at }).publishedAt).toEqual(at);
  });

  it('an unpublished draft has none', () => {
    expect(resonanceCardOf({ ...base, publishedAt: null }).publishedAt).toBeNull();
    expect(resonanceCardOf(base).publishedAt).toBeNull();
  });
});

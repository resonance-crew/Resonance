import { describe, expect, it } from 'vitest';
import { onePerToken } from './devices';

describe('onePerToken', () => {
  it('keeps each token once — its most recently registered record — in the records’ own order', () => {
    const rows = [
      { id: 'a', token: 't1', updatedAtMs: 1 },
      { id: 'b', token: 't2', updatedAtMs: 5 },
      { id: 'c', token: 't1', updatedAtMs: 9 },
      { id: 'd', token: 't1', updatedAtMs: 9 },
    ];
    expect(onePerToken(rows).map((r) => r.id)).toEqual(['b', 'c']);
    expect(onePerToken([])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { visualTapAsked } from './visualTap';

// Round 27 §V2: the screenshots' hold of the passages' dialog answers only in an emulator build, never in production.
describe('visualTapAsked', () => {
  it('reads passages or picked in an emulator build, nothing else and nothing in a real one', () => {
    expect(visualTapAsked('?visualTap=passages', true)).toBe('passages');
    expect(visualTapAsked('?visualTap=picked', true)).toBe('picked');
    expect(visualTapAsked('?visualTap=other', true)).toBeNull();
    expect(visualTapAsked('', true)).toBeNull();
    expect(visualTapAsked('?visualTap=passages', false)).toBeNull();
  });
});

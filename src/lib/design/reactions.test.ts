import { describe, expect, it } from 'vitest';
import { REACTION_GLYPHS, REACTION_IDS, isReactionId, placedPath } from './reactions';

describe('the reactions', () => {
  it('are the five the server stores, heart and moved among them', () => {
    expect(REACTION_IDS).toEqual(['heart', 'moved', 'laugh', 'hug', 'thumbs']);
    expect(isReactionId('moved')).toBe(true);
    expect(isReactionId('angry')).toBe(false);
    expect(isReactionId(null)).toBe(false);
  });

  // The apps draw only absolute M/L/C/Z (scripts/apps/reactions.ts parses them the icons' way).
  it('draw every layer with absolute M/L/C/Z paths inside the 24 box', () => {
    for (const id of REACTION_IDS) {
      for (const layer of REACTION_GLYPHS[id]) {
        expect(layer.d).toMatch(/^M[\d., CLMZ-]+$/);
        expect(layer.fill ?? layer.stroke).toBeDefined();
        const nums = placedPath(layer).match(/-?\d*\.?\d+/g)!.map(Number);
        for (const n of nums) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it('bakes a fill’s offset into its points for the apps', () => {
    expect(placedPath({ d: 'M1,2 C3,4 5,6 7,8 Z', fill: 'face', offset: [-0.5, 0.25] })).toBe('M0.5,2.25 C2.5,4.25 4.5,6.25 6.5,8.25 Z');
    expect(placedPath({ d: 'M1,2 L3,4', stroke: 'ink' })).toBe('M1,2 L3,4');
  });
});

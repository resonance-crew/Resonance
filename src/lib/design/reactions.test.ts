import { describe, expect, it } from 'vitest';
import { REACTION_COLOURS, REACTION_GLYPHS, REACTION_IDS, isReactionId, placedPath } from './reactions';

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

  // Round 17 §3: 抱抱 is 🫂, two people holding each other with no face; 大笑 is 😆, the grin with no tears.
  it('draw hug as two people, not a face, and laugh as a grin without tears', () => {
    const fills = (id: (typeof REACTION_IDS)[number]) => new Set(REACTION_GLYPHS[id].map((l) => l.fill).filter(Boolean));
    expect(fills('hug')).toEqual(new Set(['face', 'navy']));
    expect(fills('laugh')).toContain('face');
    expect(fills('laugh')).not.toContain('tear');
  });

  // Round 17 review: two blues side by side read as 👥 at the chip's 18. The two people are told apart by
  // colour — a warm and a cool, a light and a deep — and each has a back, a head and an arm across the other.
  it('draw hug’s two people in clearly different colours, each with a back, a head and an arm', () => {
    const oklch = (c: string) => c.match(/oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/)!.slice(1).map(Number);
    const [front, other] = [oklch(REACTION_COLOURS.face), oklch(REACTION_COLOURS.navy)];
    expect(Math.abs(front[0] - other[0])).toBeGreaterThanOrEqual(25);
    const hueApart = Math.abs(front[2] - other[2]) % 360;
    expect(Math.min(hueApart, 360 - hueApart)).toBeGreaterThanOrEqual(120);
    for (const colour of ['face', 'navy'] as const) {
      const shapes = REACTION_GLYPHS.hug.filter((l) => l.fill === colour);
      expect(shapes.filter((l) => l.stroke === 'outline')).toHaveLength(2); // a back and a head, rimmed
      expect(shapes.filter((l) => !l.stroke)).toHaveLength(1); // an arm, rimmed only where it lies on the other
    }
  });

  it('bakes a fill’s offset into its points for the apps', () => {
    expect(placedPath({ d: 'M1,2 C3,4 5,6 7,8 Z', fill: 'face', offset: [-0.5, 0.25] })).toBe('M0.5,2.25 C2.5,4.25 4.5,6.25 6.5,8.25 Z');
    expect(placedPath({ d: 'M1,2 L3,4', stroke: 'ink' })).toBe('M1,2 L3,4');
  });
});

import { describe, expect, it } from 'vitest';
import { MASCOT_CAST } from '../cast.generated';
import { PAL_SLUGS, PHOTO_ORDER, stillOf } from './still';

const stills = Object.fromEntries(MASCOT_CAST.map((c) => [c.slug, stillOf(c)]));

describe('Paper Pal stills', () => {
  it('has every one of the cast, in the profiles and in the photo', () => {
    expect([...PAL_SLUGS].sort()).toEqual(MASCOT_CAST.map((c) => c.slug).sort());
    expect([...PHOTO_ORDER].sort()).toEqual([...PAL_SLUGS].sort());
  });

  it('stands them at the heights the stage gives them: 牽牽 tallest, 點點 smallest, 摺摺 a unit', () => {
    const body = (s: string) => stills[s].h * (1 - stills[s].below);
    expect(body('tag')).toBeGreaterThan(body('tuck'));
    expect(body('dot')).toBeLessThan(body('card'));
    // 摺摺 is the unit: its body from the ground to the top of its hair, a little over 420 rig units
    expect(body('tuck')).toBeGreaterThan(1);
    expect(body('tuck')).toBeLessThan(1.15);
  });

  it('lays every part inside its frame, the ground line just above its foot', () => {
    for (const s of Object.values(stills)) {
      expect(s.below).toBeGreaterThan(0);
      expect(s.below).toBeLessThan(0.1);
      for (const p of s.parts) {
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.top).toBeGreaterThanOrEqual(0);
        expect(p.left + p.width).toBeLessThanOrEqual(100.01);
        expect(p.top + p.height).toBeLessThanOrEqual(100.01);
        expect(p.src).toMatch(new RegExp(`^/mascots/${s.slug}/[\\w-]+\\.webp\\?v=`));
      }
    }
  });

  it('paints in the rig\'s order and keeps the legs and shadow on the ground, the rest in the body', () => {
    const tuck = stills.tuck;
    expect(tuck.parts.filter((p) => p.layer === 'root').map((p) => p.name)).toEqual(['shadow', 'leg-l', 'leg-r']);
    expect(tuck.parts.findIndex((p) => p.name === 'torso')).toBeLessThan(tuck.parts.findIndex((p) => p.name === 'eye-l'));
    expect(tuck.parts.find((p) => p.name === 'eye-l-shut')?.variantOf).toBe('eye-l');
    expect(stills.night.parts.find((p) => p.name === 'stars-glow')?.only).toBe('dark');
  });

  it('raises each arm up and out on its own side to wave, about its brad', () => {
    for (const s of Object.values(stills)) {
      const l = s.parts.find((p) => p.name === 'arm-l')!.arm!;
      const r = s.parts.find((p) => p.name === 'arm-r')!.arm!;
      // clockwise (screen) for the left arm, counter-clockwise for the right: through the side, never across the face
      expect(l.lift).toBeGreaterThan(90);
      expect(r.lift).toBeLessThan(-90);
      // the pivot is the brad, near the strip's inner end
      expect(l.origin[0]).toBeGreaterThan(50);
      expect(r.origin[0]).toBeLessThan(50);
    }
  });
});

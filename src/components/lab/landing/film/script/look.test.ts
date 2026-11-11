import { describe, expect, it } from 'vitest';
import { LOOKS } from './look';
import { cutSamples, placeArt, type PlaceId } from './world';

const PLACES: PlaceId[] = ['home', 'journey', 'valley', 'valleyT'];
const classes = (place: PlaceId, look: 'waves' | 'peaks') =>
  placeArt(place, look)
    .planes.flatMap((pl) => pl.parts.map((part) => part.cls))
    .join(' ');

describe("the film's far land: waves (and the lab's peaks)", () => {
  it('is the waves unless the lab asks for the peaks', () => {
    expect(LOOKS).toEqual(['waves', 'peaks']);
    for (const place of PLACES) expect(placeArt(place)).toBe(placeArt(place, 'waves'));
  });

  it('cuts the far land as four waves, each with its line, and none of the borrowed props', () => {
    for (const place of PLACES) expect(classes(place, 'waves'), place).not.toMatch(/ff-fold|ff-lonetree|ff-lamp/);
    for (const place of ['home', 'journey'] as const) {
      const far = placeArt(place).planes.filter((pl) => pl.id === 'range' || pl.id === 'peaks');
      const parts = far.flatMap((pl) => pl.parts);
      expect(parts.filter((part) => part.cls.includes('fs-swell-line'))).toHaveLength(4);
      expect(parts.filter((part) => /^ff-/.test(part.cls)).map((part) => part.cls)).toEqual(['ff-range', 'ff-swell-b', 'ff-peaks', 'ff-swell-d']);
      // a wave line is an open path over its strip: never closed, never straight
      for (const part of parts.filter((p) => p.cls.includes('fs-swell-line'))) {
        expect(part.d.endsWith('Z')).toBe(false);
        const ys = [...part.d.matchAll(/[ML](-?\d+),(-?\d+)/g)].map((m) => Number(m[2]));
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
      }
    }
    // the valley's far land is home's own (no lit side to redraw)
    expect(placeArt('valley').planes.find((pl) => pl.id === 'peaks')?.src).toBe('home');
  });

  it("keeps the lab's comparison as rounds 1–5 left it: folded peaks, the lone tree, the lighthouse", () => {
    const peaks = classes('home', 'peaks');
    expect(peaks).toContain('ff-fold-lit');
    expect(peaks).toContain('ff-lonetree');
    expect(peaks).toContain('ff-lamp');
    expect(peaks).not.toContain('swell');
  });

  it('stands on the same ground either way: each plane’s place and its cut-out foot', () => {
    for (const place of PLACES) {
      const a = placeArt(place, 'peaks');
      const b = placeArt(place, 'waves');
      expect(b.planes.map((pl) => [pl.id, pl.depth, pl.x0, pl.w, pl.foot])).toEqual(a.planes.map((pl) => [pl.id, pl.depth, pl.x0, pl.w, pl.foot]));
      expect(b.groundEdge).toEqual(a.groundEdge);
      b.planes.forEach((pl, i) => expect(cutSamples(pl), `${place} ${pl.id}`).toEqual(cutSamples(a.planes[i])));
    }
  });
});

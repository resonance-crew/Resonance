import { describe, expect, it } from 'vitest';
import { WALK, walkwayAt } from './ground';
import { computeLayout } from './layout';
import { LANTERN_BAND, ctaSpot, nightHeadsY } from './marks';
import { woundAlike } from './geom';
import { LOOKS } from './look';
import { WATER_Y, placeArt, type PlaceId } from './world';

const PLACES: PlaceId[] = ['home', 'journey', 'valley', 'valleyT'];
const parts = (place: PlaceId) => placeArt(place).planes.filter((pl) => !pl.src).flatMap((pl) => pl.parts.map((part) => ({ plane: pl.id, ...part })));

describe("the world's paper, cut plainly (round 4)", () => {
  it('is flat cut paper: no fibre rims, hairs, mottle, specks, pencil lines or fences, and no shade under a layer (round 5) — a fill', () => {
    for (const place of PLACES) {
      for (const part of parts(place)) {
        expect(part.cls, `${place} ${part.plane}`).not.toMatch(/fibre|hair|mottle|speck|pencil|fence|rim|unlit|shade|ff-glow\b/);
        expect(part.d, `${place} ${part.plane}`).not.toBe('');
      }
    }
  });

  it('draws the town as a few plain houses: a roof each, one or two windows, nothing else', () => {
    const town = parts('home').filter((part) => part.plane === 'town');
    const roofs = town.find((part) => part.cls === 'ff-roof')!;
    const houses = (roofs.d.match(/M/g) ?? []).length;
    expect(houses).toBeGreaterThanOrEqual(4);
    expect(houses).toBeLessThanOrEqual(9);
    const windows = town.filter((part) => part.cls === 'ff-lit').reduce((n, part) => n + (part.d.match(/M/g) ?? []).length, 0);
    expect(windows).toBeGreaterThanOrEqual(houses);
    expect(windows).toBeLessThanOrEqual(2 * houses);
  });

  it('spans the valley with one arched bridge over a river: a deck, a wall, and an opening down to the water', () => {
    for (const tall of [false, true]) {
      const art = placeArt(tall ? 'valleyT' : 'valley');
      const bridge = art.planes.find((pl) => pl.id === 'bridge')!;
      expect(bridge.parts.map((part) => part.cls)).toEqual(['ff-bridge-wall', 'ff-bridge']);
      const [a, b] = tall ? WALK.tall : WALK.wide;
      // the water lies under the deck's crown by more than the deck is thick: there is something to see through
      expect(WATER_Y - walkwayAt((a + b) / 2, tall)).toBeGreaterThan(60);
      // the river is the ground plane's first paint (the banks stand in front of it), the sea's own colour
      const ground = art.planes.find((pl) => pl.id === 'ground')!;
      expect(ground.parts[0].cls).toBe('ff-sea');
      expect(ground.parts.some((part) => part.cls === 'ff-ground')).toBe(true);
    }
  });

  it("shows the river on every screen: its surface above the stage's foot", () => {
    for (const [w, h] of [
      [390, 844],
      [390, 664],
      [375, 553],
      [320, 568],
      [820, 1180],
      [1440, 900],
      [1366, 768],
    ]) {
      const L = computeLayout(w, h);
      const y = L.groundY + (WATER_Y - 885) * L.u;
      expect(h - y, `${w}×${h}`).toBeGreaterThan(24);
    }
  });
});

/** The paints that are paper (World.tsx PAPER): what the sand lies on. */
const PAPER = /(^| )ff-(range|swell-b|peaks|swell-d|sea|headland|town|hills|near|ground|bridge|bridge-wall|roof|tree|canopy|trail)( |$)/;
type P2 = [number, number];
/** A path's cuts by their corners (a curve by its ends), and whether each is all straight lines. */
function cuts(d: string): { pts: P2[]; straight: boolean }[] {
  const out: { pts: P2[]; straight: boolean }[] = [];
  let x = 0;
  let y = 0;
  for (const cut of d.match(/[Mm][^Mm]*/g) ?? []) {
    const pts: P2[] = [];
    let straight = true;
    for (const m of cut.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
      const n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
      const rel = m[1] === m[1].toLowerCase();
      const up = m[1].toUpperCase();
      if (up === 'M' || up === 'L') for (let i = 0; i + 1 < n.length; i += 2) pts.push(([x, y] = rel ? [x + n[i], y + n[i + 1]] : [n[i], n[i + 1]]));
      else if (up === 'H') for (const v of n) pts.push([(x = rel ? x + v : v), y]);
      else if (up === 'V') for (const v of n) pts.push([x, (y = rel ? y + v : v)]);
      else if (up === 'Q') {
        straight = false;
        for (let i = 0; i + 3 < n.length; i += 4) pts.push(([x, y] = rel ? [x + n[i + 2], y + n[i + 3]] : [n[i + 2], n[i + 3]]));
      } else if (up !== 'Z') throw new Error(`a command the sand's outline cannot be checked for: ${m[1]}`);
    }
    out.push({ pts, straight });
  }
  return out;
}
const areaOf = (p: P2[]) => p.reduce((a, [x1, y1], i) => a + x1 * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y1, 0) / 2;
const side = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function crossings(p: P2[]): number {
  let n = 0;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const [a, b, c, d] = [p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]];
      if (side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0) n++;
    }
  }
  return n;
}

describe("the paper's sand, one outline a plane (World.tsx SandGroup)", () => {
  // a plane's sand is its papers' cuts one after another in ONE path (geom.ts woundAlike): it fills where any of them
  // is only while every cut goes round the same way — two wound against each other would leave a hole in the sand
  // where they overlap — and no cut crosses itself (a crossed cut is wound both ways)
  it.each(LOOKS)("every plane's papers make one outline: each cut wound the same way, none crossing itself (%s)", (look) => {
    let seen = 0;
    let turned = 0;
    for (const place of PLACES) {
      for (const plane of placeArt(place, look).planes.filter((pl) => !pl.src)) {
        const papers = plane.parts.filter((x) => PAPER.test(x.cls)).map((x) => x.d);
        expect(papers.length, `${look} ${place} ${plane.id}`).toBeGreaterThan(0);
        const drawn = cuts(papers.join(''));
        const outline = cuts(woundAlike(papers.join('')));
        expect(outline).toHaveLength(drawn.length);
        outline.forEach((cut, i) => {
          seen++;
          if (areaOf(drawn[i].pts) < 0) turned++;
          expect(areaOf(cut.pts), `${look} ${place} ${plane.id} cut ${i}`).toBeGreaterThan(0);
          // the same paper, whichever way round: as large as it was drawn
          expect(areaOf(cut.pts)).toBeCloseTo(Math.abs(areaOf(drawn[i].pts)), 0);
          if (cut.straight) expect(crossings(cut.pts), `${look} ${place} ${plane.id} cut ${i}`).toBe(0);
        });
      }
    }
    expect(seen).toBeGreaterThan(300);
    // (the trail's ribbon comes the other way round, and the old look's headland: the outline turns them)
    expect(turned).toBeGreaterThan(0);
  });
});

describe("the night's card and its lanterns on a phone (round 4)", () => {
  it("keeps a band of sky between the card's foot and the five's heads on a tall screen, for the lanterns", () => {
    for (const [w, h, panel] of [
      [390, 844, 300],
      [390, 664, 300],
      [375, 667, 300],
      [375, 553, 190],
      [320, 568, 200],
    ]) {
      const L = computeLayout(w, h);
      expect(L.name).not.toBe('wide');
      const sp = ctaSpot(L, panel);
      const foot = sp.cy + (panel * sp.scale) / 2;
      expect(nightHeadsY(L) - foot, `${w}×${h}`).toBeGreaterThanOrEqual(LANTERN_BAND);
      // the smaller card (its cover a strip, none on a short phone) is drawn whole: never squeezed to fit
      expect(sp.scale, `${w}×${h}`).toBeGreaterThanOrEqual(0.9);
    }
  });
});

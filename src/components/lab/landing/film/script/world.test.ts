import { describe, expect, it } from 'vitest';
import { WALK, walkwayAt } from './ground';
import { computeLayout } from './layout';
import { LANTERN_BAND, ctaSpot, nightHeadsY } from './marks';
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

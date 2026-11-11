import { describe, expect, it } from 'vitest';
import { finishLayout, computeLayout, type Layout } from '../layout';
import { PLACE_OF, camOf, journeyCamEnd, HEADER_PEN } from '../marks';
import type { SceneN } from '../timeline';
import { cutSamples, placeArt } from '../world';
import { changeInfo, changePlanes, type SetPlane } from './info';
import { KEPT, NEW_TOWN_IN, P_SWITCH, lift } from './lift';
import { CLEAR_UNDER_PEN, type ChangeInfo, type ChangeN } from './types';

/** The screens the film is checked on: [w, h, lvh]. */
const SCREENS: [number, number, number][] = [
  [390, 844, 844],
  [320, 640, 640],
  [820, 1180, 1180],
  [1440, 900, 900],
  [1366, 768, 768],
];

function layouts(w: number, h: number, lvh: number): Record<SceneN, Layout> {
  const L = computeLayout(w, h, lvh);
  const zoom = L.name === 'wide' ? 1 : L.tablet ? 1.36 : 1.4;
  const L2 = finishLayout({ ...L, u: L.u * zoom, pal: L.pal * (1 + (zoom - 1) * 0.85) });
  return { 1: L, 2: L2, 3: L, 4: L };
}

function setPlanes(n: SceneN, L: Layout): SetPlane[] {
  return placeArt(PLACE_OF[n]).planes.map((pl) => {
    const tallArt = L.name === 'tall' && pl.tall ? placeArt(pl.tall).planes.find((q) => q.id === pl.id) : undefined;
    const ys = cutSamples(tallArt ?? pl);
    return { id: pl.id, depth: pl.depth, foot: pl.foot, x0: pl.x0, cut: ys ? { step: 100, ys } : null };
  });
}

const INFOS: { info: ChangeInfo; tag: string }[] = SCREENS.flatMap(([w, h, lvh]) => {
  const lay = layouts(w, h, lvh);
  return ([1, 2, 3] as ChangeN[]).map((n) => {
    const side = (k: SceneN) => {
      const L = lay[k];
      const c0 = camOf(k, L);
      return changePlanes(setPlanes(k, L), L, c0, k === 2 && n === 2 ? journeyCamEnd(L) : c0);
    };
    const info = changeInfo(n, lay[1], side(n as SceneN), side((n + 1) as SceneN), HEADER_PEN + CLEAR_UNDER_PEN);
    return { info, tag: `${w}×${h} c${n}` };
  });
});
const PS = Array.from({ length: 201 }, (_, i) => i / 200);

describe('lift (the curtain)', () => {
  it('paints the whole new set behind the whole old one', () => {
    for (const { info, tag } of INFOS) {
      const o = lift.order(info);
      expect(Math.max(...o.new), tag).toBeLessThan(Math.min(...o.old));
    }
  });

  it('turns the new set opaque behind the old before the old one changes a foot, then flies the pieces one saw', () => {
    for (const { info, tag } of INFOS) {
      const early = lift.frame(P_SWITCH / 2, info);
      early.old.forEach((m, i) => expect(m.foot === 'paper' && m.y === 0 && m.alpha === 1, `${tag} ${info.old[i].id}`).toBe(true));
      const ground = info.new.findIndex((pl) => pl.id === 'ground');
      expect(early.new[ground].alpha, tag).toBe(1);
      const f = lift.frame(0.05, info);
      info.old.forEach((pl, i) => {
        if (pl.id === 'ground') expect(f.old[i].foot, tag).toBe('cut');
        if (info.n !== 3 && ['headland', 'town', 'hills', 'near'].includes(pl.id)) expect(f.old[i].foot, `${tag} ${pl.id}`).toBe('rest');
      });
    }
  });

  it('rolls everything up: no layer of either set ever moves down as p grows', () => {
    for (const { info, tag } of INFOS) {
      let prev = lift.frame(0, info);
      for (const p of PS.slice(1)) {
        const f = lift.frame(p, info);
        f.old.forEach((m, i) => expect(m.y, `${tag} p ${p} old ${info.old[i].id}`).toBeLessThanOrEqual(prev.old[i].y + 1e-12));
        f.new.forEach((m, i) => expect(m.y, `${tag} p ${p} new ${info.new[i].id}`).toBeLessThanOrEqual(prev.new[i].y + 1e-12));
        expect(f.actors.new.y, tag).toBeLessThanOrEqual(prev.actors.new.y + 1e-12);
        expect(f.hour, tag).toBeGreaterThanOrEqual(prev.hour - 1e-12);
        prev = f;
      }
    }
  });

  it('never shows two towns at once', () => {
    for (const { info, tag } of INFOS) {
      if (info.n === 3) continue;
      const o = info.old.findIndex((pl) => pl.id === 'town');
      const n = info.new.findIndex((pl) => pl.id === 'town');
      for (const p of PS) {
        const f = lift.frame(p, info);
        if (f.new[n].alpha > 0.001) expect(f.old[o].alpha, `${tag} p ${p}`).toBeLessThanOrEqual(0.001);
      }
      expect(lift.frame(NEW_TOWN_IN[0], info).old[o].alpha, tag).toBeLessThanOrEqual(0.001);
    }
  });

  it('keeps the far layers the valley shares with home standing through the night (c3)', () => {
    for (const { info, tag } of INFOS) {
      if (info.n !== 3) continue;
      for (const p of PS) {
        const f = lift.frame(p, info);
        info.old.forEach((pl, i) => (KEPT as readonly string[]).includes(pl.id) && expect(f.old[i].y, `${tag} ${pl.id}`).toBe(0));
        info.new.forEach((pl, i) => (KEPT as readonly string[]).includes(pl.id) && expect(f.new[i].y, `${tag} ${pl.id}`).toBe(0));
      }
    }
  });

  it('lets the leaving puppets fade where they stand (they never ride their grass up)', () => {
    for (const { info, tag } of INFOS) {
      const g = info.old.findIndex((pl) => pl.id === 'ground');
      for (const p of PS) {
        const f = lift.frame(p, info);
        if (f.actors.old.alpha > 0) expect(f.old[g].y + f.actors.old.y, `${tag} p ${p}`).toBeCloseTo(0, 9);
      }
    }
  });
});

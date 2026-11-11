import { describe, expect, it } from 'vitest';
import { finishLayout, computeLayout, type Layout } from '../layout';
import { PLACE_OF, camOf, journeyCamEnd, HEADER_PEN } from '../marks';
import type { SceneN } from '../timeline';
import { cutSamples, placeArt } from '../world';
import { changeInfo, changePlanes, type SetPlane } from './info';
import { MIST_CLOUDS, mist } from './mist';
import { CLEAR_UNDER_PEN, type ChangeInfo, type ChangeN } from './types';

/** The screens: [w, h, lvh]. */
const SCREENS: [number, number, number][] = [
  [390, 844, 844],
  [390, 760, 844],
  [320, 640, 640],
  [820, 1180, 1180],
  [1440, 900, 900],
  [1366, 768, 768],
  [2560, 1080, 1080],
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
    const side = (k: SceneN) => changePlanes(setPlanes(k, lay[k]), lay[k], camOf(k, lay[k]), k === 2 && n === 2 ? journeyCamEnd(lay[k]) : camOf(k, lay[k]));
    return { info: changeInfo(n, lay[1], side(n as SceneN), side((n + 1) as SceneN), HEADER_PEN + CLEAR_UNDER_PEN), tag: `${w}×${h}/${lvh} c${n}` };
  });
});
const PS = Array.from({ length: 201 }, (_, i) => i / 200);
const { BANK, NEAR, FAR, SURE_UP, SURE_DOWN } = MIST_CLOUDS;
/** The bank's layers' bodies among the strips. */
const bankIdx = BANK.map((_, j) => FAR + 2 * j);
const nearIdx = NEAR.map((_, k) => FAR + 2 * BANK.length + 2 * k);

/** The opaque bank's sure cover at p (stage heights): merged intervals. */
function cover(p: number, info: ChangeInfo, opaque = 0.999): [number, number][] {
  const f = mist.frame(p, info);
  const spans = bankIdx
    .map((i) => f.strips[i])
    // a layer is its body with its crest over it: two sheets of the same tissue
    .filter((st) => st && 1 - (1 - st.alpha) ** 2 >= opaque)
    .map((st): [number, number] => [st.y - SURE_UP * st.h, st.y + SURE_DOWN * st.h])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([...s]);
  }
  return out;
}
const covers = (iv: [number, number][], a: number, b: number) => iv.some(([lo, hi]) => lo <= a && hi >= b);

describe('mist: through the clouds', () => {
  it('draws a paper for every strip, the same every time', () => {
    for (let i = 0; i < mist.strips; i++) {
      const d = mist.paper!(i);
      expect(d.startsWith('M'), `strip ${i}`).toBe(true);
      expect(d).toBe(mist.paper!(i));
    }
  });

  it('never shows the old ground below its place: the bank covers the stage foot as fast as the ground lifts', () => {
    for (const { info, tag } of INFOS) {
      const g = info.old.findIndex((pl) => pl.id === 'ground');
      for (const p of PS) {
        const lift = -mist.frame(p, info).old[g].y;
        if (lift <= 0.006 || mist.frame(p, info).old[g].alpha <= 0.01) continue;
        expect(covers(cover(p, info), 1 - lift - 0.01, 1), `${tag} p ${p} lift ${lift.toFixed(3)}`).toBe(true);
      }
    }
  });

  it('has wholly covered the stage below its surface while the old scene leaves and the new one comes', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS.filter((p) => p >= 0.36 && p <= 0.47)) expect(covers(cover(p, info), 0.62, 1), `${tag} p ${p}`).toBe(true);
    }
  });

  it('never shows two scenes at once: the old is gone before the new is there, and the new comes up behind the bank', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = mist.frame(p, info);
        const oldOn = f.old.some((m) => m.alpha > 0.01);
        const newOn = f.new.some((m) => m.alpha > 0.01);
        expect(oldOn && newOn, `${tag} p ${p}`).toBe(false);
        // while a new flat fades in (the old one gone), all of it on the stage is under the bank, or deep in its thinning top
        if (f.new.some((m) => m.alpha > 0.01 && m.alpha < 0.99)) {
          const iv = cover(p, info, 0.6);
          f.new.forEach((m, i) => {
            const top = info.new[i].top + m.y;
            if (m.alpha > 0.01 && top < 1) expect(covers(iv, top, 1), `${tag} p ${p} ${info.new[i].id} top ${top.toFixed(2)}`).toBe(true);
          });
        }
      }
    }
  });

  it('meets the scenes on either side: no tissue on the stage at the ends of a change', () => {
    for (const { info, tag } of INFOS) {
      for (const p of [0, 0.005, 0.01, 0.985, 0.99, 0.995, 1]) {
        for (const st of mist.frame(p, info).strips) {
          // a cloud's paper reaches at most a quarter of its box above its centre, a third below
          const onStage = st.y - 0.25 * st.h < 1 && st.y + 0.36 * st.h > 0;
          expect(onStage && st.alpha > 0.01, `${tag} p ${p}`).toBe(false);
        }
      }
    }
  });

  it('keeps the clouds round and never ends a cloud layer on the stage', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = mist.frame(p, info);
        for (const i of [...bankIdx, ...nearIdx]) {
          const st = f.strips[i];
          if (!st || st.alpha <= 0) continue;
          // the layer's paper keeps square units unless the screen is too wide for it (then it only widens)
          const aspect = (st.w * info.w) / (st.h * info.h);
          expect(aspect, `${tag} p ${p} strip ${i}`).toBeGreaterThanOrEqual(10 - 1e-9);
          // its blunt ends are off the stage
          expect(st.x - 0.5 * st.w, `${tag} p ${p} strip ${i}`).toBeLessThanOrEqual(-0.02);
          expect(st.x + 0.5 * st.w, `${tag} p ${p} strip ${i}`).toBeGreaterThanOrEqual(1.02);
        }
      }
    }
  });

  it('turns the hour while the clouds are up, never against the scroll', () => {
    for (const { info, tag } of INFOS) {
      let last = -1;
      for (const p of PS) {
        const h = mist.frame(p, info).hour;
        expect(h, `${tag} p ${p}`).toBeGreaterThanOrEqual(last);
        last = h;
      }
    }
  });
});

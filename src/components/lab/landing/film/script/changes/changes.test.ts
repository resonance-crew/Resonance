import { describe, expect, it } from 'vitest';
import { finishLayout, computeLayout, type Layout } from '../layout';
import { PLACE_OF, camOf, journeyCamEnd, pairSpots, topSpots, HEADER_PEN } from '../marks';
import { changeMoves, isBackdrop } from '../parallax';
import type { SceneN } from '../timeline';
import { cutSamples, placeArt } from '../world';
import { CHANGE_STYLES, DEFAULT_CHANGE, changeStyleOf } from './index';
import { PLANE_TOP, changeInfo, changePlanes, type SetPlane } from './info';
import { CLEAR_UNDER_PEN, easeIntoRoom, type ChangeInfo, type ChangeN, type FootMode, type PlaneMove } from './types';

/** The screens the film is checked on: [w, h, lvh] (a phone's lvh is taller than its svh with the toolbar shown). */
const SCREENS: [number, number, number][] = [
  [390, 844, 844],
  [390, 760, 844],
  [320, 640, 640],
  [820, 1180, 1180],
  [1440, 900, 900],
  [1366, 768, 768],
];

/** The journey's world on a tall screen is drawn larger (film.module.css `--zoom-2`). */
function layouts(w: number, h: number, lvh: number): Record<SceneN, Layout> {
  const L = computeLayout(w, h, lvh);
  const zoom = L.name === 'wide' ? 1 : L.tablet ? 1.36 : 1.4;
  const L2 = finishLayout({ ...L, u: L.u * zoom, pal: L.pal * (1 + (zoom - 1) * 0.85) });
  return { 1: L, 2: L2, 3: L, 4: L };
}

/** A scene's planes as the server draws them (the valley's tall art on a tall screen). */
function setPlanes(n: SceneN, L: Layout): SetPlane[] {
  return placeArt(PLACE_OF[n]).planes.map((pl) => {
    const tallArt = L.name === 'tall' && pl.tall ? placeArt(pl.tall).planes.find((q) => q.id === pl.id) : undefined;
    const ys = cutSamples(tallArt ?? pl);
    return { id: pl.id, depth: pl.depth, foot: pl.foot, x0: pl.x0, cut: ys ? { step: 100, ys } : null };
  });
}

const clearPx = HEADER_PEN + CLEAR_UNDER_PEN;

function infosOf(w: number, h: number, lvh: number): ChangeInfo[] {
  const lay = layouts(w, h, lvh);
  return ([1, 2, 3] as ChangeN[]).map((n) => {
    const side = (k: SceneN) => {
      const L = lay[k];
      const c0 = camOf(k, L);
      return changePlanes(setPlanes(k, L), L, c0, k === 2 && n === 2 ? journeyCamEnd(L) : c0);
    };
    return changeInfo(n, lay[1], side(n as SceneN), side((n + 1) as SceneN), clearPx);
  });
}

const INFOS = SCREENS.flatMap(([w, h, lvh]) => infosOf(w, h, lvh).map((info) => ({ info, tag: `${w}×${h}/${lvh} c${info.n}` })));
const STYLES = Object.values(CHANGE_STYLES);
const PS = Array.from({ length: 41 }, (_, i) => i / 40);
const FEET: FootMode[] = ['cut', 'paper', 'apron', 'rest'];
const finite = (...v: (number | undefined)[]) => v.every((n) => n == null || Number.isFinite(n));
const near = (a: number | undefined, b: number, eps = 1e-6) => Math.abs((a ?? b) - b) <= eps;

/** Where a plane's paper ends at a move (stage heights): its cut-out foot, its torn foot, or never (an apron). */
const bottomOf = (pl: ChangeInfo['old'][number], m: PlaneMove) => (m.foot === 'apron' && !pl.backdrop && pl.id !== 'bridge' ? Infinity : m.foot === 'cut' && pl.cutFoot != null ? pl.cutFoot : pl.foot);
/** Out of view: faded out, or wholly below the stage or above it. */
const outOfView = (pl: ChangeInfo['old'][number], m: PlaneMove) => m.alpha <= 0.01 || pl.top + m.y >= 1 || bottomOf(pl, m) + m.y <= 0 || Math.abs(m.x ?? 0) >= 1;
const inPlace = (m: PlaneMove) => near(m.y, 0, 1e-4) && near(m.x, 0, 1e-4) && m.alpha >= 0.999 && near(m.scale, 1, 1e-4) && near(m.rot, 0, 1e-3);

describe('the scene change styles', () => {
  it('are picked by ?change=, an unknown name falling back to the default (flats: the panel’s choice)', () => {
    expect(DEFAULT_CHANGE).toBe('flats');
    expect(changeStyleOf(null).name).toBe(DEFAULT_CHANGE);
    expect(changeStyleOf('nope').name).toBe(DEFAULT_CHANGE);
    expect(changeStyleOf('__proto__').name).toBe(DEFAULT_CHANGE);
    for (const name of ['legacy', 'lift', 'mist', 'flats']) expect(changeStyleOf(name).name).toBe(name);
  });

  it('are told each plane where the server draws it (tops above feet, the cut-out foot between)', () => {
    for (const { info, tag } of INFOS) {
      expect(info.old.length, tag).toBeGreaterThan(5);
      for (const pl of [...info.old, ...info.new]) {
        expect(pl.top, `${tag} ${pl.id}`).toBeLessThan(pl.foot);
        if (pl.cutFoot != null) {
          expect(pl.cutFoot, `${tag} ${pl.id}`).toBeGreaterThan(pl.top);
          // a short torn foot: never deeper than its paper
          expect(pl.cutFoot, `${tag} ${pl.id}`).toBeLessThanOrEqual(pl.backdrop ? 2 : pl.foot + 1e-9);
        }
      }
      expect(info.clear).toBeCloseTo(clearPx / info.h, 9);
    }
  });

  for (const style of STYLES) {
    describe(style.name, () => {
      it('answers every plane, the grass, the held cards, the lanterns, the puppets, the hero, the hour and its strips, at every p', () => {
        for (const { info, tag } of INFOS) {
          const order = style.order(info);
          expect(order.old.length, tag).toBe(info.old.length);
          expect(order.new.length, tag).toBe(info.new.length);
          expect([...order.old, ...order.new, order.fringe.old, order.fringe.new].every(Number.isFinite), tag).toBe(true);
          for (const p of PS) {
            const f = style.frame(p, info);
            const at = `${tag} p ${p}`;
            expect(f.old.length, at).toBe(info.old.length);
            expect(f.new.length, at).toBe(info.new.length);
            for (const m of [...f.old, ...f.new]) {
              expect(finite(m.y, m.x, m.alpha, m.scale, m.rot), at).toBe(true);
              expect(FEET, at).toContain(m.foot);
            }
            for (const m of [f.fringe.old, f.fringe.new, f.held, f.lanterns, f.actors.old, f.actors.new, f.hero]) expect(finite(m.y, m.alpha), at).toBe(true);
            expect(f.hour, at).toBeGreaterThanOrEqual(0);
            expect(f.hour, at).toBeLessThanOrEqual(1);
            expect(f.strips.length, at).toBeLessThanOrEqual(style.strips);
            for (const st of f.strips) expect(finite(st.x, st.y, st.w, st.h, st.rot, st.alpha, st.z), at).toBe(true);
          }
        }
      });

      it('starts with the old set in place and the new out of view, and ends the other way round', () => {
        for (const { info, tag } of INFOS) {
          const a = style.frame(0, info);
          const b = style.frame(1, info);
          a.old.forEach((m, i) => expect(inPlace(m), `${tag} p 0 old ${info.old[i].id}`).toBe(true));
          a.new.forEach((m, i) => expect(outOfView(info.new[i], m), `${tag} p 0 new ${info.new[i].id}`).toBe(true));
          b.new.forEach((m, i) => expect(inPlace(m), `${tag} p 1 new ${info.new[i].id}`).toBe(true));
          b.old.forEach((m, i) => expect(outOfView(info.old[i], m), `${tag} p 1 old ${info.old[i].id}`).toBe(true));
          // the grass, the puppets, the hour: the old scene's at 0, the new one's at 1
          expect(near(a.fringe.old.y, 0) && a.fringe.old.alpha >= 0.999, tag).toBe(true);
          expect(near(b.fringe.new.y, 0) && b.fringe.new.alpha >= 0.999, tag).toBe(true);
          expect(near(a.actors.old.y, 0) && a.actors.old.alpha >= 0.999, tag).toBe(true);
          expect(near(b.actors.new.y, 0) && b.actors.new.alpha >= 0.999, tag).toBe(true);
          expect(a.hour, tag).toBe(0);
          expect(b.hour, tag).toBe(1);
          // the held cards meet the segments on either side: in place at both ends (c3's pair gone by its end)
          expect(near(a.held.y, 0) && a.held.alpha >= 0.999, tag).toBe(true);
          expect(near(b.held.y, 0), tag).toBe(true);
          if (info.n === 3) expect(b.held.alpha, tag).toBeLessThanOrEqual(0.001);
          else expect(b.held.alpha, tag).toBeGreaterThanOrEqual(0.999);
          if (info.n === 1) {
            expect(near(a.hero.y, 0) && a.hero.alpha >= 0.999, tag).toBe(true);
            expect(b.hero.alpha, tag).toBeLessThanOrEqual(0.001);
          }
        }
      });

      it('keeps every held card under the header: 12 px under its pen line, whatever the style asks', () => {
        for (const { info, tag } of INFOS) {
          const L = computeLayout(info.w, info.h, info.lvh);
          const clear = info.clear * info.h;
          // where the beats hold them: the pair (c2), the pair at the top (c3), and any top a card may have
          // the cards are the landing page's StoryCards (round 3): about 300 × 440 laid out
          const card = { w: 300, h: 440 };
          const P = pairSpots(L, card, card);
          const T = topSpots(L, card, card);
          const tops = [P.a.cy - (card.h * P.a.scale) / 2, T.a.cy - (card.h * T.a.scale) / 2, clear, clear + 1, clear + 40, 0.3 * info.h, 0.6 * info.h];
          for (const p of PS) {
            const f = style.frame(p, info);
            for (const top of tops) {
              for (const want of [f.held.y, f.lanterns.y]) {
                const dy = easeIntoRoom(want * info.h, top - clear);
                expect(top + dy, `${tag} p ${p} top ${top.toFixed(1)}`).toBeGreaterThanOrEqual(Math.min(top, clear) - 1e-9);
              }
            }
          }
        }
      });
    });
  }

  it('eases a held offset into its room: as asked while far from the line, never past it', () => {
    for (let room = -20; room <= 300; room += 7) {
      for (let want = -600; want <= 200; want += 3) {
        const dy = easeIntoRoom(want, room);
        if (want >= 0) expect(dy).toBe(want);
        else {
          expect(dy).toBeLessThanOrEqual(0);
          expect(-dy).toBeLessThanOrEqual(Math.max(0, room) + 1e-9);
          if (-want <= room / 2) expect(dy).toBe(want);
        }
      }
    }
    // smooth and monotonic through the knee
    let last = 0;
    for (let want = 0; want >= -200; want -= 0.5) {
      const dy = easeIntoRoom(want, 40);
      expect(dy).toBeLessThanOrEqual(last + 1e-12);
      expect(last - dy).toBeLessThanOrEqual(0.5 + 1e-9);
      last = dy;
    }
  });

  it('legacy is the change as first built: the same moves as script/parallax.ts gave the director', () => {
    const legacy = CHANGE_STYLES.legacy;
    for (const [w, h, lvh] of SCREENS) {
      const lay = layouts(w, h, lvh);
      for (const info of infosOf(w, h, lvh)) {
        // the director's own reckoning before the styles (its specOf, in the large viewport's heights)
        const spec = (k: SceneN) => {
          const L = lay[k];
          const at = (y: number) => (L.groundY + (y - 885) * L.u) / L.lvh;
          return setPlanes(k, L).map((pl) => ({ depth: pl.depth, top: at(PLANE_TOP[pl.id]), bottom: isBackdrop(pl.depth) ? 1.16 : at(pl.foot) }));
        };
        for (const p of PS) {
          const was = changeMoves(p, spec(info.from), spec(info.to));
          const f = legacy.frame(p, info);
          f.old.forEach((m, i) => expect(m.y * h, `${w}×${h} c${info.n} p ${p} old ${i}`).toBeCloseTo(was.old[i].y * lvh, 6));
          f.new.forEach((m, i) => expect(m.y * h, `${w}×${h} c${info.n} p ${p} new ${i}`).toBeCloseTo(was.new[i].y * lvh, 6));
          f.new.forEach((m, i) => expect(m.alpha).toBeCloseTo(was.new[i].alpha, 9));
          f.old.forEach((m, i) => {
            if (info.old[i].id !== 'bridge') expect(m.alpha).toBeCloseTo(was.old[i].alpha, 9);
          });
        }
      }
    }
  });
});

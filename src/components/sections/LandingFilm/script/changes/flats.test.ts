import { describe, expect, it, vi } from 'vitest';
import { computeLayout, finishLayout, type Layout } from '../layout';
import { HEADER_PEN, PLACE_OF, camOf, journeyCamEnd } from '../marks';
import type { SceneN } from '../timeline';
import { REST_MARGIN, REST_PLACES, REST_PLANES, cutSamples, placeArt, restClip } from '../world';
import { yAt, type Pt } from '../geom';
import { BANK_COVER, BOUNCE, FLATS, LET_GO, TALL_CLIMB, VANISH, flats } from './flats';
import { changeInfo, changePlanes, type SetPlane } from './info';
import { hourAt, mixLab, paintAt, skyAt } from '../palette';
import { SEG, lerp, smooth } from '../timeline';
import { CLEAR_UNDER_PEN, type ChangeInfo, type ChangeN, type ChangePlane, type PlaneMove } from './types';

// These tests walk every plane of every scene change through hundreds of moments on several screens: about a second
// each here, three to four times that on a CI runner — over the default five (one timed out there, 2026-11-11).
vi.setConfig({ testTimeout: 30_000 });

/** The screens: a phone (toolbar shown and hidden), a small phone, a tablet, a desktop, a laptop. */
const SCREENS: [number, number, number][] = [
  [390, 844, 844],
  [390, 760, 844],
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
const PS = Array.from({ length: 401 }, (_, i) => i / 400);
const seaOf = (planes: ChangePlane[]) => planes.find((pl) => pl.id === 'sea')?.top ?? 0.64;

/** The planes that move (not the sea, not the far world c3 keeps standing): they are the scene's places. */
const moving = (info: ChangeInfo, pl: ChangePlane) => pl.id !== 'sea' && !(info.n === 3 && ['range', 'peaks', 'headland', 'town', 'hills'].includes(pl.id));
/** Where a moving plane's paper visibly ends (stage heights): the floor's lip hides what is below it. */
const LIP = 0.93;
/** An old flat is on the stage: seen (alpha), below the header and above the floor. */
const oldSeen = (info: ChangeInfo, pl: ChangePlane, m: PlaneMove) => m.alpha > 0.05 && pl.top + m.y < LIP && Math.min(LIP, pl.foot) + m.y > info.clear;
/** A new plane is on the stage: up out of the floor (a far one, and the headland, out of the sea's horizon). */
const newSeen = (info: ChangeInfo, pl: ChangePlane, m: PlaneMove, horizon: number) => m.alpha > 0.05 && pl.top + m.y < (pl.backdrop ? horizon : LIP);

describe('flats (the paper theatre)', () => {
  it('swings each flat at most 1.5°, and never at rest', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = flats.frame(p, info);
        for (const m of [...f.old, ...f.new]) expect(Math.abs(m.rot ?? 0), `${tag} p ${p}`).toBeLessThanOrEqual(1.5);
      }
      for (const m of [...flats.frame(0, info).old, ...flats.frame(1, info).new]) expect(Math.abs(m.rot ?? 0), tag).toBeLessThan(1e-9);
    }
  });

  it('settles each arriving flat with a tiny bounce: a 2–3 % overshoot of its travel, then exactly in place', () => {
    for (const { info, tag } of INFOS) {
      info.new.forEach((pl, i) => {
        if (!moving(info, pl)) return;
        const ys = PS.map((p) => flats.frame(p, info).new[i].y);
        // its travel: where it is in the first frame it has started rising (a far one has come up behind the sea's
        // horizon by then) down to its place
        const k = ys.findIndex((y) => y < ys[0] - 1e-9);
        if (k < 0) return;
        const travel = ys[k];
        const over = -Math.min(...ys) / travel;
        expect(over, `${tag} ${pl.id}`).toBeGreaterThan(BOUNCE * 0.8);
        expect(over, `${tag} ${pl.id}`).toBeLessThan(0.03 + 1e-3);
        expect(ys[ys.length - 1], `${tag} ${pl.id}`).toBe(0);
      });
    }
  });

  it('flies the old flats out nearest first (the ground and the bridge stay in the bank), and raises the new ones farthest first', () => {
    for (const { info, tag } of INFOS) {
      const leaves = info.old
        .map((pl, i) => ({ pl, at: PS.find((p) => Math.abs(flats.frame(p, info).old[i].y) > 1e-4) ?? 2 }))
        .filter(({ pl }) => moving(info, pl) && pl.id !== 'ground' && pl.id !== 'bridge');
      const lands = info.new
        .map((pl, i) => ({ pl, at: PS.find((p) => p > 0 && PS.slice(PS.indexOf(p)).every((q) => Math.abs(flats.frame(q, info).new[i].y) < 1e-6)) ?? 2 }))
        .filter(({ pl }) => moving(info, pl));
      for (const a of leaves) for (const b of leaves) if (a.pl.depth > b.pl.depth + 1e-9) expect(a.at, `${tag} ${a.pl.id} before ${b.pl.id}`).toBeLessThanOrEqual(b.at);
      for (const a of lands) for (const b of lands) if (a.pl.depth < b.pl.depth - 1e-9) expect(a.at, `${tag} ${a.pl.id} before ${b.pl.id}`).toBeLessThanOrEqual(b.at);
      // every old flat but the ground and the bridge does fly
      for (const { pl, at } of leaves) expect(at, `${tag} ${pl.id}`).toBeLessThan(1);
    }
  });

  it('rolls everything up: no plane ever moves down, but for a rising flat settling back from its tiny bounce', () => {
    for (const { info, tag } of INFOS) {
      const travel = info.new.map((_, i) => Math.max(...PS.map((p) => flats.frame(p, info).new[i].y)));
      let prev = flats.frame(0, info);
      for (const p of PS.slice(1)) {
        const f = flats.frame(p, info);
        f.old.forEach((m, i) => {
          // the sea is the back cloth: it keeps to the sky's horizon
          if (info.old[i].id !== 'sea') expect(m.y, `${tag} p ${p} old ${info.old[i].id}`).toBeLessThanOrEqual(prev.old[i].y + 1e-12);
        });
        f.new.forEach((m, i) => {
          if (info.new[i].id === 'sea') return;
          // settling back from the bounce: only above its place, and never more than the bounce's share of its travel
          if (m.y > prev.new[i].y + 1e-12) {
            expect(m.y, `${tag} p ${p} new ${info.new[i].id}`).toBeLessThanOrEqual(1e-12);
            expect(m.y - prev.new[i].y, `${tag} p ${p} new ${info.new[i].id}`).toBeLessThanOrEqual(0.03 * travel[i] + 1e-9);
          }
        });
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
        const f = flats.frame(p, info);
        if (f.new[n].alpha > 0.001 && info.new[n].top + f.new[n].y < LIP) expect(f.old[o].alpha, `${tag} p ${p}`).toBeLessThanOrEqual(0.001);
      }
    }
  });

  it('pales a flown flat into the haze as it goes (never back), only over the last part of its climb, and lets it go under the header', () => {
    for (const { info, tag } of INFOS) {
      const groundTop = info.old.find((q) => q.id === 'ground')?.top ?? 0.85;
      info.old.forEach((pl, i) => {
        if (!moving(info, pl) || pl.id === 'ground') return;
        const flat = !pl.backdrop && pl.id !== 'bridge';
        const climb = FLATS.climbOf(pl, FLATS.bottomOf(pl, groundTop), VANISH, info);
        let haze = 0;
        for (const p of PS) {
          const m = flats.frame(p, info).old[i];
          const h = m.haze ?? 0;
          expect(h, `${tag} p ${p} ${pl.id}`).toBeGreaterThanOrEqual(haze - 1e-12);
          haze = h;
          const mid = (pl.top + Math.min(pl.foot, 1)) / 2 + m.y;
          // while it is seen at all, its middle is under the clearance line, and it has paled as it nears it
          if (m.alpha > 0.05) {
            expect(mid, `${tag} p ${p} ${pl.id}`).toBeGreaterThan(info.clear);
            if (mid < info.clear + 0.12) expect(h, `${tag} p ${p} ${pl.id}`).toBeGreaterThan(0.4);
          }
          // a flat keeps its own paper over the first third of its climb (it is seen rolling up, not fading in place)
          if (flat && -m.y < climb / 3) expect(h, `${tag} p ${p} ${pl.id}`).toBeLessThan(0.02);
        }
        // and once it is gone it is gone
        expect(flats.frame(1, info).old[i].alpha, `${tag} ${pl.id}`).toBe(0);
      });
      // an arriving flat comes out of the haze (never into it), and stands in its own paper
      info.new.forEach((pl, i) => {
        let haze = 1;
        for (const p of PS) {
          const h = flats.frame(p, info).new[i].haze ?? 0;
          expect(h, `${tag} p ${p} new ${pl.id}`).toBeLessThanOrEqual(haze + 1e-12);
          haze = h;
        }
        expect(flats.frame(1, info).new[i].haze ?? 0, `${tag} ${pl.id}`).toBe(0);
      });
    }
  });

  it('rolls the old world up on a tall screen: each flat climbs by its depth, the town past the cards’ band, before it lets go', () => {
    for (const { info, tag } of INFOS) {
      if (info.layout !== 'tall' || info.n === 3) continue;
      info.old.forEach((pl, i) => {
        const want = TALL_CLIMB[pl.id];
        if (want == null) return;
        // how high it has climbed while still mostly there (alpha above a half)
        const high = Math.max(...PS.map((p) => flats.frame(p, info).old[i]).filter((m) => m.alpha > 0.5).map((m) => -m.y));
        const mid = (pl.top + FLATS.bottomOf(pl, info.old.find((q) => q.id === 'ground')!.top)) / 2;
        expect(high, `${tag} ${pl.id}`).toBeGreaterThan(0.8 * Math.min(want, mid - info.clear - 0.04));
        expect(high, `${tag} ${pl.id}`).toBeGreaterThan(0.24);
      });
      // nearer ones climb higher
      const climb = (id: string) => {
        const i = info.old.findIndex((q) => q.id === id);
        return i < 0 ? null : Math.max(...PS.map((p) => -flats.frame(p, info).old[i].y));
      };
      const [town, hills, headland] = [climb('town'), climb('hills'), climb('headland')];
      if (town != null && headland != null) expect(town, tag).toBeGreaterThan(headland);
      if (town != null && hills != null) expect(hills, tag).toBeGreaterThanOrEqual(town - 1e-9);
    }
  });

  it('never shows two paled flats through one another: at most one is both paled and more than a fifth there', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = flats.frame(p, info);
        const ghosts = info.old.filter((pl, i) => moving(info, pl) && !pl.backdrop && pl.id !== 'ground' && (f.old[i].haze ?? 0) > 0.3 && f.old[i].alpha > 0.2);
        expect(ghosts.length, `${tag} p ${p} ${ghosts.map((q) => q.id)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps c2 in colour: what a flown flat pales into is never a khaki, and the stage outside the cards keeps its depth', () => {
    for (const dim of [false, true]) {
      for (const { info, tag } of INFOS) {
        if (info.n !== 2) continue;
        // the cards' band (the pair A ≋ B): the top of a tall screen, a strip under the header on a wide one
        const y0 = info.layout === 'tall' ? 0.45 : 0.24;
        for (const p of PS) {
          const f = flats.frame(p, info);
          const P = paintAt(hourAt(lerp(SEG.c2.t0, SEG.c2.t1, f.hour)), dim).c;
          for (const k of ['fly', 'fly-low']) {
            const [, C, hue] = P[k];
            if (C > 0.02) expect(hue < 75 || hue > 100, `${tag} p ${p} ${k} hue ${hue.toFixed(0)}`).toBe(true);
          }
          const sea = seaOf(info.old) + (seaOf(info.new) - seaOf(info.old)) * smooth(p);
          // what is seen below the cards: the sky down to the horizon, the sea, each plane (as far as it has paled)
          const seen: number[] = [];
          for (let y = y0; y < sea; y += 0.02) seen.push(skyAt(hourAt(lerp(SEG.c2.t0, SEG.c2.t1, f.hour)), y / sea, dim)[0]);
          if (sea < LIP) seen.push(P.sea[0]);
          (['old', 'new'] as const).forEach((side) =>
            info[side].forEach((pl, i) => {
              const m = f[side][i];
              if (pl.id === 'sea' || m.alpha < 0.2 || pl.top + m.y > LIP || Math.min(1, pl.foot) + m.y < y0) return;
              const own = P[pl.id] ?? P.ground;
              seen.push(mixLab(own, pl.backdrop ? P['fly-low'] : P.fly, m.haze ?? 0)[0]);
            }),
          );
          const spread = Math.max(...seen) - Math.min(...seen);
          expect(spread, `${tag} ${dim ? 'dim' : 'light'} p ${p}`).toBeGreaterThanOrEqual(dim ? 0.18 : 0.2);
        }
      }
    }
  });

  it('covers the leaving puppets and the ground with the bank while they are whole, and lets them go only inside it', () => {
    for (const { info, tag } of INFOS) {
      const st = FLATS.stageOf(info);
      const g = info.old.findIndex((pl) => pl.id === 'ground');
      const bank = (f: ReturnType<typeof flats.frame>) => f.strips.slice(FLATS.S_BANK, FLATS.S_BANK + 2 * FLATS.BANK.length);
      for (const p of PS) {
        const f = flats.frame(p, info);
        // they never ride their ground up: it stays, and they only sink a little into the bank
        expect(f.old[g].y, `${tag} p ${p}`).toBe(0);
        expect(f.actors.old.y, `${tag} p ${p}`).toBeGreaterThanOrEqual(0);
        const letting = f.actors.old.alpha < 0.999 || f.old[g].alpha < 0.999;
        if (letting && f.actors.old.alpha > 0.001) {
          expect(p, `${tag} p ${p}`).toBeGreaterThanOrEqual(BANK_COVER);
          // the bank is up over them, whole
          expect(FLATS.bankTop(p, st), `${tag} p ${p}`).toBeLessThanOrEqual(st.cover + 1e-9);
          // (each cloud is one piece of paper — round 5: its body whole, its crest's lighter copy no longer laid over it)
          bank(f).forEach((s, i) => {
            if (i % 2 === 0) expect(s.alpha, `${tag} p ${p}`).toBeGreaterThanOrEqual(0.999);
            else expect(s.alpha, `${tag} p ${p}`).toBe(0);
          });
        }
      }
      expect(flats.frame(LET_GO[1] + 0.02, info).actors.old.alpha, tag).toBe(0);
      // the bank is over every old flat and under every new one (and over the old grass)
      const o = flats.order(info);
      const keep = (pl: ChangePlane, side: 'old' | 'new') => moving(info, pl) || side === 'old';
      const oldTop = Math.max(...o.old.filter((_, i) => keep(info.old[i], 'old')), o.fringe.old);
      const newLow = Math.min(...o.new.filter((_, i) => moving(info, info.new[i]) && !(info.new[i].backdrop && info.new[i].id !== 'bridge')));
      expect(FLATS.Z.bank, tag).toBeGreaterThan(oldTop);
      expect(FLATS.Z.bank + 2 * FLATS.BANK.length + 1, tag).toBeLessThan(newLow);
    }
  });

  it('brings the five up early in c3, standing on their ground from 0.6 on', () => {
    for (const { info, tag } of INFOS) {
      if (info.n !== 3) continue;
      const g = info.new.findIndex((pl) => pl.id === 'ground');
      for (const p of PS.filter((q) => q >= 0.6)) {
        const f = flats.frame(p, info);
        expect(f.new[g].y, `${tag} p ${p}`).toBe(0);
        expect(f.actors.new.y, `${tag} p ${p}`).toBe(0);
        expect(f.actors.new.alpha, `${tag} p ${p}`).toBe(1);
      }
    }
  });

  it('never lifts the bridge: it stays where it was built and is gone once the bank is over it (c3)', () => {
    for (const { info, tag } of INFOS) {
      if (info.n !== 3) continue;
      const b = info.old.findIndex((pl) => pl.id === 'bridge');
      for (const p of PS) {
        const m = flats.frame(p, info).old[b];
        expect(m.y, `${tag} p ${p}`).toBe(0);
        expect(m.rot ?? 0, `${tag} p ${p}`).toBe(0);
        expect(m.scale ?? 1, `${tag} p ${p}`).toBe(1);
        // whole until the bank covers the banks, gone right after
        if (p <= FLATS.BANK_COVER) expect(m.alpha, `${tag} p ${p}`).toBe(1);
        if (p >= FLATS.LET_GO[1] + 0.02) expect(m.alpha, `${tag} p ${p}`).toBe(0);
      }
    }
  });

  it('shows one place at a time: every old flat is off the stage before a new one comes up', () => {
    for (const { info, tag } of INFOS) {
      const horizon = (p: number) => {
        const sea = (pl: ChangePlane[]) => pl.find((q) => q.id === 'sea')?.top ?? 0.64;
        const k = p * p * (3 - 2 * p);
        return sea(info.old) + (sea(info.new) - sea(info.old)) * k;
      };
      for (const p of PS) {
        const f = flats.frame(p, info);
        const olds = info.old.filter((pl, i) => moving(info, pl) && oldSeen(info, pl, f.old[i]));
        const news = info.new.filter((pl, i) => moving(info, pl) && newSeen(info, pl, f.new[i], horizon(p)));
        expect(olds.length && news.length ? `${olds.map((q) => q.id)} with ${news.map((q) => q.id)}` : '', `${tag} p ${p}`).toBe('');
      }
    }
  });

  it('never lets the back cloth (the sea) or the standing far world thin: one copy is always whole', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = flats.frame(p, info);
        info.old.forEach((pl, i) => {
          if (moving(info, pl)) return;
          const j = info.new.findIndex((q) => q.id === pl.id);
          expect(Math.max(f.old[i].alpha, f.new[j].alpha), `${tag} p ${p} ${pl.id}`).toBeGreaterThanOrEqual(0.999);
          // and the two copies stand together (the sea follows the sky's horizon)
          expect(pl.top + f.old[i].y, `${tag} p ${p} ${pl.id}`).toBeCloseTo(info.new[j].top + f.new[j].y, 9);
        });
      }
    }
  });

  it('flies a middle flat as its silhouette at rest from the first frame, the ground as its cut-out once hauled, and lands everything on its paper', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = flats.frame(p, info);
        info.old.forEach((pl, i) => {
          if (!moving(info, pl)) return;
          // (a phone's c2: the town and hills the journey's near hill hid fly as their cut-outs, never as unseen bodies)
          const hid = info.layout === 'tall' && info.n === 2 && (pl.id === 'town' || pl.id === 'hills') && pl.cutFoot != null;
          if (REST_PLANES.includes(pl.id)) expect(f.old[i].foot, `${tag} p ${p} ${pl.id}`).toBe(hid ? 'cut' : 'rest');
          if (pl.id === 'ground' && f.old[i].y < -1e-4) expect(f.old[i].foot, `${tag} p ${p}`).toBe('cut');
          if (pl.id === 'ground' && p === 0) expect(f.old[i].foot, tag).toBe('paper');
        });
      }
      for (const m of flats.frame(1, info).new) expect(m.foot, tag).toBe('paper');
    }
  });

  it('is pure: the same p is the same frame, whatever came before', () => {
    const { info } = INFOS[0];
    const once = PS.map((p) => JSON.stringify(flats.frame(p, info)));
    const back = [...PS].reverse().map((p) => JSON.stringify(flats.frame(p, info)));
    expect(back.reverse()).toEqual(once);
  });

  it('lights the open sea with glints only in c1 and c2, and draws its tissue only during a change, never more than it has made', () => {
    for (const { info, tag } of INFOS) {
      for (const p of PS) {
        const f = flats.frame(p, info);
        expect(f.strips.length, tag).toBeLessThanOrEqual(flats.strips);
        if (p === 0 || p === 1) expect(f.strips.length, `${tag} p ${p}`).toBe(0);
        const glints = f.strips.slice(0, FLATS.GLINTS);
        if (info.n === 3 || p < 0.06 || p > 0.85) for (const g of glints) expect(g.alpha, `${tag} p ${p}`).toBe(0);
        for (const st of f.strips) {
          expect(st.alpha, `${tag} p ${p}`).toBeGreaterThanOrEqual(0);
          expect(st.alpha, `${tag} p ${p}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('the middle flats’ silhouettes at rest (world.ts restClip)', () => {
  /** A clip path's points (M/L only). */
  const pointsOf = (d: string): Pt[] => [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it('is drawn for the middle flats of home and the journey, and for nothing else', () => {
    for (const id of REST_PLACES) {
      const art = placeArt(id);
      for (const plane of art.planes) expect(!!restClip(art, plane, 1), `${id} ${plane.id}`).toBe(REST_PLANES.includes(plane.id));
    }
  });

  it('keeps its torn foot under the planes in front of it, so wearing it at rest changes nothing on screen', () => {
    for (const id of REST_PLACES) {
      const art = placeArt(id);
      art.planes.forEach((plane, i) => {
        const d = restClip(art, plane, 7400 + i);
        if (!d) return;
        const nearer = art.planes.slice(i + 1).flatMap((pl) => pl.edges ?? []);
        const foot = pointsOf(d).filter(([, y]) => y > -500);
        let checked = 0;
        for (const [x, y] of foot) {
          const tops = nearer.filter((e) => x >= e[0][0] && x <= e[e.length - 1][0]).map((e) => yAt(e, x));
          if (!tops.length) continue;
          // the torn line wanders, but never up past the margin's last third (nor above the plane's own paper foot)
          expect(y, `${id} ${plane.id} x ${x.toFixed(0)}`).toBeGreaterThanOrEqual(Math.min(Math.min(...tops) + REST_MARGIN / 3, plane.foot));
          checked++;
        }
        expect(checked, `${id} ${plane.id}`).toBeGreaterThan(20);
      });
    }
  });
});

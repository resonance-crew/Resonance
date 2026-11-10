/**
 * legacy — the scene change as it was built first (SPEC §4, script/parallax.ts): the old flats lift off upward, the
 * nearest first and fastest, each a strip of its own paper down to its torn foot; the new flats rise from below, the
 * farthest first, each wearing an apron of its paper so no sky shows under the new ground; the new back flat is
 * seam-locked under the old ground's foot (one hanging scroll rolled up); the backdrop barely moves and crossfades.
 * The held cards lift a little mid-way; the leaving puppets fade before their hill passes the cards; the hero flies as
 * a flat of depth 0.6. Kept exactly, as the default until a designer's style replaces it.
 */
import { HERO_DEPTH, changeMoves, heldLift, outFlat, type PlaneSpec } from '../parallax';
import { smooth, span } from '../timeline';
import type { ChangeFrame, ChangeInfo, ChangeOrder, ChangePlane, ChangeStyle } from './types';

/** The planes in legacy's own unit (the large viewport's height), as parallax.ts reckons them. */
const specOf = (pl: ChangePlane, k: number): PlaneSpec => ({ depth: pl.depth, top: pl.top * k, bottom: pl.backdrop ? 1.16 : pl.foot * k });

export const legacy: ChangeStyle = {
  name: 'legacy',
  strips: 0,

  order(info: ChangeInfo): ChangeOrder {
    return {
      old: info.old.map((pl) => (pl.backdrop ? 1 : 10 + pl.index)),
      new: info.new.map((pl) => (pl.backdrop ? 2 : 30 + pl.index)),
      fringe: { old: 50, new: 60 },
    };
  },

  frame(p: number, info: ChangeInfo): ChangeFrame {
    // stage heights ↔ the large viewport's (legacy's unit)
    const k = info.h / info.lvh;
    const toH = info.lvh / info.h;
    const m = changeMoves(
      p,
      info.old.map((pl) => specOf(pl, k)),
      info.new.map((pl) => specOf(pl, k)),
    );
    // leaving the valley, the bridge goes first (before the pair at the top could see it fly past)
    const bridgeAway = info.n === 3 ? 1 - smooth(span(p, 0, 0.25)) : 1;
    const away = info.n === 1 ? 1 - smooth(span(p, 0.1, 0.28)) : 1 - smooth(span(p, 0, 0.25));
    return {
      old: m.old.map((mv, i) => ({ y: mv.y * toH, alpha: info.old[i].id === 'bridge' ? mv.alpha * bridgeAway : mv.alpha, foot: 'paper' })),
      new: m.new.map((mv) => ({ y: mv.y * toH, alpha: mv.alpha, foot: 'apron' })),
      // the front grass never flies up over the town: the old sinks away and fades first, the new fades in last
      fringe: {
        old: { y: 0.12 * smooth(span(p, 0, 0.2)) * toH, alpha: 1 - smooth(span(p, 0, 0.2)) },
        new: { y: 0, alpha: smooth(span(p, 0.8, 1)) },
      },
      // the card on the wind and the pair lift a little mid-way; the pair at the top fades where it is (c3)
      held: info.n === 3 ? { y: 0, alpha: 1 - smooth(span(p, 0, 0.2)) } : { y: -heldLift(p), alpha: 1 },
      lanterns: { y: 0, alpha: 1 },
      // the leaving puppets are gone before their hill flies up past the cards (摺摺 waves first, in c1)
      actors: { old: { y: 0, alpha: away }, new: { y: 0, alpha: 1 } },
      // the hero flies as a flat of depth 0.6, fading as it rises so its words never cross the header's
      hero: { y: outFlat(HERO_DEPTH, p, 1.1) * toH, alpha: 1 - smooth(span(p, 0.06, 0.34)) },
      hour: p,
      strips: [],
    };
  },
};

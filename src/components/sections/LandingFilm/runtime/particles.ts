/**
 * The screen-space particles in front of the planes (SPEC §3.3): the wind ≋ (three ribbons whose pen streams with the
 * film, 0.42 → 0.85 as they carry the card), five paper birds crossing the journey, nine paper lanterns rising from
 * the town at dusk into the night sky (four of them become today's stories on a wide screen), twelve fireflies from
 * 19:00. Transform and opacity only, written when they change.
 */
import { Y1, type SlotPose } from '../script/beats';
import { easeIntoRoom, type HeldMove } from '../script/changes/types';
import type { Layout } from '../script/layout';
import { SKY_CARDS, ctaSpot, nightHeadsY, skySpot, HEADER_CLEAR } from '../script/marks';
import { SEG, bell, clamp01, easeOut, lerp, smooth, span } from '../script/timeline';

/** Style properties written only when they change — and remembered, so a stopped film can hand the page back as the
 *  server drew it (`clear`). */
export class StyleBook {
  private readonly m = new Map<Element, Map<string, string>>();
  set(el: Element | null, prop: string, v: string) {
    if (!el) return;
    let m = this.m.get(el);
    if (!m) {
      m = new Map();
      this.m.set(el, m);
    }
    if (m.get(prop) === v) return;
    m.set(prop, v);
    (el as HTMLElement | SVGElement).style.setProperty(prop, v);
  }
  /** Forgets one element's cached values (something else wrote its style). */
  forget(el: Element) {
    this.m.delete(el);
  }
  clear() {
    for (const [el, props] of this.m) for (const k of props.keys()) (el as HTMLElement | SVGElement).style.removeProperty(k);
    this.m.clear();
  }
}

export interface ParticleInput {
  s: number;
  L: Layout;
  now: number;
  resting: boolean;
  hour: number;
  /** Chip A's pose this frame (the wind's target), if it is shown. */
  chip: SlotPose | null;
  /** The yours act's time (lanterns turning into sky chips). */
  yoursA: number;
  ctaH: number;
  /** 0 … 1: the end's motion winding down. */
  settle?: number;
  /** In c3, the change's style's hold on the lanterns (offset in stage heights, opacity); else null. */
  lift?: HeldMove | null;
  /** 12 px under the header's pen line (stage px): no lantern is lifted above it. */
  clear?: number;
  /** The moon's disc (stage px) while it is up: the lanterns keep out of it. */
  moon?: { x: number; y: number; r: number } | null;
}

export class Particles {
  private readonly wind: SVGSVGElement | null;
  private readonly ribbons: SVGPathElement[];
  private readonly birds: HTMLElement | null;
  private readonly lanterns: HTMLElement[];
  private readonly fireflies: HTMLElement | null;
  readonly css = new StyleBook();
  private windBox = '';

  constructor(stage: HTMLElement) {
    this.wind = stage.querySelector('[data-wind]');
    this.ribbons = [...stage.querySelectorAll<SVGPathElement>('[data-ribbon]')];
    this.birds = stage.querySelector('[data-birds]');
    this.lanterns = [...stage.querySelectorAll<HTMLElement>('[data-lantern]')];
    this.fireflies = stage.querySelector('[data-fireflies]');
  }

  render(p: ParticleInput) {
    this.renderWind(p);
    this.renderBirds(p);
    this.renderLanterns(p);
    this.css.set(this.fireflies, 'opacity', (smooth((p.hour - 19) / 0.6) * (p.s >= SEG.bridge.t0 ? 1 : 0)).toFixed(3));
  }

  private renderWind({ s, L, now, resting, chip }: ParticleInput) {
    const svg = this.wind;
    if (!svg) return;
    const on = s >= SEG.wind.t0 && s < SEG.catch.t0 + 1.4 && chip;
    const fadeOut = 1 - smooth(span(s, SEG.catch.t0, SEG.catch.t0 + 1.4));
    const enter = smooth(span(s, SEG.wind.t0, SEG.wind.t0 + 0.4 * (SEG.wind.t1 - SEG.wind.t0)));
    const alpha = on ? lerp(0.42, 0.85, smooth(span(s, SEG.wind.t0, SEG.wind.t1))) * fadeOut * Math.max(0.15, enter) : 0;
    this.css.set(svg, 'opacity', alpha.toFixed(3));
    if (!on || !chip) return;
    const box = `0 0 ${Math.round(L.w)} ${Math.round(L.lvh * 0.6)}`;
    if (box !== this.windBox) {
      svg.setAttribute('viewBox', box);
      this.windBox = box;
    }
    // the ≋ streams across the whole screen under the card it carries (the cards are in front of it)
    const head = Math.max(0.05, smooth(span(s, SEG.wind.t0, SEG.wind.t0 + 0.55 * (SEG.wind.t1 - SEG.wind.t0))));
    const y0 = chip.cy + 26;
    this.ribbons.forEach((r, i) => {
      const A: [number, number] = [-80, y0 + 70 + i * 6];
      const C: [number, number] = [L.w + 80, y0 - 40 + i * 4];
      const B: [number, number] = [L.w * 0.42, y0 + 34];
      let d = '';
      const n = 36;
      for (let q = 0; q <= n; q++) {
        const u = (q / n) * head;
        const v = 1 - u;
        const x = v * v * A[0] + 2 * v * u * B[0] + u * u * C[0];
        const y = v * v * A[1] + 2 * v * u * B[1] + u * u * C[1] + (i - 1) * 13 + Math.sin(u * Math.PI * 2 * 2.6 + i * 0.5 + s * 1.3) * 8;
        d += `${q ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      if (r.getAttribute('d') !== d) r.setAttribute('d', d);
      const stream = (s * 0.42 + (resting ? 0 : now * 0.12) + i * 0.13) % 1;
      this.css.set(r, 'stroke-dashoffset', (-stream).toFixed(3));
    });
  }

  private renderBirds({ s, L }: ParticleInput) {
    const el = this.birds;
    if (!el) return;
    const v = span(s, SEG.journey.t0, SEG.journey.t1);
    const k = span(v, 0.2, 0.8);
    const on = s >= SEG.journey.t0 && s < SEG.journey.t1 && k > 0 && k < 1;
    this.css.set(el, 'opacity', on ? (bell(k) * 0.9).toFixed(3) : '0');
    if (!on) return;
    const x = lerp(L.w * 1.05, -L.w * 0.2, k);
    const y = L.lvh * (L.name === 'wide' ? 0.16 : 0.13) + Math.sin(k * Math.PI * 2) * 14;
    // large enough that each reads as a folded paper bird (two creased wings, a tail), not a V of strokes
    const sc = L.name === 'wide' ? 1.7 : 1.3;
    this.css.set(el, 'transform', `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc})`);
  }

  /** The lanterns' places in the night sky: on a wide screen the sky cards' first (and a fourth's), then five around the card. */
  private lanternSlots(L: Layout, ctaH: number): [number, number][] {
    if (L.name === 'wide') {
      const chips = Array.from({ length: SKY_CARDS + 1 }, (_, i): [number, number] => {
        const sp = skySpot(L, i);
        return [sp.cx, sp.cy];
      });
      const more: [number, number][] = [[0.3, 0.13], [0.72, 0.17], [0.94, 0.3], [0.26, 0.6], [0.7, 0.62]].map(([fx, fy]): [number, number] => [fx * L.w, Math.max(HEADER_CLEAR + 10, fy * L.h)]);
      return [...chips, ...more];
    }
    // a tall screen: in the band of sky between the card's foot and the five's heads (the card keeps LANTERN_BAND of it
    // free, marks.ts ctaSpot), two loose rows across — never down among the puppets, whatever the screen's height
    const cta = ctaSpot(L, ctaH);
    const foot = cta.cy + (ctaH * cta.scale) / 2;
    const heads = nightHeadsY(L);
    const bottom = heads - 20;
    const top = Math.min(bottom - 22, Math.max(foot + 16, bottom - 150));
    return [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6].map((fx, i): [number, number] => [fx * L.w, lerp(top, bottom, [0.1, 0.75, 0.55, 0.2, 0.9, 0.35][i % 6])]);
  }

  private renderLanterns({ s, L, now, resting, yoursA, ctaH, settle = 0, lift = null, clear = 0, moon = null }: ParticleInput) {
    if (!this.lanterns.length) return;
    const on = s >= SEG.c3.t0;
    const p = span(s, SEG.c3.t0, SEG.c3.t1);
    const slots = this.lanternSlots(L, ctaH);
    // from the town's roofs — on a short phone, where the town stands behind the five, from over their heads
    const townY = Math.min(L.hz + 80 * L.u, nightHeadsY(L) - 14);
    this.lanterns.forEach((el, i) => {
      if (!on) {
        this.css.set(el, 'opacity', '0');
        return;
      }
      const start = (0.6 * i) / 8;
      const k = easeOut(clamp01((p - start) / (1 - start)));
      const [sx, sy] = slots[i];
      const x0 = lerp(L.w * 0.35, L.w * 0.85, ((i * 37) % 9) / 8);
      let x = lerp(x0, sx, k);
      let y = lerp(townY, sy, k);
      if (!resting && s >= SEG.c3.t1 && settle < 1) {
        const a = 1 - smooth(settle);
        x += 5 * a * Math.sin(now * 0.7 + i * 1.7);
        y += 3 * a * Math.sin(now * 0.9 + i);
      }
      let alpha = smooth(clamp01((p - start) / 0.15));
      // the lanterns at the sky cards' places become those cards (beats `yours`)
      if (L.name === 'wide' && i < SKY_CARDS) alpha *= 1 - smooth(span(yoursA, Y1.sky.from + i * Y1.sky.step, Y1.sky.from + i * Y1.sky.step + Y1.sky.dur));
      const sc = L.name === 'wide' ? 1.15 : 0.9;
      if (lift) {
        // the style's hold, eased into the room under the header (the paper's top is 8 px over its centre)
        y += easeIntoRoom(lift.y * L.h, y - 8 * sc - clear);
        alpha *= clamp01(lift.alpha);
      }
      // never across the moon's face: a lantern its path would take over the disc goes round it, by its glow's width
      if (moon) {
        const room = moon.r + 22 * sc;
        const dx = x - moon.x;
        const dy = y - moon.y;
        const d = Math.hypot(dx, dy);
        if (d < room) {
          const ux = d > 1e-3 ? dx / d : -1;
          const uy = d > 1e-3 ? dy / d : 0;
          x = moon.x + ux * room;
          y = moon.y + uy * room;
        }
      }
      this.css.set(el, 'opacity', alpha.toFixed(3));
      this.css.set(el, 'transform', `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc})`);
    });
  }
}

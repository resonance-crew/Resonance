// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/../test/render';
import type { FilmModel, FilmTile } from '../model';
import { hourOf } from '../script/changes/flats';
import type { ChangeN } from '../script/changes/types';
import { LIGHT_VAR, lightAt } from '../script/light';
/** The paints a plane's pair holds: every paint but the light's. */
const isTwoPaint = (k: string) => !LIGHT_VAR.test(k);
import { hourAt, paletteAt } from '../script/palette';
import { SEG, changeAt, lerp, segmentAtS } from '../script/timeline';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }));
// Film.tsx starts the runtime after hydration: these tests make the director themselves
vi.mock('./index', () => ({ loadChangeStyle: () => Promise.resolve(undefined), startFilm: () => () => {} }));
vi.mock('@/components/sections/SiteHeader/SiteHeaderAccount', () => ({ SiteHeaderAccountMenu: () => null, SiteHeaderSignedInNav: () => null }));

// jsdom measures nothing: the director's measures read zeros (a Range's box included)
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;

import Page from '../Page';
import { Director } from './director';

/**
 * §A (round 25): the director draws the light from script/light.ts — the planes' paper in two paints, only the upper
 * one's opacity moving per frame, a paint rewritten only while it is hidden; the stills whole; destroy() leaves the
 * server's stage as it was.
 */

const tile = (id: string): FilmTile => ({ id, href: `/card/${id}`, title: `Story ${id}`, excerpt: 'words', author: { name: id, initials: 'P' }, tags: [], minutes: 3, family: 1, script: 'latin' });
const MODEL: FilmModel = { a: tile('a'), b: tile('b'), relation: 'kin', sky: [tile('s1'), tile('s2'), tile('s3')], picks: [tile('p1'), tile('p2')] };

let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
});

function film() {
  const { container, unmount } = renderWithIntl(<Page model={MODEL} locale="en" />);
  const root = container.querySelector<HTMLElement>('[data-film-root]')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const before = stage.innerHTML;
  const d = new Director(root, stage, null, () => {});
  d.measure();
  destroy = () => {
    d.destroy();
    unmount();
  };
  const frame = (s: number, now: number, resting = false) =>
    d.render({ st: { s, sTarget: s, owner: segmentAtS(s), x: s - segmentAtS(s).t0, acting: true }, acts: new Map(), now, resting, dim: false, ySvh: 0, released: false });
  return { d, root, stage, before, frame, unmount };
}

/** The pairs as drawn: each plane's (or the sky's) own paints and its copy's, and the copy's opacity. */
function pairs(stage: HTMLElement) {
  const out: { base: HTMLElement | SVGElement; over: HTMLElement | SVGElement }[] = [];
  for (const over of stage.querySelectorAll<SVGElement>('[data-plane] > svg[data-paper-next]')) out.push({ base: over.parentElement!, over });
  const sky = stage.querySelector<HTMLElement>('[data-sky]');
  const next = stage.querySelector<HTMLElement>('[data-sky-next]');
  if (sky && next) out.push({ base: sky, over: next });
  const clouds = stage.querySelector<HTMLElement>('[data-clouds]');
  const cnext = stage.querySelector<HTMLElement>('[data-clouds-next]');
  if (clouds && cnext) out.push({ base: clouds, over: cnext });
  return out;
}
const paintsOf = (el: Element) => {
  const st = (el as HTMLElement).style;
  const o: Record<string, string> = {};
  // (the paints a pair holds: not the light's that step on the sky, nor the glow's place)
  for (let i = 0; i < st.length; i++) if (st[i].startsWith('--film-') && !st[i].startsWith('--film-glow') && isTwoPaint(st[i])) o[st[i]] = st.getPropertyValue(st[i]);
  return JSON.stringify(o);
};
const opacityOf = (el: Element) => Number((el as HTMLElement).style.opacity || '0');
/** The hour the director draws at s (its default change style). */
const hourDrawn = (s: number) => {
  const ch = changeAt(s);
  return hourAt(ch ? lerp(ch.seg.t0, ch.seg.t1, hourOf(ch.from as ChangeN, ch.p)) : s);
};

describe('the film’s light as the director draws it', () => {
  it('gives every plane (and the sky, and the clouds) its art again, the copy hidden at rest, the exact hour whole', () => {
    const { stage, frame } = film();
    const s = 50;
    frame(s, 1, true);
    const ps = pairs(stage);
    expect(ps.length).toBeGreaterThan(10);
    const want = paletteAt(hourAt(s));
    for (const { base, over } of ps) {
      if (over.closest('[data-set]') && !over.closest('[data-set][data-live]')) continue;
      expect(opacityOf(over)).toBe(0);
      const st = (base as HTMLElement).style;
      for (let i = 0; i < st.length; i++) {
        const k = st[i];
        if (k.startsWith('--film-') && isTwoPaint(k) && want[k]) expect(st.getPropertyValue(k), k).toBe(want[k]);
      }
    }
  });

  it('while it plays moves only the copies’ opacity, rewriting a paint only while it is hidden', () => {
    const { stage, frame } = film();
    // through the dusk and the change into the night (the hour fastest in c3)
    let prev: { base: string; over: string; o: number; live: boolean }[] | null = null;
    let rewrites = 0;
    let fades = 0;
    for (let i = 0, s = SEG.meet.t1 - 2; s < SEG.c3.t1; i++, s += 1 / 60) {
      frame(s, 1 + i / 60);
      // (a set off stage is written whole at once: nothing of it is painted)
      const now = pairs(stage).map(({ base, over }) => ({ base: paintsOf(base), over: paintsOf(over), o: opacityOf(over), live: !over.closest('[data-set]') || !!over.closest('[data-set][data-live]') }));
      if (prev && i > 2) {
        now.forEach((p, j) => {
          const q = prev![j];
          if (!p.live || !q.live) return;
          if (p.over !== q.over) {
            rewrites++;
            expect(p.o, `pair ${j} at s ${s.toFixed(3)}: its copy rewritten while it shows`).toBe(0);
          }
          if (p.base !== q.base) {
            rewrites++;
            expect(p.o, `pair ${j} at s ${s.toFixed(3)}: its own paint rewritten while it shows`).toBe(1);
          }
          if (p.o !== q.o && p.o > 0 && p.o < 1) fades++;
        });
      }
      prev = now;
    }
    expect(rewrites).toBeGreaterThan(0);
    expect(fades).toBeGreaterThan(100);
  });

  it('shows the hour the measure says: each live pair at the two keys and their mix', () => {
    const { stage, frame } = film();
    let s = SEG.bridge.t0 + 1;
    for (let i = 0; i < 90; i++, s += 1 / 60) frame(s, 1 + i / 60);
    const at = lightAt(hourDrawn(s - 1 / 60));
    const lo = paletteAt(at.paper.lo);
    const hi = paletteAt(at.paper.hi);
    let seen = 0;
    for (const { base, over } of pairs(stage)) {
      if (over.closest('[data-set]') && !over.closest('[data-set][data-live]')) continue;
      const b = (base as HTMLElement).style.getPropertyValue('--film-c-ground') || (base as HTMLElement).style.getPropertyValue('--film-sky-0');
      const o = (over as HTMLElement).style.getPropertyValue('--film-c-ground') || (over as HTMLElement).style.getPropertyValue('--film-sky-0');
      const k = (base as HTMLElement).style.getPropertyValue('--film-c-ground') ? '--film-c-ground' : '--film-sky-0';
      if (!b) continue;
      // either the lower key under the upper at the mix, or the two swapped (the copy holds the lower at 1 − mix)
      const straight = b === lo[k] && o === hi[k] && Math.abs(opacityOf(over) - at.paper.mix) < 0.002;
      const swapped = b === hi[k] && o === lo[k] && Math.abs(opacityOf(over) - (1 - at.paper.mix)) < 0.002;
      expect(straight || swapped, `${k}: ${b} / ${o} at ${opacityOf(over)} (mix ${at.paper.mix})`).toBe(true);
      seen++;
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('settles on the exact hour, whole, once the film is held still a moment (paused)', () => {
    const { stage, frame } = film();
    let s = SEG.meet.t0 + 2;
    let now = 1;
    for (let i = 0; i < 30; i++, s += 1 / 60, now += 1 / 60) frame(s, now);
    s -= 1 / 60;
    for (let i = 0; i < 30; i++, now += 1 / 60) frame(s, now);
    const want = paletteAt(hourDrawn(s));
    for (const { base, over } of pairs(stage)) {
      if (over.closest('[data-set]') && !over.closest('[data-set][data-live]')) continue;
      expect(opacityOf(over)).toBe(0);
      const v = (base as HTMLElement).style.getPropertyValue('--film-c-ground');
      if (v) expect(v).toBe(want['--film-c-ground']);
    }
  });

  it('destroy() leaves the stage as the server drew it', () => {
    const { stage, frame, d, before, unmount } = film();
    for (let i = 0; i < 20; i++) frame(SEG.c2.t0 + i / 60, 1 + i / 60);
    expect(stage.querySelectorAll('[data-paper-next]').length).toBeGreaterThan(0);
    d.destroy();
    for (const q of ['[data-paper-next]', '[data-sky-next]', '[data-sky-glow]', '[data-clouds-next]', '[data-split]']) expect(stage.querySelector(q), q).toBeNull();
    for (const el of stage.querySelectorAll<HTMLElement>('[data-plane], [data-sky], [data-clouds]')) {
      for (let i = 0; i < el.style.length; i++) expect(el.style[i].startsWith('--film-c-') || el.style[i].startsWith('--film-sky-'), el.style[i]).toBe(false);
    }
    // (the fringes' second <use>s too: the stage's markup is the server's again, but for what the film's own frames moved)
    expect(stage.querySelectorAll('use').length).toBe(new DOMParser().parseFromString(`<div>${before}</div>`, 'text/html').querySelectorAll('use').length);
    destroy = unmount;
  });
});

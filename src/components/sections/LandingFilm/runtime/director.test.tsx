// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/../test/render';
import type { FilmModel, FilmTile } from '../model';
import { hourOf } from '../script/changes/flats';
import type { ChangeN } from '../script/changes/types';
import { FOLD_SEAM, LIGHT_VAR, flatKey, MAIN_STEP_AT_REST, MAIN_STEP_IN_CHANGE, deltaE, oklabOfSrgb, parseOklch, restAt } from '../script/light';
import { hourAt, paletteAt, srgb, type LCH } from '../script/palette';
import { FILM_END, SEG, changeAt, lerp, segmentAtS } from '../script/timeline';
/** The paints a plane's pair holds: every paint but the light's. */
const isTwoPaint = (k: string) => !LIGHT_VAR.test(k);

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
 * §A (round 25): the director draws the planes' paper from script/light.ts. While a scene is at rest each live plane
 * shows its pair — only the copy's opacity moving per frame, a paint rewritten only while it is hidden; through a
 * scene change it is drawn as main draws it, no copy displayed; the seams between bounded; the stills whole;
 * destroy() leaves the server's stage as it was.
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

/** The planes' pairs: each plane's own paints and its copy's. */
function pairs(stage: HTMLElement) {
  return [...stage.querySelectorAll<SVGElement>('[data-plane] > svg[data-paper-next]')].map((over) => ({ base: over.parentElement!, over }));
}
const paintsOf = (el: Element) => {
  const st = (el as HTMLElement).style;
  const o: Record<string, string> = {};
  for (let i = 0; i < st.length; i++) if (st[i].startsWith('--film-c-') && isTwoPaint(st[i])) o[st[i]] = st.getPropertyValue(st[i]);
  return JSON.stringify(o);
};
const opacityOf = (el: Element) => Number((el as HTMLElement).style.opacity || '0');
const shows = (over: Element) => !over.hasAttribute('data-off');
const liveOf = (el: Element) => !!el.closest('[data-set][data-live]');
/** The hour the director draws at s (its default change style). */
const hourDrawn = (s: number) => {
  const ch = changeAt(s);
  return hourAt(ch ? lerp(ch.seg.t0, ch.seg.t1, hourOf(ch.from as ChangeN, ch.p)) : s);
};
const lab = (v: string) => oklabOfSrgb(srgb(parseOklch(v)));
/** What a plane shows of one paint: its own, or its copy over it at the copy's opacity (composited in sRGB). */
function shown(base: Element, over: Element, k: string): LCH | null {
  const b = (base as HTMLElement).style.getPropertyValue(k);
  if (!b) return null;
  if (!shows(over)) return lab(b);
  const o = (over as HTMLElement).style.getPropertyValue(k) || b;
  const m = opacityOf(over);
  const x = srgb(parseOklch(b));
  const y = srgb(parseOklch(o));
  return oklabOfSrgb(x.map((v, i) => v + (y[i] - v) * m) as LCH);
}

describe('the film’s paper as the director draws it', () => {
  it('in the stills (?rest=1) shows no copy at all, every plane whole at main’s key, as main draws them', () => {
    const { stage, frame } = film();
    for (const s of [0, 11.5, 27, 50, 63]) {
      frame(s, s + 1, true);
      const want = paletteAt(flatKey(hourAt(s), !!changeAt(s)));
      expect(stage.querySelectorAll('[data-paper-next]:not([data-off])').length).toBe(0);
      for (const { base, over } of pairs(stage)) {
        if (!liveOf(over)) continue;
        const st = (base as HTMLElement).style;
        for (let i = 0; i < st.length; i++) if (st[i].startsWith('--film-c-') && isTwoPaint(st[i]) && want[st[i]]) expect(st.getPropertyValue(st[i]), st[i]).toBe(want[st[i]]);
      }
    }
  });

  // one run over the whole film at 60 fps, kept for the checks below
  const run = (() => {
    const out = {
      shownInChange: 0,
      shownAtRest: 0,
      fades: 0,
      hiddenRewrites: 0,
      badRewrites: [] as string[],
      rest: { d: 0, at: '' },
      flat: { d: 0, at: '' },
      change: { d: 0, at: '' },
      fold: { d: 0, at: '' },
      unfold: { d: 0, at: '' },
    };
    return () => {
      const { stage, frame } = film();
      let prev: { base: string; over: string; o: number; on: boolean; live: boolean; c: (LCH | null)[] }[] | null = null;
      const keys = (base: Element) => [`--film-c-${base.getAttribute('data-plane')}`, '--film-c-canopy', '--film-c-tree'];
      const keep = (w: { d: number; at: string }, d: number, at: string) => {
        if (d > w.d) Object.assign(w, { d, at });
      };
      for (let i = 0; i <= Math.ceil(FILM_END * 60); i++) {
        const s = Math.min(FILM_END, i / 60);
        frame(s, 1 + i / 60);
        const ps = pairs(stage);
        const shownNow = ps.filter(({ over }) => shows(over)).length;
        if (changeAt(s)) out.shownInChange += shownNow;
        else out.shownAtRest += shownNow;
        const now = ps.map(({ base, over }) => ({ base: paintsOf(base), over: paintsOf(over), o: opacityOf(over), on: shows(over), live: liveOf(over), c: keys(base).map((k) => shown(base, over, k)) }));
        if (prev && i > 3) {
          now.forEach((p, j) => {
            const q = prev![j];
            if (!p.live || !q.live) return;
            const at = `plane ${j} (${ps[j].base.getAttribute('data-plane')}) at s ${s.toFixed(3)}`;
            if (p.on && q.on) {
              if (p.over !== q.over) {
                out.hiddenRewrites++;
                if (p.o !== 0) out.badRewrites.push(`${at}: its copy rewritten while it shows`);
              }
              if (p.base !== q.base) {
                out.hiddenRewrites++;
                if (p.o !== 1) out.badRewrites.push(`${at}: its own paint rewritten while it shows`);
              }
              if (p.o !== q.o && p.o > 0 && p.o < 1) out.fades++;
            }
            let d = 0;
            p.c.forEach((c, n) => {
              const w = q.c[n];
              if (c && w) d = Math.max(d, deltaE(c, w));
            });
            if (p.on && q.on) keep(out.rest, d, at);
            else if (q.on && !p.on) keep(out.fold, d, at);
            else if (!q.on && p.on) keep(out.unfold, d, at);
            else if (changeAt(s) || changeAt(s - 1 / 60)) keep(out.change, d, at);
            else keep(out.flat, d, at);
          });
        }
        prev = now;
      }
      return out;
    };
  })();

  let r: ReturnType<typeof run>;
  beforeAll(() => {
    r = run();
  }, 180_000);

  it('through a scene change displays no copy at all; while a scene is at rest the planes show their pairs', () => {
    expect(r.shownInChange).toBe(0);
    expect(r.shownAtRest).toBeGreaterThan(1000);
    expect(r.fades).toBeGreaterThan(1000);
  });

  it('while a scene is at rest rewrites a paint only while it is hidden', () => {
    expect(r.hiddenRewrites).toBeGreaterThan(50);
    expect(r.badRewrites.slice(0, 5)).toEqual([]);
  });

  it('never steps a plane at rest, and elsewhere never more than main does there', () => {
    // at rest: the hour's own motion (the exact paints move ≤ 0.004 a frame outside the changes), never a step
    expect(r.rest.d, r.rest.at).toBeLessThan(0.006);
    // around a change, the planes drawn as main draws them: a twelfth's step, and a quarter's in the change
    expect(r.flat.d, r.flat.at).toBeLessThanOrEqual(MAIN_STEP_AT_REST);
    expect(r.change.d, r.change.at).toBeLessThanOrEqual(MAIN_STEP_IN_CHANGE);
  });

  it('crosses the seams without a jump: folding out of rest ≤ the fold’s bound, unfolding into it ≤ main’s own step there', () => {
    console.log(JSON.stringify({ rest: r.rest, flat: r.flat, change: r.change, fold: r.fold, unfold: r.unfold }));
    expect(r.fold.d, r.fold.at).toBeLessThanOrEqual(FOLD_SEAM);
    expect(r.unfold.d, r.unfold.at).toBeLessThanOrEqual(MAIN_STEP_AT_REST);
  });

  it('settles on the exact hour, whole, once the film is held still a moment (paused)', () => {
    const { stage, frame } = film();
    let s = SEG.meet.t0 + 3;
    let now = 1;
    for (let i = 0; i < 90; i++, s += 1 / 60, now += 1 / 60) frame(s, now);
    s -= 1 / 60;
    for (let i = 0; i < 30; i++, now += 1 / 60) frame(s, now);
    const want = paletteAt(hourDrawn(s));
    let seen = 0;
    for (const { base, over } of pairs(stage)) {
      if (!liveOf(over)) continue;
      expect(opacityOf(over)).toBe(0);
      const v = (base as HTMLElement).style.getPropertyValue('--film-c-ground');
      if (v) {
        expect(v).toBe(want['--film-c-ground']);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(restAt(s)).toBe(true);
  });

  it('destroy() leaves the stage as the server drew it', () => {
    const { stage, frame, d, before, unmount } = film();
    for (let i = 0; i < 20; i++) frame(SEG.c2.t0 + i / 60, 1 + i / 60);
    expect(stage.querySelectorAll('[data-paper-next]').length).toBeGreaterThan(0);
    d.destroy();
    expect(stage.querySelector('[data-paper-next]')).toBeNull();
    for (const el of stage.querySelectorAll<HTMLElement>('[data-plane]')) {
      for (let i = 0; i < el.style.length; i++) expect(el.style[i].startsWith('--film-c-'), el.style[i]).toBe(false);
    }
    // (the fringes' second <use>s too)
    expect(stage.querySelectorAll('use').length).toBe(new DOMParser().parseFromString(`<div>${before}</div>`, 'text/html').querySelectorAll('use').length);
    destroy = unmount;
  });
});

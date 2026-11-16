// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/../test/render';
import type { FilmModel } from '../model';
import { SAND_TILE, pictureSrc } from './sand';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/lab/landing/film',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }));
// the film's runtime stays out of it (Film.tsx would start it after hydration): only the page's paper is read here
vi.mock('../runtime', () => ({ loadChangeStyle: () => Promise.resolve(undefined), startFilm: () => () => {} }));
vi.mock('@/components/sections/SiteHeader/SiteHeaderAccount', () => ({ SiteHeaderAccountMenu: () => null, SiteHeaderSignedInNav: () => null }));

import Page from '../Page';
import { islandRegistry } from '../islands';

const MODEL: FilmModel = { a: null, b: null, relation: 'drawn', sky: [], picks: [] } as unknown as FilmModel;

describe("the paper's sand", () => {
  it('reads a picture import either way a bundler gives it', () => {
    expect(pictureSrc('/a.png')).toBe('/a.png');
    expect(pictureSrc({ src: '/b.png' })).toBe('/b.png');
    expect(SAND_TILE).toBeGreaterThan(40);
  });

  it("lays the sand on each plane's paper once — its papers' one outline, over the art — and on nothing that is no paper", () => {
    const { container } = renderWithIntl(<Page model={MODEL} locale="en" />);
    // on as the film is drawn (film.module.css: the lightest strength); the lab's `?sand=0|2` is the mode script's
    expect(container.querySelector('[data-film-root]')!.hasAttribute('data-sand')).toBe(false);
    expect(container.querySelector('[data-sky] svg rect')?.getAttribute('fill')).toBe('url(#film-sand)');
    const defs = islandRegistry()['film-world-defs'];
    expect(defs).toMatch(new RegExp(`<pattern id="film-sand" width="${SAND_TILE}" height="${SAND_TILE}" patternUnits="userSpaceOnUse"><image [^>]*sand-dark[^>]*/?><image [^>]*sand-light[^>]*/?></pattern>`));
    // (its strength is the fill's own opacity: an `opacity` has WebKit paint the whole sheet aside first)
    expect(defs).toContain('.fk-sand{fill:url(#film-sand);fill-opacity:var(--film-sand,0);visibility:var(--film-sand-show,hidden)}');
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${defs}</svg>`, 'image/svg+xml');
    const PAPER = /(^| )ff-(range|swell-b|peaks|swell-d|sea|headland|town|hills|near|ground|bridge|bridge-wall|roof|tree|canopy|trail)( |$)/;
    const groups = [...doc.querySelectorAll('g[id^="film-"]')].filter((g) => !g.id.endsWith('-sand') && !g.id.startsWith('film-fringe'));
    expect(groups.length).toBeGreaterThan(15);
    const moves = (d: string) => (d.match(/[Mm]/g) ?? []).length;
    for (const g of groups) {
      // the art's own group carries no sand: the plane's is one fill, in a group of its own
      expect(g.querySelector('.fk-sand, [fill*="film-sand"]'), g.id).toBeNull();
      // its sand: one path right after it, as many cuts as its papers have between them, and none of a detail's
      const sand = g.nextElementSibling!;
      expect(sand.id, g.id).toBe(`${g.id}-sand`);
      expect(sand.children, g.id).toHaveLength(1);
      const sheet = sand.children[0];
      expect(sheet.tagName).toBe('path');
      expect(sheet.getAttribute('class')).toBe('fk-sand');
      const papers = [...g.children].filter((el) => PAPER.test(el.getAttribute('class') ?? ''));
      expect(papers.length, g.id).toBeGreaterThan(0);
      expect(moves(sheet.getAttribute('d')!), g.id).toBe(papers.reduce((n, el) => n + moves(el.getAttribute('d')!), 0));
    }
    // the lights, the lines, the flowers and the mist are no paper: in the art, in no sheet of sand
    for (const cls of ['ff-lit', 'fs-swell-line', 'fs-sea-line', 'ff-mist', 'ff-flower']) expect(doc.querySelector(`.${cls}`)!.parentElement!.id, cls).not.toMatch(/-sand$/);
    // every plane on the stage draws its group's sand over its art, in the art's own picture — one layer a plane, as
    // before — cut with it through a change; its haze (the paper paling into the sky) draws none
    const planes = [...container.querySelectorAll<HTMLElement>('[data-plane]')];
    expect(planes.length).toBeGreaterThan(20);
    for (const plane of planes) {
      const art = plane.querySelector(':scope > svg:not([data-haze]):not([data-reflect])')!;
      const uses = [...art.querySelectorAll(':scope > use')];
      const drawn = uses.filter((u) => !u.getAttribute('href')!.endsWith('-sand'));
      const sanded = uses.filter((u) => u.getAttribute('href')!.endsWith('-sand'));
      expect(drawn.length, plane.dataset.plane).toBeGreaterThan(0);
      // the art first, then its sand
      expect(uses, plane.dataset.plane).toEqual([...drawn, ...sanded]);
      expect(sanded.map((u) => u.getAttribute('href'))).toEqual(drawn.map((u) => `${u.getAttribute('href')}-sand`));
      expect(sanded.map((u) => [u.getAttribute('class'), u.getAttribute('data-cut'), u.getAttribute('data-rest')])).toEqual(drawn.map((u) => [u.getAttribute('class'), u.getAttribute('data-cut'), u.getAttribute('data-rest')]));
      for (const u of sanded) expect(doc.querySelector(u.getAttribute('href')!), u.getAttribute('href')!).not.toBeNull();
      const haze = plane.querySelector(':scope > svg[data-haze]');
      if (haze) expect([...haze.querySelectorAll('use')].map((u) => u.getAttribute('href'))).toEqual(drawn.map((u) => u.getAttribute('href')));
      // (no sheet of its own for the sand: a layer the plane's size over every plane is slower than the fill it saves)
      expect(plane.querySelectorAll(':scope > svg:not([data-haze]):not([data-reflect])')).toHaveLength(1);
    }
  });

  it("gives no shape of the world an `opacity` of its own: a fill's or a stroke's, which paints in one go", () => {
    renderWithIntl(<Page model={MODEL} locale="en" />);
    for (const look of ['film-world-defs', 'film-world-defs-peaks']) {
      const defs = islandRegistry()[look];
      if (!defs) continue;
      // (WebKit paints a shape with an `opacity` into a sheet of its own and lays that down, at every repaint of its
      // plane; one fill or one stroke at its own opacity looks the same)
      expect(defs.match(/(?<![-\w])opacity:[^;}"]*/g) ?? [], look).toEqual([]);
      expect(defs).toMatch(/fill-opacity:var\(--film-win-0\)/);
      expect(defs).toMatch(/\.fs-sea-line\{[^}]*stroke-opacity:\.45\}/);
    }
  });
});

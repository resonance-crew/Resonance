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

  it('lays the sand on each paper once — cut once, painted, then sanded — and on nothing that is no paper', () => {
    const { container } = renderWithIntl(<Page model={MODEL} locale="en" />);
    // on as the film is drawn (film.module.css: the lightest strength); the lab's `?sand=0|2` is the mode script's
    expect(container.querySelector('[data-film-root]')!.hasAttribute('data-sand')).toBe(false);
    expect(container.querySelector('[data-sky] svg rect')?.getAttribute('fill')).toBe('url(#film-sand)');
    const defs = islandRegistry()['film-world-defs'];
    expect(defs).toMatch(new RegExp(`<pattern id="film-sand" width="${SAND_TILE}" height="${SAND_TILE}" patternUnits="userSpaceOnUse"><image [^>]*sand-dark[^>]*/?><image [^>]*sand-light[^>]*/?></pattern>`));
    expect(defs).toContain('.fk-sand{fill:url(#film-sand);opacity:var(--film-sand,0);visibility:var(--film-sand-show,hidden)}');
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${defs}</svg>`, 'image/svg+xml');
    const sanded = [...doc.querySelectorAll('use.fk-sand')];
    expect(sanded.length).toBeGreaterThan(40);
    for (const use of sanded) {
      // right after the same paper's painted drawing, both of one unpainted cut
      const paint = use.previousElementSibling!;
      expect(paint.tagName).toBe('use');
      expect(paint.getAttribute('href')).toBe(use.getAttribute('href'));
      expect(paint.getAttribute('class')).toMatch(/(^| )ff-(range|swell-b|peaks|swell-d|sea|headland|town|hills|near|ground|bridge|bridge-wall|roof|tree|canopy|trail)( |$)/);
      const cut = doc.querySelector(use.getAttribute('href')!)!;
      expect(cut.tagName).toBe('path');
      expect(cut.hasAttribute('class')).toBe(false);
    }
    // the lights, the lines, the flowers and the mist are no paper: plain paths, never sanded
    for (const cls of ['ff-lit', 'fs-swell-line', 'fs-sea-line', 'ff-mist', 'ff-flower']) {
      const el = doc.querySelector(`.${cls}`)!;
      expect(el.tagName, cls).toBe('path');
      expect(el.nextElementSibling?.getAttribute('class') ?? '', cls).not.toBe('fk-sand');
    }
    // and every paper is: no painted paper is left a plain path
    expect(doc.querySelectorAll('path.ff-range, path.ff-hills, path.ff-ground, path.ff-sea, path.ff-town, path.ff-near')).toHaveLength(0);
  });
});

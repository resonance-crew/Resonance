/**
 * How the visitor came to the film, for the way back from a card page (SPEC §7.5): a back/forward navigation of the
 * document, or — the site is a single-page app — a popstate the router turned into a client-side render of this page.
 * Film.tsx imports this module statically, so its listener is there before the router's render of the way back.
 * And which scene a URL hash names.
 */
import { SCENES, type Scene } from '../script/timeline';

let lastPop = -Infinity;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (lastPop = performance.now()));

/** Whether this mount is the way back: a back/forward load, or a popstate in the last few seconds. */
export function cameBack(navType: string | undefined, now = performance.now()): boolean {
  return navType === 'back_forward' || now - lastPop < 4000;
}

/** The scene a hash (`#answer`…) names, if any. */
export function sceneOfHash(hash: string): Scene | null {
  const h = hash.replace(/^#/, '');
  return SCENES.find((sc) => sc.hash === h) ?? null;
}

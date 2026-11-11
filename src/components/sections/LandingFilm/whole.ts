/**
 * A still made of part images shows whole or not at all (film.module.css hides every `[data-pal]` until it is marked
 * `data-whole`): on a cold load the parts arrive one by one, and a puppet must never stand there as a mitten and two
 * feet. `watchStills` marks each still once every part it draws is loaded and decoded; a part that fails keeps the
 * still unseen. It runs as an inline script right after the film's HTML (Page.tsx), before hydration, so the first
 * screen's puppets show as soon as their parts are in; and again from Film.tsx for a page the router drew (whose inline
 * scripts never run). A part the page's theme never draws (`data-only`, display: none) isn't waited for: it would
 * never load when lazy. A lazy still loads as one: its first part in asks for all the others.
 *
 * Plain JavaScript in the browser: the function is also sent as source (`WATCH_STILLS_SCRIPT`), so it is
 * self-contained and uses nothing it doesn't define.
 */
export function watchStills(scope: ParentNode): void {
  const pals = scope.querySelectorAll<HTMLElement>('[data-pal]:not([data-whole])');
  for (let i = 0; i < pals.length; i++) {
    const pal = pals[i] as HTMLElement & { __whole?: boolean };
    if (pal.__whole) continue;
    pal.__whole = true;
    const imgs = pal.querySelectorAll('img');
    const parts: HTMLImageElement[] = [];
    for (let j = 0; j < imgs.length; j++) {
      const im = imgs[j];
      if (im.hasAttribute('data-only') && getComputedStyle(im).display === 'none') continue;
      parts.push(im);
    }
    let left = parts.length;
    let failed = false;
    const one = (ok: boolean) => {
      if (!ok) failed = true;
      left--;
      if (left === 0 && !failed) pal.setAttribute('data-whole', '');
    };
    if (!left) pal.setAttribute('data-whole', '');
    // a lazy still loads all of a piece: once one part is in (the still is near the view), the rest are asked for at
    // once — a part the view never quite reaches (an arm clipped by its frame) would otherwise never come
    // (only once the page has hydrated: React drew `loading`, and a change before it looks would be a mismatch —
    // Film.tsx runs what waited)
    const all = () => {
      const eager = () => {
        for (let k = 0; k < parts.length; k++) if (parts[k].loading === 'lazy') parts[k].loading = 'eager';
      };
      const w = window as Window & { __filmHydrated?: boolean; __filmEager?: (() => void)[] };
      if (w.__filmHydrated) eager();
      else (w.__filmEager = w.__filmEager || []).push(eager);
    };
    parts.forEach((im) => {
      const decoded = () => {
        all();
        if (typeof im.decode !== 'function') return one(true);
        im.decode().then(
          () => one(true),
          () => one(im.naturalWidth > 0),
        );
      };
      // in already (a lazy part not yet asked for, or one that failed before this ran, waits: unseen is the safe side)
      if (im.complete && im.naturalWidth > 0) decoded();
      else {
        im.addEventListener('load', decoded, { once: true });
        im.addEventListener('error', () => one(false), { once: true });
      }
    });
  }
}

/** The same, as an inline script: it watches the stills of the element it is placed in. */
export const WATCH_STILLS_SCRIPT = `(function(){try{(${watchStills.toString()})(document.currentScript.parentElement)}catch(e){}})();`;

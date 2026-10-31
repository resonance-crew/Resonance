/**
 * A picture the browser tried and gave up on — for an <img> whose error fired before React
 * hydrated it, and so went unheard. A lazy one not yet asked for isn't `complete`; jsdom asks
 * for none (no `currentSrc`), so tests see pictures as on their way, never broken.
 */
export function brokenImage(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth === 0 && !!img.currentSrc;
}

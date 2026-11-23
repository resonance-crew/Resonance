/**
 * Blur-to-sharp (Wave 2 #7): a picture that arrives after its box is already on screen comes in from a soft blur
 * and a fade; one the browser already had (in memory, or back within REVEAL_INSTANT_MS) simply shows, never
 * blurred, never flashing. The skeleton or colour behind it stays as it is — this is only how the picture lands.
 *
 * Strengths (the same on iOS and Android): covers and chat pictures 10 px over 320 ms, small thumbnails 4 px over
 * 240 ms, avatars 3 px over 200 ms; the full-screen viewer and the thought map's SVG covers only fade (a filter
 * inside the map's moving SVG would be drawn again on every move).
 *
 * Off under reduced motion (and so in the visual captures, which run with it); under Save-Data — the web's
 * nearest thing to battery saver — only the fade (the owner: in battery saver keep the fade only). At most
 * MAX_BLURS pictures blur at once — a feed's covers landing together fade beyond that, so a burst never costs
 * more than six filters a frame. Nothing stays on the element afterwards: the attribute and its custom
 * properties go when the animation ends (globals.css `[data-reveal]`).
 */

export type RevealKind = 'cover' | 'thumb' | 'avatar' | 'fade';
export type RevealPlay = 'none' | 'fade' | 'blur';

export const REVEAL: Record<RevealKind, { blur: number; ms: number }> = {
  cover: { blur: 10, ms: 320 },
  thumb: { blur: 4, ms: 240 },
  avatar: { blur: 3, ms: 200 },
  fade: { blur: 0, ms: 240 },
};

/** Pictures blurring at once; beyond this a landing picture only fades. */
export const MAX_BLURS = 6;
/** A load heard this soon after the element was attached came from a cache: it shows at once. */
export const REVEAL_INSTANT_MS = 50;

export interface RevealInput {
  kind: RevealKind;
  /** The picture was already decoded when its element was attached (`img.complete`), or came back that fast. */
  instant: boolean;
  reducedMotion: boolean;
  /** Save-Data (the web's battery saver): the fade only. */
  saveData: boolean;
  /** Pictures blurring right now. */
  blurring: number;
}

/** Whether a landing picture plays, and how — the one rule the three platforms share. */
export function decideReveal({ kind, instant, reducedMotion, saveData, blurring }: RevealInput): RevealPlay {
  if (instant || reducedMotion) return 'none';
  if (kind === 'fade' || saveData || blurring >= MAX_BLURS) return 'fade';
  return 'blur';
}

let blurring = 0;
/** For tests: how many pictures are blurring now. */
export function blurringNow(): number {
  return blurring;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function savesData(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

/** A picture element that has its pixels already (an <img> the browser had; an SVG <image> can't tell). */
function alreadyDecoded(el: Element): boolean {
  return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0;
}

/**
 * Plays the reveal on `el` now (its picture just loaded) and returns how long it runs (0: it doesn't).
 * The attribute and the custom properties are removed when it ends — or a little after its length, should the
 * animation never run (a hidden tab, a stylesheet not yet in).
 */
export function playReveal(el: HTMLElement | SVGElement, kind: RevealKind, instant: boolean): number {
  const play = decideReveal({ kind, instant, reducedMotion: prefersReducedMotion(), saveData: savesData(), blurring });
  if (play === 'none') return 0;
  const { blur, ms } = REVEAL[kind];
  const blurs = play === 'blur';
  if (blurs) blurring++;
  el.style.setProperty('--reveal-ms', `${ms}ms`);
  if (blurs) el.style.setProperty('--reveal-blur', `${blur}px`);
  el.setAttribute('data-reveal', play);
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    if (blurs) blurring--;
    el.removeAttribute('data-reveal');
    el.style.removeProperty('--reveal-ms');
    el.style.removeProperty('--reveal-blur');
    el.removeEventListener('animationend', end);
    el.removeEventListener('animationcancel', end);
    window.clearTimeout(timer);
  };
  el.addEventListener('animationend', end);
  el.addEventListener('animationcancel', end);
  const timer = window.setTimeout(end, ms + 200);
  return ms;
}

/**
 * Watches a picture element from when it is attached: a picture already there shows at once; one that loads
 * later reveals (`onPlay` hears how long, so a host can keep its skeleton under the picture until it is sharp).
 * Returns the detach (a React 19 ref callback's cleanup).
 */
export function watchReveal(
  el: HTMLElement | SVGElement | null,
  kind: RevealKind,
  onPlay?: (ms: number) => void,
): (() => void) | undefined {
  if (!el || typeof window === 'undefined') return undefined;
  if (alreadyDecoded(el)) return undefined;
  const attached = performance.now();
  const loaded = () => {
    const ms = playReveal(el, kind, performance.now() - attached < REVEAL_INSTANT_MS);
    onPlay?.(ms);
  };
  el.addEventListener('load', loaded, { once: true });
  return () => el.removeEventListener('load', loaded);
}

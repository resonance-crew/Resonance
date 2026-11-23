'use client';

import { forwardRef, useCallback, useRef, type ImgHTMLAttributes, type Ref, type RefCallback } from 'react';
import { watchReveal, type RevealKind } from '@/lib/images/reveal';

/**
 * A ref callback that plays the blur-to-sharp reveal (lib/images/reveal) on the picture it is attached to, when that
 * picture lands after the element is on screen — none for one the browser already had. `onPlay` hears the reveal's
 * length (0: none played), for a host that keeps its skeleton under the picture until it is sharp.
 */
export function useRevealRef<T extends HTMLElement | SVGElement>(
  kind: RevealKind,
  onPlay?: (ms: number) => void,
  forward?: Ref<T>,
): RefCallback<T> {
  const played = useRef(onPlay);
  played.current = onPlay;
  return useCallback(
    (el: T | null) => {
      if (typeof forward === 'function') forward(el);
      else if (forward) (forward as { current: T | null }).current = el;
      return watchReveal(el, kind, (ms) => played.current?.(ms));
    },
    [kind, forward],
  );
}

export interface RevealImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** How strongly it reveals: a cover or chat picture, a small thumbnail, an avatar, or the fade alone. */
  reveal: RevealKind;
}

/**
 * A plain remote `<img>` that lands blur-to-sharp — what every one-off picture on the web draws with, so each has
 * the reveal the covers and avatars have (`imageReveal.web.test.ts` counts the raw `<img>`s left). Takes every
 * `<img>` prop as is.
 */
export const RevealImg = forwardRef<HTMLImageElement, RevealImgProps>(function RevealImg({ reveal, alt = '', ...rest }, ref) {
  const attach = useRevealRef<HTMLImageElement>(reveal, undefined, ref);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={attach} alt={alt} {...rest} />;
});

/**
 * A window scroll listener that is passive and runs `fn` at most once an animation frame (the perf audit's W21: the
 * headers' listeners were neither, and set their state on every event). Returns the way to take it off.
 */
export function onScrollPassive(fn: () => void, target: Window | HTMLElement = window): () => void {
  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn();
    });
  };
  target.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    target.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@/../test/render';
import { IMAGE_RETRY_MS, OrganicImage } from './OrganicImage';

// A cover whose request fails — a lookup that failed on a network just joined, a host briefly
// unreachable — is asked for once more a moment later on a fresh element, shimmering meanwhile;
// only a second failure gives up.
describe('a cover that fails to load', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const shimmer = (c: HTMLElement) => c.querySelector('span[aria-hidden]');
  const SRC = 'https://img.example.com/image/cover.avif';

  it('tries once more, then settles', () => {
    const { container } = render(<OrganicImage src={SRC} />);
    const first = container.querySelector('img')!;
    expect(shimmer(container)).not.toBeNull();

    fireEvent.error(first);
    expect(shimmer(container)).not.toBeNull();
    expect(container.querySelector('img')).toBe(first);

    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS));
    const second = container.querySelector('img')!;
    expect(second).not.toBe(first);
    expect(second.getAttribute('src')).toBe(SRC);
    expect(shimmer(container)).not.toBeNull();

    fireEvent.error(second);
    expect(shimmer(container)).toBeNull();
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS * 2));
    expect(container.querySelector('img')).toBe(second);
  });

  it('lands on the second try', () => {
    const { container } = render(<OrganicImage src={SRC} />);
    fireEvent.error(container.querySelector('img')!);
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS));
    fireEvent.load(container.querySelector('img')!);
    expect(shimmer(container)).toBeNull();
  });

  it('gives a new picture its own retry', () => {
    const { container, rerender } = render(<OrganicImage src={SRC} />);
    fireEvent.error(container.querySelector('img')!);
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS));
    fireEvent.error(container.querySelector('img')!);

    rerender(<OrganicImage src="https://img.example.com/image/other.avif" />);
    const first = container.querySelector('img')!;
    fireEvent.error(first);
    expect(shimmer(container)).not.toBeNull();
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS));
    expect(container.querySelector('img')).not.toBe(first);
  });
});

// Round 25 post-merge: a framed cover's percentages (coverImageBox) are of the ratio box, but the picture sat in
// the wrapper that bleeds past it on every side — drawn out of its shape and off the crop the stage showed.
describe('a framed cover', () => {
  const W = 320;
  const RATIO = 0.62;
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(W);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(Math.round(W * RATIO));
  });
  afterEach(() => vi.restoreAllMocks());

  const px = (v: string) => Number.parseFloat(v);
  const pct = (v: string) => Number.parseFloat(v) / 100;

  it('is drawn in its own shape, its percentages of the ratio box', () => {
    const frame = { cx: 0.3, cy: 0.4, zoom: 1.4, ar: 1.5 };
    const { container } = render(<OrganicImage src="https://img.example.com/image/framed.avif" ratio={RATIO} frame={frame} />);
    const img = container.querySelector<HTMLImageElement>('img[data-frame]')!;
    // The box the percentages are of: the img's containing block, from the bled wrapper and its own inset.
    const bled = container.firstElementChild!.firstElementChild as HTMLElement;
    const bleed = -px(bled.style.inset || '0');
    expect(bleed).toBeGreaterThan(0); // the clip is measured, so the wrapper does bleed
    const holder = img.parentElement!;
    const inset = holder === bled ? 0 : px(holder.style.inset || '0');
    const boxW = W + 2 * bleed - 2 * inset;
    const boxH = Math.round(W * RATIO) + 2 * bleed - 2 * inset;
    const drawnAspect = (pct(img.style.width) * boxW) / (pct(img.style.height) * boxH);
    expect(Math.abs(drawnAspect / frame.ar - 1)).toBeLessThan(0.01);
  });
});

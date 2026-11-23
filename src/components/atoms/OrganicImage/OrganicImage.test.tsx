// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@/../test/render';
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
    // past a reveal, should it have played (a load heard later than 50 ms after the element came)
    act(() => vi.advanceTimersByTime(400));
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

// The perf audit's W6: a list's cover offers its smaller copy beside the cover, so a card a third of the screen wide
// decodes a 960 px picture, not the 2048 px one; the one more try after a failure asks for the cover alone.
describe('a list cover with a smaller copy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const SRC = 'https://img.example.com/image/cover.webp';
  const THUMB = 'https://img.example.com/image/cover-960.webp';

  it('offers both by width, then the cover alone if that fails', () => {
    const { container } = render(<OrganicImage src={SRC} thumbSrc={THUMB} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(SRC);
    expect(img.getAttribute('srcset')).toBe(`${THUMB} 960w, ${SRC} 2048w`);
    expect(img.getAttribute('sizes')).toContain('33vw');
    fireEvent.error(img);
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS));
    const retry = container.querySelector('img')!;
    expect(retry).not.toBe(img);
    expect(retry.getAttribute('srcset')).toBeNull();
    expect(retry.getAttribute('src')).toBe(SRC);
  });

  it('without one, is the cover alone', () => {
    const { container } = render(<OrganicImage src={SRC} />);
    expect(container.querySelector('img')!.getAttribute('srcset')).toBeNull();
  });
});

// A cover's grain waits for its picture (the perf audit's W2): while the place shimmers nothing a mask or filter
// draws lies over the shimmer, so its sweep never has the grain drawn again.
describe('a cover grain', () => {
  const SRC = 'https://img.example.com/image/cover.avif';
  const grain = <i data-testid="grain" />;

  it('comes once the picture has landed, never over the shimmer', async () => {
    const { container, queryByTestId } = render(<OrganicImage src={SRC} grain={grain} />);
    expect(container.querySelector('span[aria-hidden]')).not.toBeNull();
    expect(queryByTestId('grain')).toBeNull();
    fireEvent.load(container.querySelector('img')!);
    // A picture that lands late reveals blur-to-sharp first (lib/images/reveal): the shimmer stays under it until then.
    if (container.querySelector('span[aria-hidden]')) expect(queryByTestId('grain')).toBeNull();
    await waitFor(() => expect(container.querySelector('span[aria-hidden]')).toBeNull());
    expect(queryByTestId('grain')).not.toBeNull();
  });

  it('is there at once with no picture', () => {
    const { queryByTestId } = render(<OrganicImage grain={grain} />);
    expect(queryByTestId('grain')).not.toBeNull();
  });
});

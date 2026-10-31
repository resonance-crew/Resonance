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

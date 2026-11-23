// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@/../test/render';
import { RevealImg } from '@/components/atoms/RevealImg/RevealImg';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { MAX_BLURS, REVEAL, REVEAL_INSTANT_MS, blurringNow, decideReveal } from './reveal';

// Blur-to-sharp (Wave 2 #7): only a picture that lands after its box is on screen plays; one the browser had
// shows at once; reduced motion plays nothing, Save-Data (the web's battery saver) only the fade; at most six blur.
describe('whether a landing picture plays', () => {
  const base = { kind: 'cover' as const, instant: false, reducedMotion: false, saveData: false, blurring: 0 };
  it('blurs a picture that arrives late', () => expect(decideReveal(base)).toBe('blur'));
  it('shows one already there at once', () => expect(decideReveal({ ...base, instant: true })).toBe('none'));
  it('plays nothing under reduced motion', () => expect(decideReveal({ ...base, reducedMotion: true })).toBe('none'));
  it('only fades under Save-Data', () => expect(decideReveal({ ...base, saveData: true })).toBe('fade'));
  it('only fades past six blurs at once', () => {
    expect(decideReveal({ ...base, blurring: MAX_BLURS - 1 })).toBe('blur');
    expect(decideReveal({ ...base, blurring: MAX_BLURS })).toBe('fade');
  });
  it('fades the viewer and the map', () => expect(decideReveal({ ...base, kind: 'fade' })).toBe('fade'));
  it('keeps the agreed strengths', () => {
    expect(REVEAL.cover).toEqual({ blur: 10, ms: 320 });
    expect(REVEAL.thumb).toEqual({ blur: 4, ms: 240 });
    expect(REVEAL.avatar).toEqual({ blur: 3, ms: 200 });
  });
});

describe('a picture element landing', () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const SRC = 'https://img.example.com/image/a.webp';

  it('reveals a late picture and leaves nothing on it afterwards', () => {
    const { container } = render(<RevealImg reveal="thumb" src={SRC} />);
    const img = container.querySelector('img')!;
    now += REVEAL_INSTANT_MS + 200;
    fireEvent.load(img);
    expect(img.getAttribute('data-reveal')).toBe('blur');
    expect(img.style.getPropertyValue('--reveal-blur')).toBe('4px');
    expect(blurringNow()).toBe(1);
    fireEvent.animationEnd(img);
    expect(img.hasAttribute('data-reveal')).toBe(false);
    expect(img.style.getPropertyValue('--reveal-blur')).toBe('');
    expect(blurringNow()).toBe(0);
  });

  it('shows a picture back from a cache at once', () => {
    const { container } = render(<RevealImg reveal="cover" src={SRC} />);
    const img = container.querySelector('img')!;
    now += 10;
    fireEvent.load(img);
    expect(img.hasAttribute('data-reveal')).toBe(false);
  });

  it('plays nothing under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const { container } = render(<RevealImg reveal="cover" src={SRC} />);
    const img = container.querySelector('img')!;
    now += 500;
    fireEvent.load(img);
    expect(img.hasAttribute('data-reveal')).toBe(false);
  });

  it('ends on its own when the animation never runs', () => {
    const { container } = render(<RevealImg reveal="avatar" src={SRC} />);
    const img = container.querySelector('img')!;
    now += 500;
    fireEvent.load(img);
    expect(img.hasAttribute('data-reveal')).toBe(true);
    act(() => vi.advanceTimersByTime(REVEAL.avatar.ms + 250));
    expect(img.hasAttribute('data-reveal')).toBe(false);
  });

  it("keeps a cover's shimmer under it until it is sharp", () => {
    const { container } = render(<OrganicImage src={SRC} />);
    const shimmer = () => container.querySelector('span[aria-hidden]');
    const img = container.querySelector('img')!;
    now += 500;
    fireEvent.load(img);
    act(() => vi.advanceTimersByTime(1));
    expect(img.getAttribute('data-reveal')).toBe('blur');
    expect(shimmer()).not.toBeNull();
    act(() => vi.advanceTimersByTime(REVEAL.cover.ms));
    expect(shimmer()).toBeNull();
  });
});

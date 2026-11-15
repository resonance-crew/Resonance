// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drive } from './drive';
import { watchCardHands } from './pointer';

/**
 * §B (round 25): a mouse over a card no longer stops the film — only its press does. The owner: 「只有使用者滑鼠点下去
 * 的时候才会触发事件，其他时候都不要停止播放动画」.
 */

/** The film's stage with one card, a real Drive playing it and the runtime's scheduled resume. */
function film() {
  let y = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(((o: ScrollToOptions) => {
    y = o.top ?? y;
  }) as typeof window.scrollTo);
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  document.body.innerHTML = `
    <div data-film-stage>
      <a href="/card/rain-walk" data-film-card="c1"><h3>雨中的散步</h3></a>
      <p data-sky>the sky</p>
    </div>`;
  const stage = document.querySelector('[data-film-stage]') as HTMLElement;
  const drive = new Drive({ top: () => 0, svh: () => 10 }, () => {});
  // the runtime's resume (index.ts): a time ▶ takes the page again at, or 0
  const resume = { at: 0 };
  const stopResume = vi.fn(() => {
    resume.at = 0;
  });
  const stop = watchCardHands(stage, { drive, stopResume });
  drive.play(4);
  const card = stage.querySelector('h3') as HTMLElement;
  return { stage, drive, resume, stopResume, card, sky: stage.querySelector('[data-sky]') as HTMLElement, stop };
}

const pointer = (type: string, init: PointerEventInit) =>
  // jsdom has no PointerEvent constructor everywhere: a MouseEvent carrying pointerType reads the same
  Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }), { pointerType: init.pointerType ?? 'mouse' });

let h: ReturnType<typeof film>;
beforeEach(() => {
  h = film();
});
afterEach(() => {
  h.stop();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a mouse over the film’s cards', () => {
  it('moving across a card while the film plays changes nothing', () => {
    expect(h.drive.mode).toBe('play');
    for (let i = 0; i < 12; i++) h.card.dispatchEvent(pointer('pointermove', { clientX: 100 + i * 9, clientY: 200 + i * 3 }));
    h.card.dispatchEvent(pointer('pointerover', { clientX: 120, clientY: 210 }));
    expect(h.drive.mode).toBe('play');
    expect(h.stopResume).not.toHaveBeenCalled();
  });

  it('a primary press on a card hands the page back at once, with no resume scheduled', () => {
    h.resume.at = performance.now() + 900; // as a wheel's skip would have left it
    h.card.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 120, clientY: 210 }));
    expect(h.drive.mode).toBe('browse');
    expect(h.stopResume).toHaveBeenCalledTimes(1);
    expect(h.resume.at).toBe(0);
  });

  it('a press off the cards, or with another button, leaves the film playing', () => {
    h.sky.dispatchEvent(pointer('pointerdown', { button: 0 }));
    h.card.dispatchEvent(pointer('pointerdown', { button: 2 }));
    expect(h.drive.mode).toBe('play');
    expect(h.stopResume).not.toHaveBeenCalled();
  });

  it('a finger on a card is the touch handlers’ (a scroll that skips ahead), not this press', () => {
    h.card.dispatchEvent(pointer('pointerdown', { button: 0, pointerType: 'touch' }));
    h.card.dispatchEvent(pointer('pointerdown', { button: 0, pointerType: 'pen' }));
    expect(h.drive.mode).toBe('play');
    expect(h.stopResume).not.toHaveBeenCalled();
  });

  it('the keyboard’s focus on a card still hands back (:focus-visible)', () => {
    const link = h.stage.querySelector('a') as HTMLAnchorElement;
    const matches = link.matches.bind(link);
    link.matches = (sel: string) => (sel === ':focus-visible' ? true : matches(sel));
    link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(h.drive.mode).toBe('browse');
    expect(h.stopResume).toHaveBeenCalled();
  });

  it('stops listening when the film is torn down', () => {
    h.stop();
    h.card.dispatchEvent(pointer('pointerdown', { button: 0 }));
    expect(h.drive.mode).toBe('play');
  });
});

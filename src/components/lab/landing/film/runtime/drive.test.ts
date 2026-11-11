// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILM_END, SEG, TRACK_SVH, sOfY } from '../script/timeline';
import { Drive, HOLDS } from './drive';
import { sceneOfHash } from './nav';

/** A page whose scroll the drive writes (1svh = 10 px, the film at the page's top). */
function page() {
  let y = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(((o: ScrollToOptions) => {
    y = o.top ?? y;
  }) as typeof window.scrollTo);
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  const modes: string[] = [];
  const d = new Drive({ top: () => 0, svh: () => 10 }, (m) => modes.push(m));
  const s = () => sOfY(y / 10);
  return { d, modes, s, setY: (v: number) => (y = v) };
}

describe('the play-through', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('catches the scenery up to an act that has already played, instead of standing on it', () => {
    const { d, s } = page();
    // the opening act has played on its own to its end (9.4 s) while the page stayed at the top
    d.play(SEG.write.t1, 0);
    for (let i = 0; i < 40; i++) d.step(0.05); // 2 s of wall clock
    // at 1× it would be at 2 s; caught up it is past the opening, and its pause counts as done
    expect(s()).toBeGreaterThan(SEG.write.t1);
  });

  it('pauses for a breath at the end of an act it plays through', () => {
    // the opening, the answer, the meeting and the night (round 3: room to breathe after the two meet too)
    expect(HOLDS).toEqual([SEG.write.t1, SEG.reply.t1, SEG.meet.t1, SEG.yours.t1]);
    const { d, s } = page();
    d.play(SEG.write.t1 - 0.2);
    for (let i = 0; i < 10; i++) d.step(0.05);
    expect(s()).toBeCloseTo(SEG.write.t1, 1);
    for (let i = 0; i < 20; i++) d.step(0.05);
    expect(s()).toBeCloseTo(SEG.write.t1, 1); // still holding
    for (let i = 0; i < 20; i++) d.step(0.05);
    expect(s()).toBeGreaterThan(SEG.write.t1 + 0.3);
  });

  it('keeps a glide and the play-through to the wall clock, even at 5 frames a second', () => {
    const { d, s, modes } = page();
    d.glideTo(500, undefined, 2);
    for (let i = 0; i < 10; i++) d.step(0.2); // 2 s of wall clock in ten long frames
    expect(modes.at(-1)).toBe('browse');
    expect(window.scrollY).toBe(500);
    d.play(1);
    for (let i = 0; i < 15; i++) d.step(0.2); // 3 s
    expect(s()).toBeCloseTo(4, 1);
  });

  it("hands the page back when the visitor moves it, and on ❚❚", () => {
    const { d, setY } = page();
    d.play(1);
    d.step(0.05);
    expect(d.mode).toBe('play');
    setY(window.scrollY + 40);
    d.step(0.05);
    expect(d.mode).toBe('browse');
    d.play(1);
    d.handBack();
    expect(d.mode).toBe('browse');
  });
});

// round 3's reviews: ▶ stopped a rounded px short of the track's end (804.976 svh on a phone), where the header kept
// the night's ink over the site's cream band
describe('the end of ▶', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('lands on the track\'s end, never a px short, whatever a svh is in px', () => {
    for (const svh of [8.44, 7.68, 9.0, 11.8]) {
      let y = 0;
      vi.spyOn(window, 'scrollTo').mockImplementation(((o: ScrollToOptions) => {
        y = o.top ?? y;
      }) as typeof window.scrollTo);
      Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
      const d = new Drive({ top: () => 0, svh: () => svh }, () => {});
      d.play(FILM_END - 0.3);
      for (let i = 0; i < 400 && d.mode === 'play'; i++) d.step(0.05);
      expect(d.mode).toBe('browse');
      expect(y / svh, `${svh}`).toBeGreaterThanOrEqual(TRACK_SVH);
      expect(y / svh, `${svh}`).toBeLessThan(TRACK_SVH + 1 / svh + 1e-9);
      vi.restoreAllMocks();
    }
  });
});

describe('a scene link', () => {
  it('names the scene its hash does, and nothing else', () => {
    expect(sceneOfHash('#answer')?.n).toBe(2);
    expect(sceneOfHash('#yours')?.y0).toBe(SEG.yours.y0);
    expect(sceneOfHash('#stories')).toBeNull();
    expect(sceneOfHash('')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { WEB_CHECKS, checksPath, consoleNoise, judgePage, lineCount, type PageMeasure } from './webChecks';

const quiet: PageMeasure = { blank: false, viewport: 390, scrollWidth: 390, pastEdge: [], labels: [], small: [], contrast: null, film: null };
const line = (top: number, height = 20) => ({ top, bottom: top + height });

describe('lineCount', () => {
  it('counts one line for words side by side, even a smaller span set a little lower', () => {
    expect(lineCount([line(100), line(102, 16)])).toBe(1);
  });

  it('counts two when the words break', () => {
    expect(lineCount([line(100), line(124)])).toBe(2);
    expect(lineCount([line(124), line(100), line(101)])).toBe(2);
  });

  it('counts nothing for no words', () => {
    expect(lineCount([])).toBe(0);
  });
});

describe('judgePage', () => {
  it('finds nothing on a page that fits, with short labels on one line and no errors', () => {
    expect(judgePage({ ...quiet, labels: [{ text: '共振', boxes: [line(10)] }] }, [], { touch: true })).toEqual([]);
  });

  // CLAUDE.md, Phone, tablet and Mac: a phone's lists are bands, never framed cards (shipped twice, 2026-11-01 and -09).
  it('says, on the phone, which card or band stops short of the window’s edges, and only warns', () => {
    const [f] = judgePage({ ...quiet, framed: [{ name: '邀請你接收新卡片', left: 16, right: 374 }] }, [], { touch: true });
    expect(f).toEqual({ check: 'phone-bands', level: 'warn', detail: '1 not edge to edge: 邀請你接收新卡片 (16–374 of 390)' });
    expect(judgePage({ ...quiet, framed: [] }, [], { touch: true })).toEqual([]);
  });

  it('says how wide a page runs past the window, and what sticks out', () => {
    const [f] = judgePage({ ...quiet, scrollWidth: 431, pastEdge: [{ name: 'div.tags', right: 430.6 }] }, [], { touch: true });
    expect(f).toEqual({ check: 'overflow', level: WEB_CHECKS.overflow.level, detail: 'the page is 431 px wide in a 390 px window — past the edge: div.tags (to 431)' });
  });

  it('forgives a page a pixel wide (subpixel rounding)', () => {
    expect(judgePage({ ...quiet, scrollWidth: 391 }, [], { touch: false })).toEqual([]);
  });

  it('names a short button whose words broke onto two lines', () => {
    const [f] = judgePage({ ...quiet, labels: [{ text: '發布這張卡片', boxes: [line(10), line(34)] }] }, [], { touch: false });
    expect(f.check).toBe('wrapped-label');
    expect(f.detail).toBe('“發布這張卡片” breaks onto 2 lines');
  });

  it('gathers console errors into one finding, each once', () => {
    const [f] = judgePage(quiet, ['TypeError: x is undefined', 'TypeError: x   is undefined', 'Hydration failed'], { touch: false });
    expect(f).toMatchObject({ check: 'console', detail: 'TypeError: x is undefined, Hydration failed' });
  });

  it('checks touch targets on a touch screen only', () => {
    const small = [{ name: '⋯', width: 32, height: 32 }];
    expect(judgePage({ ...quiet, small }, [], { touch: false })).toEqual([]);
    expect(judgePage({ ...quiet, small }, [], { touch: true })[0]).toMatchObject({ check: 'touch-target', detail: '1 under 44 × 44: ⋯ (32 × 32)' });
  });

  it('lists five at most, then how many more', () => {
    const small = Array.from({ length: 7 }, (_, i) => ({ name: `b${i}`, width: 30, height: 30 }));
    expect(judgePage({ ...quiet, small }, [], { touch: true })[0].detail).toMatch(/b4 \(30 × 30\), and 2 more$/);
  });

  it('passes on what the contrast audit found', () => {
    const [f] = judgePage({ ...quiet, contrast: [{ text: '已儲存', ratio: 3.21, min: 4.5, where: 'span.status' }] }, [], { touch: false });
    expect(f).toMatchObject({ check: 'contrast', detail: '1 under AA: “已儲存” 3.21:1 (needs 4.5) at span.status' });
  });

  it('fails a run on a blank page', () => {
    expect(judgePage({ ...quiet, blank: true }, [], { touch: false })).toEqual([
      { check: 'blank', level: 'fail', detail: 'the page shows no words and no picture' },
    ]);
  });

  it('fails a run only on what a full web run was seen clean of; warns of the rest', () => {
    const levels = Object.fromEntries(Object.entries(WEB_CHECKS).map(([check, { level }]) => [check, level]));
    expect(levels).toEqual({
      blank: 'fail',
      overflow: 'fail',
      'wrapped-label': 'fail',
      console: 'warn',
      'touch-target': 'warn',
      contrast: 'warn',
      film: 'fail',
      'film-frames': 'warn',
      'phone-bands': 'warn',
    });
  });
});

describe('the landing film’s checks', () => {
  const film = { ready: true, scene: 2, resting: true, actors: 9, live: 9 };

  it('passes a film ready, its cast on stage, standing in the scene its still names', () => {
    expect(judgePage({ ...quiet, film }, [], { touch: true, scene: 2 })).toEqual([]);
  });

  it('fails one never ready, a puppet left as its still, or a still in another scene — said together', () => {
    const [f] = judgePage({ ...quiet, film: { ...film, ready: false, live: 7, scene: 3 } }, [], { touch: true, scene: 2 });
    expect(f).toEqual({
      check: 'film',
      level: 'fail',
      detail: 'the runtime never said it was ready; 2 of 9 puppets never came on stage; it stands in scene 3, not 2',
    });
  });

  it('fails a still whose page has no film at all', () => {
    expect(judgePage(quiet, [], { touch: false, scene: 1 })[0]).toMatchObject({ check: 'film', detail: 'no landing film on the page' });
  });

  it('asks nothing of a film page that pins no scene but its cast', () => {
    expect(judgePage({ ...quiet, film: { ...film, scene: 4 } }, [], { touch: false })).toEqual([]);
  });

  it('warns when a scroll through it drew slowly, and not when it drew well', () => {
    const slow = { ...film, frames: { frames: 200, p50: 16, p95: 48, long: 30 } };
    expect(judgePage({ ...quiet, film: slow }, [], { touch: false })).toEqual([
      { check: 'film-frames', level: 'warn', detail: 'scrolled through: p95 48 ms, 30 of 200 frames over 50 ms' },
    ]);
    const smooth = { ...film, frames: { frames: 200, p50: 16, p95: 18, long: 2 } };
    expect(judgePage({ ...quiet, film: smooth }, [], { touch: false })).toEqual([]);
  });
});

describe('the console', () => {
  it("leaves out the capture's own aborted puppet requests", () => {
    expect(consoleNoise('Failed to load resource: net::ERR_FAILED', 'http://localhost:3150/mascots/tuck/head.webp?v=3')).toBe(true);
    expect(consoleNoise('Failed to load resource: the server responded with a status of 500', 'http://localhost:3150/api/v1/feed')).toBe(false);
  });
});

it('keeps findings beside their capture', () => {
  expect(checksPath('/r/web/phone/home@light-zh-TW.png')).toBe('/r/web/phone/home@light-zh-TW.checks.json');
});

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { INK } from '@/lib/design/strokes';
import pageStyles from './MessagesPage.module.css';
import { threadBodyArea } from './ThreadHeaderChrome';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** The thread's header row (with its chrome) at `top`, its chrome from `chromeLeft` to the window's end. */
function header(top: number, chromeLeft: number, winW: number) {
  const el = document.createElement('div');
  const chrome = document.createElement('div');
  chrome.className = pageStyles.threadChrome;
  el.appendChild(chrome);
  el.getBoundingClientRect = () => rect(chromeLeft, top, winW - chromeLeft, 58);
  chrome.getBoundingClientRect = () => rect(chromeLeft, top, winW - chromeLeft, 72);
  return el;
}

/** The two panes' rule: a 7.6-wide box whose pen wavers ±2 round x = 315, from y 60 to past the window's foot. */
function rule(withLayout: boolean) {
  const el = document.createElement('div');
  el.innerHTML = '<div><svg><path d="M 0,0"></path></svg></div>';
  el.getBoundingClientRect = () => rect(311.2, 60, 7.6, 800);
  const path = el.querySelector('path')! as unknown as SVGPathElement & Record<string, unknown>;
  if (withLayout) {
    // The Divider's path in its own units (a 240-tall viewBox), stretched onto the box: x as drawn, y × 800 / 240.
    path.getTotalLength = () => 240;
    path.getPointAtLength = (s: number) => ({ x: 2 * Math.sin(s / 15), y: s }) as DOMPoint;
    path.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 800 / 240, e: 315, f: 60 }) as DOMMatrix;
  }
  return el;
}

/** The clip's straight segments (`L x,y`), in its own box. */
const lines = (clip: string) => Array.from(clip.matchAll(/L (-?[\d.]+),(-?[\d.]+)/g), (m) => [Number(m[1]), Number(m[2])]);

// Round 17 review D2: on two panes the scrim starts exactly at the rule's pen — its leading edge is the line's own
// wave (its trailing rim), so no strip of undimmed paper runs beside it, and the line itself stays crisp.
describe('the thread body a held message dims', () => {
  it('follows the rule’s pen line on two panes: no undimmed seam, the line left crisp', () => {
    const area = threadBodyArea(header(100, 319, 1024), rule(true), 1024, 768);
    const penX = (y: number) => 315 + 2 * Math.sin(((y - 60) * 240) / 800 / 15);
    // The box starts at the pen's leftmost trailing rim, never at the rule box's right edge (318.8: a 4–6 px seam).
    expect(area.left).toBeLessThan(315);
    expect(area.left).toBeGreaterThanOrEqual(313 + INK / 2 - 1);
    // Every point of the leading edge lies on the pen's trailing rim at its height, within a hair.
    const edge = lines(area.clip).filter(([, y]) => y > 20 && y < area.height);
    expect(edge.length).toBeGreaterThan(50);
    for (const [x, y] of edge) {
      const rim = penX(y + area.top) + INK / 2;
      expect(x + area.left).toBeLessThanOrEqual(rim + 0.05);
      expect(x + area.left).toBeGreaterThan(rim - 1);
    }
    // Its top still follows the header's wave, from the line to the window's end.
    expect(area.clip).toMatch(/^M [\d.]+,[\d.]+ C /);
    expect(area.width).toBe(1024 - area.left);
  });

  it('starts at the rule’s middle where the line can’t be read, and at the window’s edge on a phone', () => {
    const fallback = threadBodyArea(header(100, 319, 1024), rule(false), 1024, 768);
    expect(fallback.left).toBeCloseTo(315 + INK / 2 - 0.4, 5);
    const phone = threadBodyArea(header(0, 0, 375), null, 375, 812);
    expect(phone.left).toBe(0);
    expect(phone.width).toBe(375);
  });
});

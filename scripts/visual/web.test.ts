// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { pendingShapeInPicture } from './web';

afterEach(() => (document.body.innerHTML = ''));

/**
 * A shape still showing its stand-in, its box at `top` (the window is jsdom's, 1024 × 768); `drawn: false` is one in a
 * `display: none` (no box at all).
 */
function pendingAt(top: number, { height = 40, drawn = true }: { height?: number; drawn?: boolean } = {}) {
  const el = document.createElement('div');
  el.setAttribute('data-shape-pending', '');
  const rect = (drawn ? { x: 0, y: top, top, left: 0, right: 200, bottom: top + height, width: 200, height } : { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
  el.getBoundingClientRect = () => rect;
  el.getClientRects = () => (drawn ? [rect] : []) as unknown as DOMRectList;
  document.body.appendChild(el);
  return el;
}

describe('a capture waits for the shapes in its picture', () => {
  it('waits for one in the window, never for one far below it that the page lays out only once scrolled to', () => {
    expect(pendingShapeInPicture(false)).toBe(true);
    pendingAt(3000);
    expect(pendingShapeInPicture(false)).toBe(true);
    pendingAt(-500);
    expect(pendingShapeInPicture(false)).toBe(true);
    pendingAt(700);
    expect(pendingShapeInPicture(false)).toBe(false);
  });

  it('never waits for one the page doesn’t draw (inside a display: none: the landing page’s desktop header on a phone), on any capture', () => {
    pendingAt(0, { drawn: false });
    expect(pendingShapeInPicture(false)).toBe(true);
    expect(pendingShapeInPicture(true)).toBe(true);
  });

  it('waits for every drawn one on a full-page capture, and for one drawn with no size yet', () => {
    const below = pendingAt(3000);
    expect(pendingShapeInPicture(true)).toBe(false);
    below.remove();
    expect(pendingShapeInPicture(true)).toBe(true);
    pendingAt(0, { height: 0 });
    expect(pendingShapeInPicture(false)).toBe(false);
  });
});

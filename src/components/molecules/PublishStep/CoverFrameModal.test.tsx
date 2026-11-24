// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import enMessages from '@/messages/en.json';
import type { StagePicture } from '@/components/molecules/CropStage/CropStage';
import { RUBBER_MAX, rubberBand } from '@/lib/images/cropFrame';
import { CoverFrameModal } from './CoverFrameModal';

/**
 * Round 33 §Q5 (the owner: 「无拖动空间时给轻微橡皮筋回弹，并在框下方提示『放大後才能移動』」): in 調整封面 a drag past
 * where the picture can go still follows the finger a little — firmer the further, never past 24 — and springs back
 * on the lift (not at all under reduced motion); once a drag met an axis the picture has no room in at this zoom,
 * 放大後才能移動 shows under the frame until a zoom gives it room.
 */

function picture(width: number, height: number): StagePicture {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return { el, width, height };
}

function open(pic = picture(1536, 1024), zh = true) {
  renderWithIntl(<CoverFrameModal picture={pic} frame={null} onCancel={vi.fn()} onDone={vi.fn()} />, {
    locale: zh ? 'zh-TW' : 'en',
    messages: zh ? zhMessages : enMessages,
  });
  const stage = screen.getByRole('group');
  const holder = stage.querySelector<HTMLElement>('[style*="transform"]')!;
  const at = () => {
    const m = holder.style.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\)/)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  return { stage, holder, at };
}

const drag = (stage: HTMLElement, dx: number, dy: number, lift = true) => {
  fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 200, clientY: 150 });
  // in small steps, as a finger moves
  for (let i = 1; i <= 10; i++) fireEvent.pointerMove(stage, { pointerId: 1, clientX: 200 + (dx * i) / 10, clientY: 150 + (dy * i) / 10 });
  if (lift) fireEvent.pointerUp(stage, { pointerId: 1, clientX: 200 + dx, clientY: 150 + dy });
};

const noRoom = () => document.querySelector<HTMLElement>('[data-crop-no-room]')!;

function reduceMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => reduceMotion(false));

describe('調整封面: a drag with no room answers (round 33 §Q5)', () => {
  it('the rubber band: about half at first, firmer the further, never past 24, its sign kept', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(10)).toBeGreaterThan(4);
    expect(rubberBand(10)).toBeLessThan(10);
    expect(rubberBand(-10)).toBeCloseTo(-rubberBand(10));
    expect(rubberBand(1000)).toBeLessThanOrEqual(RUBBER_MAX);
    expect(rubberBand(1000)).toBeGreaterThan(RUBBER_MAX - 0.5);
    expect(rubberBand(80) - rubberBand(40)).toBeLessThan(rubberBand(40) - rubberBand(0));
  });

  it('follows a drag across an axis with no room a little, springs back on the lift, and says 放大後才能移動', () => {
    reduceMotion(false);
    // 3 : 2 at zoom 1 in the 0.62 frame: it just covers the frame's width — no room across at all.
    const { stage, holder, at } = open();
    const rest = at();
    expect(noRoom()).not.toHaveAttribute('data-shown');
    expect(noRoom().textContent).toBe('');
    drag(stage, 120, 0, false);
    const held = at();
    // It moved with the finger, but much less than the finger, and never more than 24.
    expect(held.x - rest.x).toBeGreaterThan(4);
    expect(held.x - rest.x).toBeLessThanOrEqual(RUBBER_MAX);
    expect(holder).toHaveAttribute('data-rubber');
    expect(noRoom()).toHaveAttribute('data-shown');
    expect(noRoom().textContent).toBe('放大後才能移動');
    fireEvent.pointerUp(stage, { pointerId: 1 });
    // Back where it was, by the spring's transition.
    expect(at().x).toBeCloseTo(rest.x);
    expect(holder).toHaveAttribute('data-spring');
    expect(holder).not.toHaveAttribute('data-rubber');
    // The hint stays while there is no room…
    expect(noRoom()).toHaveAttribute('data-shown');
    // …and goes once a zoom gives room across.
    fireEvent.keyDown(stage, { key: '+' });
    fireEvent.keyDown(stage, { key: '+' });
    expect(noRoom()).not.toHaveAttribute('data-shown');
  });

  // Post-merge review: the line came back by itself when the zoom returned to 1 (the push was kept until the picture
  // changed); a zoom that gives the axis room forgets it, as iOS and Android.
  it('forgets the push once a zoom gives room: back at zoom 1 the line waits for another drag', () => {
    reduceMotion(false);
    const { stage } = open();
    drag(stage, 120, 0);
    expect(noRoom()).toHaveAttribute('data-shown');
    fireEvent.keyDown(stage, { key: '+' });
    fireEvent.keyDown(stage, { key: '+' });
    fireEvent.keyDown(stage, { key: '+' });
    expect(noRoom()).not.toHaveAttribute('data-shown');
    for (let i = 0; i < 6; i++) fireEvent.keyDown(stage, { key: '-' });
    expect(noRoom()).not.toHaveAttribute('data-shown');
    drag(stage, 120, 0);
    expect(noRoom()).toHaveAttribute('data-shown');
  });

  it('a drag back takes up the stretch first, then the picture moves where it has room', () => {
    reduceMotion(false);
    // a portrait photo at zoom 1: room up and down, none across
    const { stage, at } = open(picture(1024, 1536));
    const rest = at();
    fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 240, clientY: 150 });
    const out = at().x - rest.x;
    expect(out).toBeGreaterThan(0);
    // back by half the way: still stretched, less
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 220, clientY: 150 });
    expect(at().x - rest.x).toBeGreaterThan(0);
    expect(at().x - rest.x).toBeLessThan(out);
    // a move down, where there is room: the picture itself moves, no hint for that axis
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 200, clientY: 180 });
    expect(at().y - rest.y).toBeGreaterThan(20);
    fireEvent.pointerUp(stage, { pointerId: 1 });
  });

  it('under reduced motion it doesn’t move at all, and still says why', () => {
    reduceMotion(true);
    const { stage, holder, at } = open();
    const rest = at();
    drag(stage, 120, 0, false);
    expect(at().x).toBeCloseTo(rest.x);
    expect(holder).not.toHaveAttribute('data-rubber');
    expect(noRoom()).toHaveAttribute('data-shown');
    fireEvent.pointerUp(stage, { pointerId: 1 });
    expect(holder).not.toHaveAttribute('data-spring');
  });

  it('says it in English with no full stop', () => {
    const { stage } = open(picture(1536, 1024), false);
    drag(stage, -120, 0);
    expect(noRoom().textContent).toBe('Zoom in to move it');
  });
});

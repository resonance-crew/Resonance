import { describe, expect, it } from 'vitest';
import { LIFT_SCALE, LIST_GAP, MENU_MARGIN, POPOVER_GAP, TRAY_GAP, alignToMessage, placeMessageMenu, placePopover } from './menuPlacement';

// Round 16 §3: the reactions always directly above the held message, the
// actions always directly below — and when that doesn't fit where the message
// is, the message moves by the least distance that fits, never the menus.

const TRAY = 52;
const LIST = 4 + 3 * 44 + 6 + 32; // a sheet list of three rows and its time
const VIEW = 812;
const grow = (h: number) => (h * (LIFT_SCALE - 1)) / 2;

describe('placeMessageMenu', () => {
  it('moves nothing when both fit around the message where it is, the tray 8 above it and the list 10 below', () => {
    const p = placeMessageMenu({ top: 300, height: 40, viewport: VIEW, trayH: TRAY, listH: LIST });
    expect(p.shift).toBe(0);
    expect(p.clipped).toBe(false);
    expect(p.trayTop).toBeCloseTo(300 - TRAY_GAP - TRAY - grow(40));
    expect(p.listTop).toBeCloseTo(340 + LIST_GAP + grow(40));
  });

  it('glides a message held near the foot up by just enough for the list, never flipping it above', () => {
    const p = placeMessageMenu({ top: 700, height: 40, viewport: VIEW, trayH: TRAY, listH: LIST });
    expect(p.shift).toBeLessThan(0);
    // The list's foot is on the bottom margin: not one pixel more than needed.
    expect(p.listTop + LIST).toBeCloseTo(VIEW - MENU_MARGIN);
    // Still under the message, the tray still over it.
    expect(p.listTop).toBeGreaterThan(700 + p.shift + 40);
    expect(p.trayTop + TRAY).toBeLessThan(700 + p.shift);
  });

  it('glides a message held near the top down by just enough for the tray', () => {
    const p = placeMessageMenu({ top: 30, height: 40, viewport: VIEW, trayH: TRAY, listH: LIST });
    expect(p.shift).toBeGreaterThan(0);
    expect(p.trayTop).toBeCloseTo(MENU_MARGIN);
  });

  it('needs no room above when no reactions are offered (a message still on its way, a letter)', () => {
    const p = placeMessageMenu({ top: 20, height: 40, viewport: VIEW, trayH: 0, listH: LIST });
    expect(p.shift).toBe(0);
    expect(p.trayTop).toBe(20);
  });

  it('shows a message taller than the room from its top, clipped to what is left between the two', () => {
    const p = placeMessageMenu({ top: 100, height: 900, viewport: VIEW, trayH: TRAY, listH: LIST });
    expect(p.clipped).toBe(true);
    expect(p.trayTop).toBeCloseTo(MENU_MARGIN);
    // Lifted from its top, it grows nothing past the clip: the tray 8 over it, the list 10 under it, exactly.
    expect(100 + p.shift).toBeCloseTo(MENU_MARGIN + TRAY + TRAY_GAP);
    expect(p.listTop).toBeCloseTo(100 + p.shift + p.shown + LIST_GAP);
    expect(p.listTop + LIST).toBeCloseTo(VIEW - MENU_MARGIN);
    expect(p.shown).toBeLessThan(900);
  });
});

describe('alignToMessage', () => {
  it("lines up the viewer's own on the message's right edge, theirs on its left, kept 12 from the window's sides", () => {
    expect(alignToMessage(232, 150, 359, true, 375)).toBe(359 - 232);
    expect(alignToMessage(232, 52, 200, false, 375)).toBe(52);
    // A short message of their own near the left: the tray stays inside the window.
    expect(alignToMessage(232, 300, 340, true, 375)).toBe(340 - 232);
    expect(alignToMessage(232, 260, 300, false, 375)).toBe(375 - 12 - 232);
    expect(alignToMessage(232, 0, 100, true, 375)).toBe(12);
  });
});

// Review M3: to a fine pointer the ☺ opens the reactions alone, 8 over it, and the ⋯ the actions alone, under it —
// beside the button that was clicked, reaching toward the thread's middle.
describe('placePopover', () => {
  const view = { width: 1280, height: 800 };
  const smile = { top: 400, bottom: 436, left: 700, right: 736 };

  it('hangs the reactions 8 over the ☺, its edge on the button’s, toward the middle', () => {
    const theirs = placePopover({ anchor: smile, width: 232, height: 52, prefer: 'above', align: 'start', viewport: view });
    expect(theirs).toEqual({ top: 400 - POPOVER_GAP - 52, left: 700, side: 'above' });
    const own = placePopover({ anchor: smile, width: 232, height: 52, prefer: 'above', align: 'end', viewport: view });
    expect(own.left).toBe(736 - 232);
  });

  it('goes under the button only when there is no room over it', () => {
    const top = { top: 30, bottom: 66, left: 700, right: 736 };
    expect(placePopover({ anchor: top, width: 232, height: 52, prefer: 'above', align: 'start', viewport: view })).toMatchObject({ top: 66 + POPOVER_GAP, side: 'below' });
  });

  it('drops the actions under the ⋯, and over it near the window’s foot', () => {
    const list = 4 + 3 * 44 + 6 + 32;
    expect(placePopover({ anchor: smile, width: 216, height: list, prefer: 'below', align: 'start', viewport: view }).top).toBe(436 + POPOVER_GAP);
    const low = { top: 700, bottom: 736, left: 700, right: 736 };
    expect(placePopover({ anchor: low, width: 216, height: list, prefer: 'below', align: 'start', viewport: view })).toMatchObject({ top: 700 - POPOVER_GAP - list, side: 'above' });
  });

  it('stays the margin inside the window’s sides', () => {
    const edge = { top: 400, bottom: 436, left: 4, right: 40 };
    expect(placePopover({ anchor: edge, width: 232, height: 52, prefer: 'above', align: 'end', viewport: view }).left).toBe(MENU_MARGIN);
    const far = { top: 400, bottom: 436, left: 1250, right: 1276 };
    expect(placePopover({ anchor: far, width: 232, height: 52, prefer: 'above', align: 'start', viewport: view }).left).toBe(1280 - MENU_MARGIN - 232);
  });
});

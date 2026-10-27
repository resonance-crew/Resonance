/**
 * Where a held message's menu goes (round 16 §3) — pure, so the rule is
 * tested on its own and the apps can match it: the reactions are always
 * directly above the message, the actions always directly below. When that
 * doesn't fit where the message is, the message moves — never the menus.
 */

/** Room kept from the window's edges. */
export const MENU_MARGIN = 12;
/** Between the tray's foot and the message. */
export const TRAY_GAP = 8;
/** Between the message's foot and the action list. */
export const LIST_GAP = 10;
/**
 * The lifted message is drawn this much larger — from its side's centre, so it grows by half of it above and
 * below; a clipped one from its top.
 */
export const LIFT_SCALE = 1.03;
/** A message too tall for the room is shown clipped to at least this much of its top. */
const MIN_SHOWN = 44;

export interface MenuPlacementInput {
  /** The message (its quote and bubble) on the screen as it was held. */
  top: number;
  height: number;
  /** The window's height (the visual viewport's: what the keyboard leaves). */
  viewport: number;
  /** The tray's height, or 0 when no reactions are offered. */
  trayH: number;
  /** The action list's height, or 0 when it has no rows. */
  listH: number;
}

export interface MenuPlacement {
  /** How far the lifted message glides from where it lay (negative: up). 0 when both fit where it is. */
  shift: number;
  /** How much of the message is shown: all of it, or (`clipped`) its top, a fade at its foot. */
  shown: number;
  clipped: boolean;
  /** The tray's top and the list's top, on the screen. */
  trayTop: number;
  listTop: number;
}

/**
 * The least glide that fits the tray above and the list below: up when the
 * list would run off the foot, down when the tray would run off the top;
 * nothing when both fit where the message is. A message taller than the room
 * left between them is shown clipped to that room, from its top.
 */
export function placeMessageMenu({ top, height, viewport, trayH, listH }: MenuPlacementInput): MenuPlacement {
  const first = MENU_MARGIN;
  const last = viewport - MENU_MARGIN;
  // Lifted from its side's centre, it grows by `grow` above and below.
  const grow = (height * (LIFT_SCALE - 1)) / 2;
  const above = trayH ? trayH + TRAY_GAP + grow : 0;
  const below = listH ? LIST_GAP + listH + grow : 0;
  if (height <= last - first - above - below) {
    let at = top;
    if (at + height + below > last) at = last - below - height;
    if (at - above < first) at = first + above;
    return { shift: at - top, shown: height, clipped: false, trayTop: at - above, listTop: at + height + (listH ? LIST_GAP + grow : 0) };
  }
  // Too tall for the room: shown from its top (lifted from there, so nothing grows past the clip), in all the
  // room the two leave.
  const aboveClipped = trayH ? trayH + TRAY_GAP : 0;
  const belowClipped = listH ? LIST_GAP + listH : 0;
  const shown = Math.max(MIN_SHOWN, last - first - aboveClipped - belowClipped);
  const at = first + aboveClipped;
  return { shift: at - top, shown, clipped: true, trayTop: first, listTop: at + shown + (listH ? LIST_GAP : 0) };
}

/**
 * Where a piece `width` wide lines up with the message: its right edge on the
 * message's for the viewer's own (`right`), its left edge on theirs — kept
 * {@link MENU_MARGIN} from the window's sides.
 */
export function alignToMessage(width: number, left: number, right: number, own: boolean, windowWidth: number): number {
  const x = own ? right - width : left;
  return Math.min(Math.max(MENU_MARGIN, x), Math.max(MENU_MARGIN, windowWidth - MENU_MARGIN - width));
}

/** Between a fine pointer's popover and the button it belongs to (the ☺, the ⋯, a reaction chip). */
export const POPOVER_GAP = 8;

export interface PopoverInput {
  /** The button it belongs to, on the screen. */
  anchor: { top: number; bottom: number; left: number; right: number };
  /** The popover's own size. */
  width: number;
  height: number;
  /** The side it would rather be on: the reactions over the ☺, the actions under the ⋯. */
  prefer: 'above' | 'below';
  /**
   * Which edges line up — the popover's right on the button's (`end`, the viewer's own message, whose tools
   * stand left of it) or its left on the button's (`start`, theirs): it reaches toward the thread's middle.
   */
  align: 'start' | 'end';
  /** The window's size. */
  viewport: { width: number; height: number };
}

/**
 * Where a fine pointer's popover goes (round 16 review M3): {@link POPOVER_GAP}
 * from its button on the side it prefers, on the other when that side has no
 * room, and on the roomier one when neither has; its `align` edge on the
 * button's — all kept {@link MENU_MARGIN} from the window's edges.
 */
export function placePopover({ anchor, width, height, prefer, align, viewport }: PopoverInput): { top: number; left: number; side: 'above' | 'below' } {
  const aboveTop = anchor.top - POPOVER_GAP - height;
  const belowTop = anchor.bottom + POPOVER_GAP;
  const fitsAbove = aboveTop >= MENU_MARGIN;
  const fitsBelow = belowTop + height <= viewport.height - MENU_MARGIN;
  const side: 'above' | 'below' =
    prefer === 'above'
      ? fitsAbove || (!fitsBelow && anchor.top >= viewport.height - anchor.bottom)
        ? 'above'
        : 'below'
      : fitsBelow || (!fitsAbove && viewport.height - anchor.bottom >= anchor.top)
        ? 'below'
        : 'above';
  const rawTop = side === 'above' ? aboveTop : belowTop;
  const top = Math.min(Math.max(MENU_MARGIN, rawTop), Math.max(MENU_MARGIN, viewport.height - MENU_MARGIN - height));
  const x = align === 'end' ? anchor.right - width : anchor.left;
  const left = Math.min(Math.max(MENU_MARGIN, x), Math.max(MENU_MARGIN, viewport.width - MENU_MARGIN - width));
  return { top, left, side };
}

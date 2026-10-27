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
/** The lifted message is drawn this much larger (from its side's centre): it grows by half of it above and below. */
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
  const grow = (height * (LIFT_SCALE - 1)) / 2;
  const above = trayH ? trayH + TRAY_GAP + grow : 0;
  const below = listH ? LIST_GAP + listH + grow : 0;
  const first = MENU_MARGIN;
  const last = viewport - MENU_MARGIN;
  const room = last - first - above - below;
  let at = top;
  let shown = height;
  let clipped = false;
  if (height > room) {
    shown = Math.max(MIN_SHOWN, room);
    clipped = true;
    at = first + above;
  } else {
    if (at + height + below > last) at = last - below - height;
    if (at - above < first) at = first + above;
  }
  return {
    shift: at - top,
    shown,
    clipped,
    trayTop: at - above,
    listTop: at + shown + (listH ? LIST_GAP + grow : 0),
  };
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

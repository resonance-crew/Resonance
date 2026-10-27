'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type UIEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { HeaderBar } from '@/components/sections/AppHeader/HeaderBar';
import { HEADER_TOTAL_H } from '@/components/sections/AppHeader/HeaderChrome';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { makePrng } from '@/lib/design/prng';
import { INK_STRONG } from '@/lib/design/strokes';
import { pointsToBezier } from '@/lib/design/wavyPath';
import { wobRect } from '@/lib/design/wobRect';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import { PaneHeader } from './PaneHeader';
import styles from './WriteWorkspace.module.css';

/* The editor pane may shrink to a comfortable reading column and grow at most
   to a 1:1 split — the map keeps at least half the screen or it stops being a
   map (desktop; below 1200px the pane simply covers the viewport). */
export const MIN_EDITOR_FRAC = 0.32;
export const MAX_EDITOR_FRAC = 0.5;
/** Dragged on past the narrowest, a pane narrower than this hides on release. */
export const HIDE_EDITOR_FRAC = 0.18;
/**
 * The writer's pane dragged on past 1:1 follows the pointer; released at
 * least this wide it takes the whole width (the apps' EditorSplit / PaneDrag
 * rule), released short of it it springs back to 1:1.
 */
export const FULL_EDITOR_FRAC = 0.75;
/** One arrow key's step of the divider. */
const KEY_STEP = 0.02;
/** How far the docked grip is dragged toward the map before it shows the pane. */
const SHOW_DRAG_PX = 8;
/**
 * A throw (round 17 §5.1): released moving at least this fast (px per ms, over the last {@link THROW_WINDOW_MS}
 * of its moves) after at least {@link THROW_TRAVEL_PX} of travel, the divider goes on to the next stop in its
 * direction — toward the map, the whole width (the writer's pane; 1:1 for another); back toward the pane's side,
 * folded away.
 */
export const THROW_SPEED = 0.5;
export const THROW_WINDOW_MS = 80;
export const THROW_TRAVEL_PX = 24;
/**
 * A release this long after the last move is a hand that had stopped (round 17 review W1): no throw. Within it
 * the release is one frame after the last move, as a mouse or a trackpad lets go (33 ms at 30 fps).
 */
export const THROW_STOP_MS = 50;
/** Samples nearer together than this say nothing of a speed (one frame's coalesced moves). */
const THROW_MIN_SPAN_MS = 8;

/**
 * How fast the pointer was going as it let go at `t` (px per ms, negative toward the left; 0 when unknown or
 * stopped) — from its moves alone (round 17 review W1): the last {@link THROW_WINDOW_MS} of `moves` (the press
 * among them), the release point `x` counted only when it moved past the last one. A release usually comes a
 * frame after the last move at the same x; counted, it added time with no distance and a fast drag sprang back.
 * More than {@link THROW_STOP_MS} after the last move, the hand had stopped: 0.
 */
export function releaseSpeed(moves: { t: number; x: number }[], t: number, x?: number): number {
  const last = moves[moves.length - 1];
  if (!last || t - last.t > THROW_STOP_MS) return 0;
  const points = x != null && x !== last.x && t > last.t ? [...moves, { t, x }] : moves;
  const end = points[points.length - 1];
  const recent = points.filter((p) => p.t >= end.t - THROW_WINDOW_MS && p.t <= end.t);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const span = end.t - first.t;
  return span >= THROW_MIN_SPAN_MS ? (end.x - first.x) / span : 0;
}

/** The grip's box and its mark (round 17 §5.4): a short vertical pen stroke, 40 tall, three gentle waves of the hand. */
const GRIP_W = 28;
const GRIP_H = 52;
function gripMark(): string {
  const rnd = makePrng(23);
  const top = (GRIP_H - 40) / 2;
  // Laid along x (the bezier helper's axis), then turned to stand along y.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const lean = i === 0 || i === 6 ? 0 : (i % 2 ? 1 : -1) * (1.5 + (rnd() - 0.5) * 0.4);
    pts.push([top + (i * 40) / 6, GRIP_W / 2 + lean]);
  }
  return pointsToBezier(pts).replace(/(-?[\d.]+),(-?[\d.]+)/g, '$2,$1');
}

export interface WorkspaceShellProps {
  /** Whether there is something in the right (editor) pane; none = full-bleed map. */
  open: boolean;
  /**
   * Closes the pane below the split, where it covers the map (the
   * thought-map page; the writer's bar has the way back instead): the pane's
   * header row carries the control, and Escape does it.
   */
  onClose?: () => void;
  /**
   * At the split, the pane folded away by its divider (or Escape) — kept
   * mounted as it was, the map taking the whole width: what it shows is to be
   * saved at once.
   */
  onHide?: () => void;
  /** What the pane shows, named in its header row below the split (with `onClose` and no `bar`). */
  paneTitle?: ReactNode;
  /** The header row's back, when it isn't 返回 (the publish step's 繼續寫), and whether it waits. */
  paneBack?: { label?: string; disabled?: boolean };
  /**
   * Which card the pane shows (its id): another card opened while the pane is
   * open starts at its top, the header's line at rest; and closing the pane
   * hands focus back to that card on the map when what opened it is gone.
   */
  paneKey?: string;
  /** Host override for the map's「開啟卡片」. */
  onOpenCard?: (card: Card) => void;
  /**
   * The card the pane shows, when it may be on the map: the map brings it to
   * the centre of what is left of it whenever its width settles (the pane
   * opened or shown again, another card opened, the divider released).
   */
  focusCardId?: string | null;
  /** Replaces the map entirely (resonance writing shows the original card). */
  leftOverride?: ReactNode;
  /**
   * The writer's bar below the split, as on the apps' writer page: the back
   * arrow and the title of what the pane shows, what scrolls passing under
   * its pen line, over the pane that covers the map. At the split the
   * workspace is one page with the thought map's: no bar, the Leave floating
   * over the map (`onLeave`) its way back.
   */
  bar?: { title: ReactNode; onBack: () => void; backDisabled?: boolean; backLabel?: string };
  /**
   * The Leave's words over the map at the split (and its glyph's name at the whole width) — 離開 while writing,
   * the step's way back (繼續寫) in the publish step (round 17 §5.3: one back, the host's `onLeave` step-aware).
   */
  leaveLabel?: string;
  /** The Leave waits (a publish on its way). */
  leaveDisabled?: boolean;
  /**
   * The pane's save state (the editor's SaveState): after the title in the
   * writer's bar or the pane's header row below the split; at the split, just
   * before the floating ✓ while there is one (the publish step says it in its
   * own heading row).
   */
  paneStatus?: ReactNode;
  /** The Leave floating over the map; the page's history back without it. */
  onLeave?: () => void;
  /**
   * What the pane does next (the editor's 下一步): at the end of the writer's
   * bar or the pane's header row below the split; at the split, where the
   * pane has neither, it floats at the pane's top-right — the Leave's mirror
   * over the map — outside what scrolls, so it never scrolls away and folds
   * with the pane.
   */
  paneAction?: ReactNode;
  /** The bar's (or the pane header's) title, for a host that moves the focus to it. */
  titleRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

/** Which edge a docked grip sits on: the trailing one (the pane folded away) or the leading one (full width). */
type Dock = 'end' | 'start';

/**
 * The unified full-viewport workspace: thought map fixed on the left, the
 * pane on the right — at the split (≥ 1200px) one page whichever way it was
 * come into (the writer, or the thought-map page): no bar, no header row in
 * the pane, the Leave floating over the map. The boundary is the pane's own
 * straight edge, and a grip riding on it is the divider: dragged, it resizes
 * the editor (32–50 % of the width); dragged on toward the edge, the pane
 * follows, dims once narrower than 18 %, and hides on release there (the
 * pill says so) — the grip then docks at the edge and shows it again, as it
 * was. Below the split the pane covers the map: the writer stands its bar
 * over it, the thought-map page's pane has its own header row.
 */
export function WorkspaceShell({
  open,
  onClose,
  onHide,
  paneTitle,
  paneBack,
  paneKey,
  onOpenCard,
  focusCardId,
  leftOverride,
  bar,
  onLeave,
  leaveLabel: leaveWords,
  leaveDisabled = false,
  paneStatus,
  paneAction,
  titleRef,
  children,
}: WorkspaceShellProps) {
  const t = useTranslations('write');
  const tMap = useTranslations('me.thoughtMap');
  const tNav = useTranslations('app.nav');
  const isMobile = useIsMobile(640);
  const router = useRouter();
  const paneId = useId();
  // Below the desktop split (the module CSS's 1200px) the open pane covers
  // the map: there it mounts — reading the map and every card on it — only
  // once it is shown, and then stays (a card opened from it returns to it).
  // Unknown until hydrated, so a phone never mounts it in passing.
  const split = useMediaQuery('(min-width: 1200px)');
  const mapShown = useRef(false);
  if (!leftOverride && (!open || split === true)) mapShown.current = true;

  const shellRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [editorFrac, setEditorFrac] = useState(MAX_EDITOR_FRAC);

  // At the split the pane can be folded away by its divider: kept mounted (what it shows stays as it was), the
  // map taking the whole width. Nothing in the pane, nothing folded; a card opened from the map shows it again.
  const [hidden, setHidden] = useState(false);
  if (!open && hidden) setHidden(false);
  const folded = hidden && open && split === true;
  // The writer's pane dragged out to the whole width (round 16 §7, the apps' full mode): the map hidden behind
  // it, the grip docked at the leading edge to bring the map back at 1:1. No bar comes in: the Leave stays
  // where it floated over the map and the ✓ where it floated over the pane, so nothing moves under the eye on
  // release. Only the writer's, only at the split, never remembered.
  const canFull = !!bar;
  const [fullState, setFull] = useState(false);
  if (fullState && (!open || !canFull || split === false)) setFull(false);
  const full = fullState && open && split === true && !folded;
  const dock: Dock | undefined = folded ? 'end' : full ? 'start' : undefined;

  // A drag of the divider: `over` is the pane's width while dragged on past the narrowest (it follows the
  // pointer there), null within 32–50 %; `from` the width it had when the drag began, which it shows again
  // at if this drag hides it.
  // Where the drag is now (`over`, `beyond`) is kept here too: a release that comes before the last move's render
  // (a fast drag — round 17 §5.1) is judged by where the pointer was, not by the render before it. `samples` are
  // its recent moves, for the speed it is released at.
  const drag = useRef<{
    id: number;
    from: number;
    x: number;
    docked: Dock | undefined;
    shown: boolean;
    over: number | null;
    beyond: number | null;
    samples: { t: number; x: number }[];
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  // Past 1:1 (the writer's pane only), the pane's width as the pointer has it, else null.
  const [beyond, setBeyond] = useState<number | null>(null);
  const inFullZone = beyond != null && beyond >= FULL_EDITOR_FRAC;
  // How the pane eases to where it was left: a pointer's release settles at once (no swing after the mouse
  // has let go — round 16 §7), a key's step and the spring back to the narrowest keep their spring.
  const [ease, setEase] = useState<'release' | 'spring'>('spring');
  // Bumped once the divider has been released (or stepped by a key): the map's width has settled.
  const [settleKey, setSettleKey] = useState(0);
  const settle = () => setSettleKey((k) => k + 1);
  const inHideZone = over != null && over < HIDE_EDITOR_FRAC;

  const hide = () => {
    // What had the focus in the pane goes with it: the docked grip is where it shows again.
    const active = document.activeElement;
    if (active instanceof HTMLElement && paneRef.current?.contains(active)) railRef.current?.focus();
    setHidden(true);
    // Shown again, it comes back at 1:1, not over the whole width.
    if (full) {
      setFull(false);
      setEditorFrac(MAX_EDITOR_FRAC);
    }
    onHide?.();
  };
  const show = () => setHidden(false);
  // From the whole width back to the map beside the pane, 1:1.
  const unfill = () => {
    setFull(false);
    setEditorFrac(MAX_EDITOR_FRAC);
    settle();
  };

  const fracAt = (clientX: number) => {
    const r = shellRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return (r.right - clientX) / r.width;
  };

  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = {
      id: e.pointerId,
      from: editorFrac,
      x: e.clientX,
      docked: dock,
      shown: false,
      over: null,
      beyond: null,
      samples: [{ t: e.timeStamp, x: e.clientX }],
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!dock) setDragging(true);
  };
  const onRailPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // A mouse moving with no button held is not dragging: its release went somewhere the rail never heard of
    // (out of the window, a lost capture). It ends here — a hover never moves the divider. While the rail still
    // holds the pointer's capture the release is still to come (a capture ends with it), so the move is the
    // drag's: a fast trackpad drag can report no button on a move.
    if (e.pointerType === 'mouse' && e.buttons === 0 && !e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      finishDrag(e.clientX, true, e.timeStamp);
      return;
    }
    d.samples.push({ t: e.timeStamp, x: e.clientX });
    if (d.samples.length > 12) d.samples.shift();
    if (d.docked === 'end') {
      // Docked at the trailing edge: drawn toward the map, the pane comes back as it was.
      if (!d.shown && d.x - e.clientX > SHOW_DRAG_PX) {
        d.shown = true;
        show();
      }
      return;
    }
    if (d.docked === 'start') {
      // Docked at the leading edge (full width): drawn toward the middle, the map comes back at 1:1.
      if (!d.shown && e.clientX - d.x > SHOW_DRAG_PX) {
        d.shown = true;
        unfill();
      }
      return;
    }
    const f = fracAt(e.clientX);
    if (f == null) return;
    if (f > MAX_EDITOR_FRAC && canFull) {
      d.over = null;
      d.beyond = Math.min(1, f);
      setEditorFrac(MAX_EDITOR_FRAC);
    } else if (f >= MIN_EDITOR_FRAC) {
      d.over = null;
      d.beyond = null;
      setEditorFrac(Math.min(MAX_EDITOR_FRAC, f));
    } else {
      d.over = Math.max(0, f);
      d.beyond = null;
      setEditorFrac(MIN_EDITOR_FRAC);
    }
    setOver(d.over);
    setBeyond(d.beyond);
  };
  /** The drag is over — released (or `cancelled`: lost, left the window) at `clientX`, at `t` (the event's time). */
  const finishDrag = (clientX: number, cancelled: boolean, t?: number) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    if (d.docked) {
      // A tap on a docked grip: at the trailing edge it shows the pane again, at the leading one the map.
      if (!cancelled && !d.shown && Math.abs(clientX - d.x) <= SHOW_DRAG_PX) {
        if (d.docked === 'end') show();
        else unfill();
      }
      return;
    }
    // Thrown (round 17 §5.1): released moving fast after a real travel, the divider goes on to the next stop in
    // its direction — toward the map the whole width (the writer's pane; another stops at 1:1), back toward the
    // pane's side folded away, to come back at the width it had.
    const speed = t == null ? 0 : releaseSpeed(d.samples, t, clientX);
    const thrown = !cancelled && Math.abs(clientX - d.x) >= THROW_TRAVEL_PX && Math.abs(speed) >= THROW_SPEED;
    // Released past the hide line: the pane slides away, to come back at the width it had. Between it and the
    // narrowest, the pane springs back to the narrowest. Past 3/4 of the width it takes the whole; between 1:1
    // and there, it eases back to 1:1 — judged by where the drag was, never by a render that hadn't caught up.
    const hideZone = d.over != null && d.over < HIDE_EDITOR_FRAC;
    const fullZone = d.beyond != null && d.beyond >= FULL_EDITOR_FRAC;
    setEase(d.over != null && !thrown ? 'spring' : 'release');
    if (thrown && speed > 0) {
      setEditorFrac(d.from);
      hide();
    } else if (thrown) {
      if (canFull) setFull(true);
      else setEditorFrac(MAX_EDITOR_FRAC);
      settle();
    } else if (!cancelled && hideZone) {
      setEditorFrac(d.from);
      hide();
    } else if (!cancelled && fullZone) {
      setFull(true);
      settle();
    } else settle();
    setOver(null);
    setBeyond(null);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (drag.current?.id !== e.pointerId) return;
    finishDrag(e.clientX, cancelled, e.timeStamp);
  };
  // The window losing the focus mid-drag (another app, a dialog) ends the drag where it was, as a cancel.
  useEffect(() => {
    if (!dragging) return;
    const onBlur = () => finishDrag(0, true);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // A separator the keyboard moves too: the arrows resize (toward the map widens the editor; from the docked
  // edge, shows it), Enter and Space hide and show.
  const onRailKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    setEase('spring');
    if (e.key === 'Home' && canFull && !folded) {
      // The separator's far end toward the map: the whole width.
      e.preventDefault();
      if (!full) {
        setFull(true);
        settle();
      }
    } else if (e.key === 'End' && !folded) {
      // Its other end: folded away.
      e.preventDefault();
      hide();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (folded) show();
      else if (full) unfill();
      else hide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (folded) show();
      else if (full) return;
      else if (canFull && editorFrac >= MAX_EDITOR_FRAC) {
        // From 1:1, one more step toward the map is the whole width.
        setFull(true);
        settle();
      } else {
        setEditorFrac((f) => Math.min(MAX_EDITOR_FRAC, +(f + KEY_STEP).toFixed(2)));
        settle();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (full) unfill();
      else if (!folded) {
        setEditorFrac((f) => Math.max(MIN_EDITOR_FRAC, +(f - KEY_STEP).toFixed(2)));
        settle();
      }
    }
  };

  // The writer's bar (below the split) inks its pen line in whole while anything under it has scrolled (the
  // draft, or the original card beside it).
  const barShown = !!bar && split !== true;
  const scrolledUnder = useRef(new Set<Element>());
  const [scrolled, setScrolled] = useState(false);
  const onScrollCapture = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.scrollTop > 20) scrolledUnder.current.add(el);
    else scrolledUnder.current.delete(el);
    setScrolled([...scrolledUnder.current].some((x) => x.isConnected));
  };

  // The thought-map page's pane below the split: a header row of its own (no writer's bar), whose pen line
  // inks in whole while anything under it has scrolled (the editor, or the reading panel's own scroller). At
  // the split the pane has none: one page with the writer's.
  const headed = open && !bar && !!onClose && split !== true;
  const paneScrolledUnder = useRef(new Set<Element>());
  const [paneScrolled, setPaneScrolled] = useState(false);
  const onPaneScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.scrollTop > 4) paneScrolledUnder.current.add(el);
    else paneScrolledUnder.current.delete(el);
    setPaneScrolled([...paneScrolledUnder.current].some((x) => x.isConnected));
  };
  const mapRef = useRef<HTMLDivElement>(null);
  const paneBodyRef = useRef<HTMLDivElement>(null);
  // A pane opened again, or showing another card, starts at its top, its line
  // at rest (before it paints: never a frame of the last card's scroll).
  useLayoutEffect(() => {
    paneScrolledUnder.current.clear();
    setPaneScrolled(false);
    if (paneBodyRef.current) paneBodyRef.current.scrollTop = 0;
  }, [open, paneKey]);

  // Below the split the open pane covers the map: nothing on it can be
  // reached (Tab would walk controls no one sees) or keep the focus.
  const mapCovered = open && split === false;

  // Closing the pane unmounts what had the focus (its →|, the field being
  // written in): hand it back to what opened the card — the card's 開啟卡片
  // on the map, or the card itself — rather than drop it to the page. A card
  // opened from the map shows a folded pane again.
  const openerRef = useRef<HTMLElement | null>(null);
  const openFromMap = onOpenCard
    ? (card: Card) => {
        const active = document.activeElement;
        openerRef.current = active instanceof HTMLElement && mapRef.current?.contains(active) ? active : null;
        setHidden(false);
        onOpenCard(card);
      }
    : undefined;
  const shownKey = useRef<string | undefined>(undefined);
  const wasOpen = useRef(open);
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (open) {
      shownKey.current = paneKey;
      return;
    }
    if (!closing || bar || !onClose) return;
    const map = mapRef.current;
    if (!map) return;
    const active = document.activeElement;
    if (active && active !== document.body && map.contains(active)) return;
    const opener = openerRef.current;
    const node = Array.from(map.querySelectorAll<HTMLElement>('[data-card-id]')).find(
      (el) => el.dataset.cardId === shownKey.current,
    );
    const back = opener?.isConnected && map.contains(opener) ? opener : node;
    back?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paneKey]);

  // Escape folds the pane away at the split (the writer's or the map page's)
  // and closes the map page's covering pane below it, as its →| does —
  // unless something over it is the one to close (a dialog, a menu, an open
  // list: they stand on the page), the key ends an input method's
  // composition (a Chinese IME's Escape only drops its candidates), or it is
  // a field on the map's own (an edge label being named lets Escape cancel
  // it). A card just opened from the map leaves the focus on its 開啟卡片 (or
  // on the card): Escape works from there too. Typing in a field, Escape
  // first steps out of it — to the divider at the split, to the →| below it
  // (whose tooltip says what the next Escape does) — so a stray press never
  // folds away the card being written. Heard on the way down, as the story
  // editor keeps every Escape to itself.
  const escapes = open && !folded && (split === true || headed);
  useEffect(() => {
    if (!escapes) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('[role="menu"], [role="listbox"], [aria-modal="true"]')) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      // A toolbar keeps its Escape (the story's selection bubble gives the words back with it), and a publish
      // on its way holds the pane where it is.
      if (target?.closest('[role="toolbar"]')) return;
      if (paneRef.current?.querySelector('[data-step-pending]')) return;
      const editable = !!target && (target.isContentEditable || target.matches('input, textarea, select'));
      // A field on the map (an arrow's label, a region's title being named)
      // keeps its Escape, which cancels it; its buttons and cards do not.
      if (editable && mapRef.current?.contains(target)) return;
      if (editable) {
        if (split === true) railRef.current?.focus();
        else paneRef.current?.querySelector<HTMLButtonElement>('header button')?.focus();
        return;
      }
      // Full width, Escape brings the map back beside the pane (1:1) rather than folding the card away.
      if (split === true) {
        if (full) unfill();
        else hide();
      } else onClose?.();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escapes, split, onClose, onHide, full]);

  const leaveLabel = leaveWords ?? tMap('leave');
  const leave = onLeave ?? (() => router.back());
  const shownFrac = folded ? 0 : full ? 1 : (over ?? beyond ?? editorFrac);

  // The grip's mark and the disc of ink behind it on hover (round 17 §5.4).
  const mark = useMemo(gripMark, []);
  const disc = useMemo(() => wobRect(GRIP_W, GRIP_H, GRIP_W / 2, 29, 1.2, { segmentsH: 1, segmentsV: 2, curve: 1.2 }), []);
  const gripRef = useRef<HTMLDivElement>(null);
  const [gripHover, setGripHover] = useState({ x: GRIP_W / 2, y: GRIP_H / 2, on: false });
  const brushGrip = (e: ReactPointerEvent<HTMLDivElement>, on: boolean) => {
    if (e.pointerType !== 'mouse') return;
    const r = gripRef.current?.getBoundingClientRect();
    setGripHover({ x: r ? e.clientX - r.left : GRIP_W / 2, y: r ? e.clientY - r.top : GRIP_H / 2, on });
  };

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      data-bar={bar ? '' : undefined}
      data-full={full || undefined}
      onScrollCapture={barShown ? onScrollCapture : undefined}
      style={
        {
          '--editor-frac': shownFrac,
          '--min-editor-frac': MIN_EDITOR_FRAC,
          // Under the bar (below the split) everything keeps clear of it as of the app header.
          ...(bar && { '--bar-h': `${HEADER_TOTAL_H}px` }),
        } as CSSProperties
      }
    >
      {barShown && (
        <div className={styles.barBelowSplit}>
          <HeaderBar
            title={bar.title}
            backLabel={bar.backLabel ?? tNav('back')}
            onBack={bar.onBack}
            backDisabled={bar.backDisabled}
            scrolled={scrolled}
            heading
            status={paneStatus}
            trailing={paneAction}
            titleRef={titleRef}
          />
        </div>
      )}
      {/* At the split the writer's title is the page's heading still, for a screen reader. */}
      {bar && split === true && <h1 className={styles.srOnly}>{bar.title}</h1>}
      <div
        ref={mapRef}
        className={leftOverride ? `${styles.mapPane} ${styles.mapPaneDoc}` : styles.mapPane}
        data-full={full || undefined}
        data-beyond={beyond != null || undefined}
        inert={mapCovered}
      >
        {leftOverride ??
          (mapShown.current && (
            <ThoughtMapBoard
              height="100%"
              flush
              onOpenCard={openFromMap}
              paneOpen={open && !folded}
              focusCardId={focusCardId}
              settleKey={settleKey}
            />
          ))}
        {(!bar || split !== false) && (
          // Floats over the map: the tonal pill, opaque over the board's dots, no pen line of its own. The
          // writer's only at the split (below it, its bar has the way back). At the whole width it stays where
          // it was, over the pane's edge (the map behind it is hidden, the pill is not).
          // At the whole width the pill becomes its glyph alone (round 17 §5.2): the words fade, the paper draws in
          // to the glyph (its own shape narrowing — review W8) as the ← grows to the ✓'s size and ink, then the
          // bare ← takes its place in the same instant and the paper fades — one arrow throughout, on the ✓'s
          // line — and back when the map comes back. Its words follow the step (round 17 §5.3), and so does its
          // name.
          <div className={styles.back} data-split-only={bar ? '' : undefined} data-over-pane={full || undefined} data-glyph={full || undefined}>
            <span className={styles.backPill} aria-hidden={full || undefined} inert={full}>
              <OrganicButton variant="tonal" size="sm" onClick={leave} disabled={leaveDisabled}>
                <span className={styles.backIcon}>
                  <Icon
                    name="arrow-right"
                    size={15}
                    ariaLabel={isMobile ? leaveLabel : undefined}
                  />
                </span>
                {!isMobile && (
                  // Its words in a track of their own, which draws in to nothing at the whole width: the pill's
                  // paper narrows with it, its own wobble re-drawn as it goes — never a straight cut.
                  <span className={styles.backWords}>
                    <span key={leaveLabel} className={styles.backLabel}>
                      {leaveLabel}
                    </span>
                  </span>
                )}
              </OrganicButton>
            </span>
            {canFull && split === true && (
              <span className={styles.backGlyph} aria-hidden={!full || undefined} inert={!full}>
                <BareIconButton
                  icon="arrow-right"
                  mirror
                  tone="ink"
                  iconSize={22}
                  label={leaveLabel}
                  tip="below"
                  tipAlign="start"
                  seed={17}
                  disabled={leaveDisabled}
                  onClick={leave}
                />
              </span>
            )}
          </div>
        )}
      </div>

      {open && (
        <>
          <div
            ref={railRef}
            className={styles.rail}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={folded ? t('openEditor') : full ? t('showMap') : t('resizeDivider')}
            aria-controls={paneId}
            aria-valuemin={0}
            aria-valuemax={canFull ? 100 : Math.round(MAX_EDITOR_FRAC * 100)}
            aria-valuenow={Math.round(shownFrac * 100)}
            aria-valuetext={full ? t('fullEditor') : undefined}
            title={folded ? t('openEditor') : full ? t('showMap') : t('resizeDivider')}
            data-docked={dock}
            data-dragging={dragging || undefined}
            onPointerDown={onRailPointerDown}
            onPointerMove={onRailPointerMove}
            onPointerUp={(e) => endDrag(e, false)}
            onPointerCancel={(e) => endDrag(e, true)}
            // The capture taken from it mid-drag (a re-render, the browser): the drag ends there, never left
            // waiting for a release it will not hear.
            onLostPointerCapture={(e) => endDrag(e, true)}
            onKeyDown={onRailKeyDown}
          >
            {/* One mark wherever the grip is — between the panes, docked at either edge: a short wavy pen stroke,
                terracotta under the hand, the keyboard and a drag, a disc of ink spreading behind it on hover. */}
            <div
              ref={gripRef}
              className={styles.railGrip}
              aria-hidden="true"
              onPointerEnter={(e) => brushGrip(e, true)}
              onPointerLeave={(e) => brushGrip(e, false)}
            >
              <BrushWash
                w={GRIP_W}
                h={GRIP_H}
                d={disc}
                color="color-mix(in oklch, var(--color-terracotta) 14%, transparent)"
                x={gripHover.x}
                y={gripHover.y}
                on={gripHover.on || dragging}
                duration={240}
                overshoot={2}
              />
              <svg className={styles.railMark} width={GRIP_W} height={GRIP_H} viewBox={`0 0 ${GRIP_W} ${GRIP_H}`}>
                <path d={mark} fill="none" stroke="currentColor" strokeWidth={INK_STRONG} strokeLinecap="round" />
              </svg>
            </div>
            {inHideZone && (
              <span className={styles.releasePill} aria-hidden="true">
                {t('releaseToClose')}
              </span>
            )}
            {inFullZone && (
              <span className={styles.releasePill} data-side="pane" aria-hidden="true">
                {t('releaseToFull')}
              </span>
            )}
          </div>

          <section
            id={paneId}
            className={styles.editorPane}
            // What the pane's dialogs centre over (the link editor, round 17 review W10): the pane at the split,
            // the window at the whole width and below the split, where the pane is the window.
            data-dialog-host=""
            data-folded={folded || undefined}
            data-dragging={dragging || undefined}
            data-ease={ease}
            data-dim={inHideZone || undefined}
            inert={folded}
          >
            {/* What the pane shows keeps one place in the tree at every width (the header row comes and goes
                beside it), so crossing the split never remounts the card being written. While the pane is
                narrower than the narrowest (dragged on, sliding away) it keeps that width and is cut at the
                edge: it slides rather than squeezes. */}
            <div className={styles.paneClip}>
              <div ref={paneRef} className={styles.paneHeaded}>
                {headed && (
                  // The header stands over what the pane shows, which scrolls
                  // (and keeps its sticky toolbar) under the header's pen line.
                  <PaneHeader
                    title={paneTitle}
                    backLabel={paneBack?.label ?? tNav('back')}
                    backDisabled={paneBack?.disabled}
                    onBack={onClose!}
                    scrolled={paneScrolled}
                    status={paneStatus}
                    trailing={paneAction}
                    titleRef={titleRef}
                  />
                )}
                {split === true && paneAction != null && (
                  <div className={styles.paneAction}>
                    {paneStatus}
                    {paneAction}
                  </div>
                )}
                <div ref={paneBodyRef} className={styles.paneBody} onScrollCapture={headed ? onPaneScroll : undefined}>
                  {children}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

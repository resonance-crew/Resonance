'use client';

import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keyboardInset } from '@/lib/hooks/useKeyboardInset';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import { ModalCloseRow } from './ModalActions';
import styles from './Modal.module.css';
import { INK } from '@/lib/design/strokes';
import { DIMMED_THEME_COLORS, metaScheme, resolvedAccent } from '@/lib/design/appearance';

export interface ModalProps {
  open: boolean;
  /**
   * Closes it: a click on the backdrop, Escape, and the close itself. Left
   * out while something is in flight (a publish, a delete), when nothing may
   * close it.
   */
  onClose?: () => void;
  children: ReactNode;
  /** Its widest (a number of px, or any CSS length: `min(400px, calc(100vw - 32px))`). */
  maxWidth?: CSSProperties['maxWidth'];
  seed?: number;
  fillColor?: string;
  borderColor?: string;
  padding?: CSSProperties['padding'];
  ariaLabel?: string;
  /** The close's words: its name for a screen reader, and its label with `closeButton`. 關閉 / Close by default. */
  closeLabel?: string;
  /**
   * For a modal whose foot has nothing else to do — a list, a picker, a
   * notice: the close is drawn there, a small tonal pill at the right, as in the
   * apps (`ModalCloseRow`).
   */
  closeButton?: boolean;
  /**
   * It holds a field a phone's keyboard comes up for: it stays centred in the
   * room the keyboard leaves (the visual viewport), not behind the keyboard.
   */
  keyboardAware?: boolean;
  /**
   * The part of the page it belongs to, asked as it opens (and as the window resizes): it centres over that
   * element rather than the window when the element is narrower than the window — the link editor over the
   * writer's pane at the desktop split, not across the map beside it (round 17 review W10). Null, or the whole
   * window, centres it over the window as ever. The scrim still dims the whole window.
   */
  centerOver?: () => HTMLElement | null;
}

/**
 * The part of the window the on-screen keyboard leaves (top and bottom insets
 * of the visual viewport), while `active`: 0, 0 with no keyboard up.
 */
function useVisibleBox(active: boolean): { top: number; bottom: number } {
  const [box, setBox] = useState({ top: 0, bottom: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = { top: Math.max(0, Math.round(vv.offsetTop)), bottom: keyboardInset() };
        setBox((now) => (now.top === next.top && now.bottom === next.bottom ? now : next));
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setBox({ top: 0, bottom: 0 });
    };
  }, [active]);
  return box;
}

/**
 * Where the element `centerOver` names lies across the window (its left and right), while `ask` is given; null when
 * there is none, or it spans the window (nothing to centre over but the window).
 */
function useHostBox(ask: (() => HTMLElement | null) | undefined): { left: number; right: number } | null {
  const [box, setBox] = useState<{ left: number; right: number } | null>(null);
  const askRef = useRef(ask);
  askRef.current = ask;
  const active = ask != null;
  useLayoutEffect(() => {
    if (!active) {
      setBox(null);
      return;
    }
    const update = () => {
      const r = askRef.current?.()?.getBoundingClientRect();
      const next = r && r.width > 0 && r.width < window.innerWidth - 1 ? { left: r.left, right: r.right } : null;
      setBox((now) => (now?.left === next?.left && now?.right === next?.right ? now : next));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [active]);
  return box;
}

/** Room kept between a dialog centred over part of the page and the window's edges. */
const EDGE_ROOM = 16;

/**
 * The backdrop's side padding that centres a dialog `w` wide over `host` (its left and right on the screen) in a
 * window `winW` wide: a content box exactly the dialog's width, its middle the host's — moved in as far as it must
 * to keep the dialog {@link EDGE_ROOM} inside the window. Null until the dialog is measured.
 */
export function sidePadding(host: { left: number; right: number }, w: number, winW: number): { left: number; right: number } | null {
  if (!w) return null;
  const box = Math.min(w + 2, winW - 2 * EDGE_ROOM);
  const half = box / 2;
  const mid = Math.min(Math.max((host.left + host.right) / 2, EDGE_ROOM + half), winW - EDGE_ROOM - half);
  return { left: Math.round(mid - half), right: Math.round(winW - mid - half) };
}

/**
 * The browser's own bars (Android Chrome's, an installed app's status bar)
 * are painted in the page's theme colour, which no scrim reaches: while a
 * modal is open they take the scrim's colour over the paper of the theme and
 * scheme each bar stands for (lib/design/appearance DIMMED_THEME_COLORS — the
 * module CSS's `.backdrop` is that same `--scrim`), so the whole screen dims
 * as one and no bright band is left at the top.
 */
let dimmed = 0;
let themeColors: [HTMLMetaElement, string][] = [];

function dimThemeColor() {
  if (dimmed++ > 0) return;
  themeColors = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map(
    (meta) => [meta, meta.content],
  );
  const accent = resolvedAccent();
  for (const [meta] of themeColors) meta.content = DIMMED_THEME_COLORS[accent][metaScheme(meta)];
}

function restoreThemeColor() {
  if (--dimmed > 0) return;
  for (const [meta, content] of themeColors) meta.content = content;
  themeColors = [];
}

/**
 * While `active`, the browser's own bars take the scrim's colour, as under a
 * modal — for anything else that dims the whole window with the same scrim
 * (`--scrim`): the thread's
 * long-press menu.
 */
export function useDimmedChrome(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    dimThemeColor();
    return restoreThemeColor;
  }, [active]);
}

/**
 * Whether `panel` is the dialog on top — the last laid over the page (each is
 * portalled to the end of the body as it opens): a dialog opened over another
 * is the one its keys are for.
 */
function onTop(panel: HTMLElement | null): boolean {
  const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  return !!panel && open[open.length - 1] === panel;
}

/** What Tab can reach inside a dialog. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab and Shift+Tab walk round the dialog instead of out of it into the page
 * under the backdrop (which a click can't reach either): past the last
 * control to the first, before the first to the last.
 */
function keepFocusIn(panel: HTMLElement | null, e: KeyboardEvent) {
  if (!panel) return;
  const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden], [aria-hidden="true"]'));
  if (!stops.length) {
    e.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = stops[0];
  const last = stops[stops.length - 1];
  const at = document.activeElement;
  const inside = at instanceof Node && panel.contains(at);
  if (e.shiftKey && (!inside || at === first || at === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || at === last)) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The hand-drawn dialog. It has no ✕: every way on lies in its own buttons,
 * and a click on the backdrop or Escape closes it (as in the apps). A screen
 * reader still finds a close button inside it — hidden until keyboard focus
 * reaches it — or the visible one at its foot with `closeButton`.
 */
export function Modal({
  open,
  onClose,
  children,
  maxWidth = 440,
  seed = 17,
  fillColor = 'var(--color-card-bg)',
  borderColor = 'var(--modal-border)',
  padding = '32px 28px',
  ariaLabel = 'Dialog',
  closeLabel,
  closeButton = false,
  keyboardAware = false,
  centerOver,
}: ModalProps) {
  const t = useTranslations('safety.report');
  const close = closeLabel ?? t('close');
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // `mounted` must be a measurement dep: when the Modal mounts with `open`
  // already true (conditionally rendered confirms), the first measure effect
  // runs before the portal exists (ref is null) and `open` never changes — so
  // without `mounted` the size stays 0×0 and the wobbly background never draws.
  const { w, h } = useElementSize(ref, 0, 0, [open, mounted]);
  const R = 26;
  const mag = Math.min(w, h) * 0.025;
  // A click closes only when it began on the backdrop too: text selected by
  // dragging out of the dialog must not throw the dialog away.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Another dialog over this one answers the key (or did already).
      if (e.defaultPrevented || !onTop(ref.current)) return;
      if (e.key === 'Escape') {
        if (!onClose) return;
        // This dialog is what Escape closes — nothing under it (a search open over a thread) closes with it.
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        keepFocusIn(ref.current, e);
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useDimmedChrome(open);
  const visible = useVisibleBox(open && keyboardAware);
  const over = useHostBox(open && mounted ? centerOver : undefined);
  const across = over ? sidePadding(over, w, window.innerWidth) : null;

  // Focus goes into the dialog when it opens (unless a field in it took it
  // already), so a screen reader is in it and Tab starts there; it goes back
  // to whatever opened it when it closes.
  useEffect(() => {
    const panel = ref.current;
    if (!open || !mounted || !panel) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return () => {
      const lost = document.activeElement === document.body || panel.contains(document.activeElement);
      if (before?.isConnected && lost) before.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const borderPath =
    w && h
      ? wobRect(w, h, R, seed, mag, {
          segmentsH: [3, 4],
          segmentsV: [5, 6],
          curve: 0.6,
          cornerJitter: 0.9,
          cornerOffset: 5,
        })
      : '';

  return createPortal(
    <div
      className={styles.backdrop}
      style={{
        ...(keyboardAware && (visible.top || visible.bottom) ? { top: visible.top, bottom: visible.bottom } : null),
        ...(across ? { paddingLeft: across.left, paddingRight: across.right } : null),
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose?.();
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        // Until the hand-drawn paper is measured (and while it fades in), the box stands in as a plain
        // rounded one of the same paper and pen, so the content never sits over the page's own words.
        className={`${styles.dialog} res-shape-stand-in`}
        data-shape-pending={w && h ? undefined : ''}
        style={
          {
            maxWidth,
            padding,
            '--shape-fill': fillColor,
            '--shape-ink': borderColor,
            '--shape-ink-width': `${INK}px`,
            '--shape-radius': `${R}px`,
          } as CSSProperties
        }
      >
        <HandDrawnBorder
          w={w} h={h} R={R} seed={seed} mag={mag}
          fillColor={fillColor}
          strokeColor="transparent"
          strokeWidth={0}
          chalkSeed={seed + 1}
          segmentsH={[3, 4]} segmentsV={[5, 6]}
          curve={0.6} cornerJitter={0.9} cornerOffset={5}
        />
        <ShapeGrain w={w} h={h} d={borderPath} opacity={0.3} frequency={0.88} seed={seed} />
        <HandDrawnBorder
          w={w} h={h} R={R} seed={seed} mag={mag}
          strokeColor={borderColor}
          strokeWidth={INK}
          segmentsH={[3, 4]} segmentsV={[5, 6]}
          curve={0.6} cornerJitter={0.9} cornerOffset={5}
        />
        <div className={styles.content}>
          {children}
          {closeButton && onClose && <ModalCloseRow label={close} onClose={onClose} />}
        </div>
        {!closeButton && onClose && (
          <button type="button" className={styles.hiddenClose} onClick={onClose}>
            {close}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

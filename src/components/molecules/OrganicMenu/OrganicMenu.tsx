'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { RowInkWash, useRowInk } from '@/components/atoms/RowInk/RowInk';
import { PaperSheet, sheetPath } from '@/components/atoms/PaperSheet/PaperSheet';
import { wobRect } from '@/lib/design/wobRect';
import { wobCircle } from '@/lib/design/wobCircle';
import { dividerPath, rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import styles from './OrganicMenu.module.css';

export interface OrganicMenuItem {
  key: string;
  /** A hand-drawn icon by name, or an element drawn as it is in the row's 17px icon slot (a brand's mark). */
  icon: IconName | ReactElement;
  label: ReactNode;
  /** The row's accessible name, when it says more than its label (「分享到 LINE」 for a row reading LINE). */
  ariaLabel?: string;
  /** Destructive rows get the warning wash (the card menu's delete-row language). */
  danger?: boolean;
}

export interface OrganicMenuProps {
  items: OrganicMenuItem[];
  onChoose: (key: string) => void;
  /** Accessible name for the trigger button. */
  label: string;
  /** Wobble seed so the trigger chip is deterministic per host. */
  seed?: number;
  /** Accent hue for the chip/panel; defaults to the theme terracotta. */
  hue?: number;
  /** Disables the rows while an action is in flight. */
  busy?: boolean;
  triggerIcon?: IconName;
  triggerSize?: number;
  /**
   * The chip says what it does in words beside its glyph (「更換封面」): a
   * pill `triggerSize` tall, as wide as its words — for a menu nothing else
   * on the page names (a glyph alone on a picture reads as decoration).
   */
  triggerLabel?: string;
  /**
   * For a labelled chip: its own colours instead of the paper (round 9 §8 — the
   * 更換封面 chip wears its card's family): an opaque `fill`, a `pen` line at
   * INK round it (it floats over a picture: the line, not a shadow, parts it
   * from one), and the `ink` of its glyph and words.
   */
  triggerColors?: { fill: string; pen: string; ink: string };
  /**
   * A bare glyph on the page's own paper (no chip): muted ink at rest, a soft
   * disc of ink under it on hover, focus and while open, and `label` shown
   * as a tooltip on hover and keyboard focus — the frameless trigger has to
   * say what it is for. Its hit area is 36px, 44px under a coarse pointer
   * (`triggerSize` is ignored).
   */
  bare?: boolean;
  /**
   * For `bare`: muted ink at rest (default), or full ink — a trigger leading
   * or closing a bar's row beside the bar's back arrow, which is full ink.
   */
  tone?: 'muted' | 'ink';
  /** For `bare`: where its tooltip hangs — over it (default), or under it at the top of a screen. */
  tip?: 'above' | 'below';
  /**
   * The rows' hand-drawn glyphs in the menu's pen (default), or in the page's
   * ink at rest and under the row's wash alike — for a menu whose other rows
   * wear brands' marks, which are never recoloured (the share menu): one
   * column of glyphs in one ink.
   */
  glyphs?: 'pen' | 'ink';
  /** A quiet line under the rows (a message's full time), parted from them by one more divider. */
  footer?: ReactNode;
  /**
   * The footer may run to more than one line (a hint, not a time): it adds
   * no width of its own past 256px and wraps there, and the panel grows
   * with it.
   */
  footerWrap?: boolean;
  /**
   * Asked first when a click would open the menu: returning true says the
   * host has handled the click itself (a share sheet opened in its place),
   * and the panel stays closed. Called inside the click, so whatever it
   * starts keeps the click's user activation.
   */
  onTriggerClick?: () => boolean;
  /**
   * The panel floats over the page (a portal, `position: fixed`) instead of
   * hanging in the trigger's box — for a trigger inside something that
   * scrolls or clips, like a message in a thread. It opens below the trigger,
   * or above it when there is no room below, its `align` edge on the
   * trigger's, and it closes when the page under it scrolls.
   */
  floating?: boolean;
  /** For `floating`: which edges line up — the panel's right on the trigger's (`end`), or its left (`start`). */
  align?: 'start' | 'end';
  /** The trigger's open state changes (a host that keeps its trigger shown while the menu is open). */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * The `--menu-*` colours a panel draws with: the theme's terracotta (the
 * glyphs; the panel's frame and paper are palette.ts's menu-frame and
 * menu-paper, quieter and raised at night), or the accent `hue` at the
 * scheme's lightness (palette.ts HUE_ROLES).
 */
function menuColors(hue: number | undefined): CSSProperties {
  return (
    hue === undefined
      ? {
          '--menu-border': 'var(--color-terracotta)',
          '--menu-border-hover': 'var(--terracotta-deep)',
          '--menu-outline': 'var(--menu-frame)',
          '--menu-cream': 'var(--menu-paper)',
          '--menu-divider': 'color-mix(in oklch, var(--menu-frame) 40%, transparent)',
        }
      : {
          '--menu-border': `oklch(var(--hue-pen) ${hue})`,
          '--menu-border-hover': `oklch(var(--hue-pen-deep) ${hue})`,
          '--menu-outline': `oklch(var(--hue-pen) ${hue})`,
          '--menu-cream': `oklch(var(--hue-menu) ${hue})`,
          '--menu-divider': `oklch(var(--hue-separator) ${hue} / 0.4)`,
        }
  ) as CSSProperties;
}

/** A panel's height: its rows, and the footer line under them (a `sheet` panel's taller rows, pad and parted footer). */
export function menuPanelHeight(rows: number, footer: boolean, sheet = false): number {
  if (sheet) return SHEET_PAD + rows * SHEET_ROW_H + (footer ? SHEET_FOOTER_GAP + SHEET_FOOTER_H : SHEET_PAD);
  return rows * ROW_H + (footer ? FOOTER_H : 0);
}

/** Room kept between a floating panel and the window's edge. */
const EDGE = 12;

/**
 * The organic「⋯」dropdown, extracted from the card menu's language: a wobbly
 * chip trigger dropping a hand-drawn panel with wavy pen dividers and a
 * spreading ink wash on the hovered row. Closes on outside pointer-down or
 * Escape. The chip is paper with no rim — it sits on a card's cover or beside
 * a title, already framed, like the apps' (their bars draw the glyph bare).
 */
export function OrganicMenu({
  items,
  onChoose,
  label,
  seed = 7,
  hue,
  busy = false,
  triggerIcon = 'dots',
  triggerSize = 38,
  triggerLabel,
  triggerColors,
  bare = false,
  tone = 'muted',
  tip = 'above',
  glyphs = 'pen',
  footer,
  footerWrap = false,
  onTriggerClick,
  floating = false,
  align = 'end',
  onOpenChange,
  className,
}: OrganicMenuProps) {
  const [open, setOpen] = useState(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  // A floating panel's place on the screen, from the trigger's as it opened.
  const [placed, setPlaced] = useState<CSSProperties | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Escape puts away a bare trigger's tooltip until the pointer or focus
  // leaves (content shown on hover or focus has to be dismissible).
  const [tipDismissed, setTipDismissed] = useState(false);
  const [panelSeed, setPanelSeed] = useState(seed);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // A pill's width is its words': its outline is drawn once it is measured (only a pill is watched — a
  // thread holds a menu per message).
  const pill = !bare && triggerLabel !== undefined;
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const setTrigger = useCallback(
    (el: HTMLButtonElement | null) => {
      triggerRef.current = el;
      pillRef.current = pill ? el : null;
    },
    [pill],
  );
  const { w: pillW } = useElementSize(pillRef, 0, 0, [triggerLabel, pill]);
  // Opened from the keyboard: the focus goes to the first row (a pointer's opening leaves no ring on it).
  const [byKeyboard, setByKeyboard] = useState(false);
  /** Closes it — and, when the focus was in the panel, puts it back on the trigger, where the reader was. */
  const closeMenu = useCallback(() => {
    const had = panelRef.current?.contains(document.activeElement);
    setOpen(false);
    if (had) triggerRef.current?.focus({ preventScroll: true });
  }, []);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    // A floating panel stays where it opened: whatever scrolls under it takes it away.
    function onScroll(e: Event) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    if (floating) {
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', close);
    }
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, floating, closeMenu]);

  const styleOverrides = {
    ...menuColors(hue),
    ...(glyphs === 'ink' ? { '--menu-glyph': 'var(--color-text)', '--menu-glyph-active': 'var(--color-text)' } : {}),
  } as CSSProperties;

  /** Where a floating panel goes: under the trigger when it fits, else over it; its `align` edge on the trigger's. */
  function place(trigger: HTMLElement): CSSProperties {
    const r = trigger.getBoundingClientRect();
    const h = menuPanelHeight(items.length, footer != null);
    const below = r.bottom + 8 + h <= window.innerHeight - EDGE || r.top - 8 - h < EDGE;
    return {
      ...(below ? { top: r.bottom + 8 } : { bottom: window.innerHeight - r.top + 8 }),
      ...(align === 'end'
        ? { right: Math.max(EDGE, window.innerWidth - r.right) }
        : { left: Math.max(EDGE, r.left) }),
      transformOrigin: `${below ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}`,
    };
  }

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={styleOverrides}
    >
      <button
        ref={setTrigger}
        type="button"
        className={bare ? `${styles.trigger} ${styles.bare}` : pill ? `${styles.trigger} ${styles.pill}` : styles.trigger}
        style={
          bare
            ? undefined
            : pill
              ? { height: triggerSize, ...(triggerColors ? { color: triggerColors.ink } : {}) }
              : { width: triggerSize, height: triggerSize }
        }
        data-colored={(pill && triggerColors) || undefined}
        data-open={open || undefined}
        data-tone={bare ? tone : undefined}
        data-icon={triggerIcon}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={label}
        onKeyDown={bare ? (e) => e.key === 'Escape' && setTipDismissed(true) : undefined}
        onMouseLeave={bare ? () => setTipDismissed(false) : undefined}
        onBlur={bare ? () => setTipDismissed(false) : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // The host may answer a click that would open the menu itself.
          if (!open && onTriggerClick?.()) return;
          if (floating) setPlaced(place(e.currentTarget));
          // Enter or Space on the trigger is a click with no pointer behind it.
          setByKeyboard(e.detail === 0);
          setOpen((v) => {
            const next = !v;
            if (next) setPanelSeed(Math.floor(Math.random() * 10000));
            return next;
          });
        }}
      >
        {bare ? (
          <BareWash seed={seed} />
        ) : pill ? (
          pillW > 0 && (
            <HandDrawnBorder
              w={pillW}
              h={triggerSize}
              R={triggerSize * 0.42}
              seed={seed}
              mag={triggerSize * 0.03}
              fillColor={triggerColors?.fill ?? 'color-mix(in oklch, var(--menu-cream) 94%, transparent)'}
              strokeColor={triggerColors?.pen}
              strokeWidth={INK}
              segmentsH={2}
              segmentsV={1}
              curve={1.4}
              cornerJitter={2.4}
            />
          )
        ) : (
          <HandDrawnBorder
            w={triggerSize}
            h={triggerSize}
            R={triggerSize * 0.42}
            seed={seed}
            mag={triggerSize * 0.03}
            fillColor="color-mix(in oklch, var(--menu-cream) 94%, transparent)"
            segmentsH={1}
            segmentsV={1}
            curve={1.4}
            cornerJitter={2.4}
          />
        )}
        <span className={styles.triggerIcon}>
          <Icon name={triggerIcon} size={bare ? 22 : pill ? 16 : Math.round(triggerSize * 0.53)} strokeWidth={INK} />
        </span>
        {pill && <span className={styles.triggerLabel}>{triggerLabel}</span>}
      </button>
      {bare && (
        <span className={styles.tip} aria-hidden="true" data-side={tip} data-dismissed={tipDismissed || undefined}>
          {label}
        </span>
      )}

      {open &&
        (floating && placed ? (
          createPortal(
            <div className={styles.floating} style={{ ...styleOverrides, ...placed }}>
              <MenuPanel
                ref={panelRef}
                uid={uid}
                seed={panelSeed}
                items={items}
                busy={busy}
                footer={footer}
                footerWrap={footerWrap}
                placed
                // Laid at the end of the page, the panel is out of the trigger's tab order: it takes the focus
                // (its first row, from the keyboard), and Tab out of it closes it, back on the trigger.
                autoFocus={byKeyboard ? 'row' : 'panel'}
                onTabOut={closeMenu}
                onChoose={(key) => {
                  closeMenu();
                  onChoose(key);
                }}
              />
            </div>,
            document.body,
          )
        ) : (
          <MenuPanel
            ref={panelRef}
            uid={uid}
            seed={panelSeed}
            items={items}
            busy={busy}
            footer={footer}
            footerWrap={footerWrap}
            autoFocus={byKeyboard ? 'row' : null}
            onChoose={(key) => {
              closeMenu();
              onChoose(key);
            }}
          />
        ))}
    </div>
  );
}

export interface OrganicMenuPanelProps {
  items: OrganicMenuItem[];
  onChoose: (key: string) => void;
  seed: number;
  busy?: boolean;
  /** A quiet line under the rows, parted from them by one more divider. */
  footer?: ReactNode;
  hue?: number;
  /** The corner it grows from (CSS `transform-origin`): the edge of what it belongs to. */
  origin?: string;
  /**
   * A borderless paper sheet (round 16 §3, the message menu's actions): no
   * pen line round it and no dividers between its rows — the menu's paper and
   * grain (atoms/PaperSheet) — rows 44 tall, the footer parted by space
   * alone; 216 wide at least, growing to its longest row up to 280.
   */
  sheet?: boolean;
  /** Where the focus goes as it opens (default: nowhere — the host decides). */
  autoFocus?: 'row' | 'panel' | null;
  className?: string;
}

/**
 * The menu's panel on its own, for a host that places it — the thread's
 * long-press menu, which hangs it under the message it lifted. The same
 * wobbly card, wavy dividers and spreading row ink as the dropdown's (or,
 * as a `sheet`, the ink alone on bare paper).
 */
export function OrganicMenuPanel({ items, onChoose, seed, busy = false, footer, hue, origin, sheet = false, autoFocus = null, className }: OrganicMenuPanelProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className={className} style={{ ...menuColors(hue), ...(origin ? { transformOrigin: origin } : {}) }}>
      <MenuPanel uid={uid} seed={seed} items={items} busy={busy} footer={footer} placed sheet={sheet} autoFocus={autoFocus} onChoose={onChoose} />
    </div>
  );
}

/**
 * The bare trigger's hover disc: a wobbly circle of ink at a low tint, drawn
 * in a 100-unit box so CSS sizes it with the hit area and grows it by
 * `transform` (no repaint of the page under it).
 */
function BareWash({ seed }: { seed: number }) {
  const d = useMemo(() => wobCircle(50, 50, 46, seed, { segments: 8, mag: 2.2, cpJitter: 0.4 }), [seed]);
  return (
    <svg className={styles.wash} viewBox="0 0 100 100" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ROW_H = 42;
/** The footer line is a little shorter than a row. */
const FOOTER_H = 38;
/** A sheet panel's rows, the air above its first, its footer and the space that parts the footer from the rows. */
const SHEET_ROW_H = 44;
const SHEET_PAD = 4;
const SHEET_FOOTER_H = 32;
const SHEET_FOOTER_GAP = 6;
/** A sheet panel's corners. */
const SHEET_R = 20;

interface MenuPanelProps {
  uid: string;
  seed: number;
  items: OrganicMenuItem[];
  busy: boolean;
  footer?: ReactNode;
  /** The footer wraps (OrganicMenu's `footerWrap`), and the panel takes its measured height. */
  footerWrap?: boolean;
  /** Placed by its host (or a floating wrapper) rather than hung under the trigger. */
  placed?: boolean;
  /** Where the focus goes as it opens: its first row, the panel itself (Tab then walks its rows), or nowhere. */
  autoFocus?: 'row' | 'panel' | null;
  /** Tab leaves its rows (a panel out of the page's tab order closes on it). */
  onTabOut?: () => void;
  /** A borderless paper sheet (OrganicMenuPanel's `sheet`). */
  sheet?: boolean;
  onChoose: (key: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}

function MenuPanel({
  uid,
  seed,
  items,
  busy,
  footer,
  footerWrap = false,
  placed = false,
  autoFocus = null,
  onTabOut,
  sheet = false,
  onChoose,
  ref: outerRef,
}: MenuPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The panel's own ref (it measures itself) and the host's (whose outside-click test needs it).
  const setRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (typeof outerRef === 'function') outerRef(el);
    else if (outerRef) (outerRef as React.RefObject<HTMLDivElement | null>).current = el;
  };
  const hasFooter = footer != null;
  // The footer is one more band under the rows: a divider above it, and no ink in it.
  const bands = items.length + (hasFooter ? 1 : 0);
  // A footer that wraps is as tall as its lines (never shorter than one line's band).
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(FOOTER_H);
  // A sheet's rows are taller, with a little air above the first; its footer is parted by space, not a line.
  const rowH = sheet ? SHEET_ROW_H : ROW_H;
  const top = sheet ? SHEET_PAD : 0;
  const h = sheet ? menuPanelHeight(items.length, hasFooter, true) : items.length * ROW_H + (hasFooter ? footerH : 0);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el || !footerWrap) return;
    const recompute = () => setFooterH(Math.max(FOOTER_H, Math.ceil(el.offsetHeight)));
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [footerWrap]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recompute = () => setW(el.offsetWidth);
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = Math.max(10, h * 0.04);

  const outerPath = useMemo(() => {
    if (!w || !h) return '';
    // A sheet's outline is its PaperSheet's (the row ink is clipped to the paper it lies on).
    if (sheet) return sheetPath(w, h, SHEET_R, seed + 100);
    return wobRect(w, h, 16, seed + 100, autoMag(w, h), {
      segmentsH: autoSegments(w),
      segmentsV: autoSegments(h),
      curve: autoCurve(w, h),
    });
  }, [w, h, seed, sheet]);

  const boundaries = useMemo<[number, number][][]>(() => {
    if (!w) return [];
    return Array.from({ length: bands - 1 }, (_, i) => rowBoundary(top + (i + 1) * rowH, w, seed + i * 31 + 7, 2, pad));
  }, [w, bands, seed, pad, top, rowH]);

  const listRef = useRef<HTMLDivElement>(null);
  const rows = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  useLayoutEffect(() => {
    if (autoFocus === 'row') rows()[0]?.focus({ preventScroll: true });
    else if (autoFocus === 'panel') listRef.current?.focus({ preventScroll: true });
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** The arrows walk the rows (round from the last to the first), Home and End go to either end. */
  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    byKeys.current = true;
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      e.key === 'ArrowDown' ? (at + 1) % all.length
      : e.key === 'ArrowUp' ? (at <= 0 ? all.length - 1 : at - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? all.length - 1
      : null;
    if (to != null && all.length) {
      e.preventDefault();
      all[to].focus();
    } else if (e.key === 'Tab' && onTabOut) {
      const leaving = e.shiftKey ? at <= 0 : at === all.length - 1;
      if (leaving) {
        e.preventDefault();
        onTabOut();
      }
    }
  };

  const ready = w > 0 && boundaries.length === bands - 1;
  const dangerIndex = items.findIndex((it) => it.danger);

  // The pointer's row takes the ink, and so does the keyboard's (a row focused from the keyboard: the arrows,
  // Tab), growing from its centre — the same wash, never a box around it.
  const [keyRow, setKeyRow] = useState<number | null>(null);
  const inkRows = useMemo(() => items.map((_, i) => ({ top: top + i * rowH, height: rowH })), [items, top, rowH]);
  const ink = useRowInk({ panelRef: ref, rows: inkRows, w, h, activeIndex: keyRow });
  // Whether the focus is the keyboard's to show: it opened the menu, or a key moved it since a pointer last did.
  const byKeys = useRef(autoFocus === 'row');
  const washes: string[] = items.map((_, i) =>
    i === dangerIndex
      ? 'color-mix(in oklch, var(--color-yellow) 45%, var(--menu-cream))'
      : 'color-mix(in oklch, var(--menu-border-hover) 15%, transparent)',
  );
  // The footer's band takes no ink.
  if (hasFooter) washes.push('transparent');

  return (
    <div
      ref={setRef}
      className={[styles.panel, placed ? styles.placed : '', sheet ? styles.sheet : ''].filter(Boolean).join(' ')}
      style={{ height: `${h}px` }}
    >
      {sheet && w > 0 && <PaperSheet w={w} h={h} R={SHEET_R} seed={seed + 100} />}
      {w > 0 && (
        <svg
          className={`${styles.border} res-shape-fade-in`}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          <defs>
            <clipPath id={`organicmenu-clip-${uid}`}>
              <path d={outerPath} />
            </clipPath>
          </defs>
          <g clipPath={`url(#organicmenu-clip-${uid})`}>
            {/* A sheet's paper is its PaperSheet's, under this. */}
            {!sheet && <path d={outerPath} fill="var(--menu-cream)" />}
            {/* warning wash under the destructive row, before any hover */}
            {ready && dangerIndex >= 0 && (
              <path
                d={rowRegion(dangerIndex, bands, boundaries, w, h, pad)}
                fill="color-mix(in oklch, var(--color-yellow) 25%, var(--menu-cream))"
              />
            )}
            {/* the hovered row's ink, spreading from the pointer */}
            {ready && (
              <RowInkWash
                uid={`organicmenu-${uid}`}
                ink={ink}
                boundaries={boundaries}
                w={w}
                h={h}
                pad={pad}
                fills={washes}
              />
            )}
          </g>
          {/* A sheet has no pen: no dividers, no outline. */}
          {ready &&
            !sheet &&
            boundaries.map((pts, i) => (
              <path
                key={i}
                d={dividerPath(pts)}
                fill="none"
                stroke="var(--menu-divider)"
                strokeWidth={INK_LIGHT}
                strokeLinecap="round"
                clipPath={`url(#organicmenu-clip-${uid})`}
              />
            ))}
          {!sheet && (
            <path
              d={outerPath}
              fill="none"
              stroke="var(--menu-outline)"
              strokeWidth={INK}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
      <div
        id={`${uid}-menu`}
        ref={listRef}
        role="menu"
        tabIndex={-1}
        className={styles.list}
        onKeyDown={onListKey}
        onPointerDown={() => (byKeys.current = false)}
      >
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className={styles.option}
            data-active={ink.index === i || undefined}
            disabled={busy}
            {...ink.rowProps(i, () => setKeyRow(null))}
            onFocus={() => setKeyRow(byKeys.current ? i : null)}
            onBlur={() => setKeyRow((cur) => (cur === i ? null : cur))}
            onClick={() => onChoose(it.key)}
            aria-label={it.ariaLabel}
          >
            <span className={styles.optionIcon}>
              {typeof it.icon === 'string' ? <Icon name={it.icon} size={17} strokeWidth={INK} /> : it.icon}
            </span>
            {it.label}
          </button>
        ))}
        {hasFooter && (
          <div ref={footerRef} className={footerWrap ? `${styles.footer} ${styles.footerWrap}` : styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

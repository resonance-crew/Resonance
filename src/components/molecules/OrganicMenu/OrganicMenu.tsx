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
import { RowBrushes, menuRowWash, useRowInk } from '@/components/atoms/RowInk/RowInk';
import { PaperSheet, sheetPath } from '@/components/atoms/PaperSheet/PaperSheet';
import { wobCircle } from '@/lib/design/wobCircle';
import { rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { INK } from '@/lib/design/strokes';
import styles from './OrganicMenu.module.css';

export interface OrganicMenuItem {
  key: string;
  /** A hand-drawn icon by name, or an element drawn as it is in the row's 17px icon slot (a brand's mark). */
  icon: IconName | ReactElement;
  label: ReactNode;
  /** The row's accessible name, when it says more than its label (「分享到 LINE」 for a row reading LINE). */
  ariaLabel?: string;
  /**
   * A row that ends or removes something (刪除, 封鎖, 永久刪除): told by the danger ink alone — its glyph and
   * words in the danger ink (`--danger-fill`, the words' AA one), its ink spreading in the danger hue — and no
   * wash at rest (round 17 review D1).
   */
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
  /** A quiet line under the rows (a message's full time), at their end, directly under the last. */
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
 * The `--menu-*` colours a menu draws with: the theme's terracotta (the
 * glyphs and the row ink), or the accent `hue` at the scheme's lightness
 * (palette.ts HUE_ROLES) — and the chip trigger's paper. A card's own menu
 * (a `hue`) keeps the card's menu paper as its sheet's (`--sheet-base`,
 * raised at night as every sheet is); every other menu is the menu paper.
 */
function menuColors(hue: number | undefined): CSSProperties {
  const colors: Record<string, string> =
    hue === undefined
      ? {
          '--menu-border': 'var(--color-terracotta)',
          '--menu-border-hover': 'var(--terracotta-deep)',
          '--menu-cream': 'var(--menu-paper)',
        }
      : {
          '--menu-border': `oklch(var(--hue-pen) ${hue})`,
          '--menu-border-hover': `oklch(var(--hue-pen-deep) ${hue})`,
          '--menu-cream': `oklch(var(--hue-menu) ${hue})`,
          '--sheet-base': `oklch(var(--hue-menu) ${hue})`,
        };
  return colors as CSSProperties;
}

/**
 * A panel's height (round 17 §1, §2.3): 6 of paper over its first row, its rows 44 each, then either the
 * footer line (24, directly under the last row) and 10 of paper under it, or 6 of paper.
 */
export function menuPanelHeight(rows: number, footer: boolean): number {
  return SHEET_TOP + rows * ROW_H + (footer ? FOOTER_H + FOOTER_PAD : SHEET_BOTTOM);
}

/** Room kept between a floating panel and the window's edge. */
const EDGE = 12;

/**
 * The organic「⋯」dropdown: a wobbly chip trigger (or a bare glyph) dropping
 * the one menu sheet (round 17 §1) — borderless paper and grain lifted by a
 * soft shadow, no dividers, rows 44 tall, a spreading ink wash on the hovered
 * (or pressed) row clipped to its band within the sheet's wobble. Closes on
 * outside pointer-down or Escape. The chip is paper with no rim — it sits on
 * a card's cover or beside a title, already framed, like the apps' (their
 * bars draw the glyph bare). No scrim: a menu opened from a button is quick.
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

  /**
   * Where a floating panel goes: under the trigger when it fits, else over it; its `align` edge on the trigger's —
   * kept {@link EDGE} inside the window, and inside the part of the page its trigger sits in when that part says
   * so (`data-dialog-host`: the writer's pane at the desktop split), so a menu opened from the pane's gutter never
   * meets the divider's grip beside it (round 17 review W7).
   */
  function place(trigger: HTMLElement): CSSProperties {
    const r = trigger.getBoundingClientRect();
    const h = menuPanelHeight(items.length, footer != null);
    const below = r.bottom + 8 + h <= window.innerHeight - EDGE || r.top - 8 - h < EDGE;
    const winW = window.innerWidth;
    const host = trigger.closest<HTMLElement>('[data-dialog-host]')?.getBoundingClientRect();
    const start = Math.max(0, host && host.width > 0 ? host.left : 0) + EDGE;
    const end = Math.min(winW, host && host.width > 0 ? host.right : winW) - EDGE;
    return {
      ...(below ? { top: r.bottom + 8 } : { bottom: window.innerHeight - r.top + 8 }),
      ...(align === 'end' ? { right: Math.max(winW - end, winW - r.right) } : { left: Math.max(start, r.left) }),
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
  /** A quiet line at the rows' end, directly under the last (a message's full time). */
  footer?: ReactNode;
  hue?: number;
  /** The corner it grows from (CSS `transform-origin`): the edge of what it belongs to. */
  origin?: string;
  /** Where the focus goes as it opens (default: nowhere — the host decides). */
  autoFocus?: 'row' | 'panel' | null;
  /** Tab leaves its rows (a panel floating out of the page's tab order closes on it, as OrganicMenu's `floating`). */
  onTabOut?: () => void;
  /** A message's action list: 216 wide at least, 280 at most (every other menu: 168 at least). */
  wide?: boolean;
  /**
   * It opened under a finger still down (a held message): a row acts only on a press that began on it after the
   * panel came, or on the keyboard — the lift of the hold that opened it chooses nothing, whatever row glided
   * under it (round 17 review D4).
   */
  freshPress?: boolean;
  className?: string;
}

/**
 * The menu's panel on its own, for a host that places it — the thread's
 * long-press menu, which hangs it under the message it lifted, and a fine
 * pointer's ⋯ beside a message. The same sheet and row ink as the dropdown's.
 */
export function OrganicMenuPanel({ items, onChoose, seed, busy = false, footer, hue, origin, autoFocus = null, onTabOut, wide = false, freshPress = false, className }: OrganicMenuPanelProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className={className} style={{ ...menuColors(hue), ...(origin ? { transformOrigin: origin } : {}) }}>
      <MenuPanel uid={uid} seed={seed} items={items} busy={busy} footer={footer} placed wide={wide} autoFocus={autoFocus} onTabOut={onTabOut} freshPress={freshPress} onChoose={onChoose} />
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

/** A row (round 17 §1: 44 everywhere). */
const ROW_H = 44;
/** The paper over the first row, and under the last when there is no footer. */
const SHEET_TOP = 6;
const SHEET_BOTTOM = 6;
/** The footer's line, directly under the last row (round 17 §2.3), and the paper under it. */
const FOOTER_H = 24;
const FOOTER_PAD = 10;
/** The sheet's corners. */
const SHEET_R = 20;
/** How far a row's band (the ink's) may lean off its line: the bands keep the hand's waver with no line drawn. */
const BAND_WAVER = 2;

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
  /** A message's action list (216–280 wide). */
  wide?: boolean;
  /** A row acts only on a press that began on it (or the keyboard): see OrganicMenuPanel's `freshPress`. */
  freshPress?: boolean;
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
  wide = false,
  freshPress = false,
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
  // The footer is one more band under the rows, which takes no ink.
  const bands = items.length + (hasFooter ? 1 : 0);
  // A footer that wraps (a hint) is as tall as its lines, never shorter than the time's one line.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(FOOTER_H);
  const h = hasFooter && footerWrap ? SHEET_TOP + items.length * ROW_H + footerH + FOOTER_PAD : menuPanelHeight(items.length, hasFooter);
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
  // The sheet's outline: its paper's (PaperSheet draws the same path), and the ink's clip.
  const outline = useMemo(() => sheetPath(w, h, SHEET_R, seed + 100), [w, h, seed]);
  // Where one row's band meets the next's — no line is drawn there (round 17 §1), but the ink keeps to its band.
  const boundaries = useMemo<[number, number][][]>(() => {
    if (!w) return [];
    return Array.from({ length: bands - 1 }, (_, i) => rowBoundary(SHEET_TOP + (i + 1) * ROW_H, w, seed + i * 31 + 7, BAND_WAVER, pad));
  }, [w, bands, seed, pad]);
  const regions = useMemo(
    () => (w && boundaries.length === bands - 1 ? Array.from({ length: bands }, (_, i) => rowRegion(i, bands, boundaries, w, h, pad)) : []),
    [w, h, bands, boundaries, pad],
  );

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

  const ready = w > 0 && regions.length === bands;

  // The pointer's row takes the ink, and so does the keyboard's (a row focused from the keyboard: the arrows,
  // Tab), growing from its centre — the same wash, never a box around it.
  const [keyRow, setKeyRow] = useState<number | null>(null);
  const inkRows = useMemo(() => items.map((_, i) => ({ top: SHEET_TOP + i * ROW_H, height: ROW_H })), [items]);
  const ink = useRowInk({ panelRef: ref, rows: inkRows, w, h, activeIndex: keyRow });
  // The row a press began on since the panel came (`freshPress`): a click elsewhere — the lift of the hold that
  // opened it, over a row that glided under the finger — is no choice. Nor does the lift's compatibility
  // mouseenter ink the row it lands on: under `freshPress` a row takes the hover ink only from a real mouse.
  const pressedRow = useRef<number | null>(null);
  const lastPointer = useRef<string | null>(null);
  useEffect(() => {
    if (!freshPress) return;
    const note = (e: globalThis.PointerEvent) => {
      lastPointer.current = e.pointerType;
    };
    document.addEventListener('pointermove', note, true);
    document.addEventListener('pointerdown', note, true);
    return () => {
      document.removeEventListener('pointermove', note, true);
      document.removeEventListener('pointerdown', note, true);
    };
  }, [freshPress]);
  // Whether the focus is the keyboard's to show: it opened the menu, or a key moved it since a pointer last did —
  // anywhere, not only in the rows: a host's own Tab (the message overlay's, from its reactions) lands on a row too
  // (WCAG 2.4.7), as :focus-visible would judge it.
  const byKeys = useRef(autoFocus === 'row');
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') byKeys.current = true;
    };
    const pointer = () => {
      byKeys.current = false;
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, []);
  // Every row's ink at one strength, a destructive row's in the danger hue (round 17 review D1: no warning wash at
  // rest — the danger ink of its glyph and words says it). See-through: the paper's grain shows through it, so an
  // inked row is the same paper, never a second layer on it.
  const washes: string[] = items.map((it) => menuRowWash(it.danger));
  // The footer's band takes no ink.
  if (hasFooter) washes.push('transparent');

  return (
    <div
      ref={setRef}
      className={[styles.panel, placed ? styles.placed : '', wide ? styles.wide : ''].filter(Boolean).join(' ')}
      style={{ height: `${h}px` }}
    >
      {w > 0 && <PaperSheet w={w} h={h} R={SHEET_R} seed={seed + 100} />}
      {ready && <RowBrushes w={w} h={h} outline={outline} bands={regions} ink={ink} fills={washes} />}
      <div
        id={`${uid}-menu`}
        ref={listRef}
        role="menu"
        tabIndex={-1}
        className={styles.list}
        onKeyDown={onListKey}
        onPointerDown={() => (byKeys.current = false)}
      >
        {items.map((it, i) => {
          const row = ink.rowProps(i, () => setKeyRow(null));
          return (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={styles.option}
              data-active={ink.index === i || undefined}
              data-tone={it.danger ? 'danger' : undefined}
              disabled={busy}
              {...row}
              onMouseEnter={(e) => (!freshPress || lastPointer.current === 'mouse') && row.onMouseEnter(e)}
              onMouseMove={(e) => (!freshPress || lastPointer.current === 'mouse') && row.onMouseMove(e)}
              onPointerDown={(e) => {
                pressedRow.current = i;
                row.onPointerDown(e);
              }}
              onFocus={() => setKeyRow(byKeys.current ? i : null)}
              onBlur={() => setKeyRow((cur) => (cur === i ? null : cur))}
              onClick={(e) => {
                // The keyboard's click (Enter, Space) has no pointer behind it (`detail` 0).
                if (freshPress && e.detail !== 0 && pressedRow.current !== i) return;
                onChoose(it.key);
              }}
              aria-label={it.ariaLabel}
            >
              <span className={styles.optionIcon}>
                {typeof it.icon === 'string' ? <Icon name={it.icon} size={17} strokeWidth={INK} /> : it.icon}
              </span>
              {it.label}
            </button>
          );
        })}
        {hasFooter && (
          <div ref={footerRef} className={footerWrap ? `${styles.footer} ${styles.footerWrap}` : styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

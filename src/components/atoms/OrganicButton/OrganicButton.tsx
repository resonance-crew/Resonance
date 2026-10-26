'use client';

import { Children, CSSProperties, isValidElement, MouseEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '../ShapeGrain/ShapeGrain';
import { BrushWash } from '../BrushWash/BrushWash';
import { ButtonLoader } from '../ButtonLoader/ButtonLoader';
import { Icon } from '../Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import styles from './OrganicButton.module.css';

/**
 * A button is a filled shape and never draws a pen line: an outline marks a
 * floating surface (a modal, a sheet, a menu), a container (a card, a panel)
 * or an input (a field, a select) — never a button, segmented ones included
 * (SegmentedActionBar is a filled bar too). And every button has a fill: bare text does
 * not read as something to press, so a Cancel beside a verb is a pill as
 * filled as the verb, only quieter. The same organic pill, coloured by rank:
 *  - `solid`       the verb: deep terracotta, cream label — Publish, Sign in,
 *                  Confirm, the page's one call to action
 *  - `tonal`       everything beside it: a soft peach face with a deep
 *                  terracotta label — a secondary action (Share your story,
 *                  Sign out, Retry), Cancel / Keep / Close, Download,
 *                  Unblock. `text` and `textAccent` (the names those call
 *                  sites carry) wear it too. The feed's Load more is not a
 *                  button of this kind: its words alone, in the tonal
 *                  label's ink (home's FeedMore, the apps' FeedMoreButton).
 *  - `danger`      solid in red: the final confirm of what can't be undone
 *  - `dangerTonal` the peach's red twin: a button that opens a destructive
 *                  flow (Settings' Delete account), whose dialog then asks
 *                  with `danger`
 *  - `dangerText`  the one face without a fill (round 9 §5): the trash's 清空,
 *                  a word in the danger ink at the end of the shelf's hint
 *                  line, where a filled shape under the shelf picker would read
 *                  as a field — its wash, in the danger ink, says it presses
 *  - `ink`         solid in the ink colour, cream label: for a brand that asks
 *                  for a black button (Sign in with Apple)
 *  - `paper`       the cards' paper, ink label: for a control that has to
 *                  match a paper surface (the floating tools that wore it —
 *                  the thought map's toolbar, the workspace's Leave — are
 *                  tonal now: on cream, card paper hardly reads as a fill)
 *  - `ctaLight` / `ctaGhost`  the two ranks on the terracotta CTA band:
 *                  a cream pill, and a deeper-terracotta one with a cream label
 * The older names keep working and wear the new faces — `primary` is `solid`;
 * `outline`, `ghost`, `secondary`, `secondaryOutline`, `text` and
 * `textAccent` are `tonal` — so the call sites can move to the rank names at
 * their own pace. Bare text is left to a link inside running text (an <a>,
 * not this) and to icon-only header and toolbar buttons, whose icon is the
 * affordance. The apps' OrganicButton (ButtonVariant / Variant) carries the
 * same names. Every face keeps the hover brush and, for the keyboard, a focus
 * ring round the pill.
 */
export type OrganicButtonVariant =
  | 'primary' | 'secondary' | 'ghost' | 'outline' | 'ctaLight' | 'ctaGhost' | 'secondaryOutline'
  | 'solid' | 'tonal' | 'danger' | 'dangerTonal' | 'dangerText' | 'ink' | 'text' | 'textAccent' | 'paper';

// The red every error line and danger row uses, deepened like the terracotta
// fill so its cream label clears 4.5:1 (5.1:1) — the palette's --danger-fill
// (in dark a bright red under a night-paper label).
const DANGER = 'var(--danger-fill)';

/** `bare`: no fill and so no grain — the face is the label and its wash alone. */
type Face = { fill: string; text: string; hoverOverlay: string; bare?: true };

// A filled face moves away from the paper under the hover ink (darker in
// light, lighter in dark: --toward-ink); a tinted one takes a wash of its own hue.
const DARKEN = 'color-mix(in oklch, var(--toward-ink) 14%, transparent)';
const WASH = 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)';
const SOLID: Face = { fill: 'var(--button-fill)', text: 'var(--color-cream)', hoverOverlay: DARKEN };
const TONAL: Face = { fill: 'var(--button-tonal)', text: 'var(--button-on-tonal)', hoverOverlay: WASH };

const BTN_VARIANTS: Record<OrganicButtonVariant, Face> = {
  solid: SOLID,
  primary: SOLID,
  tonal: TONAL,
  outline: TONAL,
  ghost: TONAL,
  secondary: TONAL,
  secondaryOutline: TONAL,
  // Cancel / Close / Load more were bare words once; a word alone did not read
  // as a button beside a filled verb, so they take the secondary pill.
  text: TONAL,
  textAccent: TONAL,
  // On the call-to-action band (--cta-band): a paper pill for the verb, a
  // deeper band for the second action (its words 5.5:1; the band itself
  // carries only large type) — the band's own tokens, light in either scheme.
  ctaLight:   { fill: 'var(--cta-ink)', text: 'var(--cta-verb-ink)', hoverOverlay: 'color-mix(in oklch, var(--toward-ink) 8%, transparent)' },
  ctaGhost:   { fill: 'var(--cta-ghost)', text: 'var(--cta-ink)', hoverOverlay: 'color-mix(in oklch, var(--cta-ink) 14%, transparent)' },
  danger:     { fill: DANGER, text: 'var(--color-cream)', hoverOverlay: DARKEN },
  // The deep red on its rose tint, 5.7:1.
  dangerTonal: {
    fill: 'var(--button-danger-tonal)',
    text: 'var(--button-on-danger-tonal)',
    hoverOverlay: 'color-mix(in oklch, var(--color-danger) 14%, transparent)',
  },
  // The danger ink on the page's own paper (5.1:1 on cream), its wash the same red at a whisper.
  dangerText: {
    fill: 'transparent',
    text: DANGER,
    hoverOverlay: 'color-mix(in oklch, var(--color-danger) 12%, transparent)',
    bare: true,
  },
  // Sign in with Apple: Apple's black button on light paper, its white one (pure white, black words) on dark.
  ink:        { fill: 'var(--apple-fill)', text: 'var(--apple-label)', hoverOverlay: DARKEN },
  paper:      { fill: 'var(--color-card-bg)', text: 'var(--color-text)', hoverOverlay: WASH },
};

// Each rank keeps the wobble of the variant it grew out of (solid / danger /
// ink: primary's, tonal / dangerTonal: outline's, text / paper: ghost's), so a
// renamed call site wobbles exactly as before — and like its native twin.
const BTN_SEEDS: Record<OrganicButtonVariant, number> = {
  primary: 3, secondary: 201, ghost: 401, outline: 601, ctaLight: 801, ctaGhost: 1001, secondaryOutline: 1201,
  solid: 3, tonal: 601, danger: 3, dangerTonal: 601, dangerText: 401, ink: 3, text: 401, textAccent: 601, paper: 401,
};

// Buttons are small — keep the wobble gentle (few turns, low bow) so the
// face reads as a calm pill rather than a busy blob. Module-scoped so the
// reference stays stable across renders (used in a useMemo dep list).
const BTN_SEG_H: [number, number] = [2, 3];

export interface OrganicButtonProps {
  children: ReactNode;
  variant?: OrganicButtonVariant;
  /** `sm` tightens padding + font for dense chrome (e.g. canvas toolbars). */
  size?: 'md' | 'sm';
  /** Fill the container's width: the face is drawn at that width, the label stays centred. */
  block?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Not pressable yet (a dialog's verb before there is anything to act on): faded, no hover ink. */
  disabled?: boolean;
  /**
   * Its action is on its way: the label stays, a small pen loop draws
   * itself in the label's ink (in place of a leading icon, else just before
   * the label), the button keeps its size and colour, takes no click and
   * says it is busy (aria-busy) — focus stays on it.
   */
  loading?: boolean;
  /**
   * With `loading`: the caller draws the ButtonLoader itself, in a slot of
   * its own (a brand mark's, which the button can't see inside) — the
   * button only takes the busy state.
   */
  callerLoader?: boolean;
  style?: CSSProperties & { fillColor?: string };
  className?: string;
  /** Its accessible name when the words shown are a short form of it (清空 for 清空垃圾桶). */
  ariaLabel?: string;
}

export function OrganicButton({ children, variant = 'primary', size = 'md', block = false, onClick, disabled = false, loading = false, callerLoader = false, style = {}, className, ariaLabel }: OrganicButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref, 160, 50);
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const seed = BTN_SEEDS[variant] ?? 3;
  const R = 16; // md radius for controls consistency
  const mag = Math.min(w, h) * 0.04;

  const btnCurve = 1.3;
  const btnJitter = 1.3;

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const cornerOff = Math.min(w, h) * 0.03;
  const overlayPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: BTN_SEG_H,
      segmentsV: 1,
      curve: btnCurve,
      cornerJitter: btnJitter,
      cornerOffset: cornerOff,
    });
  }, [w, h, R, seed, mag, cornerOff]);

  const { fillColor: _fill, ...restStyle } = style;
  const { content, shift } = loadingLabel(children, loading && !callerLoader, size === 'sm' ? 14 : 16);
  // Until measured (the server's HTML, a browser still loading or running no
  // scripts) the button stands in as a plain pill of its own fill
  // (.res-shape-stand-in): a solid's cream label never sits on cream.
  const standIn = {
    '--shape-fill': style.fillColor || v.fill,
    '--shape-radius': `${R}px`,
  } as CSSProperties;

  return (
    <button
      ref={ref}
      // Busy: no click (nor a form's submit), but not `disabled`, which would drop the focus.
      onClick={loading ? (e) => e.preventDefault() : onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      aria-label={ariaLabel}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={`${styles.btn}${size === 'sm' ? ` ${styles.sm}` : ''}${block ? ` ${styles.block}` : ''} res-shape-stand-in ${className || ''}`}
      style={{ color: v.text, ...standIn, ...restStyle }}
      data-variant={variant}
      data-shape-pending={w > 0 && h > 0 ? undefined : ''}
    >
      <HandDrawnBorder
        w={w} h={h} R={R} seed={seed} mag={mag}
        fillColor={style.fillColor || v.fill}
        strokeColor="transparent"
        strokeWidth={0}
        segmentsH={BTN_SEG_H} segmentsV={1}
        curve={btnCurve} cornerJitter={btnJitter} cornerOffset={cornerOff}
      />
      {/* Paper carries the cards' own grain (the Modal's); every other fill the button's. */}
      {!v.bare && (
        <ShapeGrain
          w={w} h={h} d={overlayPath} seed={seed}
          opacity={variant === 'paper' ? 0.3 : 0.38}
          frequency={variant === 'paper' ? 0.88 : 1.1}
        />
      )}
      <BrushWash
        w={w} h={h} d={overlayPath}
        color={v.hoverOverlay}
        x={pos.x} y={pos.y} on={hovered && !disabled && !loading} duration={340} overshoot={4}
      />
      <span
        className={styles.label}
        data-loading-shift={shift != null || undefined}
        style={shift != null ? ({ '--loader-shift': `${shift}px` } as CSSProperties) : undefined}
      >
        {content}
      </span>
    </button>
  );
}

/** The loader's distance from the label it stands before. */
const LOADER_GAP = 6;

/**
 * A busy button's label: the loader takes a leading icon's place (at the
 * icon's size), else it stands `LOADER_GAP` before the label, outside its
 * box, and the label moves half that much toward the end — so the pair stays
 * centred and the button never changes size. `shift` is that move (null when
 * nothing moves).
 */
export function loadingLabel(
  children: ReactNode,
  loading: boolean,
  box: number,
): { content: ReactNode; shift: number | null } {
  if (!loading) return { content: children, shift: null };
  const kids = Children.toArray(children);
  const first = kids[0];
  if (isValidElement<{ size?: number }>(first) && first.type === Icon) {
    return { content: [<ButtonLoader key="loader" size={first.props.size ?? box} />, ...kids.slice(1)], shift: null };
  }
  return {
    content: (
      <>
        <span className={styles.loaderSlot}>
          <ButtonLoader size={box} />
        </span>
        {children}
      </>
    ),
    shift: (box + LOADER_GAP) / 2,
  };
}

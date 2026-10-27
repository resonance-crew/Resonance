'use client';

import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import { RowBrushes, menuRowWash, useRowInk } from '@/components/atoms/RowInk/RowInk';
import { PaperSheet, sheetPath } from '@/components/atoms/PaperSheet/PaperSheet';
import { rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { INK, INK_STRONG } from '@/lib/design/strokes';
import styles from './Field.module.css';

/**
 * `bare` is a document's own field, not a form's: no frame, no padding, no
 * type of its own — it takes the type of what it is set in (the writer's
 * title takes the card page's title type from src/styles/story.css). Its
 * focus is its caret. Textarea only.
 */
type Variant = 'default' | 'subtle';
type TextareaVariant = Variant | 'bare';
type Tone = 'default' | 'display';

export interface FieldLabelProps {
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  id?: string;
}

export function FieldLabel({ children, htmlFor, required, id }: FieldLabelProps) {
  return (
    <label id={id} htmlFor={htmlFor} className={styles.label}>
      {children}
      {required && <span className={styles.required} aria-hidden>*</span>}
    </label>
  );
}

export interface FieldHintProps {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'error';
}

export function FieldHint({ children, tone = 'default' }: FieldHintProps) {
  return (
    <div className={styles.hint} data-tone={tone === 'default' ? undefined : tone}>
      {children}
    </div>
  );
}

export interface CharCountProps {
  count: number;
  max: number;
}

export function CharCount({ count, max }: CharCountProps) {
  const state = count > max ? 'over' : count === max ? 'full' : 'ok';
  return (
    <div className={styles.charCount} data-state={state === 'ok' ? undefined : state}>
      {count} / {max}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: Variant;
  tone?: Tone;
  /** Seed for the wobbly dashed border. */
  seed?: number;
  curve?: number;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = 'default', tone = 'default', className, seed = 13, curve, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const inputEl = (
    <input
      ref={ref}
      {...rest}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      className={[styles.field, className].filter(Boolean).join(' ')}
      data-variant={variant === 'default' ? undefined : variant}
      data-tone={tone === 'default' ? undefined : tone}
    />
  );

  if (variant !== 'default') return inputEl;

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={16}
      strokeWidth={INK}
      curve={curve}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {inputEl}
    </HandDrawnDashedSurface>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: TextareaVariant;
  tone?: Tone;
  seed?: number;
  curve?: number;
  /**
   * Height follows the content: the box grows and shrinks with the text and
   * never scrolls internally (`rows` still sets the resting minimum).
   */
  autoGrow?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant = 'default', tone = 'default', className, rows = 6, seed = 17, curve, autoGrow = false, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Collapse-then-measure so the box also *shrinks* when lines are deleted.
  const fitHeight = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(() => {
    if (autoGrow) fitHeight();
  }, [autoGrow, fitHeight, rest.value]);
  // Re-fit when the box's *width* changes (pane resize, fonts settling): the
  // text re-wraps, so a height measured at another width is stale. Watching
  // width only — the fit itself changes the height, which must not loop.
  useEffect(() => {
    if (!autoGrow) return;
    const el = innerRef.current;
    if (!el) return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastW) {
        lastW = el.clientWidth;
        fitHeight();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoGrow, fitHeight]);

  const el = (
    <textarea
      ref={setRefs}
      rows={rows}
      {...rest}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      className={[styles.field, autoGrow && styles.autoGrow, className].filter(Boolean).join(' ')}
      data-variant={variant === 'default' ? undefined : variant}
      data-tone={tone === 'default' ? undefined : tone}
    />
  );

  if (variant !== 'default') return el;

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={16}
      strokeWidth={INK}
      curve={curve}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {el}
    </HandDrawnDashedSurface>
  );
});

export interface SelectOption {
  value: string;
  label: ReactNode;
}

export interface SelectProps {
  value: string;
  /** Called with the chosen option's value. */
  onChange: (value: string) => void;
  /** `<option value="…">label</option>` children, like a native select. */
  children: ReactNode;
  /** Seed so the wobble of the box + panel is deterministic per-instance. */
  seed?: number;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Custom closed-state content (e.g. a leading icon + short label) in place
   * of echoing the selected option's label. Receives the selected option.
   */
  renderValue?: (selected: SelectOption | undefined) => ReactNode;
  /**
   * Force the open panel to at least this width, right-aligned to the trigger.
   * Lets the closed box shrink (e.g. an icon-only trigger) while the menu stays
   * wide enough to read the option labels.
   */
  menuMinWidth?: number | string;
  /**
   * Strip the closed trigger down to a plain icon button: no hand-drawn frame,
   * no chevron — reads like any other icon control in a header (e.g. the mobile
   * language picker sitting beside the hamburger). The open list is the same
   * sheet. Pair with `renderValue` returning a single icon.
   */
  bare?: boolean;
}

/**
 * Organic dropdown. Closed, it's the same wobbly hand-drawn box as `<Input>`
 * (a form field keeps its outline). Clicking it lays the one menu sheet over
 * the box (round 17 review D6 — every menu's: paper and grain, no pen, no
 * dividers, the paper-cut shadow that follows its wobble, rows 44 with their
 * content 20 in, the spreading ink clipped to each row's band), listing the
 * options, the chosen one's words in terracotta with a ✓ at its end. A
 * pointer's opening inks no row; the keyboard's starts on the chosen one.
 * Pass `<option>`s as children; `onChange` receives the value.
 */
export function Select({
  value,
  onChange,
  children,
  seed = 15,
  ariaLabel,
  disabled,
  className,
  renderValue,
  menuMinWidth,
  bare,
}: SelectProps) {
  const options = useMemo<SelectOption[]>(
    () =>
      Children.toArray(children)
        .filter((c): c is ReactElement<{ value: string; children: ReactNode }> =>
          isValidElement(c),
        )
        .map((c) => ({ value: String(c.props.value), label: c.props.children })),
    [children],
  );

  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [hover, setHover] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Whether the keyboard is the one walking the rows (its row wears the ink): it opened the list, or a key moved
  // since the pointer last did. A pointer's opening inks nothing until a row is under it (the one sheet's rule).
  const [byKeys, setByKeys] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : '';

  function openPanel(fromKeys: boolean) {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setByKeys(fromKeys);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedHeight = selectSheetHeight(options.length);
      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
    setOpen(true);
  }
  function choose(v: string) {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openPanel(true);
        else {
          setByKeys(true);
          setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openPanel(true);
        else {
          setByKeys(true);
          setActiveIndex((i) => Math.max(0, i - 1));
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openPanel(true);
        else if (options[activeIndex]) choose(options[activeIndex].value);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      className={styles.dropdownTrigger}
      data-open={open || undefined}
      data-bare={bare || undefined}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${uid}-listbox`}
      aria-label={ariaLabel}
      aria-activedescendant={open ? `${uid}-opt-${activeIndex}` : undefined}
      // Enter and Space open it in onKeyDown; a click with no pointer behind it (`detail` 0) is the keyboard's too.
      onClick={(e) => (open ? setOpen(false) : openPanel(e.detail === 0))}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onBlur={() => setHover(false)}
    >
      <span className={styles.dropdownValue}>
        {renderValue ? renderValue(selectedIndex >= 0 ? options[selectedIndex] : undefined) : selectedLabel}
      </span>
      {!bare && (
        <Icon name="chevron-down" size={20} strokeWidth={INK_STRONG} className={styles.dropdownChevron} />
      )}
    </button>
  );

  return (
    <div ref={rootRef} className={[styles.dropdownRoot, className].filter(Boolean).join(' ')}>
      {bare ? (
        trigger
      ) : (
        <HandDrawnDashedSurface
          seed={seed}
          R={16}
          strokeWidth={INK}
          // Floor the auto per-95px count rather than pinning it: the closed box
          // is the one surface users stare at before interacting, and at small
          // header/select widths the raw auto count (2–3 turns) reads as a lazy
          // bow rather than a drawn line. A floor of 4 keeps short selects
          // visibly hand-made while letting wide settings selects gain turns as
          // their width grows (the settings page has much larger boxes). With
          // the extra turning points the per-segment bow is dialed below the
          // small-surface auto value (~1.6) so the line stays calm, not busy.
          minSegmentsH={4}
          curve={1.15}
          state={open ? 'focus' : hover ? 'hover' : 'idle'}
          // When open, the sheet lies over the box — its pen line goes with it,
          // so none peeks out past the sheet's wobble.
          strokeColor={open ? 'transparent' : undefined}
          className={styles.surface}
        >
          {trigger}
        </HandDrawnDashedSurface>
      )}

      {open && (
        <DropdownPanel
          seed={seed}
          uid={uid}
          options={options}
          value={value}
          activeIndex={byKeys ? activeIndex : null}
          onActivate={(i) => {
            setByKeys(false);
            setActiveIndex(i);
          }}
          onChoose={choose}
          openUp={openUp}
          menuMinWidth={menuMinWidth}
        />
      )}
    </div>
  );
}

/** The sheet's rows (round 17 §1: 44 everywhere), the paper over the first and under the last, its corners. */
const SELECT_ROW_H = 44;
const SELECT_SHEET_PAD = 6;
const SELECT_SHEET_R = 20;
/** How far a row's band (the ink's) may lean off its line — the bands keep the hand's waver with no line drawn. */
const SELECT_BAND_WAVER = 2;

/** The open list's height for `n` options. */
export function selectSheetHeight(n: number): number {
  return SELECT_SHEET_PAD * 2 + n * SELECT_ROW_H;
}

interface DropdownPanelProps {
  seed: number;
  uid: string;
  options: SelectOption[];
  value: string;
  /** The keyboard's row (it wears the ink), or null while the pointer leads. */
  activeIndex: number | null;
  onActivate: (i: number) => void;
  onChoose: (value: string) => void;
  openUp?: boolean;
  menuMinWidth?: number | string;
}

/**
 * The open list: the one menu sheet (atoms/PaperSheet — the menus' paper and
 * grain, no pen, its shadow following the wobble) laid **over the closed
 * box** (anchored at its top, or its foot when it opens upward), the options
 * in 44 rows with no lines between them, the inked row's wash spreading from
 * where the pointer came in (or the keyboard's row's centre), cut to its band
 * inside the sheet's wobble (RowBrushes) — the dropdown menus' ink, never a box.
 */
function DropdownPanel({
  seed,
  uid,
  options,
  value,
  activeIndex,
  onActivate,
  onChoose,
  openUp,
  menuMinWidth,
}: DropdownPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const n = options.length;
  const h = selectSheetHeight(n);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recompute = () => setW(el.offsetWidth);
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(
    () => options.map((_, i) => ({ top: SELECT_SHEET_PAD + i * SELECT_ROW_H, height: SELECT_ROW_H })),
    [options],
  );
  const pad = Math.max(10, h * 0.04);
  const outline = useMemo(() => sheetPath(w, h, SELECT_SHEET_R, seed + 100), [w, h, seed]);
  // Where one row's band meets the next's: no line is drawn there, but the ink keeps to its band.
  const regions = useMemo(() => {
    if (!w) return [];
    const boundaries = rows
      .slice(1)
      .map((r, i) => rowBoundary(r.top, w, seed + i * 31 + 7, SELECT_BAND_WAVER, pad));
    return rows.map((_, i) => rowRegion(i, n, boundaries, w, h, pad));
  }, [w, h, n, rows, seed, pad]);

  const ink = useRowInk({ panelRef: ref, rows, w, h, activeIndex });
  // The menus' one ink (no `--menu-*` here: the menu's deep pen is the theme's).
  const washes = useMemo(() => options.map(() => menuRowWash()), [options]);

  return (
    <div
      ref={ref}
      className={styles.dropdownPanel}
      style={{
        height: `${h}px`,
        ...(openUp ? { top: 'auto', bottom: 0 } : null),
        // Right-anchor and grow to fit the labels when the closed trigger is
        // narrower than the menu needs to be (e.g. an icon-only trigger).
        ...(menuMinWidth != null
          ? { left: 'auto', right: 0, width: 'max-content', minWidth: menuMinWidth }
          : null),
      }}
    >
      {w > 0 && <PaperSheet w={w} h={h} R={SELECT_SHEET_R} seed={seed + 100} />}
      {regions.length === n && <RowBrushes w={w} h={h} outline={outline} bands={regions} ink={ink} fills={washes} />}
      <div id={`${uid}-listbox`} className={styles.dropdownList} role="listbox" aria-label="options">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            role="option"
            id={`${uid}-opt-${i}`}
            aria-selected={opt.value === value}
            className={styles.dropdownOption}
            data-selected={opt.value === value || undefined}
            data-active={ink.index === i || undefined}
            onClick={() => onChoose(opt.value)}
            {...ink.rowProps(i, () => onActivate(i))}
          >
            <span className={styles.dropdownOptionLabel}>{opt.label}</span>
            {opt.value === value && (
              <Icon name="check" size={18} strokeWidth={INK_STRONG} color="var(--color-terracotta)" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  hintTone?: 'default' | 'ok' | 'error';
  required?: boolean;
  htmlFor?: string;
  /** The label's id, for a control that isn't a form field to name itself by (aria-labelledby). */
  labelId?: string;
  children: ReactNode;
  /** Right-aligned trailing slot (e.g. CharCount). */
  trailing?: ReactNode;
}

/** Composed wrapper: label + control + (hint | char count). */
export function Field({ label, hint, hintTone, required, htmlFor, labelId, children, trailing }: FieldProps) {
  return (
    <div className={styles.fieldGroup}>
      {label && (
        <FieldLabel htmlFor={htmlFor} required={required} id={labelId}>
          {label}
        </FieldLabel>
      )}
      {children}
      <div className={styles.fieldFoot}>
        <div className={styles.fieldFootHint}>{hint && <FieldHint tone={hintTone}>{hint}</FieldHint>}</div>
        {trailing}
      </div>
    </div>
  );
}

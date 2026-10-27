'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { FieldHint } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CAPSULE_R, segmentCapsuleShape } from '@/components/molecules/SegmentedActionBar/segmentCapsule';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { keyboardInset } from '@/lib/hooks/useKeyboardInset';
import styles from './TagField.module.css';

export interface TagFieldProps {
  tags: string[];
  /** The whole list after an add or a remove. */
  onChange: (tags: string[]) => void;
  /** Ask the model for 2–3 tags (the host merges them into the list). */
  onSuggest: () => void;
  suggesting: boolean;
  /** Why the model's suggestion failed, under the field while it is set. */
  error?: string | null;
  /** The text input's id. */
  id?: string;
}

/** A tag ends at a comma of either width or the enumeration comma (、). */
const SEPARATORS = /[,，、]/;
/** The field's seed: its wobble, its seam, its grain. */
const SEED = 53;

/**
 * Whether a key comes from a hardware keyboard: a screen with a fine pointer
 * among its pointers (a desktop, an iPad with a trackpad) and no on-screen
 * keyboard up. A phone's soft keyboard never takes a tag back with Backspace
 * (round 16 §1): its Backspace repeats as it is held, and nothing on the
 * keyboard says a pill is next.
 */
function hardwareKeyboard(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(any-pointer: fine)').matches && keyboardInset() === 0;
}

/** The element that scrolls the field — the publish step's pane, else the page. */
function scrollerOf(el: HTMLElement | null): Element {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * The writer's tags (round 16 §1, and its review's S1 / S2). The section's
 * label 「標籤」 on its own line; under it the chosen tags as removable pills
 * wrapping like words (TagPill lg, outlined and quiet — half the accent's
 * light wash, the soft pen, words at 500 —, a 44 × 44 target round each ✕,
 * named for its tag), a new one popping in. Below, the field in the chat composer's language — one
 * capsule (its wobble, cream, its pen darkening while written in), one line
 * exactly 48 tall, ending in a segment behind a wavy seam: with nothing typed
 * (or an input method mid-word) the tonal 「✦ AI 建議」, which asks the model
 * (its pen loop in the sparkle's place while it thinks); with a word typed
 * the solid 「＋ 新增」, which adds it. The segment is as wide as the wider of
 * its two faces, so the seam never moves when typing starts.
 *
 * Enter, a comma (，、 too) or the segment adds; a tap on the segment while an
 * input method is mid-word ends the word first and adds it. Backspace in the
 * empty field takes the last tag back, one per press, only from a hardware
 * keyboard. When the row grows or shrinks (a tag wraps onto a new line, or
 * one goes) while the field is being written in, or the model's tags arrive,
 * the page scrolls by as much in the same frame: the field never moves under
 * the caret. Tags added are said politely (`tagsAdded`); a failed suggestion
 * is said under the field.
 *
 * The apps' twins are `Tags` in WriteScreen (Android) and WriteParts (iOS).
 */
export function TagField({ tags, onChange, onSuggest, suggesting, error, id }: TagFieldProps) {
  const t = useTranslations('write');
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  // An input method (Zhuyin, Pinyin …) is mid-word: Enter and the separators belong to it.
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const ownId = useId();
  const inputId = id ?? ownId;
  const labelId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLButtonElement>(null);
  const ready = !composing && draft.trim() !== '';
  const busy = suggesting && !ready;

  // The capsule's shape at its size, its end segment as wide as the segment's wider face.
  const { w, h } = useElementSize(capsuleRef);
  const { w: segmentW } = useElementSize(segmentRef);
  const shape = useMemo(() => (segmentW ? segmentCapsuleShape(w, h, segmentW, SEED) : null), [w, h, segmentW]);
  const clipId = `tag-field-clip-${useId().replace(/:/g, '')}`;
  const [hover, setHover] = useState({ x: 0, y: 0, on: false });
  const brush = (e: MouseEvent<HTMLButtonElement>, on: boolean) => {
    const r = capsuleRef.current?.getBoundingClientRect();
    if (r) setHover({ x: e.clientX - r.left, y: e.clientY - r.top, on });
  };

  // Pills already there when the step opened stand still; a new one pops in.
  const [standing] = useState(() => new Set(tags));

  // ── Tags added, said politely: typed, or the model's arriving. ──
  const [said, setSaid] = useState('');
  const knownRef = useRef(tags);
  useEffect(() => {
    const added = tags.filter((tag) => !knownRef.current.includes(tag)).length;
    knownRef.current = tags;
    // A trailing mark of its own each time, so the same words twice are said twice.
    if (added > 0) setSaid((before) => `${t('tagsAdded', { count: added })}${before.endsWith('​') ? '' : '​'}`);
  }, [tags, t]);

  // ── The field stays where it is while what is above it changes height. ──
  // A tag wraps the row onto a new line (or one goes), and the preview card above takes its tags too: the field
  // would move by as much. Its place in the scroller's content (never moved by scrolling) is kept after every
  // change, and a ResizeObserver keeps it through changes of anything else (a picture loaded, the window).
  const fieldPlace = useRef<number | null>(null);
  // The change in flight came from the field's segment (the model's tags arrive after the field may have lost the focus).
  const fromSegment = useRef(false);
  const placeOf = (scroller: Element) => {
    const top = capsuleRef.current?.getBoundingClientRect().top ?? 0;
    return top + (scroller === document.scrollingElement ? window.scrollY : scroller.scrollTop);
  };
  useEffect(() => {
    const capsule = capsuleRef.current;
    if (!capsule || typeof ResizeObserver === 'undefined') return;
    const keep = () => (fieldPlace.current = placeOf(scrollerOf(capsule)));
    const seen = new ResizeObserver(keep);
    seen.observe(capsule.closest('section') ?? document.body);
    if (rowRef.current) seen.observe(rowRef.current);
    return () => seen.disconnect();
  }, []);
  useLayoutEffect(() => {
    const capsule = capsuleRef.current;
    if (!capsule) return;
    const scroller = scrollerOf(capsule);
    const now = placeOf(scroller);
    const before = fieldPlace.current;
    const follow = fromSegment.current || document.activeElement === inputRef.current;
    fromSegment.current = false;
    fieldPlace.current = now;
    if (before == null || Math.abs(now - before) < 0.5 || !follow) return;
    scroller.scrollBy({ top: now - before, behavior: 'instant' as ScrollBehavior });
  }, [tags]);
  // A suggestion that brought nothing new leaves no change in flight.
  useLayoutEffect(() => {
    if (!suggesting) fromSegment.current = false;
  }, [suggesting]);

  /** Add the given words, in order, skipping blanks and tags already there. */
  function add(words: string[]) {
    const next = [...tags];
    for (const word of words) {
      const tag = word.trim();
      if (tag && !next.includes(tag)) next.push(tag);
    }
    if (next.length !== tags.length) onChange(next);
  }

  function commit() {
    const word = draftRef.current;
    if (!word.trim()) return;
    add([word]);
    setDraft('');
    inputRef.current?.focus();
  }

  /** The text as typed or pasted: a separator ends a tag, the rest stays to be typed on. */
  function take(value: string) {
    if (!SEPARATORS.test(value)) {
      setDraft(value);
      return;
    }
    const words = value.split(SEPARATORS);
    const rest = words.pop() ?? '';
    add(words);
    setDraft(rest.trimStart());
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    if (composingRef.current) setDraft(e.target.value);
    else take(e.target.value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Safari reports the Enter that confirms a word after the composition has
    // ended, with keyCode 229 — still the IME's, not a request to add.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0 && !e.repeat && hardwareKeyboard()) {
      // One tag per press from a keyboard: holding the key clears the text, then stops.
      onChange(tags.slice(0, -1));
    }
  }

  // A tap on the segment mid-word ends the word (an input method commits it as its field loses the focus) and
  // adds it; otherwise the press keeps the focus, and the keyboard, in the field.
  const tappedMidWord = useRef(false);
  function onSegmentDown(e: PointerEvent<HTMLButtonElement>) {
    if (composingRef.current) {
      tappedMidWord.current = true;
      inputRef.current?.blur();
      return;
    }
    if (document.activeElement === inputRef.current) e.preventDefault();
  }
  function onSegment() {
    const midWord = tappedMidWord.current;
    tappedMidWord.current = false;
    if (midWord || draftRef.current.trim()) {
      fromSegment.current = true;
      commit();
      return;
    }
    if (suggesting) return;
    fromSegment.current = true;
    onSuggest();
  }

  const typed = draft.trim();

  return (
    <div className={styles.field}>
      {/* The section's label on its own line, as 卡片類型's below it (round 16 review S1). */}
      <label id={labelId} className={styles.label} htmlFor={inputId}>
        {t('tagsLabel')}
      </label>
      {/* The chosen tags, quieter than the step's one button (review S2): half the accent's light wash on the
          paper, the soft pen, words at 500, a muted ✕ named for its tag. Empty, the row takes no room. */}
      <div ref={rowRef} className={styles.row}>
        {tags.map((tag) => (
          <span key={tag} className={styles.pill} data-standing={standing.has(tag) || undefined}>
            <TagPill
              size="lg"
              outlined
              quiet
              color="color-mix(in oklch, var(--color-terracotta-light) 50%, var(--color-cream))"
              removeLabel={t('tagsRemoveLabel', { tag })}
              onRemove={() => onChange(tags.filter((x) => x !== tag))}
            >
              {tag}
            </TagPill>
          </span>
        ))}
      </div>

      <div
        ref={capsuleRef}
        className={`${styles.capsule} res-shape-stand-in`}
        data-focus={focused || undefined}
        data-ready={ready || undefined}
        data-shape-pending={shape ? undefined : ''}
        style={{ '--shape-radius': `${CAPSULE_R}px`, '--shape-ink-width': `${INK}px` } as CSSProperties}
      >
        {shape && (
          <>
            {/* The field's cream and the segment's face — under what is in it. */}
            <svg aria-hidden="true" className={styles.capsuleShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <defs>
                <clipPath id={clipId}>
                  <path d={shape.outline} />
                </clipPath>
              </defs>
              <path d={shape.outline} className={styles.paper} />
              <path d={shape.segment} className={styles.segmentFace} clipPath={`url(#${clipId})`} />
            </svg>
            {/* The segment's grain and its hover brush, cut to the capsule's outline. */}
            <div className={styles.segmentLayer} style={{ width: w, height: h, clipPath: `path('${shape.outline}')` }} aria-hidden="true">
              <ShapeGrain w={w} h={h} d={shape.segment} seed={SEED} opacity={0.38} frequency={1.1} />
              <BrushWash w={w} h={h} d={shape.segment} color="color-mix(in oklch, var(--toward-ink) 14%, transparent)" x={hover.x} y={hover.y} on={hover.on} duration={340} overshoot={4} />
            </div>
            {/* The seam in the paper's colour and the pen line over everything. */}
            <svg aria-hidden="true" className={styles.capsuleShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <path d={shape.seam} className={styles.seam} strokeWidth={INK} clipPath={`url(#${clipId})`} />
              <path d={shape.outline} className={styles.pen} strokeWidth={INK} />
            </svg>
          </>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={styles.input}
          value={draft}
          placeholder={t('tagsPlaceholder')}
          aria-labelledby={labelId}
          aria-describedby={error ? errorId : undefined}
          enterKeyHint="done"
          autoComplete="off"
          onChange={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onCompositionStart={() => {
            composingRef.current = true;
            setComposing(true);
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setComposing(false);
            take(e.currentTarget.value);
          }}
        />
        <button
          ref={segmentRef}
          type="button"
          className={styles.segment}
          aria-label={ready ? t('tagsAddLabel', { tag: typed }) : t('tagsSuggestLabel')}
          title={ready ? t('tagsAddLabel', { tag: typed }) : t('tagsSuggestLabel')}
          aria-busy={busy || undefined}
          onPointerDown={onSegmentDown}
          onClick={onSegment}
          onMouseEnter={(e) => brush(e, true)}
          onMouseLeave={(e) => brush(e, false)}
        >
          {/* Both faces in one cell: the wider sets the segment's width, so the seam never moves. */}
          <span className={styles.face} data-face="suggest" aria-hidden="true">
            <span className={styles.glyph}>{busy ? <ButtonLoader size={15} /> : <Icon name="sparkle" size={15} />}</span>
            {t('tagsSuggestShort')}
          </span>
          <span className={styles.face} data-face="add" aria-hidden="true">
            <span className={styles.glyph}>
              <Icon name="plus" size={13} />
            </span>
            {t('tagsAdd')}
          </span>
        </button>
      </div>

      {/* Only why the model's suggestion failed (no help line: the field and its segment say how). */}
      <div id={errorId} aria-live="polite" className={styles.error}>
        {error && <FieldHint tone="error">{error}</FieldHint>}
      </div>
      <div className={styles.said} role="status" aria-live="polite">
        {said}
      </div>
    </div>
  );
}

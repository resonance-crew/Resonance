'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { StickerBreath, type BreathingCell } from '@/lib/chat/stickerBreath';
import { prefersStill, stickerBlob } from '@/lib/chat/stickerPlayback';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import { wobCircle } from '@/lib/design/wobCircle';
import { wobRect } from '@/lib/design/wobRect';
import { seedFromString } from '@/lib/design/prng';
import { STICKER_PACKS, stickerName, stickerOf, stickerPackIconPath, stickerPath, type StickerRef } from '@/lib/stickers/catalog';
import styles from './Thread.module.css';

/** The recents' section, before the packs. */
const RECENT = 'recent';

/** How many cells may move at once (round 23): a phone's panel, and a tablet's panel or the desktop popover. */
export const PICKER_PLAYING_PHONE = 6;
export const PICKER_PLAYING_WIDE = 12;
/** A panel this wide or wider is a tablet's (its 5–6 columns). */
const WIDE_PANEL = 520;
/** A cell moves while this much of it is in view. */
export const CELL_IN_VIEW = 0.6;
/** No new cell starts until the grid has been still this long. */
const SCROLL_REST_MS = 150;

export interface StickerPickerProps {
  /** The stickers the viewer sent last, newest first (none: no 🕘 tab) — as they were when the picker opened. */
  recents: readonly StickerRef[];
  /** A tap sends it (round 23: one tap, no preview). */
  onPick: (sticker: StickerRef) => void;
  /** Where it lies: the phone panel (4 columns, 5–6 on a tablet) or the desktop popover (4). */
  variant?: 'panel' | 'popover';
  /** The grid's scroller, for a host that grows with its scroll (the phone panel). */
  gridRef?: Ref<HTMLDivElement>;
}

/** Whether the picker's cells stay on their key frames: less motion asked for, or the data saved. */
export function pickerHoldsStill(): boolean {
  if (prefersStill()) return true;
  if (typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-data: reduce)').matches;
}

/** What a cell hands the picker so its turns come: where it is, and what a turn does. */
type Register = (key: string, order: number, el: HTMLElement, cell: BreathingCell) => () => void;

/**
 * The 小紙團 stickers (round 22 §4.1; round 23): a bar of the packs — each
 * its character's head, the 🕘 of the ones sent last first once there are
 * any — over one grid scrolling through every pack, each headed by its
 * character's name. The bar follows the scroll; a pack's head scrolls to it.
 * No search, no card round it and no line between the two: it lies on
 * whatever paper holds it (the foot's, or the popover's sheet).
 *
 * A tap sends the sticker (round 23, the owner's: no second tap, no preview
 * over it). The cells in view breathe (StickerBreath): each plays its file
 * once, rests on its key frame a moment and plays again, a few at a time — six
 * on a phone, twelve on a tablet or in the popover — none starting while the
 * grid scrolls; all still with less motion or the data saved.
 */
export function StickerPicker({ recents, onPick, variant = 'panel', gridRef }: StickerPickerProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const hintId = `sticker-hint-${useId().replace(/:/g, '')}`;
  const sections = useMemo(
    () => [
      ...(recents.length ? [{ id: RECENT, name: t('stickerRecent'), stickers: recents }] : []),
      ...STICKER_PACKS.map((p) => ({
        id: p.id,
        name: locale.startsWith('en') ? p.name.en : p.name['zh-TW'],
        stickers: p.stickers.map((s) => ({ pack: p.id, id: s.id })),
      })),
    ],
    [recents, locale, t],
  );
  const scroller = useRef<HTMLDivElement | null>(null);
  // Its edges fade a little where more stickers lie beyond them (the page's own scroll fades): no line, no card.
  const edges = useEdgeFades(scroller);
  const [active, setActive] = useState(sections[0]?.id ?? '');

  // The cells' turns: one scheduler and one watcher of the grid for the picker's life, made by the first cell that
  // asks (a cell's effect runs before the picker's own; the grid is in the page by then).
  const [still] = useState(pickerHoldsStill);
  const turns = useRef<{ breath: StickerBreath; io: IntersectionObserver | null; keys: Map<Element, string> } | null>(null);
  const register = useCallback<Register>(
    (key, order, el, cell) => {
      if (still) return () => {};
      if (!turns.current) {
        const wide = variant === 'popover' || (scroller.current?.clientWidth ?? 0) >= WIDE_PANEL;
        const keys = new Map<Element, string>();
        const breath = new StickerBreath(wide ? PICKER_PLAYING_WIDE : PICKER_PLAYING_PHONE);
        const io =
          typeof IntersectionObserver === 'undefined'
            ? null
            : new IntersectionObserver(
                (entries) => {
                  for (const entry of entries) {
                    const k = keys.get(entry.target);
                    if (k) breath.see(k, entry.isIntersecting && entry.intersectionRatio >= CELL_IN_VIEW - 0.01);
                  }
                },
                { root: scroller.current, threshold: [0, CELL_IN_VIEW] },
              );
        turns.current = { breath, io, keys };
      }
      const { breath, io, keys } = turns.current;
      breath.add(key, order, cell);
      keys.set(el, key);
      io?.observe(el);
      return () => {
        io?.unobserve(el);
        keys.delete(el);
        breath.remove(key);
      };
    },
    [still, variant],
  );
  // A scroll in progress starts no one; the picker going stops everyone.
  useEffect(() => {
    const el = scroller.current;
    if (!el || still) return;
    let rest: number | null = null;
    const onScroll = () => {
      turns.current?.breath.hold(true);
      if (rest != null) window.clearTimeout(rest);
      rest = window.setTimeout(() => {
        rest = null;
        turns.current?.breath.hold(false);
      }, SCROLL_REST_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rest != null) window.clearTimeout(rest);
    };
  }, [still]);
  useEffect(
    () => () => {
      turns.current?.breath.dispose();
      turns.current?.io?.disconnect();
      turns.current = null;
    },
    [],
  );
  // Each cell's place in reading order, through every section.
  let order = 0;

  // The bar follows the scroll: the pack whose heading has reached the grid's top is the one shown.
  const follow = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop + 8;
    let current = sections[0]?.id ?? '';
    for (const section of el.querySelectorAll<HTMLElement>('[data-sticker-section]')) {
      if (section.offsetTop <= top) current = section.dataset.stickerSection ?? current;
    }
    // At the very end the last pack is the one being looked at, however short it is.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) current = sections[sections.length - 1]?.id ?? current;
    setActive(current);
  }, [sections]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    follow();
    el.addEventListener('scroll', follow, { passive: true });
    return () => el.removeEventListener('scroll', follow);
  }, [follow]);

  const goTo = (id: string) => {
    const el = scroller.current;
    const section = el?.querySelector<HTMLElement>(`[data-sticker-section="${id}"]`);
    if (!el || !section) return;
    setActive(id);
    el.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  };

  return (
    <div className={styles.stickerPicker} data-variant={variant}>
      <div className={styles.packBar} role="toolbar" aria-label={t('stickers')}>
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={styles.packTab}
            aria-label={s.name}
            aria-pressed={active === s.id}
            title={s.name}
            onClick={() => goTo(s.id)}
          >
            <PackWash seed={31 + i * 7} />
            {s.id === RECENT ? (
              <Icon name="clock" size={22} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stickerPackIconPath(s.id)} alt="" width={30} height={30} draggable={false} />
            )}
          </button>
        ))}
      </div>
      <div
        ref={(el) => {
          edges(el);
          if (typeof gridRef === 'function') gridRef(el);
          else if (gridRef) (gridRef as { current: HTMLDivElement | null }).current = el;
        }}
        className={styles.stickerGrid}
      >
        {/* Every cell's hint, said after its name (「謝謝，傳送貼圖」). */}
        <span id={hintId} hidden>
          {t('stickerSendHint')}
        </span>
        {sections.map((s) => (
          <section key={s.id} data-sticker-section={s.id} aria-label={s.name}>
            <h3 className={styles.packHeading}>{s.name}</h3>
            <div className={styles.stickerCells}>
              {s.stickers.map((ref) => {
                const key = `${s.id}:${ref.pack}/${ref.id}`;
                return (
                  <PickerCell
                    key={key}
                    cellKey={key}
                    order={order++}
                    sticker={ref}
                    name={stickerName(ref, locale) ?? ''}
                    hintId={hintId}
                    register={register}
                    onPick={onPick}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * One sticker of the grid: its key frame at rest, its file while its turn lasts (a fresh address each play, so an
 * `<img>` starts it from its first frame: the file's loop count is baked in). A press washes its cell in the
 * terracotta's light tint (the drawn outline, never a CSS box); a tap sends it.
 */
function PickerCell({
  cellKey,
  order,
  sticker,
  name,
  hintId,
  register,
  onPick,
}: {
  cellKey: string;
  order: number;
  sticker: StickerRef;
  name: string;
  hintId: string;
  register: Register;
  onPick: (sticker: StickerRef) => void;
}) {
  const thumb = stickerPath(sticker, 'thumb');
  const anim = stickerPath(sticker, 'anim');
  const [src, setSrc] = useState(thumb);
  const ref = useRef<HTMLButtonElement>(null);
  const url = useRef<string | null>(null);
  const alive = useRef(true);
  const loopMs = stickerOf(sticker.pack, sticker.id)?.durationMs ?? 2000;

  const letGo = (address: string | null) => {
    // Revoked once the next picture has taken its place.
    if (address) window.setTimeout(() => URL.revokeObjectURL(address), 1000);
  };

  useEffect(() => {
    alive.current = true;
    const el = ref.current;
    if (!el) return;
    const unregister = register(cellKey, order, el, {
      loopMs,
      play: () => {
        void stickerBlob(anim).then(
          (blob) => {
            if (!alive.current) return;
            const before = url.current;
            url.current = URL.createObjectURL(blob);
            setSrc(url.current);
            letGo(before);
          },
          () => undefined,
        );
      },
      stop: () => {
        if (!alive.current) return;
        const before = url.current;
        url.current = null;
        setSrc(thumb);
        letGo(before);
      },
    });
    return () => {
      alive.current = false;
      unregister();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
    };
    // Its place in the grid is the picker's to say once; a recents list that changed is another picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey, register, anim, thumb, loopMs]);

  return (
    <button
      ref={ref}
      type="button"
      className={styles.stickerCell}
      aria-label={name}
      aria-describedby={hintId}
      data-sticker={`${sticker.pack}/${sticker.id}`}
      data-moving={src !== thumb || undefined}
      onClick={() => onPick(sticker)}
    >
      <CellWash sticker={sticker} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
    </button>
  );
}

/**
 * A sticker's cell outline at [w × h]: its own seed, two bends a side, the corners and the swing in proportion
 * to its size.
 */
export function stickerCellPath(w: number, h: number, sticker: StickerRef): string {
  const s = Math.min(w, h);
  return wobRect(w, h, s * 0.28, seedFromString(sticker.id), s * 0.035, { segmentsH: 2, segmentsV: 2, curve: 1.2 });
}

/**
 * A sticker cell's wash under the pointer (grey) or while pressed (the terracotta's light tint: a tap lands): its
 * hand-drawn outline (stickerCellPath), never a CSS box. The cell is square, so one 100-unit drawing stretches to it.
 */
function CellWash({ sticker }: { sticker: StickerRef }) {
  const d = useMemo(() => stickerCellPath(100, 100, sticker), [sticker]);
  return (
    <svg className={styles.cellWash} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** A pack tab's wash when it is the one shown: a wobbly disc of the terracotta's light tint. */
function PackWash({ seed }: { seed: number }) {
  const d = useMemo(() => wobCircle(50, 50, 44, seed, { segments: 8, mag: 2.6, cpJitter: 0.45 }), [seed]);
  return (
    <svg className={styles.packWash} viewBox="0 0 100 100" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

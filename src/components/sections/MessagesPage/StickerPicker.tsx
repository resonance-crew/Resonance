'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import { wobCircle } from '@/lib/design/wobCircle';
import { STICKER_PACKS, stickerName, stickerPackIconPath, stickerPath, type StickerRef } from '@/lib/stickers/catalog';
import styles from './Thread.module.css';

/** The recents' section, before the packs. */
const RECENT = 'recent';

export interface StickerPickerProps {
  /** The stickers the viewer sent last, newest first (none: no 🕘 tab). */
  recents: readonly StickerRef[];
  /** The sticker being previewed (marked in the grid). */
  selected: StickerRef | null;
  onPick: (sticker: StickerRef) => void;
  /** Where it lies: the phone panel (4 columns, 5–6 on a tablet) or the desktop popover (5). */
  variant?: 'panel' | 'popover';
  /** The grid's scroller, for a host that grows with its scroll (the phone panel). */
  gridRef?: Ref<HTMLDivElement>;
}

const same = (a: StickerRef | null, b: StickerRef) => !!a && a.pack === b.pack && a.id === b.id;

/**
 * The 小紙團 stickers (round 22 §4.1): a bar of the packs — each its
 * character's head, the 🕘 of the ones sent last first once there are any —
 * over one grid scrolling through every pack, each headed by its character's
 * name. The bar follows the scroll; a pack's head scrolls to it. No search, no
 * card round it and no line between the two: it lies on whatever paper holds
 * it (the foot's, or the popover's sheet).
 */
export function StickerPicker({ recents, selected, onPick, variant = 'panel', gridRef }: StickerPickerProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
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
        {sections.map((s) => (
          <section key={s.id} data-sticker-section={s.id} aria-label={s.name}>
            <h3 className={styles.packHeading}>{s.name}</h3>
            <div className={styles.stickerCells}>
              {s.stickers.map((ref) => {
                const name = stickerName(ref, locale) ?? '';
                return (
                  <button
                    key={`${s.id}:${ref.pack}/${ref.id}`}
                    type="button"
                    className={styles.stickerCell}
                    aria-label={name}
                    aria-pressed={same(selected, ref)}
                    data-sticker={`${ref.pack}/${ref.id}`}
                    onClick={() => onPick(ref)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stickerPath(ref, 'thumb')} alt="" loading="lazy" decoding="async" draggable={false} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
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

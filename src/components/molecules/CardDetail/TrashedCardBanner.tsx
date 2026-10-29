'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { Icon } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { boundaryPoints, polyline } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';
import { useToast } from '@/components/providers/ToastProvider';
import { useRouter } from '@/i18n/navigation';
import { daysLeft, purgeAtOf } from '@/lib/cards/trash';
import { announceRestoredAlone, useTrashActions } from '@/lib/data/trash';
import { ApiError } from '@/lib/db/firestore/client/api';
import type { Card } from '@/lib/db/types';
import styles from './TrashedCardBanner.module.css';

export interface TrashedCardBannerProps {
  /** The owner's card, in the trash (`trashedAt` set). */
  card: Pick<Card, 'id' | 'slug' | 'trashedAt' | 'trashedFrom' | 'anonymous' | 'publishedAt'>;
  /** It was moved to the trash on this very page a moment ago: focus comes to the banner's title. */
  focusTitle?: boolean;
}

const SEED = 83;
/** The corner, as a card's. */
const R = 18;
/**
 * How far the seams wave (px): a gentle bend, not a swing — the owner, round 20, the outline's curve too strong; it is
 * now a Panel's wobble a little calmer (autoMag × 0.8, autoCurve × 0.7), and the seams follow.
 */
const SEAM = 1.1;
const SEAM_ACROSS = 1.5;

type Shape = {
  outline: string;
  /** The wavy seams: before 還原, between the two, and (stacked) the one under the words. */
  seams: string[];
  /** Where the segments are: everything past the first seam (or under the words' seam). */
  segments: string;
  /** Past the seam between 還原 and 永久刪除. */
  danger: string;
  /** 還原's own region, for its hover brush. */
  restore: string;
};

/** A seam across the bar at `y` (left to right), the segmented bar's wave turned on its side. */
function acrossAt(y: number, w: number, seed: number, pad: number): [number, number][] {
  return boundaryPoints(y, w, seed, SEAM_ACROSS, pad).map(([a, b]) => [b, a]);
}

/** The region right of a seam running top to bottom, reaching out past the outline (which clips it). */
function rightOf(pts: [number, number][], w: number, h: number, pad: number): string {
  return `${polyline(pts)} L ${w + pad},${h + pad} L ${w + pad},${-pad} Z`;
}

/**
 * The banner's drawing at `w` × `h`: its outline — a card's wobble, plain to
 * see — and the two segments cut off by wavy seams in the paper's colour.
 * Side by side (`stacked` false) the segments are the bar's end, past the
 * words; stacked (a phone) they are its foot, under them, split down the
 * middle. One point list for each seam's stroke and the faces' edges (the
 * segmented bar's, so a face's edge lies exactly under its seam).
 */
function bannerShape(w: number, h: number, restoreAt: { x: number; y: number }, dangerX: number, stacked: boolean): Shape | null {
  if (!w || !h) return null;
  const outline = wobRect(w, h, R, SEED, autoMag(w, h) * 0.8, {
    segmentsH: autoSegments(w),
    segmentsV: 2,
    curve: autoCurve(w, h) * 0.7,
    cornerJitter: 0.8,
  });
  const pad = Math.max(12, h * 0.3);
  if (!stacked) {
    const first = boundaryPoints(restoreAt.x, h, SEED + 11, SEAM, pad);
    const second = boundaryPoints(dangerX, h, SEED + 48, SEAM, pad);
    const restore = `${polyline(first)} ${[...second].reverse().map(([x, y]) => `L ${x},${y}`).join(' ')} Z`;
    return {
      outline,
      seams: [polyline(first), polyline(second)],
      segments: rightOf(first, w, h, pad),
      danger: rightOf(second, w, h, pad),
      restore,
    };
  }
  const under = acrossAt(restoreAt.y, w, SEED + 11, pad);
  const rowH = h - restoreAt.y;
  // Down the middle of the foot, from a little above the seam over it (which hides what reaches above).
  const split = boundaryPoints(dangerX, rowH, SEED + 48, SEAM, pad).map(([x, y]) => [x, y + restoreAt.y] as [number, number]);
  const segments = `${polyline(under)} L ${w + pad},${h + pad} L ${-pad},${h + pad} Z`;
  return {
    outline,
    seams: [polyline(under), polyline(split)],
    segments,
    danger: rightOf(split, w, h, pad),
    restore: `M ${-pad},${-pad} ${split.map(([x, y]) => `L ${x},${y}`).join(' ')} L ${-pad},${h + pad} Z`,
  };
}

/**
 * 「這張卡片在垃圾桶裡」 — what the owner sees at the head of their card's
 * page while it is in the trash (from the shelf, a bell, a link, or the
 * page's own 刪除, which leaves them here): how long it has and that only
 * they can see it, and that an anonymous card's notes went with it; then
 * 還原 (the card comes back here, as it was) and 永久刪除 (asked first, in
 * red, then back to the card box). Everyone else gets the page's not-found.
 *
 * One hand-drawn shape, as the segmented bar is cut (round 19): the words on
 * its paper, the two ways out filling its end as segments behind wavy seams
 * — 還原 the verb's solid face, 永久刪除 the danger's tonal one — and on a
 * phone, where the words take the width, its foot.
 */
export function TrashedCardBanner({ card, focusTitle = false }: TrashedCardBannerProps) {
  const t = useTranslations('card.trashed');
  const tActions = useTranslations('me.actions');
  const tMe = useTranslations('me');
  const router = useRouter();
  const toast = useToast();
  const actions = useTrashActions();
  const title = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState<'restore' | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The drawing follows the laid-out banner: its size, where 還原 starts and where 永久刪除 does.
  const box = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState({ w: 0, h: 0, rx: 0, ry: 0, dx: 0 });
  const measure = useCallback(() => {
    const el = box.current;
    const r = restoreRef.current;
    const d = deleteRef.current;
    if (!el || !r || !d) return;
    const next = { w: el.offsetWidth, h: el.offsetHeight, rx: r.offsetLeft, ry: r.offsetTop, dx: d.offsetLeft };
    setLayout((cur) => (Object.keys(next).every((k) => cur[k as keyof typeof cur] === next[k as keyof typeof next]) ? cur : next));
  }, []);
  useLayoutEffect(() => {
    measure();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (box.current) watch?.observe(box.current);
    if (restoreRef.current) watch?.observe(restoreRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => watch?.disconnect();
  }, [measure]);
  const { w, h } = layout;
  // Stacked: the segments sit under the words (a phone's width), not beside them.
  const stacked = layout.ry > 1;
  const shape = useMemo(
    () => bannerShape(w, h, { x: layout.rx, y: layout.ry }, layout.dx, stacked),
    [w, h, layout.rx, layout.ry, layout.dx, stacked],
  );
  const clipId = `trash-banner-${useId().replace(/:/g, '')}`;

  // A segment's hover brush, from where the pointer came in (as a button's); the keyboard's focus grows it from its middle.
  const [hover, setHover] = useState<{ on: 'restore' | 'delete' | null; x: number; y: number }>({ on: null, x: 0, y: 0 });
  const at = (e: MouseEvent<HTMLElement>) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  const brushHandlers = (which: 'restore' | 'delete') => ({
    onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => {
      if (!busy) setHover({ on: which, ...at(e) });
    },
    onMouseLeave: (e: MouseEvent<HTMLButtonElement>) => setHover((cur) => (cur.on === which ? { on: null, ...at(e) } : cur)),
    onFocus: (e: { currentTarget: HTMLButtonElement }) => {
      const b = e.currentTarget;
      setHover({ on: which, x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 });
    },
    onBlur: () => setHover((cur) => (cur.on === which ? { ...cur, on: null } : cur)),
  });

  useEffect(() => {
    if (focusTitle) title.current?.focus();
  }, [focusTitle]);

  const ref = { id: card.id, slug: card.slug, referenceCardId: card.trashedFrom?.referenceCardId ?? undefined };
  const left = card.trashedAt ? daysLeft(purgeAtOf(card.trashedAt)) : null;
  const days = left ? (left.lastDay ? tMe('trashLastDay') : tMe('trashDaysLeft', { count: left.days })) : null;

  async function restore() {
    if (busy) return;
    setHover((cur) => ({ ...cur, on: null }));
    setBusy('restore');
    try {
      // The page reads the card again (useTrashActions): the banner goes with the trash.
      const { droppedResonance } = await actions.restore(ref);
      if (droppedResonance) announceRestoredAlone();
      else toast.show({ message: tActions('restored') });
    } catch {
      toast.show({ message: tActions('undoFailed') });
    } finally {
      setBusy(null);
    }
  }

  // Round 21: gone at once — the question closes and the card box opens with the card off its shelves
  // (useTrashActions); the answer is said in a toast there, and a refusal puts the card back.
  function deleteForever() {
    setConfirming(false);
    router.replace('/me');
    actions.deleteForever(ref).then(
      () => toast.show({ message: tActions('deletedForever') }),
      // Restored meanwhile (another device): it stays where it is now.
      (e) => toast.show({ message: tActions(e instanceof ApiError && e.code === 'conflict' ? 'notInTrash' : 'deleteForeverFailed') }),
    );
  }

  return (
    <div ref={box} className={styles.banner} data-stacked={stacked || undefined}>
      {shape && (
        <>
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={styles.backdrop}>
            <defs>
              <clipPath id={clipId}>
                <path d={shape.outline} />
              </clipPath>
              {/* Stacked, the split between the two reaches up past the words' seam: it is cut back to the foot. */}
              <clipPath id={`${clipId}-foot`}>
                <path d={shape.segments} />
              </clipPath>
            </defs>
            <path d={shape.outline} className={styles.paper} />
            <g clipPath={`url(#${clipId})`}>
              <path d={shape.segments} className={styles.restoreFace} />
              <path d={shape.danger} className={styles.dangerFace} clipPath={`url(#${clipId}-foot)`} />
            </g>
          </svg>
          {/* The segments' grain and their hover brushes, cut to the outline (and, stacked, under the words' seam). */}
          <div className={styles.layer} style={{ width: w, height: h, clipPath: `path('${shape.outline}')` }} aria-hidden="true">
            <div className={styles.layer} style={{ width: w, height: h, clipPath: `path('${shape.segments}')` }}>
              <ShapeGrain w={w} h={h} d={shape.segments} seed={SEED} opacity={0.38} frequency={1.1} />
              <BrushWash w={w} h={h} d={shape.restore} color="color-mix(in oklch, var(--toward-ink) 14%, transparent)" x={hover.x} y={hover.y} on={hover.on === 'restore'} duration={340} overshoot={4} />
              <BrushWash w={w} h={h} d={shape.danger} color="color-mix(in oklch, var(--color-danger) 14%, transparent)" x={hover.x} y={hover.y} on={hover.on === 'delete'} duration={340} overshoot={4} />
            </div>
          </div>
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={styles.backdrop} data-over="">
            <g clipPath={`url(#${clipId})`}>
              <path d={shape.seams[0]} className={styles.seam} strokeWidth={INK} />
              <path d={shape.seams[1]} className={styles.seam} strokeWidth={INK} clipPath={stacked ? `url(#${clipId}-foot)` : undefined} />
            </g>
            <path d={shape.outline} className={styles.pen} strokeWidth={INK} />
          </svg>
        </>
      )}
      <div className={styles.text}>
        <span className={styles.glyph}>
          <Icon name="trash" size={20} />
        </span>
        <div>
          {/* Not a heading: it comes before the card's own title (the page's h1). */}
          <p ref={title} className={styles.title} tabIndex={-1}>
            {t('title')}
          </p>
          <p className={styles.caption}>{days ? `${days} · ${t('onlyYou')}` : t('onlyYou')}</p>
          {card.anonymous === true && card.publishedAt && <p className={styles.caption}>{t('notesGone')}</p>}
        </div>
      </div>
      <button
        ref={restoreRef}
        type="button"
        className={`${styles.seg} ${styles.restore}`}
        data-face="solid"
        onClick={busy ? undefined : () => void restore()}
        aria-busy={busy === 'restore' || undefined}
        aria-disabled={busy !== null || undefined}
        {...brushHandlers('restore')}
      >
        {busy === 'restore' ? <ButtonLoader size={16} /> : <Icon name="restore" size={16} />}
        <span>{tActions('restore')}</span>
      </button>
      <button
        ref={deleteRef}
        type="button"
        className={`${styles.seg} ${styles.delete}`}
        data-face="dangerTonal"
        onClick={
          busy
            ? undefined
            : () => setConfirming(true)
        }
        aria-disabled={busy !== null || undefined}
        {...brushHandlers('delete')}
      >
        <Icon name="trash" size={16} />
        <span>{tActions('deleteForever')}</span>
      </button>
      <ConfirmModal
        open={confirming}
        title={tActions('deleteForeverConfirmTitle')}
        body={tActions('deleteConfirmBody')}
        cancelLabel={tActions('deleteCancel')}
        confirmLabel={tActions('deleteForever')}
        workingLabel={tActions('delete')}
        onCancel={() => setConfirming(false)}
        onConfirm={deleteForever}
        destructive
        seed={71}
      />
    </div>
  );
}

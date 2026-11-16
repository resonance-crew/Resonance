'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicSlider } from '@/components/atoms/OrganicSlider/OrganicSlider';
import { Icon } from '@/components/atoms/Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';
import { CROP_START, KEY_PAN, KEY_PAN_FAST, KEY_ZOOM, WHEEL_ZOOM, type CropView } from '@/lib/images/avatarCrop';
import { frameScale, frameStage, panFrameView, sliderOfZoom, viewMoved, zoomFrameView, zoomOfSlider } from '@/lib/images/cropFrame';
import styles from './CropStage.module.css';

/** A picture to frame: a decoded canvas (a new profile photo) or a loaded <img> (a cover already up). */
export interface StagePicture {
  el: HTMLCanvasElement | HTMLImageElement;
  width: number;
  height: number;
}

export interface CropStageProps {
  picture: StagePicture | null;
  /** The frame's height ÷ width (1 for the avatar, the feed card's 0.62 for a cover). */
  ratio: number;
  /** The stage's widest (round 25 §G3.1: 400 for the avatar, 480 for a cover). */
  max: number;
  /** Dimmed picture all round the frame, px. */
  inset: number;
  zoomMax: number;
  /** The frame's outline, at (0, 0) in a frameW × frameH box. */
  outline: (frameW: number, frameH: number) => string;
  view: CropView;
  onView: (update: (v: CropView) => CropView) => void;
  /** The stage's name (「封面顯示範圍」, 「Photo framing area」). */
  label: string;
  busy?: boolean;
}

/** The scrim over the picture outside the frame (the avatar dropzone's wash). */
const SCRIM = 'color-mix(in oklch, var(--photo-shade) 50%, transparent)';
const STAGE_SEED = 79;
type Point = { x: number; y: number };

/**
 * The crop stage the profile photo and the cover share (round 25 §G3): the picture under a frame, dimmed outside it,
 * dragged to move, pinched (about the fingers' moving centre), wheeled or slid to zoom — the slider on a multiplying
 * scale, so all three are one control — the arrow keys moving it (8 px, Shift 32) and + / − zooming, as the hint shown
 * on the keyboard's focus says; 重設 once something has moved. The view is in frame widths (lib/images/cropFrame), so
 * a resize keeps the framing; the stage is never taller than the window less 200.
 */
export function CropStage({ picture, ratio, max, inset, zoomMax, outline, view, onView, label, busy = false }: CropStageProps) {
  const t = useTranslations('crop');
  const keysId = useId();
  const roomRef = useRef<HTMLDivElement>(null);
  const { w: room } = useElementSize(roomRef, 0, 0, [picture]);
  const [winH, setWinH] = useState(0);
  useEffect(() => {
    const read = () => setWinH(window.innerHeight);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  const { width, height, frameW, frameH } = frameStage(room > 0 ? room : max, winH, { max, inset, ratio });
  const img = useMemo(() => (picture ? { width: picture.width, height: picture.height } : null), [picture]);

  // The picture itself, placed by the view.
  const holderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const holder = holderRef.current;
    if (!picture || !holder) return;
    picture.el.className = styles.picture;
    holder.appendChild(picture.el);
    return () => {
      if (picture.el.parentNode === holder) holder.removeChild(picture.el);
    };
  }, [picture, width]);

  const stageRef = useRef<HTMLDivElement>(null);
  /** A pointer's place from the frame's centre, in frame widths. */
  const toUnits = useCallback(
    (clientX: number, clientY: number): Point => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box || frameW <= 0) return { x: 0, y: 0 };
      return { x: (clientX - box.left - width / 2) / frameW, y: (clientY - box.top - height / 2) / frameW };
    },
    [frameW, width, height],
  );
  const pan = useCallback((dx: number, dy: number) => img && onView((v) => panFrameView(img, ratio, v, dx, dy, zoomMax)), [img, onView, ratio, zoomMax]);
  const zoom = useCallback(
    (z: (current: number) => number, anchor?: Point) => img && onView((v) => zoomFrameView(img, ratio, v, z(v.z), zoomMax, anchor)),
    [img, onView, ratio, zoomMax],
  );

  // Drag to move; two fingers pinch (and move) about their moving centre.
  const pointers = useRef(new Map<number, Point>());
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (busy || !img) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, toUnits(e.clientX, e.clientY));
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const map = pointers.current;
    const before = map.get(e.pointerId);
    if (!before || busy) return;
    const now = toUnits(e.clientX, e.clientY);
    if (map.size === 1) {
      map.set(e.pointerId, now);
      pan(now.x - before.x, now.y - before.y);
      return;
    }
    const [a, b] = Array.from(map.entries()).slice(0, 2);
    const other = a[0] === e.pointerId ? b[1] : a[1];
    map.set(e.pointerId, now);
    const c0 = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
    const c1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
    const d0 = Math.hypot(before.x - other.x, before.y - other.y);
    const d1 = Math.hypot(now.x - other.x, now.y - other.y);
    pan(c1.x - c0.x, c1.y - c0.y);
    if (d0 > 0 && d1 > 0) zoom((z) => (z * d1) / d0, c1);
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
  }

  // A wheel or a trackpad's pinch zooms about the pointer, and never scrolls the page under the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (busy) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoom((z) => z * Math.exp(-dy * WHEEL_ZOOM), toUnits(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [busy, zoom, toUnits, picture]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (busy || frameW <= 0) return;
    const step = (e.shiftKey ? KEY_PAN_FAST : KEY_PAN) / frameW;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      pan(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoom((z) => z * KEY_ZOOM);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoom((z) => z / KEY_ZOOM);
    }
  }

  const stagePath = useMemo(
    () =>
      width > 0 && height > 0
        ? wobRect(width, height, 16, STAGE_SEED, autoMag(width, height), { segmentsH: autoSegments(width), segmentsV: autoSegments(height), curve: autoCurve(width, height) })
        : '',
    [width, height],
  );
  const framePath = useMemo(() => (frameW > 0 ? outline(frameW, frameH) : ''), [outline, frameW, frameH]);

  // Where the picture is drawn: its centre (ox, oy) frame widths from the frame's centre, at scale s.
  const s = img ? frameScale(img, ratio, view.z) * frameW : 1;
  const placed = img
    ? {
        width: img.width,
        height: img.height,
        transform: `translate(${width / 2 + view.ox * frameW - (img.width * s) / 2}px, ${height / 2 + view.oy * frameW - (img.height * s) / 2}px) scale(${s})`,
      }
    : undefined;
  const fx = (width - frameW) / 2;
  const fy = (height - frameH) / 2;

  return (
    <>
      <div ref={roomRef} className={styles.room}>
        <div
          ref={stageRef}
          className={styles.stage}
          style={{ width, height }}
          role="group"
          aria-label={label}
          aria-describedby={keysId}
          tabIndex={0}
          data-busy={busy || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <div className={styles.paper} style={stagePath ? { clipPath: `path('${stagePath}')`, WebkitClipPath: `path('${stagePath}')` } : undefined}>
            <div ref={holderRef} className={styles.holder} style={placed} />
            {framePath && (
              <svg className={styles.overlay} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
                <g transform={`translate(${fx} ${fy})`}>
                  <path d={`M${-fx} ${-fy}H${width - fx}V${height - fy}H${-fx}Z ${framePath}`} fill={SCRIM} fillRule="evenodd" />
                  <path d={framePath} fill="none" stroke="var(--photo-ink)" strokeOpacity={0.9} strokeWidth={INK} strokeLinejoin="round" data-crop-mask="" />
                </g>
              </svg>
            )}
          </div>
          {/* the keyboard's way, said on its focus only */}
          <span id={keysId} className={styles.keys}>
            {t('keys')}
          </span>
        </div>
      </div>

      <div className={styles.zoom}>
        <Icon name="minus" size={16} className={styles.zoomGlyph} />
        <div className={styles.slider}>
          <OrganicSlider
            value={sliderOfZoom(view.z)}
            min={0}
            max={sliderOfZoom(zoomMax)}
            step={0.001}
            ariaLabel={t('zoom')}
            disabled={busy}
            onChange={(v) => zoom(() => zoomOfSlider(v))}
          />
        </div>
        <Icon name="plus" size={16} className={styles.zoomGlyph} />
        {viewMoved(view) && (
          <span className={styles.reset}>
            <OrganicButton variant="quiet" size="sm" disabled={busy} onClick={() => onView(() => CROP_START)}>
              {t('reset')}
            </OrganicButton>
          </span>
        )}
      </div>
    </>
  );
}

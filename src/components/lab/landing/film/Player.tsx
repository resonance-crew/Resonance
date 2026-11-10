'use client';

/**
 * The film's player, floating over the stage's foot (round 4, the owner: 「這個播放欄…這塊背景是不是可以直接拿掉」): no
 * bar, no paper of its own — ▶/❚❚ as the site's organic button (a soft fill, its wobble and its brush) and the progress
 * line, a pen's wavy line whose dot rides the curve; a pointer drags it (the page scrolls to that place on the track,
 * and the film follows exactly as it does on a scroll), with the scene's name beside it on a wider screen. The film
 * starts by itself (round 5, the owner: 「直接就開始播放，然後預設…就是有這個暫停按鈕」): the one button is ❚❚ from
 * the first frame, ▶ once paused — never a button with words, never a hint. When the film is over the player goes and
 * a pen's arrow takes its place, leading down to the stories (「動畫播完的時候，我希望這個進度條就消失，然後底下變成
 * 一個引導向下滾動的箭頭」). It talks to the runtime through window events (`film:cmd` out, `film:state` in). Every
 * target is at least 44 px.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { INK, INK_STRONG } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import { wobCircle } from '@/lib/design/wobCircle';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { copyFor } from './copy';
import { Glyph } from './glyphs';
import { PROGRESS_LINE } from './script/progressLine';
import { SCENES, TRACK_SVH } from './script/timeline';
import styles from './film.module.css';

export type FilmCommand =
  | { cmd: 'toggle' }
  | { cmd: 'pause' }
  | { cmd: 'scene'; n: number }
  /** The progress line pressed or dragged: `frac` of the way along the track (0 … 1). */
  | { cmd: 'seek'; frac: number }
  /** The press or the drag is over: a film that was playing plays on from there. */
  | { cmd: 'seeked' }
  /** The end's arrow: on to the stories. */
  | { cmd: 'stories' }
  | { cmd: 'film' };

export interface PlayerState {
  playing: boolean;
  /** An act plays on its own (not held): the one button is ❚❚ then too (WCAG 2.2.2). */
  acting?: boolean;
  /** The film is over (its last act has played out): the player gives way to the arrow down. */
  ended?: boolean;
  scene: number;
  ready: boolean;
  announce: string;
}

export function sendFilm(c: FilmCommand) {
  window.dispatchEvent(new CustomEvent<FilmCommand>('film:cmd', { detail: c }));
}

/** The progress dot's radius and its drawing's box, px (room for its wobble and its pen). */
const DOT_R = 6.5;
const DOT_BOX = 20;
/** How far a press on a scene's tick may move before it is a drag rather than a tap (px). */
const TAP_SLOP = 4;
/** How far a finger moves sideways on the line before it scrubs (px) — and only if more sideways than up or down. */
const TOUCH_SLOP = 8;

export function Player({ locale }: { locale: string }) {
  const c = copyFor(locale);
  // the opening plays by itself from the first frame: ❚❚ until the runtime says otherwise (a reduced-motion reader's
  // film waits, and its first word is ▶)
  const [st, setSt] = useState<PlayerState>({ playing: false, acting: true, scene: 1, ready: false, announce: '' });
  const line = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; tick: number | null; x0: number; y0: number; moved: boolean; touch: boolean } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Partial<PlayerState>>).detail;
      setSt((s) => ({ ...s, ...d }));
    };
    window.addEventListener('film:state', on);
    return () => window.removeEventListener('film:state', on);
  }, []);

  // the runtime decides from its own mode at the moment of the press (React's copy may be a frame behind)
  const playToggle = useCallback(() => sendFilm({ cmd: 'toggle' }), []);
  const names = c.scenes.map((s) => s.name);
  const ticks = useMemo(() => SCENES.map((sc) => sc.y0 / TRACK_SVH), []);
  const pen = useMemo(() => wavyLine(PROGRESS_LINE.width, PROGRESS_LINE.seed, PROGRESS_LINE.amp, PROGRESS_LINE.steps), []);
  // the dot: a little hand-drawn round, never a compass's circle (round 5, the owner: 「改成也是曲線的 border」)
  const dot = useMemo(() => wobCircle(0, 0, DOT_R, 23, { segments: 6, mag: 1.2, cpJitter: 0.9 }), []);

  const onSliderKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = st.scene;
    let to = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = Math.max(1, n - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = Math.min(4, n + 1);
    else if (e.key === 'Home') to = 1;
    else if (e.key === 'End') to = 4;
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    sendFilm({ cmd: 'scene', n: to });
  };

  // ── the line under a pointer: a press seeks, a drag scrubs; a tap on a scene's tick glides to that scene. A finger
  // is a native slider's: a sideways drag scrubs, a tap seeks as it lifts, and a swipe up or down is the page's own
  // scroll (touch-action: pan-y; the browser then cancels the pointer) — never a seek where the swipe began ──
  const fracAt = (x: number) => {
    const r = line.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const tick = (e.target as HTMLElement).closest<HTMLElement>('[data-tick]');
    const touch = e.pointerType !== 'mouse';
    drag.current = { id: e.pointerId, tick: tick ? Number(tick.dataset.tick) : null, x0: e.clientX, y0: e.clientY, moved: false, touch };
    if (tick || touch) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sendFilm({ cmd: 'seek', frac: fracAt(e.clientX) });
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && (d.tick != null || d.touch)) {
      const dx = Math.abs(e.clientX - d.x0);
      if (dx < (d.touch ? TOUCH_SLOP : TAP_SLOP) || (d.touch && dx <= Math.abs(e.clientY - d.y0))) return;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.moved = true;
    sendFilm({ cmd: 'seek', frac: fracAt(e.clientX) });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.tick != null && !d.moved) sendFilm({ cmd: 'scene', n: d.tick + 1 });
    else {
      // a finger's tap seeks where it lifted
      if (d.touch && !d.moved) sendFilm({ cmd: 'seek', frac: fracAt(e.clientX) });
      sendFilm({ cmd: 'seeked' });
    }
  };
  const onCancel = () => {
    if (drag.current) sendFilm({ cmd: 'seeked' });
    drag.current = null;
  };

  // ❚❚ while anything plays by itself — the film playing through, or an act on its own (WCAG 2.2.2) — else ▶ (↺ at
  // the end)
  const pausable = st.playing || !!st.acting;
  const playLabel = pausable ? c.lip.pause : st.ended ? c.cta.replay : c.lip.play;

  const face = { fillColor: 'var(--film-btn)', color: 'var(--film-cream)' };

  return (
    <div
      className={styles.lip}
      data-ended={st.ended ? '' : undefined}
      role="region"
      aria-label={c.lip.controls}
      data-lip=""
    >
      {/* the film's player: ▶ and the line */}
      <div className={styles.lipRow}>
        <span className={`${styles.lipPlay} ${styles.lipGlyph}`} data-play="" title={playLabel}>
          <OrganicButton variant="ctaGhost" size="sm" style={face} onClick={playToggle} ariaLabel={playLabel}>
            <Glyph name={pausable ? 'pause' : st.ended ? 'replay' : 'play'} />
          </OrganicButton>
        </span>
        <div
          ref={line}
          className={styles.progress}
          role="slider"
          tabIndex={0}
          aria-label={c.lip.progressName}
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={st.scene}
          aria-valuetext={c.lip.progress(st.scene, names[st.scene - 1])}
          onKeyDown={onSliderKey}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onLostPointerCapture={onCancel}
        >
          <svg viewBox={`0 -6 ${PROGRESS_LINE.width} 12`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d={pen} className={styles.progressLine} strokeWidth={INK_STRONG} />
          </svg>
          {ticks.map((f, i) => (
            <span key={i} aria-hidden="true" className={styles.progressTick} data-tick={i} style={{ left: `${(f * 100).toFixed(2)}%` }} />
          ))}
          {/* the dot rides a rail as wide as the line, moved by a transform alone (the director's, per frame: along,
              and up and down with the pen line under it) */}
          <span className={styles.progressRail} data-progress-dot="" aria-hidden="true">
            <svg className={styles.progressDot} viewBox={`${-DOT_BOX / 2} ${-DOT_BOX / 2} ${DOT_BOX} ${DOT_BOX}`} width={DOT_BOX} height={DOT_BOX} focusable="false">
              <path d={dot} strokeWidth={INK} />
            </svg>
          </span>
        </div>
        <span className={`${styles.sceneName} ${styles.wideOnly}`} aria-hidden="true">
          {names[st.scene - 1]}
        </span>
      </div>

      {/* the film is over: the way on, down to the stories */}
      <button type="button" className={styles.lipNext} onClick={() => sendFilm({ cmd: 'stories' })} tabIndex={st.ended ? 0 : -1} aria-hidden={st.ended ? undefined : true}>
        <span>{c.lip.next}</span>
        <span className={styles.lipNextArrow}>
          <Glyph name="down" size={26} />
        </span>
      </button>

      {/* without the film (no script, a short landscape window, a runtime that failed): the still's own row */}
      <div className={styles.bookRow}>
        <span className={styles.bookPlay}>
          <OrganicButton variant="ctaGhost" size="sm" style={face} onClick={() => sendFilm({ cmd: 'film' })}>
            <span className={styles.lipWords}>
              <Glyph name="play" size={20} />
              {c.lip.playFilm}
            </span>
          </OrganicButton>
        </span>
        <span className={styles.bookTurn}>{c.lip.turn}</span>
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {st.announce ? c.announce(Number(st.announce), names[Number(st.announce) - 1] ?? '') : ''}
      </p>
    </div>
  );
}

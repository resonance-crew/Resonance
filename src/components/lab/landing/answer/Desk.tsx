'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { whenIdle } from '@/components/sections/LandingStage/LandingStage';
import { Link } from '@/i18n/navigation';
import { DOWNLOAD_ANCHOR } from '@/lib/appStores';
import { cardVar } from '@/lib/design/cardColours';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { Chip } from './Chip';
import type { Still } from '@/lib/mascots/pals/still';
import type { Point } from '@/lib/mascots/types';
import { storyType } from '@/lib/text/script';
import { copyFor } from './copy';
import type { DeskGeometry, DeskScene } from './deskScene';
import { LinkButton } from './LinkButton';
import { Paper } from './Paper';
import { RestToggle, setAnswered, useMotionOk, usePalsRest, usePicked } from './rest';
import type { LabStory } from './story';
import { NOTE_SVG } from './note';
import s from './desk.module.css';

// ── GSAP (and the desk's measure), fetched on intent (a first touch of the blank card) or a little after idle ──
type Gsap = typeof import('gsap').gsap;
type Timeline = ReturnType<Gsap['timeline']>;
interface Kit {
  gsap: Gsap;
  measure: (win: Window, root: HTMLElement) => DeskGeometry | null;
}
let kitPromise: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  kitPromise ??= Promise.all([import('gsap'), import('gsap/DrawSVGPlugin'), import('gsap/MotionPathPlugin'), import('./deskScene')]).then(
    ([g, d, m, ds]) => {
      g.gsap.registerPlugin(d.DrawSVGPlugin, m.MotionPathPlugin);
      return { gsap: g.gsap, measure: ds.measureDesk };
    },
  );
  return kitPromise;
}

const reducedNow = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The phone's stacked spread (desk.module.css's breakpoint): the note is tucked on the story's foot, not carried onto its top. */
const stackedNow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 719px)').matches;

/** Ms to the three captions, each at most this long after the one before (the page never waits on a puppet). */
const CAPTION_AT = [600, 2000, 3600];

/** The hand-over's beats, seconds after 回應 (the line lands at 0.42). */
const MEET_AT = 0.35;
const MEET_DUR = 0.6;
/** How fast a puppet walks a thread (px a second), in the engine's 12 fps steps. */
const PACE = 330;

const pathLength = (pts: readonly Point[]) => pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/**
 * Walks `el` (its translation, px) along `pts` in stop-motion steps with a 3 px bob of `inner`, from `at` on the
 * timeline, at `pace` px a second (or in `dur` seconds). Answers how long it takes.
 */
function walk(tl: Timeline, el: Element, inner: Element | null, pts: Point[], at: number, pace = PACE, dur?: number): number {
  const d = Math.max(0.2, dur ?? pathLength(pts) / Math.max(pace, 1));
  const steps = Math.max(3, Math.round(d * 12));
  tl.to(el, { motionPath: { path: pts.map(([x, y]) => ({ x, y })), curviness: 0 }, duration: d, ease: `steps(${steps})` }, at);
  if (inner) {
    tl.to(inner, { y: -3, duration: d / steps, repeat: steps - 1, yoyo: true, ease: 'steps(1)' }, at);
    tl.set(inner, { y: 0 }, at + d);
  }
  return d;
}

/** The points of a polyline between x0 and x1 (either order), in the order walked. */
function along(pts: readonly Point[], x0: number, x1: number): Point[] {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const inside = pts.filter(([x]) => x >= lo && x <= hi);
  return x0 > x1 ? inside.reverse() : inside;
}

/** Where a still the server drew stands: its middle, its ground, and how far its chest is above the ground. */
function stillAt(el: HTMLElement | null, box: DOMRect, noteH: number): { x: number; y: number; chest: number } | null {
  const frame = el?.firstElementChild as HTMLElement | null;
  if (!el || !frame) return null;
  const r = frame.getBoundingClientRect();
  if (!r.width) return null;
  const below = Number(el.dataset.below) || 0;
  const y = r.bottom - box.top - r.height * below;
  // the note before its chest: as `.note` sits in the frame (top 50%, nudged 10 % of its own height up)
  const noteMid = r.top - box.top + r.height * 0.5 + noteH * 0.4;
  return { x: r.left - box.left + r.width / 2, y, chest: y - noteMid };
}

/**
 * The idle hint on the blank card's writing line: a little card that, every few seconds, folds into a heart for a
 * moment and unfolds again — a heart that refuses to be a heart. Rests as the card.
 */
function CardNotHeart() {
  const common = { fill: 'none', stroke: 'var(--color-terracotta)', strokeWidth: INK, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg className={s.heart} viewBox="0 0 40 36" aria-hidden="true">
      <g className={s.hf0}>
        <path {...common} d="M20 32.5 C9 24.5 3.5 18 5 11 C6.5 4.8 14.5 3.6 20 10.4 C25.5 3.6 33.5 4.8 35 11 C36.5 18 31 24.5 20 32.5 Z" />
      </g>
      <g className={s.hf1}>
        <path {...common} d="M20 31.5 C11 25.5 6 20 6.5 13 L20 12 L33.5 12.6 C34 20 29 25.5 20 31.5 Z" />
        <path {...common} d="M6.5 13 C10 9 15 8.6 20 12" />
      </g>
      <g className={s.hf2}>
        <path {...common} d="M8.5 9.5 L33 7.2 L35 29 L7.2 30.8 Z" />
      </g>
      <g className={s.hf3}>
        <path {...common} d="M6 7.5 L34 6.8 L34.6 30 L5.6 30.4 Z" />
        <path {...common} strokeWidth={INK_LIGHT} d="M11 14 C15 13 20 14.6 28 13.6 M11 19.4 C14 18.6 19 19.8 24 19 M11 24.6 C15 24 21 25.2 27 24.4" />
      </g>
    </svg>
  );
}

interface DeskProps {
  stories: LabStory[];
  locale: string;
  stills: { card: Still; tag: Still };
}

/** 牽牽 and the note: waiting, the two stepping together for the hand-over, carried along the thread, delivered. */
type Carry = 'none' | 'meet' | 'moving' | 'landed';

/**
 * The desk (hero + try it): the line, the badges, and the spread — someone's real story on the left page, a blank
 * card of the visitor's own on the right. A starter (or a line typed), 回應, and the line becomes the card's title,
 * the card is inked and coloured, the thread draws across to the story, 聆聆 hands 牽牽 the folded note and 牽牽 carries
 * it over, three captions say what would really happen, and the actions arrive at once. Nothing is stored or sent;
 * with no scripts the form opens the story's page.
 */
export function Desk({ stories, locale, stills }: DeskProps) {
  const c = copyFor(locale);
  const { resting } = usePalsRest();
  const motionOk = useMotionOk();
  const n = stories.length;
  const [idx, setIdx] = useState(0);
  const [line, setLine] = useState('');
  const [phase, setPhase] = useState<'idle' | 'answered'>('idle');
  const [said, setSaid] = useState('');
  const [answeredIdx, setAnsweredIdx] = useState(0);
  const [captions, setCaptions] = useState(0);
  const [quick, setQuick] = useState(false);
  const [touched, setTouched] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [live, setLive] = useState<ReadonlySet<string>>(new Set());
  const [carry, setCarry] = useState<Carry>('none');
  /** The phone's ending: the note tucked on the story's foot (and 牽牽 back on its own card). */
  const [tucked, setTucked] = useState(false);
  const [landStacked, setLandStacked] = useState(false);
  const [hello, setHello] = useState<{ tag?: boolean; card?: boolean }>({});
  const [swap, setSwap] = useState(0);
  const [wash, setWash] = useState({ x: 0, y: 0 });
  const [resultMin, setResultMin] = useState(0);
  const [conn, setConn] = useState('');
  const [deskSeen, setDeskSeen] = useState(true);

  const deskRef = useRef<HTMLElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const accentRef = useRef<HTMLSpanElement>(null);
  const answerWrapRef = useRef<HTMLDivElement>(null);
  const answerPaperRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const echoRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const sendRef = useRef<HTMLSpanElement>(null);
  const walkerRef = useRef<HTMLSpanElement>(null);
  const flyRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<DeskScene | null>(null);
  const kitRef = useRef<Kit | null>(null);
  /** The hand-over's timelines (the walk is a second one, made once the walker exists). */
  const tls = useRef<Timeline[]>([]);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const carryRef = useRef<Carry>('none');
  carryRef.current = carry;
  const restingRef = useRef(resting);
  restingRef.current = resting;
  const lastNod = useRef(0);
  /** Which answer the carry belongs to: a reset in the meantime leaves a late carry undone. */
  const gen = useRef(0);

  const story = stories[idx];
  const answeredStory = stories[answeredIdx];
  const mine = useMemo(() => (answeredStory ? (answeredStory.palette + 2) % 6 : 1), [answeredStory]);
  const lineType = useMemo(() => storyType('', said || line, locale === 'en' ? 'latin' : 'cjk'), [said, line, locale]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      tls.current.forEach((x) => x.kill());
    },
    [],
  );

  // GSAP a little after the page is idle (or at once on a first touch of the blank card: `warm`)
  useEffect(() => {
    let t = 0;
    const cancel = whenIdle(window, () => {
      t = window.setTimeout(() => loadKit().then((k) => (kitRef.current = k)).catch(() => {}), 2000);
    });
    return () => {
      cancel();
      window.clearTimeout(t);
    };
  }, []);
  const warm = useCallback(() => {
    if (!kitRef.current) loadKit().then((k) => (kitRef.current = k)).catch(() => {});
  }, []);

  // The desk in view or not: the little card's loop runs only while someone can see it.
  useEffect(() => {
    const el = deskRef.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((es) => setDeskSeen(es[es.length - 1].isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── The puppets: a stage each over the spread, once the page is idle (never resting, under reduced motion or Save-Data) ──
  useEffect(() => {
    const root = spreadRef.current;
    if (!root || motionOk === null) return;
    if (resting || !motionOk) return;
    let gone = false;
    let retry = 0;
    const cancel = whenIdle(window, () => {
      Promise.all([import('./stages'), import('./deskScene')])
        .then(async ([st, ds]) => {
          const engine = await st.loadEngine();
          const mount = (tries = 0) => {
            if (gone) return;
            // a hand-over under way plays with the stills: the stages come once it is done
            if (carryRef.current === 'meet' || carryRef.current === 'moving') {
              retry = window.setTimeout(() => mount(tries), 500);
              return;
            }
            try {
              sceneRef.current = ds.mountDesk(window, root, {
                engine,
                onEnter: (slug) => setLive((v) => new Set(v).add(slug)),
                classes: { nod: s.nodLayer, nodOn: s.nodOn },
                answered: phaseRef.current === 'answered',
              });
            } catch (e) {
              // the cards' outlines are drawn a moment after the page: ask again
              if (tries < 10) retry = window.setTimeout(() => mount(tries + 1), 300);
              else if (process.env.NODE_ENV === 'development') console.warn('[desk] puppets left out', e);
            }
          };
          mount();
        })
        .catch((e) => {
          if (process.env.NODE_ENV === 'development') console.warn('[desk] puppets left out', e);
        });
    });
    return () => {
      gone = true;
      cancel();
      window.clearTimeout(retry);
      sceneRef.current?.destroy();
      sceneRef.current = null;
      setLive(new Set());
    };
  }, [resting, motionOk]);

  // Put to rest mid-answer: the hand-over ends where it would have ended, at once.
  useEffect(() => {
    if (!resting || (carryRef.current !== 'meet' && carryRef.current !== 'moving')) return;
    stopHandOver();
    land(gen.current, stackedNow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resting]);

  // ── The thread from the headline's wave down to the blank card's corner (where the two pages are side by side) ──
  useLayoutEffect(() => {
    const desk = deskRef.current;
    const accent = accentRef.current;
    const wrap = answerWrapRef.current;
    if (!desk || !accent || !wrap) return;
    const draw = () => {
      const d = desk.getBoundingClientRect();
      const wave = accent.querySelector('svg')?.getBoundingClientRect();
      const a = wrap.getBoundingClientRect();
      const story = desk.querySelector('[data-desk-story]')?.getBoundingClientRect();
      // side by side only, the blank card to the right of where the wave ends
      if (!wave || !story || story.bottom < a.top || a.left < wave.right) {
        setConn('');
        return;
      }
      const sx = wave.right - d.left - 3;
      const sy = wave.top + wave.height * 0.62 - d.top;
      const ex = a.left - d.left + 10;
      const ey = a.top - d.top + 5;
      const dx = ex - sx;
      const dy = ey - sy;
      const P: Point[] = [
        [sx, sy],
        [sx + dx * 0.42, sy + 4],
        [sx + dx * 0.74, sy + dy * 0.18],
        [sx + dx * 0.8, sy + dy * 0.52],
      ];
      // the smooth second curve: its first handle the mirror of the last one
      const Q: Point[] = [P[3], [2 * P[3][0] - P[2][0], 2 * P[3][1] - P[2][1]], [ex - 2, ey - 16], [ex, ey]];
      // never across words: no point of it inside the subtitle's clauses (or the badges), with a little air
      const words = Array.from(desk.querySelectorAll(`.${s.sub} > span, .${s.badges}`)).map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - d.left - 8, r: r.right - d.left + 8, t: r.top - d.top - 6, b: r.bottom - d.top + 6 };
      });
      const bez = (c: Point[], u: number): Point => {
        const v = 1 - u;
        const at = (k: 0 | 1) => v * v * v * c[0][k] + 3 * v * v * u * c[1][k] + 3 * v * u * u * c[2][k] + u * u * u * c[3][k];
        return [at(0), at(1)];
      };
      for (const c of [P, Q]) {
        for (let i = 0; i <= 40; i++) {
          const [x, y] = bez(c, i / 40);
          if (words.some((w) => x > w.l && x < w.r && y > w.t && y < w.b)) {
            setConn('');
            return;
          }
        }
      }
      const f = (p: Point) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      setConn(`M${f(P[0])} C${f(P[1])} ${f(P[2])} ${f(P[3])} S${f(Q[2])} ${f(Q[3])}`);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(desk);
    ro.observe(wrap);
    void document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, []);

  // ── A story picked on the shelf (「回應這個」) comes to the desk ──
  const picked = usePicked();
  useEffect(() => {
    if (!picked) return;
    const i = stories.findIndex((x) => x.id === picked.id);
    if (i < 0) return;
    if (phaseRef.current === 'answered') resetDesk(i);
    else {
      setIdx(i);
      setSwap((v) => v + 1);
    }
    deskRef.current?.scrollIntoView({ behavior: reducedNow() ? 'auto' : 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const nod = () => {
    const now = performance.now();
    if (now - lastNod.current < 600) return;
    lastNod.current = now;
    sceneRef.current?.nod();
  };

  const onChip = (text: string) => {
    setLine(text);
    setTouched(true);
    setNudge(false);
    warm();
    nod();
    // a finger keeps the keyboard down (chip, then 回應: two taps); a mouse puts the caret after the words
    if (window.matchMedia('(pointer: fine)').matches) {
      const f = fieldRef.current;
      if (f) {
        f.focus();
        requestAnimationFrame(() => f.setSelectionRange(text.length, text.length));
      }
    }
  };

  // ── The hand-over: 聆聆 folds the line into a note and hands it to 牽牽, who carries it to the story ──
  /** Every tween of the hand-over killed and every still put back where the server drew it. */
  const stopHandOver = () => {
    tls.current.forEach((x) => x.kill());
    tls.current = [];
    const gsap = kitRef.current?.gsap;
    const spread = spreadRef.current;
    if (!gsap || !spread) return;
    const els: Element[] = Array.from(spread.querySelectorAll('[data-desk-still], [data-desk-still] > [data-pal]'));
    if (walkerRef.current) els.push(walkerRef.current);
    if (flyRef.current) els.push(flyRef.current);
    gsap.killTweensOf(els);
    gsap.set(els, { clearProps: 'transform' });
  };

  const land = (mine: number, stacked: boolean) => {
    if (mine !== gen.current) return;
    setLandStacked(stacked);
    setTucked(stacked);
    setCarry('landed');
    setHello({ tag: true });
    setCaptions((v) => Math.max(v, 3));
    later(() => setHello({}), 2200);
    // 聆聆 back on its seat, alive, once 牽牽 has said hello
    later(() => {
      if (mine === gen.current) sceneRef.current?.settle();
    }, 2400);
  };

  /**
   * Played with the stills the server drew (whatever the stages were doing, they are put away at once), in the
   * engine's 12 fps steps: the two step toward each other on the card's top, the note goes from 聆聆's mittens to
   * 牽牽's, and 牽牽 walks it along the thread — over the gutter onto the story's top, or on a phone up the margin
   * thread to the story's foot, where it tucks the note and climbs back down. About four seconds; never waited on.
   */
  const handOver = (kit: Kit | null, mine: number) => {
    const stacked = stackedNow();
    const spread = spreadRef.current;
    sceneRef.current?.release();
    setLive(new Set());
    const g = kit && spread ? kit.measure(window, spread) : null;
    if (!kit || !spread || !g || reducedNow() || restingRef.current) return land(mine, stacked);
    const { gsap } = kit;
    const box = spread.getBoundingClientRect();
    const tagEl = spread.querySelector<HTMLElement>('[data-desk-still="tag"]');
    const cardEl = spread.querySelector<HTMLElement>('[data-desk-still="card"]');
    const u = g.unit;
    const noteH = u * 0.27;
    const tag = stillAt(tagEl, box, noteH);
    const card = stillAt(cardEl, box, noteH);
    if (!tagEl || !cardEl || !tag || !card || (stacked ? g.margin.length < 3 : g.thread.length < 3)) return land(mine, stacked);

    const tagPal = tagEl.firstElementChild;
    const cardPal = cardEl.firstElementChild;
    const tagW = (tagPal as HTMLElement).getBoundingClientRect().width;
    const cardW = (cardPal as HTMLElement).getBoundingClientRect().width;
    // they meet a little nearer 牽牽's end (it walks off that way), a mitten's reach apart
    const apart = (tagW + cardW) * 0.5 * 0.74;
    const mid = tag.x + (card.x - tag.x) * 0.42;
    const dxTag = mid - apart / 2 - tag.x;
    const dxCard = mid + apart / 2 - card.x;

    flushSync(() => setCarry('meet'));
    const fly = flyRef.current;
    if (!fly) return land(mine, stacked);
    const tl = gsap.timeline();
    tls.current = [tl];

    // 1 · the two step toward each other
    walk(tl, tagEl, tagPal, [[0, 0], [dxTag, 0]], MEET_AT, PACE, MEET_DUR);
    walk(tl, cardEl, cardPal, [[0, 0], [dxCard, 0]], MEET_AT, PACE, MEET_DUR);
    // 2 · 聆聆 holds out the note (folded from the line), and hands it over in a little arc
    const met = MEET_AT + MEET_DUR;
    const from: Point = [card.x + dxCard, card.y - card.chest];
    const to: Point = [tag.x + dxTag, tag.y - tag.chest];
    tl.call(() => setHello({ card: true }), [], met);
    tl.fromTo(fly, { x: from[0], y: from[1], scale: 0.2, rotate: 6, opacity: 1 }, { scale: 1, duration: 0.25, ease: 'steps(3)' }, met + 0.05);
    tl.to(
      fly,
      {
        motionPath: { path: [{ x: from[0], y: from[1] }, { x: (from[0] + to[0]) / 2, y: Math.min(from[1], to[1]) - u * 0.22 }, { x: to[0], y: to[1] }], curviness: 1.2 },
        rotate: -7,
        duration: 0.5,
        ease: 'steps(6)',
      },
      met + 0.35,
    );
    // 3 · 牽牽 has it: eyes shut, glad; 聆聆 lowers its arm
    const taken = met + 0.85;
    tl.call(
      () => {
        setHello({ tag: true });
        setCaptions((v) => Math.max(v, 2));
      },
      [],
      taken,
    );
    // 4 · 牽牽 sets off with it along the thread (a walker in the spread's px takes the still's place); 聆聆 goes back
    // to its seat and waves it off
    const off = taken + 0.6;
    const start: Point = [tag.x + dxTag, tag.y];
    const back = walk(tl, cardEl, cardPal, [[dxCard, 0], [0, 0]], off + 0.1, PACE * 0.8);
    tl.call(() => setHello({ card: true }), [], off + 0.2 + back);
    tl.call(
      () => {
        if (mine !== gen.current) return;
        setHello({});
        flushSync(() => setCarry('moving'));
        gsap.set(tagEl, { x: 0 });
        const w = walkerRef.current;
        if (!w) return land(mine, stacked);
        gsap.set(w, { x: start[0], y: start[1] });
        const inner = w.firstElementChild;
        const t2 = gsap.timeline({ onComplete: () => land(mine, stacked) });
        tls.current.push(t2);
        if (!stacked) {
          // along the card's top to its corner, the thread across, onto the story's top near its end
          const landX = g.storyBox.x + g.storyBox.w - u * 0.62;
          const pts: Point[] = [start, ...along(g.answerTop, start[0] - 4, g.answerBox.x + 12), ...g.thread, ...along(g.storyTop, g.storyBox.x + g.storyBox.w - 12, landX)];
          walk(t2, w, inner, pts, 0);
        } else {
          // to the thread's foot, up it until the note reaches the story's foot, the note tucked there, and back home
          const foot: Point = [g.margin[0][0], tag.y];
          const reach = g.storyBox.y + g.storyBox.h + tag.chest;
          const climb = g.margin.filter(([, y]) => y <= tag.y - 2 && y >= reach);
          const top: Point = [climb.length ? climb[climb.length - 1][0] : foot[0], reach];
          const up: Point[] = [foot, ...climb, top];
          let at = walk(t2, w, inner, [start, ...along(g.answerTop, start[0] - 4, foot[0] + 4), foot], 0);
          at += walk(t2, w, inner, up, at, PACE * 0.62);
          const noteEl = w.querySelector(`.${s.note}`);
          t2.call(() => setTucked(true), [], at + 0.15);
          if (noteEl) t2.to(noteEl, { opacity: 0, duration: 0.16, ease: 'steps(2)' }, at + 0.15);
          at += 0.45;
          at += walk(t2, w, inner, [...up].reverse(), at, PACE * 0.8);
          walk(t2, w, inner, [foot, [tag.x, tag.y]], at);
        }
      },
      [],
      off,
    );
  };

  const answer = (text: string) => {
    const mine = ++gen.current;
    setTouched(true);
    setNudge(false);
    setAnswered(text);
    const go = (kit: Kit | null) => {
      const gsap = kit?.gsap ?? null;
      const paper = answerPaperRef.current;
      const btn = sendRef.current;
      if (paper && btn) {
        const pr = paper.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        setWash({ x: br.left + br.width / 2 - pr.left, y: br.top + br.height / 2 - pr.top });
      }
      // the answered card keeps the blank card's height: an unfinished card, never a comment
      const form = paper?.querySelector('form');
      const from = echoRef.current?.getBoundingClientRect();
      const fromSize = echoRef.current ? parseFloat(getComputedStyle(echoRef.current).fontSize) : 0;
      flushSync(() => {
        setResultMin(form ? form.offsetHeight : 0);
        setSaid(text);
        setAnsweredIdx(idx);
        setPhase('answered');
        setQuick(!gsap);
        setCaptions(gsap ? 0 : 3);
      });
      const title = titleRef.current;
      title?.focus({ preventScroll: true });
      if (!gsap) return handOver(null, mine);
      // the line, from the field into the card's title (FLIP: one uniform scale, so the words never stretch)
      if (title && from && from.width) {
        const to = title.getBoundingClientRect();
        const toSize = parseFloat(getComputedStyle(title).fontSize) || 1;
        gsap.fromTo(
          title,
          { x: from.left - to.left, y: from.top - to.top, scale: fromSize / toSize, transformOrigin: '0 0' },
          { x: 0, y: 0, scale: 1, duration: 0.42, ease: 'power3.out', clearProps: 'transform' },
        );
      }
      // the dashed page is inked: a solid line drawn round it as the dashes go
      const solid = paper?.querySelector('path[data-outline]');
      const dash = paper?.querySelector('path[data-outline-dash]');
      if (solid) gsap.fromTo(solid, { drawSVG: '0% 0%', opacity: 1 }, { drawSVG: '0% 100%', duration: 0.55, ease: 'power1.inOut' });
      if (dash) gsap.to(dash, { opacity: 0, duration: 0.3 });
      // the thread, from this card to the story, then the logo's three waves where it hangs: the two are linked
      const spread = spreadRef.current;
      spread?.querySelectorAll<SVGPathElement>('path[data-thread-draw]').forEach((p) => {
        gsap.fromTo(p, { drawSVG: '0% 0%', opacity: 1 }, { drawSVG: '0% 100%', duration: 0.6, delay: 0.4, ease: 'power2.inOut' });
      });
      const knot = spread ? Array.from(spread.querySelectorAll<SVGPathElement>('path[data-knot]')) : [];
      if (knot.length) gsap.fromTo(knot, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.3, stagger: 0.12, delay: 0.95, ease: 'steps(4)' });
      CAPTION_AT.forEach((ms, i) => later(() => setCaptions((v) => Math.max(v, i + 1)), ms));
      handOver(kit, mine);
    };
    if (reducedNow()) return go(null);
    if (kitRef.current) return go(kitRef.current);
    // GSAP not here yet: wait for it a moment, then the finished state without it
    let settled = false;
    const t = window.setTimeout(() => {
      settled = true;
      go(null);
    }, 300);
    loadKit()
      .then((k) => {
        kitRef.current = k;
        if (settled) return;
        settled = true;
        window.clearTimeout(t);
        go(k);
      })
      .catch(() => {});
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = line.trim();
    if (!text) {
      setNudge(true);
      fieldRef.current?.focus();
      nod();
      return;
    }
    answer(text);
  };

  function resetDesk(next?: number) {
    gen.current++;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    stopHandOver();
    const gsap = kitRef.current?.gsap;
    const paper = answerPaperRef.current;
    const spread = spreadRef.current;
    if (gsap) {
      const els: Element[] = [
        ...(paper ? Array.from(paper.querySelectorAll('path[data-outline], path[data-outline-dash]')) : []),
        ...(spread ? Array.from(spread.querySelectorAll('path[data-thread-draw], path[data-knot]')) : []),
      ];
      gsap.killTweensOf(els);
      gsap.set(els, { clearProps: 'all' });
    }
    setAnswered(null);
    flushSync(() => {
      setPhase('idle');
      setLine('');
      setSaid('');
      setCaptions(0);
      setCarry('none');
      setTucked(false);
      setHello({});
      setQuick(false);
      setResultMin(0);
      setIdx((i) => (next != null ? next : (i + 1) % n));
      setSwap((v) => v + 1);
      setLive(new Set());
    });
    sceneRef.current?.reset();
    fieldRef.current?.focus({ preventScroll: true });
  }

  const another = () => {
    setIdx((i) => (i + 1) % n);
    setSwap((v) => v + 1);
  };

  if (!story) return null;
  const answered = phase === 'answered';
  const type = storyType(story.title, story.opening);
  const staged = !resting && motionOk === true;
  // 牽牽's still by the thread's end: gone while it is live, or while its walker carries the note, or once it is on
  // the story (a phone's 牽牽 comes home after tucking the note: its still stands again)
  const tagStillGone = live.has('tag') || carry === 'moving' || (carry === 'landed' && !landStacked);
  const cardStillGone = live.has('card');

  return (
    <section
      ref={deskRef}
      className={s.desk}
      aria-labelledby="answer-h1"
      data-phase={phase}
      data-quick={quick ? '' : undefined}
      data-seen={deskSeen ? '' : undefined}
      data-carry={carry !== 'none' ? carry : undefined}
    >
      <div className={s.head}>
        <div className={s.headText}>
          <h1 id="answer-h1" className={s.h1}>
            {c.h1.prefix}
            <span ref={accentRef} className={s.accent}>
              {c.h1.accent}
              <svg className={s.wave} viewBox="0 0 240 14" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2,8 C26,2 52,13 82,7 C110,1 138,11 166,7 C190,4 214,9 238,7" stroke="var(--color-terracotta)" strokeWidth={INK} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
            {c.h1.suffix}
          </h1>
          <p className={s.sub}>
            {c.sub.split(/(?<=——|— )/).map((part) => (
              <span key={part} className={s.clause}>
                {part}
              </span>
            ))}
          </p>
        </div>
        <GetTheApp id={DOWNLOAD_ANCHOR} className={s.badges} />
      </div>

      {conn && (
        <svg className={s.connector} aria-hidden="true">
          <path d={conn} pathLength={1} className={s.connectorPath} fill="none" stroke="var(--color-terracotta)" strokeWidth={INK} strokeLinecap="round" opacity="0.75" />
        </svg>
      )}

      <div ref={spreadRef} className={s.spread} data-desk-spread="" data-staged={staged ? '' : undefined}>
        {/* the left page: someone's story */}
        <div className={s.storyCol}>
          <div className={s.storyWrap}>
            <Paper
              seed={83 + idx * 7}
              fill={cardVar('interior', story.palette)}
              pen={cardVar('border', story.palette)}
              className={s.storyPaper}
              data={{ 'data-desk-story': '' }}
            >
              <div key={swap} className={s.storyBody} data-swap={swap ? '' : undefined}>
                <p className={s.pageLabel}>{c.story.label}</p>
                <h2 className={`story-title ${s.storyTitle}`} data-script={type.script === 'latin' ? 'latin' : undefined} lang={type.lang}>
                  {story.title}
                </h2>
                <p className={`story-prose ${s.opening}`} data-script={type.script === 'latin' ? 'latin' : undefined} data-density="compact" lang={type.lang}>
                  {story.opening}
                </p>
                <p className={s.byline}>
                  <span className={s.author}>{story.author ?? c.story.anonymous}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{c.story.minutes(story.minutes)}</span>
                </p>
              </div>
              <div className={s.pageFoot}>
                <Link href={story.href} className={s.readAll}>
                  {c.story.readAll} <span aria-hidden="true">→</span>
                </Link>
                <button type="button" className={s.another} onClick={another} aria-label={c.story.anotherAria} disabled={answered}>
                  {c.story.another} <span aria-hidden="true">↻</span>
                </button>
              </div>
            </Paper>
            {carry === 'landed' && !landStacked && (
              <span className={s.landed} data-landed="" data-hello={hello.tag ? '' : undefined} aria-hidden="true">
                <PaperPalStill still={stills.tag} waveArm="r" phase={0.6} />
                <span className={s.note} dangerouslySetInnerHTML={{ __html: NOTE_SVG }} />
              </span>
            )}
            {tucked && <span className={s.tucked} data-landed="" aria-hidden="true" dangerouslySetInnerHTML={{ __html: NOTE_SVG }} />}
          </div>
        </div>

        {/* the gutter: the thread, waiting (faint, dashed) until there is an answer to tie */}
        <div className={s.gutter} aria-hidden="true">
          <GutterThread />
        </div>
        <MarginThread />

        {/* the right page: the visitor's own, blank */}
        <div className={s.answerCol}>
          <div ref={answerWrapRef} className={s.answerWrap} data-desk-answer="" onPointerDown={warm} onFocus={warm}>
            <span
              className={s.stillTag}
              data-desk-still="tag"
              data-below={stills.tag.below}
              data-gone={tagStillGone ? '' : undefined}
              data-hello={hello.tag && (carry !== 'landed' || landStacked) ? '' : undefined}
              aria-hidden="true"
            >
              <PaperPalStill still={stills.tag} waveArm="r" phase={1.3} />
            </span>
            <span className={s.stillCard} data-desk-still="card" data-below={stills.card.below} data-gone={cardStillGone ? '' : undefined} data-hello={hello.card ? '' : undefined} aria-hidden="true">
              <PaperPalStill still={stills.card} waveArm="l" phase={0.4} />
            </span>
            <Paper
              ref={answerPaperRef}
              seed={311}
              fill="var(--answer-paper)"
              pen="var(--answer-pen)"
              blank
              inked={answered}
              penInk={cardVar('border', mine)}
              wash={{ color: `color-mix(in oklab, ${cardVar('fill', mine)} 62%, var(--color-card-bg))`, x: wash.x, y: wash.y, on: answered, duration: quick ? 0 : 520 }}
              className={s.answerPaper}
            >
              {!answered ? (
                <form
                  className={s.form}
                  aria-labelledby="answer-label"
                  method="get"
                  action={`/${locale}${story.href}`}
                  onSubmit={onSubmit}
                  noValidate
                >
                  <p id="answer-label" className={s.pageLabel}>
                    {c.answer.label}
                  </p>
                  <p className={`story-title ${s.prompt}`} data-script={locale === 'en' ? 'latin' : undefined}>
                    {c.answer.prompt}
                  </p>
                  <div className={s.chips} role="group" aria-label={c.answer.label}>
                    {c.answer.chips.map((chip, i) => (
                      <Chip key={chip} seed={31 + i * 17} label={c.answer.chipAria(chip)} onClick={() => onChip(chip)}>
                        {chip}
                      </Chip>
                    ))}
                  </div>
                  <noscript>
                    <style>{`.${s.chips}{display:none}`}</style>
                  </noscript>
                  <div className={s.fieldRow}>
                    <input
                      ref={fieldRef}
                      className={`${s.field} story-prose`}
                      data-script={lineType.script === 'latin' ? 'latin' : undefined}
                      data-desk-field=""
                      type="text"
                      value={line}
                      maxLength={80}
                      enterKeyHint="send"
                      autoComplete="off"
                      placeholder={c.answer.placeholder}
                      aria-label={c.answer.fieldLabel}
                      aria-describedby="answer-honesty"
                      onChange={(e) => {
                        setLine(e.target.value);
                        setTouched(true);
                        setNudge(false);
                        nod();
                      }}
                    />
                    <span ref={echoRef} className={`${s.echo} story-prose`} data-script={lineType.script === 'latin' ? 'latin' : undefined} aria-hidden="true">
                      {line}
                    </span>
                    {!touched && <CardNotHeart />}
                    <FieldRule />
                  </div>
                  <p id="answer-honesty" className={s.honesty}>
                    {nudge ? c.answer.nudge : c.answer.honesty}
                  </p>
                  <div className={s.sendRow}>
                    <span ref={sendRef} className={s.send}>
                      <OrganicButton variant="solid">{c.answer.send}</OrganicButton>
                    </span>
                  </div>
                </form>
              ) : (
                <div className={s.result} style={{ minHeight: resultMin || undefined }}>
                  <p className={s.pageLabel}>{c.answer.answering(answeredStory.title)}</p>
                  <p ref={titleRef} tabIndex={-1} className={`story-title ${s.resultTitle}`} data-script={lineType.script === 'latin' ? 'latin' : undefined} lang={lineType.lang}>
                    {said}
                  </p>
                  <RuledLines />
                  <div className={s.resultFoot}>
                    <p className={s.byline}>{c.answer.you}</p>
                    <LinkButton href="/write">{c.answer.finish}</LinkButton>
                  </div>
                </div>
              )}
            </Paper>
          </div>
          {answered && (
            <div className={s.after}>
              <div className={s.captions} role="status" aria-live="polite">
                {c.answer.captions.slice(0, captions).map((cap, i) => (
                  <p key={cap} className={s.caption} data-n={i}>
                    <CaptionMark n={i} />
                    {cap}
                  </p>
                ))}
              </div>
              <div className={s.actions}>
                <OrganicButton variant="quiet" onClick={() => resetDesk()}>
                  {c.answer.again}
                </OrganicButton>
                <div className={s.inApp}>
                  <span className={s.inAppLabel}>{c.answer.inApp}</span>
                  <GetTheApp qr={false} size="sm" className={s.inAppBadges} />
                </div>
              </div>
            </div>
          )}
        </div>

        {carry === 'meet' && <span ref={flyRef} className={s.fly} aria-hidden="true" dangerouslySetInnerHTML={{ __html: NOTE_SVG }} />}
        {carry === 'moving' && (
          <span ref={walkerRef} className={s.walker} aria-hidden="true">
            <span className={s.walkerInner}>
              <PaperPalStill still={stills.tag} waveArm="r" phase={0.2} />
              <span className={s.note} dangerouslySetInnerHTML={{ __html: NOTE_SVG }} />
            </span>
          </span>
        )}
      </div>

      <div className={s.deskFoot}>
        <RestToggle locale={locale} />
      </div>
    </section>
  );
}

/** A small pen mark before each caption: a dot, then the thread's wave (the logo's line). */
function CaptionMark({ n }: { n: number }) {
  return (
    <svg className={s.captionMark} viewBox="0 0 22 12" aria-hidden="true">
      <path d={n === 0 ? 'M2,6 C6,1 10,11 14,6 C16,3.5 18,4 20,6' : n === 1 ? 'M2,4 C6,0 10,8 14,4 M2,9 C6,5 10,13 14,9' : 'M2,3 C6,-1 10,7 14,3 M2,7 C6,3 10,11 14,7 M2,11 C6,7 10,15 14,11'} fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_LIGHT} strokeLinecap="round" />
    </svg>
  );
}

/** The field's ruled line: written on, not typed into a box. */
function FieldRule() {
  return (
    <svg className={s.fieldRule} viewBox="0 0 400 8" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1,4 C60,1 110,7 170,4 C230,1 290,6 340,4 C360,3 380,5 399,4" fill="none" stroke="var(--answer-pen)" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/** The answered card's empty lines (as many as its height holds): the rest of the story, still to be written. */
function RuledLines() {
  const shapes = ['M1,5 C70,2 130,8 200,5 C270,2 330,7 399,4', 'M1,4 C60,7 140,1 210,5 C280,8 340,3 399,5', 'M1,5 C80,3 150,7 230,4 C300,2 350,6 399,5'];
  const widths = [100, 96, 98, 93, 99, 95, 97, 94];
  return (
    <div className={s.ruled} aria-hidden="true">
      {widths.map((wd, i) => (
        <svg key={i} viewBox="0 0 400 9" preserveAspectRatio="none" className={s.ruledLine} style={{ width: `${wd}%` } as CSSProperties}>
          <path d={shapes[i % 3]} fill="none" stroke="var(--answer-pen)" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  );
}

/**
 * The phone's stretch of thread in the left margin, from the blank card's top up to the story's foot: drawn in the
 * margin's own px once measured (no stretched viewBox, so the pen keeps its width and DrawSVG can measure it). Its
 * path runs from the blank card up to the story: the way the note goes.
 */
function MarginThread() {
  const ref = useRef<HTMLDivElement>(null);
  const { h } = useElementSize(ref, 24, 100);
  const H = (h || 100) + 16;
  const y = (f: number) => (H * f - 10).toFixed(1);
  const d = `M12,${y(1)} C4,${y(0.78)} 20,${y(0.63)} 12,${y(0.45)} C5,${y(0.28)} 16,${y(0.14)} 12,${y(0.02)}`;
  return (
    <div ref={ref} className={s.margin} aria-hidden="true">
      <svg className={s.marginSvg} width={24} height={H} viewBox={`0 -10 24 ${H}`}>
        <path d={d} className={s.threadWait} fill="none" strokeWidth={INK_LIGHT} strokeDasharray="4 6" />
        <path d={d} className={s.threadInk} fill="none" strokeWidth={INK} strokeLinecap="round" data-thread-draw="" data-margin-thread="" />
      </svg>
      <Knot className={s.marginKnot} size={26} />
    </div>
  );
}

/** The logo's three waves (ResonanceIcon's own lines), hung on the thread once the two cards are linked. */
function Knot({ className, x, y, size = 34 }: { className?: string; x?: number; y?: number; size?: number }) {
  const paths = [
    'M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1',
    'M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0',
    'M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0',
  ];
  const inner = paths.map((d) => <path key={d} d={d} data-knot="" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK} strokeLinecap="round" vectorEffect="non-scaling-stroke" />);
  if (x != null && y != null) {
    return (
      <g className={[s.knot, className].filter(Boolean).join(' ')} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>
        {inner}
      </g>
    );
  }
  return (
    <svg className={[s.knot, className].filter(Boolean).join(' ')} viewBox="0 0 24 24" width={size} height={size}>
      {inner}
    </svg>
  );
}

/**
 * The gutter's thread: from the blank card's top corner to the story's, hanging a little. Drawn in the gutter's own
 * px once measured (the server's HTML draws it at a default width, scaled), so DrawSVG lays it exactly. Its path runs
 * from the answer's side to the story's: the order the note travels. The logo's waves hang where it sags.
 */
function GutterThread() {
  const ref = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(ref, 160, 60);
  const W = w || 160;
  const bleed = 22;
  const H = 84;
  const x0 = W + bleed;
  const x1 = -bleed;
  const mid = W / 2;
  const d = `M${x0},10 C${x0 - W * 0.32},34 ${mid + W * 0.18},44 ${mid},43 C${mid - W * 0.2},42 ${x1 + W * 0.3},30 ${x1},9`;
  return (
    <div ref={ref} className={s.gutterBox}>
      <svg className={s.gutterSvg} width={W + bleed * 2} height={H} viewBox={`${-bleed} 0 ${W + bleed * 2} ${H}`} style={{ left: -bleed } as CSSProperties}>
        <path d={d} className={s.threadWait} fill="none" strokeWidth={INK_LIGHT} strokeDasharray="4 7" strokeLinecap="round" />
        <path d={d} className={s.threadInk} fill="none" strokeWidth={INK} strokeLinecap="round" data-thread="" data-thread-draw="" />
        <Knot x={mid} y={61} size={Math.min(40, Math.max(26, W * 0.26))} />
      </svg>
    </div>
  );
}

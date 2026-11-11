/**
 * The film's runtime (SPEC §7, §10): loaded by Film.tsx right after hydration (`import()`), it reads the stage the
 * server drew, then runs one animation frame loop while the film is on screen — the scroll gives the scenery clock its
 * target, the act clocks play, the director draws — and wires the player (window `film:cmd` / `film:state` events: ▶,
 * the progress line's press and drag, its scene ticks), the keys (← → K), the hash, the way back from a card page, and
 * `window.__film` (the lab's handle). Under reduced motion the opening act waits for ▶ (nothing starts by itself).
 * The film rests (acts pure scrub, no idle life) only under the lab's `?rest=1`, for
 * exact stills (designs/landing-lab/film/tools): a visitor can no longer make it rest (the owner, round 3).
 */
import type { ChangeStyle } from '../script/changes/types';
import type { FilmModel } from '../model';
import { FILM_END, SCENES, SEG, TRACK_SVH, sOfY, sceneAtS, yOfS } from '../script/timeline';
import { FilmClock } from './clock';
import { Director } from './director';
import { Drive, type DriveMode } from './drive';
import { cameBack, sceneOfHash } from './nav';

export interface FilmHandle {
  ready: boolean;
  segments(): { id: string; kind: string; t0: number; t1: number; y0: number; y1: number }[];
  seek(t: number): void;
  play(): void;
  state(): { s: number; scene: number; acting: boolean; mode: string; resting: boolean; y: number; owner: string; x: number };
  stats(): { frames: number; p50: number; p95: number; long: number };
}

declare global {
  interface Window {
    __film?: FilmHandle;
  }
}

const Y_KEY = 'resonance:film-y';

function readStore(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function writeStore(store: Storage | undefined, key: string, v: string) {
  try {
    store?.setItem(key, v);
  } catch {
    /* storage closed: it lasts this visit */
  }
}

export { loadChangeStyle } from '../script/changes/load';

export function startFilm(root: HTMLElement, { model, style }: { model: FilmModel; style?: ChangeStyle }): () => void {
  const stage = root.querySelector<HTMLElement>('[data-stage]');
  if (!stage) return () => {};
  const page = root.closest<HTMLElement>('[data-film-page]');
  const header = page?.querySelector<HTMLElement>('[data-film-header]') ?? null;
  const lip = root.querySelector<HTMLElement>('[data-lip]');
  const q = new URLSearchParams(window.location.search);
  // the player's button: where focus goes when a card it was on leaves the screen
  const focusPlay = () => [...(lip?.querySelectorAll<HTMLElement>('[data-play] button') ?? [])].find((b) => b.offsetParent !== null)?.focus({ preventScroll: true });

  // the scene changes' style: the lab's `?change=<name>`, loaded by the caller (script/changes/load.ts); else flats
  const director = new Director(root, stage, header, focusPlay, style);
  const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  director.reduced = reducedMq.matches;
  const clock = new FilmClock();
  // the lab's exact frames (tools/shots.mjs --rest, tools/changes.mjs): never a visitor's
  const resting = q.get('rest') === '1';
  root.toggleAttribute('data-resting', resting);
  let filmTop = 0;
  let svh = 1;
  /**
   * Where (px within the film) the end's fade from the night has turned to the page's paper under the header's foot:
   * past it the header is the site's own band (`data-paper`); before it, released or not, the night's bare header — no
   * cream band over a night still filling the screen (the review, round 3).
   */
  let paperY = Infinity;
  /** Where the fade's top reaches the header's foot: from there no card of the night is under the header (`data-dusk`). */
  let duskY = Infinity;
  const measure = () => {
    const L = director.measure();
    svh = L.h / 100;
    filmTop = root.getBoundingClientRect().top + window.scrollY;
    const fade = page?.querySelector<HTMLElement>('[data-end-fade]');
    const foot = header?.querySelector('[data-pen]')?.getBoundingClientRect().bottom;
    if (fade) {
      const r = fade.getBoundingClientRect();
      const under = foot && foot > 0 ? foot : 74;
      duskY = r.top + window.scrollY - filmTop - under;
      paperY = duskY + 0.5 * r.height;
    }
  };
  let paper = false;
  let dusk = false;
  let band = -1;
  const checkPaper = () => {
    const y = window.scrollY - filmTop;
    const on = y >= paperY;
    if (on !== paper) {
      paper = on;
      root.toggleAttribute('data-paper', on);
      director.paperUp = on;
    }
    const d = y >= duskY;
    if (d !== dusk) {
      dusk = d;
      root.toggleAttribute('data-dusk', d);
    }
    // the night's band comes in over the stage's first 4–18 px of leaving: none where ▶ rests (the track's end, +1 px
    // at most — the moon's glow is under the header there), in full before the first card reaches the header's foot
    // (≥ 22 px at every layout); read from the scroll, so a jump never waits on the frame loop (the last check)
    const nb = Math.round(Math.min(1, Math.max(0, (y - TRACK_SVH * svh - 4) / 14)) * 100) / 100;
    if (nb !== band) {
      band = nb;
      header?.style.setProperty('--film-night-band', String(nb));
    }
  };
  measure();
  if (model.a) root.style.setProperty('--film-dot', `var(--card-fill-${model.a.family})`);

  // when the film plays on after a scroll that skipped ahead (0: it doesn't) — see skipScroll
  let resumeAt = 0;
  // the film was playing when the visitor jumped (a scene's tick, the progress line): it plays on once there
  let carry = false;
  const drive = new Drive({ top: () => filmTop, svh: () => svh }, (m: DriveMode) => {
    // (a scroll that skips ahead is still the film playing: it plays on once the hand rests — `resumeAt`)
    publish({ playing: m === 'play' || resumeAt > 0 || carry });
    if (m !== 'browse') wake();
    else if (!near && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  });

  // ── the dark scheme: the film keeps its hours, a little dimmer ──
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const isDim = () => {
    const sch = document.documentElement.getAttribute('data-scheme');
    return sch === 'dark' || (sch !== 'light' && darkMq.matches);
  };
  let dim = isDim();
  const onScheme = () => (dim = isDim());
  darkMq.addEventListener('change', onScheme);
  const mo = new MutationObserver(onScheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });

  // ── the player's state, sent when it changes ──
  // the film is to start by itself (decided once the start place is known)
  let auto = false;
  // `intro`: a fresh visit at the film's top, nothing asked of it yet (no scroll, no jump, no button)
  let intro = true;
  let lastScene = 1;
  let announceNext = false;
  const state = { playing: false, acting: false, ended: false, scene: 1, ready: false, announce: '' };
  const publish = (patch: Partial<typeof state>) => {
    Object.assign(state, patch);
    window.dispatchEvent(new CustomEvent('film:state', { detail: { ...state } }));
  };

  const yFilm = () => window.scrollY - filmTop;
  const ySvh = () => yFilm() / svh;
  const sTargetNow = () => sOfY(Math.max(0, ySvh()));

  // the night's sky covers start loading as soon as a jump or a glide is headed past the meet, not when it lands
  const ahead = (yPx: number) => {
    const s = sOfY(Math.max(0, yPx) / svh);
    if (s > SEG.catch.t0) director.prefetchAnswer();
    if (s > SEG.meet.t0) director.prefetchSky();
  };
  // ── jumps: s lands, every act at its floor there ──
  const jumpToY = (yPx: number) => {
    ahead(yPx);
    drive.jumpTo(yPx);
    clock.jump(sOfY(yPx / svh));
  };
  const seek = (t: number) => jumpToY(yOfS(Math.max(0, Math.min(FILM_END, t))) * svh);

  const leaveIntro = () => {
    intro = false;
  };

  // a hair past the scene's first line, so the scene it lands in is that scene (a px's rounding never leaves it before)
  const sceneStartY = (n: number) => (n <= 1 ? 0 : (SCENES[Math.min(3, n - 1)].y0 + 0.3) * svh);
  /** The film is playing, or about to play on (after a skip, a jump). */
  const playingNow = () => drive.mode === 'play' || resumeAt > 0 || carry;
  const playOn = () => {
    if (!carry) return;
    carry = false;
    startPlay();
  };
  const goScene = (n: number) => {
    leaveIntro();
    announceNext = true;
    ahead(sceneStartY(n));
    // a film that was playing plays on from the scene it was sent to
    carry = playingNow();
    resumeAt = 0;
    drive.glideTo(sceneStartY(n), playOn);
  };
  /**
   * The progress line pressed or dragged (`frac` of the way along it): the page goes to that place on the track at
   * once and the film lands there as a jump does — every act at its floor there (the engineering review, round 3: as a
   * plain scroll, an act behind it rewound and left the stage empty for a second) — playing on from there once the
   * finger lifts; and ▶ stops. Never past the stage's letting go (the lip would leave from under the finger).
   */
  const scrubTo = (frac: number) => {
    leaveIntro();
    restore = null;
    // a film that was playing plays on once the finger lifts (`seeked`)
    carry = playingNow();
    resumeAt = 0;
    const y = Math.min(1, Math.max(0, frac)) * (TRACK_SVH - 1) * svh;
    jumpToY(y);
  };
  const replay = () => {
    leaveIntro();
    drive.glideTo(0, () => drive.play(0), 2);
  };
  /**
   * ▶: from where the scenery is — or, when the act on stage has already played ahead of the scroll, from where that
   * act is (the scenery catches up quickly), never standing on a finished act. Once the film is over, from the start
   * again (drive.play glides back first).
   */
  const startPlay = () => {
    leaveIntro();
    clock.release();
    const st = clock.state(false);
    let s0 = clock.s;
    if (st.owner.kind === 'act') s0 = Math.max(s0, st.owner.t0 + (clock.acts.get(st.owner.index) ?? 0));
    drive.play(s0, clock.s);
  };
  /**
   * The one button (the owner, round 3: only ▶): ❚❚ while ▶ plays the film or an act plays on its own (WCAG 2.2.2:
   * ☾ is gone, so this is what pauses the motion that starts by itself) — the page stays, the acts hold still — and
   * ▶ otherwise, playing on from there.
   */
  const playToggle = () => {
    leaveIntro();
    auto = false;
    // (waiting to play on after a skip is playing too: the button says ❚❚, and a press pauses)
    const waiting = resumeAt > 0 || carry;
    resumeAt = 0;
    carry = false;
    if (drive.mode === 'play' || waiting || clock.state(resting).acting) {
      drive.handBack();
      clock.hold();
      publish({ playing: false, acting: false });
    } else startPlay();
  };
  /** Where the stories land (px within the film): as their own anchor lands, their heading clear of the header. */
  const storiesY = () => {
    const el = document.getElementById('stories');
    if (!el) return TRACK_SVH * svh + director.L.lvh;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    return el.getBoundingClientRect().top + window.scrollY - filmTop - margin;
  };
  /** →: the next scene; from the last one, the stage lets go (and from there, the stories). */
  const nextScene = () => {
    const n = sceneAtS(clock.s).n;
    if (n < 4) return goScene(n + 1);
    leaveIntro();
    const end = TRACK_SVH * svh;
    ahead(end);
    drive.glideTo(yFilm() < end - 4 ? end : storiesY());
  };

  // ── commands from the player ──
  const onCmd = (e: Event) => {
    const c = (e as CustomEvent<{ cmd: string; n?: number; frac?: number }>).detail;
    if (c.cmd === 'toggle') playToggle();
    else if (c.cmd === 'pause') {
      auto = false;
      stopResume();
      drive.handBack();
    }
    else if (c.cmd === 'scene' && c.n) goScene(c.n);
    else if (c.cmd === 'seek' && typeof c.frac === 'number' && Number.isFinite(c.frac)) scrubTo(c.frac);
    else if (c.cmd === 'seeked') playOn();
    else if (c.cmd === 'stories') {
      // the end's arrow: on to the stories
      leaveIntro();
      stopResume();
      restore = null;
      drive.glideTo(storiesY());
    }
  };
  window.addEventListener('film:cmd', onCmd);
  const onReplay = (e: Event) => {
    e.preventDefault();
    replay();
  };
  window.addEventListener('film:replay', onReplay);

  // ── the visitor's hand takes the page back ──
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Home', 'End']);
  const handBack = () => {
    if (drive.mode !== 'browse') drive.handBack();
  };
  /**
   * A scroll while the film plays skips ahead (or back), and the film plays on from there (round 4): the visitor's
   * hand has the page for as long as it moves it, and RESUME_MS after its last move — the wheel's, the finger's and
   * its fling's, a scroll key's — the film takes it again. Not after ❚❚, a card under the pointer, the film's end or
   * the stage's letting go. A scroll before the film has started by itself (`auto`) is the same skip: it starts from
   * where the scroll rests.
   */
  const RESUME_MS = 900;
  let touching = false;
  /** The film is not to play on after this scroll (❚❚, a card under the pointer). */
  const stopResume = () => {
    if (!resumeAt && !carry) return;
    resumeAt = 0;
    carry = false;
    if (drive.mode !== 'play') publish({ playing: false });
  };
  const skipScroll = () => {
    if (playingNow() || auto) resumeAt = performance.now() + RESUME_MS;
    auto = false;
    carry = false;
    handBack();
  };
  const onWheel = () => {
    restore = null;
    skipScroll();
    leaveIntro();
  };
  // a finger or a key on the player itself is the player's (❚❚ tapped must pause, not hand back and play again)
  const onLip = (e: Event) => !!(e.target as Element | null)?.closest?.('[data-lip]');
  const onTouch = (e: TouchEvent) => {
    if (onLip(e)) return;
    restore = null;
    touching = true;
    skipScroll();
  };
  const onTouchEnd = () => {
    touching = false;
    if (resumeAt) resumeAt = performance.now() + RESUME_MS;
  };
  // a press on the scrollbar: the drawn one floating over the page (script/scrollbar.ts), or the system's (forced
  // colours keep it). A pointer event, which the drawn bar's own press can't keep from us as it keeps the mouse's.
  const onBarPress = (e: PointerEvent) => {
    const onBar = !!(e.target as Element | null)?.closest?.('[data-page-scrollbar]');
    if (onBar || e.clientX >= document.documentElement.clientWidth) handBack();
  };
  const inFilm = () => yFilm() < (TRACK_SVH + 100) * svh;
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const field = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (SCROLL_KEYS.has(e.key) && !onLip(e)) skipScroll();
    if (field || e.metaKey || e.ctrlKey || e.altKey || !inFilm()) return;
    if (t?.getAttribute('role') === 'slider') return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextScene();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goScene(Math.max(1, sceneAtS(clock.s).n - 1));
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      playToggle();
    }
  };
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('pointerdown', onBarPress);
  window.addEventListener('keydown', onKey);
  // a mouse really moving over a card, or the keyboard's focus on one, during ▶ gives the page back (a card sliding
  // under a resting mouse doesn't: the browser's hover after a scroll comes with no movement)
  let lastPt: [number, number] | null = null;
  const onCardMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const moved = !!lastPt && Math.hypot(e.clientX - lastPt[0], e.clientY - lastPt[1]) > 2;
    lastPt = [e.clientX, e.clientY];
    if (moved && (e.target as HTMLElement | null)?.closest?.('[data-film-card]')) {
      stopResume();
      if (drive.mode === 'play') drive.handBack();
    }
  };
  const onCardFocus = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[data-film-card]') && t.matches?.(':focus-visible')) {
      stopResume();
      if (drive.mode === 'play') drive.handBack();
    }
  };
  stage.addEventListener('pointermove', onCardMove);
  stage.addEventListener('focusin', onCardFocus);
  // a card opened in this tab: remember where we were, for the way back (not a new tab's ⌘-click)
  const onCardClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.('a[data-film-card]')) writeStore(window.sessionStorage, Y_KEY, JSON.stringify({ y: yFilm(), at: Date.now() }));
  };
  root.addEventListener('click', onCardClick);
  const onScroll = () => {
    if (drive.mode === 'browse' && yFilm() > 4) leaveIntro();
    // the page still moving under the visitor's hand (a fling's momentum too): ▶ waits for it to rest
    if (resumeAt && drive.mode === 'browse') resumeAt = performance.now() + RESUME_MS;
    // also while the frame loop sleeps (the film far off the screen: a jump to the stories, the footer)
    checkPaper();
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── resize: measure again; only when the track itself changed (a rotation, a new window size — not a phone's
  // toolbar sliding away mid-scroll, fonts arriving, the observer's first call) keep the visitor's place on it ──
  let resizeQueued = false;
  const onResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      const oldSvh = svh;
      const oldTop = filmTop;
      const yOld = (window.scrollY - oldTop) / oldSvh;
      measure();
      checkPaper();
      const moved = Math.abs(svh - oldSvh) * 100 > 0.5 || Math.abs(filmTop - oldTop) > 0.5;
      if (moved) warmed = false;
      if (moved && drive.mode === 'browse' && !restore && yOld > 0 && yOld < TRACK_SVH + 100) drive.jumpTo(yOld * svh);
    });
  };
  window.addEventListener('resize', onResize);
  let roFirst = true;
  const ro = new ResizeObserver(() => {
    if (roFirst) {
      roFirst = false;
      return;
    }
    onResize();
  });
  // the cards are measured with the rest: a card's height changes as its fonts arrive (they wrap the title anew)
  for (const el of stage.querySelectorAll('[data-slot]:not([data-slot^="wave"])')) ro.observe(el);
  // and the end's fade, whose height follows the scheme: the header's dusk and paper points are measured from it
  const fadeEl = page?.querySelector<HTMLElement>('[data-end-fade]');
  if (fadeEl) ro.observe(fadeEl);
  void document.fonts?.ready.then(onResize);

  // ── where to start: ?t=, the way back from a card page, the hash, or the top ──
  const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  const saved = readStore(window.sessionStorage, Y_KEY);
  let startY: number | null = null;
  if (q.has('t')) startY = yOfS(Number(q.get('t')) || 0) * svh;
  else if (saved) {
    try {
      const { y, at } = JSON.parse(saved) as { y: number; at: number };
      if (Date.now() - at < 30 * 60_000 && cameBack(navType)) startY = y;
    } catch {
      /* a stale note: ignore it */
    }
    try {
      window.sessionStorage.removeItem(Y_KEY);
    } catch {
      /* closed */
    }
  }
  // a link to a scene (#answer…), on a fresh load: that scene's start (a reload keeps the browser's own place)
  const hashed = sceneOfHash(window.location.hash);
  if (startY == null && hashed && navType !== 'reload' && navType !== 'back_forward') startY = sceneStartY(hashed.n);
  // the router may scroll the page after we have: hold the restored place for a moment, unless the visitor moves first
  let restore: { y: number; until: number } | null = null;
  if (startY != null) {
    leaveIntro();
    jumpToY(startY);
    restore = { y: startY, until: performance.now() + 1200 };
  } else clock.jump(sTargetNow());
  if (yFilm() > 4) leaveIntro();
  // a reduced-motion reader: nothing moves by itself — the opening waits for ▶ (which releases it), as every act a
  // scroll then reaches is the visitor's own doing
  if (reducedMq.matches && intro) clock.hold();
  // everyone else: the film starts by itself (round 5, the owner: 「進入到首頁的時候…直接就開始播放，然後預設…就是有
  // 這個暫停按鈕」) — on a fresh visit at its top, once its first two puppets are live (markReady); ❚❚ pauses it, a
  // scroll skips ahead and it plays on. Not for the lab's exact frames (?rest=1), a place asked for (?t=, a scene's
  // link, the way back from a card), or a page already scrolled.
  auto = intro && !resting && !reducedMq.matches;
  // a scene's link followed on the page itself
  const onHash = () => {
    const sc = sceneOfHash(window.location.hash);
    if (sc) {
      restore = null;
      goScene(sc.n);
    }
  };
  window.addEventListener('hashchange', onHash);

  // ── the frame loop ──
  let watchS: (s: number) => void = () => {};
  let raf = 0;
  let last = performance.now();
  let running = true;
  const times: number[] = [];
  let frames = 0;
  let longFrames = 0;
  let released = false;
  let warmed = false;
  let endedAt = -1;
  let stilled = false;
  let isReady = false;
  let gapEma = 16.7;
  let slowFor = 0;
  let lowfx = 0;
  const automated = !!(navigator as Navigator & { webdriver?: boolean }).webdriver;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const gapMs = now - last;
    // the acts' clocks cap a long frame (an act never jumps); the glides and ▶ keep to the wall clock (drive.step)
    const dt = document.hidden ? 0 : Math.min(0.1, gapMs / 1000);
    const wall = document.hidden ? 0 : Math.min(0.25, gapMs / 1000);
    last = now;
    // the safety net (SPEC §10): frames slower than 24 ms for 2 s drop the small particles, 2 s more the clouds' drift
    // (judged by the frames themselves: the director's own time can't see the raster's). Not under automation, whose
    // recorders slow every frame.
    if (!document.hidden && !automated && lowfx < 2) {
      gapEma += (Math.min(60, gapMs) - gapEma) * 0.1;
      if (gapEma > 24) {
        slowFor += gapMs;
        if (slowFor > 2000) {
          lowfx++;
          slowFor = 0;
          root.setAttribute('data-lowfx', String(lowfx));
          director.lowfx = lowfx;
        }
      } else slowFor = 0;
    }
    const t0 = performance.now();
    if (restore) {
      if (now > restore.until) restore = null;
      else if (Math.abs(yFilm() - restore.y) > 2) jumpToY(restore.y);
    }
    const d = drive.step(wall);
    const yS = ySvh();
    const st = clock.tick(sOfY(Math.max(0, yS)), dt, { driving: d.driving, scrub: d.scrub || false, resting });
    // the end winds down: 5 s after the night's act is over, only breath and blinks are left (WCAG 2.2.2)
    // (the scroll rests on a whole px: a hair short of the film's last second is its end)
    const over = st.s >= FILM_END - 0.06 && (clock.acts.get(SEG.yours.index) ?? 0) >= SEG.yours.dur;
    if (!over) endedAt = -1;
    else if (endedAt < 0) endedAt = now;
    const settle = endedAt < 0 ? 0 : Math.min(1, Math.max(0, (now - endedAt) / 1000 - 4));
    if ((settle >= 1) !== stilled) {
      stilled = settle >= 1;
      root.toggleAttribute('data-still', stilled);
    }
    // the stage lets go after the night's hold: one decision for the root's `data-released` and the header's ink (▶ may
    // rest a rounded px short of the track's end)
    const rel = yS >= TRACK_SVH - 0.5;
    director.render({ st, acts: clock.acts, now: now / 1000, resting, held: clock.held, dim, ySvh: yS, released: rel, settle });
    // the writers' poses made ahead (Director.warmPoses: a fifth of a second in WebKit), at a still moment — nothing
    // acting, the scenery at rest or ▶ holding its breath — once the opening has played; at the latest a scene ahead
    // of the reply. Never inside the frame 聆聆 starts writing in.
    if (!warmed && st.s >= SEG.write.t0 && (clock.acts.get(SEG.write.index) ?? 0) >= SEG.write.dur) {
      const still = !st.acting && (drive.mode === 'browse' ? Math.abs(st.sTarget - st.s) < 1e-3 : drive.holding);
      if (still || st.s > SEG.c1.t0) {
        warmed = true;
        timers.push(window.setTimeout(() => director.warmPoses(), 0));
      }
    }
    // a tab opened in the background starts once it is looked at
    if (auto && isReady && !document.hidden) {
      auto = false;
      if (drive.mode === 'browse' && intro) startPlay();
    }
    // the film again, once the visitor's scroll has rested (skipScroll)
    if (resumeAt && !touching && now > resumeAt) {
      resumeAt = 0;
      if (drive.mode === 'browse' && !rel && !over && st.s < FILM_END - 0.06) startPlay();
      else if (drive.mode !== 'play') publish({ playing: false });
    }
    watchS(st.s);
    if (rel !== released) {
      released = rel;
      root.toggleAttribute('data-released', rel);
    }
    checkPaper();
    // the film is over once its last act has played out: the player gives way to the arrow down (Player.tsx)
    if (over !== state.ended) publish({ ended: over });
    if (st.acting !== state.acting) publish({ acting: st.acting });
    const scene = sceneAtS(st.s).n;
    if (scene !== lastScene) {
      lastScene = scene;
      publish({ scene, announce: announceNext || drive.mode === 'play' ? `${scene}` : '' });
      announceNext = false;
      try {
        history.replaceState(history.state, '', `#${SCENES[scene - 1].hash}`);
      } catch {
        /* a sandboxed frame */
      }
    }
    frames++;
    const ms = performance.now() - t0;
    times.push(ms);
    if (times.length > 600) times.shift();
    if (ms > 50) longFrames++;
  };

  // only while the film is near the screen — or the page is being driven (a glide from the end back to the start)
  let near = true;
  const wake = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(
    ([e]) => {
      near = e.isIntersecting;
      if (near) wake();
      else if (running && drive.mode === 'browse') {
        running = false;
        cancelAnimationFrame(raf);
      }
    },
    { rootMargin: '200px 0px' },
  );
  io.observe(root);
  raf = requestAnimationFrame(frame);

  // ── the loading order (SPEC §10): 摺摺 and 點點 first (their parts are the stills', already cached), then `ready`;
  // 聆聆 on idle or once the film passes 4 s; 牽牽 and 悄悄 by 20 s, or on idle 3 s after ready ──
  const markReady = () => {
    if (isReady) return;
    isReady = true;
    root.setAttribute('data-ready', '');
    publish({ ready: true });
    if (auto) {
      auto = false;
      if (drive.mode === 'browse' && intro && !document.hidden) startPlay();
      else if (document.hidden) auto = true;
    }
  };
  const idle = (fn: () => void, delay = 0) => {
    const go = () => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 200));
    if (delay) timers.push(window.setTimeout(go, delay));
    else go();
  };
  const timers: number[] = [];
  const cast = director.cast;
  const later = { card: false, rest: false };
  const loadCard = () => {
    if (later.card) return;
    later.card = true;
    void cast.goLive('card');
  };
  const loadRest = () => {
    if (later.rest) return;
    later.rest = true;
    void cast.goLive('tag');
    void cast.goLive('night');
  };
  watchS = (s: number) => {
    if (s > 4) loadCard();
    if (s > 20) loadRest();
  };
  void Promise.all([cast.goLive('tuck'), cast.goLive('dot')]).then(() => {
    markReady();
    idle(loadCard);
    idle(loadRest, 3000);
    // B's cover in by the time anything can reach it — a drag straight to the pair showed its stripes for a moment
    idle(() => director.prefetchAnswer(), 1500);
  });
  // the stills can stand a while longer: never hold the film back for them
  timers.push(window.setTimeout(markReady, 3000));

  const handle: FilmHandle = {
    get ready() {
      return isReady;
    },
    segments: () => Object.values(SEG).map((s) => ({ id: s.id, kind: s.kind, t0: s.t0, t1: s.t1, y0: s.y0, y1: s.y1 })),
    seek,
    play: () => startPlay(),
    state: () => {
      const st = clock.state(resting);
      return { s: st.s, scene: sceneAtS(st.s).n, acting: st.acting, mode: drive.mode, resting, y: ySvh(), owner: st.owner.id, x: st.x };
    },
    stats: () => {
      const sorted = [...times].sort((a, b) => a - b);
      const at = (f: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : 0);
      return { frames, p50: at(0.5), p95: at(0.95), long: longFrames };
    },
  };
  window.__film = handle;

  const onReduced = () => (director.reduced = reducedMq.matches);
  reducedMq.addEventListener('change', onReduced);

  return () => {
    cancelAnimationFrame(raf);
    for (const t of timers) window.clearTimeout(t);
    reducedMq.removeEventListener('change', onReduced);
    io.disconnect();
    ro.disconnect();
    mo.disconnect();
    darkMq.removeEventListener('change', onScheme);
    window.removeEventListener('film:cmd', onCmd);
    window.removeEventListener('film:replay', onReplay);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouch);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pointerdown', onBarPress);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('hashchange', onHash);
    stage.removeEventListener('pointermove', onCardMove);
    stage.removeEventListener('focusin', onCardFocus);
    root.removeEventListener('click', onCardClick);
    root.removeAttribute('data-ready');
    root.removeAttribute('data-released');
    root.removeAttribute('data-paper');
    root.removeAttribute('data-dusk');
    header?.style.removeProperty('--film-night-band');
    root.removeAttribute('data-still');
    root.removeAttribute('data-lowfx');
    root.style.removeProperty('--film-dot');
    director.destroy();
    if (window.__film === handle) delete window.__film;
  };
}

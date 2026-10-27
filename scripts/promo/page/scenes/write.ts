/**
 * Global 6.4 – 15.0 s (timeline.ts; the times below are local). 故事卡片: a
 * story is written on the writer's bare page and becomes a card.
 *
 * The page is the writer at the split (CardEditor in its pane): nothing but
 * the title and the story in the reader's own type (story.css — the story
 * serif over the story sans, at the reader's measure), their placeholders
 * waiting, and at the pane's top-right the save state before the ✓
 * (SaveState, PaneActionButton), the ✓ faint while there is nothing written.
 * The title is typed (a thin terracotta caret), Enter takes the caret on to
 * the story, which writes itself on a paragraph at a time; each pause saves —
 * 儲存中⋯, then 已儲存 — so the page keeps what is written without being
 * asked. A finger taps ✓: the writing steps away to its side and the card
 * the publish step will show comes in from the other, its pen line drawn
 * round, the words already on it, its cover drawn as a doodle of the story,
 * its tags. The finished card rests at MY_CARD, still from 7.9 s, where
 * "visibility" picks it up as the step's preview.
 */
import { blob } from '../decor';
import { css, html, place, svg } from '../dom';
import { C, face, icon, INK, makePrng, measure, storyCard, tapMark, wobCircle, wobRect } from '../kit';
import { MY_CARD } from '../layout';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { clamp, drift, ease, prog, spring } from '../time';
import { writeOn } from './resonate-write';
import { myCardCover } from './write-cover';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The writer's pane (1×): its width, its padding (the column's sides, its top), and its zoom on the stage. */
const PANE_W = 700;
const PAD_X = 46;
const PAD_T = 40;
/** Room left under the story, so the pane reads as a page with more to come. */
const PAD_B = 96;
const PANE_Z = 1.3;
/** The pane's right edge on the stage, and the middle of the band it stands in. */
const PANE_RIGHT = 1800;
const PANE_CY = 574;

/** The ✓ (BareIconButton: a 36 box, its glyph 22) and the save state 6 before it. */
const CHECK_BOX = 36;

/** When things happen (local seconds). */
const T = {
  pane: [0.3, 1.0],
  caretIn: 1.05,
  title: [1.3, 2.15],
  /** Enter: the caret goes on to the story; the pause saves. */
  enter: 2.32,
  save1: [2.42, 2.86],
  story: [2.5, 4.78],
  save2: [4.86, 5.22],
  /** The finger comes to ✓ and presses it. */
  tap: 5.42,
  /** The writing steps away; the card comes in. */
  away: 5.6,
  card: 5.7,
  cover: [5.8, 6.95],
  train: [6.3, 7.2],
  tags: 6.45,
  settle: [7.25, 7.9],
} as const;

/** A finger's press: down fast, up softer; the ring goes out after it. */
function tapAt(t: number, t0: number) {
  const down = ease.outQuad(prog(t, t0, t0 + 0.09));
  const up = ease.inOutQuad(prog(t, t0 + 0.12, t0 + 0.32));
  return { press: down * (1 - up), ring: ease.outCubic(prog(t, t0 + 0.03, t0 + 0.62)) };
}

/** A sentence a line (the narration's body), as the app's two-sentence lines are said. */
function bodyBySentence(body: HTMLElement) {
  const text = body.textContent ?? '';
  const sentences = text.split(/(?<=[。.!?！？])\s*/u).filter(Boolean);
  if (sentences.length < 2) return;
  body.textContent = '';
  body.append(...sentences.map((line) => html('span', { text: line, style: { display: 'block' } })));
}

export const write: Scene = {
  id: 'write',
  ...TIMELINE.write,
  build({ copy, locale }) {
    const root = html('div', { class: 'scene', style: { background: C.cream } });
    const s = copy.stories;
    const ui = copy.ui;
    const duration = TIMELINE.write.end - TIMELINE.write.start;
    const latin = locale === 'en';

    // ── The intro's two blobs on the right, carried on where it left them ──
    const blobs = [
      { el: blob(2, 280, C.sage), x: 1560, y: 360, opacity: 0.18, period: 11, phase: 1.2 },
      { el: blob(3, 460, C.lavender), x: 1560, y: 640, opacity: 0.25, period: 15, phase: 0.6 },
    ];
    blobs.forEach((b) => root.append(b.el));

    // ── Narration ──────────────────────────────────────────────────────
    const words = copy.narration.write;
    const n = narration({ icon: 'pen', eyebrow: words.eyebrow, title: words.title, body: words.body });
    bodyBySentence(n.body);
    const { h: nh } = measure(n.el);
    css(n.el, { top: Math.round(96 + (984 - nh) / 2 - 18) });
    root.append(n.el);

    // ── The writer's page ──────────────────────────────────────────────
    // story.css's .story-title and .story-prose, by the story's script (lib/text/script: a Latin
    // story sets Playfair over DM Sans, ragged; a CJK one the story serif over the story sans, justified).
    const titleType = latin
      ? { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 40, lineHeight: 1.2, letterSpacing: '0' }
      : { fontFamily: 'var(--font-story-serif)', fontWeight: 600, fontSize: 36, lineHeight: 1.4, letterSpacing: '0.02em' };
    const proseType = latin
      ? { fontFamily: 'var(--font-body)', fontSize: 20, lineHeight: 1.65, letterSpacing: '0', textAlign: 'start' }
      : { fontFamily: 'var(--font-story-sans)', fontSize: 18, lineHeight: 1.85, letterSpacing: '0.03em', textAlign: 'justify' };
    const colW = PANE_W - PAD_X * 2;

    const title = html('div', { text: s.myCard.title, style: { ...titleType, color: C.text, fontVariantNumeric: 'lining-nums' } });
    const titlePh = html('div', { class: 'abs', text: ui.titlePlaceholder, style: { ...titleType, left: 0, top: 0, color: 'var(--placeholder)', whiteSpace: 'nowrap' } });
    const titleBox = html('div', { style: { position: 'relative' } }, [titlePh, title]);

    const paras = s.myCard.story.map((text, i) =>
      html('p', { text, style: { ...proseType, color: C.text, marginTop: i > 0 ? '1.3em' : 0, lineBreak: 'strict', overflowWrap: 'anywhere' } }),
    );
    const storyPh = html('div', { class: 'abs', text: ui.storyPlaceholder, style: { ...proseType, left: 0, top: 0, color: 'var(--placeholder)', whiteSpace: 'nowrap' } });
    // The writer's title stands --writer-title-gap over its story.
    const storyBox = html('div', { style: { position: 'relative', marginTop: 32 } }, [storyPh, ...paras]);
    const column = html('div', { class: 'abs', style: { left: PAD_X, top: PAD_T, width: colW } }, [titleBox, storyBox]);

    // The save state before the ✓, at the pane's top-right, level with the title's line.
    const stateStyle = { gridArea: '1 / 1', justifySelf: 'end', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.4, color: C.muted, whiteSpace: 'nowrap' };
    const saving = html('span', { text: ui.saving, style: stateStyle });
    const saved = html('span', { text: ui.saved, style: stateStyle });
    const state = html('span', { style: { display: 'grid' } }, [saving, saved]);
    const washD = wobCircle(CHECK_BOX / 2, CHECK_BOX / 2, CHECK_BOX / 2, 19, { segments: 8, mag: 0.9, cpJitter: 0.5 });
    const wash = svg('path', { d: washD, fill: `color-mix(in oklch, ${C.text} 8%, transparent)` });
    const washSvg = svg('svg', { width: CHECK_BOX, height: CHECK_BOX, viewBox: `0 0 ${CHECK_BOX} ${CHECK_BOX}`, class: 'abs', style: 'left:0;top:0;overflow:visible' }, [wash]);
    const check = icon('check', 22, C.text);
    css(check.el, { position: 'relative', zIndex: 1 });
    const checkBtn = html('span', { style: { position: 'relative', width: CHECK_BOX, height: CHECK_BOX, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, [washSvg, check.el]);
    const action = html('div', { class: 'abs', style: { right: PAD_X - 9, top: 0, display: 'flex', alignItems: 'center', gap: 6 } }, [state, checkBtn]);

    const caretBar = html('div', { class: 'abs', style: { left: 0, top: 0, width: 1.6, borderRadius: 1, background: C.terracotta, zIndex: 3 } });

    // Laid out at 1× in the measuring layer: the column's size, then each block's lines and stops.
    const page = html('div', { style: { position: 'relative', width: PANE_W } }, [column, action, caretBar]);
    measure(page);
    const colH = measure(column).h;
    const PANE_H = Math.ceil(PAD_T + colH + PAD_B);
    css(page, { height: PANE_H });
    // The ✓ on the title's first line: centred on its line box.
    const titleLineH = parseFloat(getComputedStyle(title).lineHeight) || 50;
    css(action, { top: PAD_T + titleLineH / 2 - CHECK_BOX / 2 });
    const titleOn = writeOn(title, page);
    const storyOn = paras.map((p) => writeOn(p, page));

    // The pane: the thread's paper (card-bg, chalked, grained) and a soft pen, as a screen of the app.
    const paneD = wobRect(PANE_W, PANE_H, 26, 53, Math.min(PANE_W, PANE_H) * 0.02, { segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.6, cornerJitter: 0.9, cornerOffset: 5 });
    const paper = face(paneD, PANE_W, PANE_H, { fill: C.cardBg, chalkSeed: 54, grain: { opacity: 0.22, frequency: 0.88, seed: 53 } });
    const pen = face(paneD, PANE_W, PANE_H, { stroke: 'oklch(40% 0.06 60 / 0.6)', strokeWidth: INK });
    page.prepend(paper.el, pen.el);
    css(page, { zoom: PANE_Z });
    const paneX = PANE_RIGHT - PANE_W * PANE_Z;
    const paneY = Math.round(PANE_CY - (PANE_H * PANE_Z) / 2);
    const paneOuter = html('div', { class: 'abs', style: { left: paneX, top: paneY, width: PANE_W * PANE_Z, height: PANE_H * PANE_Z } }, [page]);
    root.append(paneOuter);

    // ── The card the publish step will show ────────────────────────────
    const doodle = myCardCover();
    const card = storyCard({
      index: 0,
      width: MY_CARD.width,
      title: s.myCard.title,
      excerpt: s.myCard.excerpt,
      tags: s.myCard.tags,
      minutes: s.myCard.minutes,
      author: s.me,
      cover: doodle.cover,
    });
    const zoom = html('div', { style: { zoom: MY_CARD.zoom, position: 'relative', width: card.w, height: card.h } }, [card.el]);
    const holder = html('div', { class: 'abs', style: { left: MY_CARD.x, top: MY_CARD.y } }, [zoom]);
    root.append(holder);

    // ── The finger ─────────────────────────────────────────────────────
    const tap = tapMark();
    root.append(tap.el);
    const checkAt = {
      x: paneX + (PANE_W - (PAD_X - 9) - CHECK_BOX / 2) * PANE_Z,
      y: paneY + (parseFloat(action.style.top) + CHECK_BOX / 2) * PANE_Z,
    };

    // When each of the title's characters lands: a hand's uneven rhythm, a beat longer after a space.
    const keys = (() => {
      const rnd = makePrng(907);
      const chars = [...segmenter.segment(s.myCard.title)].map((g) => g.segment);
      const gaps = chars.map((g, i) => (0.7 + 0.6 * rnd()) * (i > 0 && chars[i - 1] === ' ' ? 1.5 : 1));
      const sum = gaps.reduce((a, b) => a + b, 0);
      const span = T.title[1] - T.title[0] - 0.08;
      let at = T.title[0] + 0.04;
      return gaps.map((g) => {
        const key = at;
        at += (g / sum) * span;
        return key;
      });
    })();

    /** The story's paragraphs as one run along their lines, each with its soft front. */
    const SOFT = 20;
    const runs = storyOn.map((o) => o.total + SOFT);
    const storyTotal = runs.reduce((a, b) => a + b, 0);

    /** A spring that has come to rest reads exactly 1, so nothing keeps a transform once it is still. */
    const rest = (t: number, start: number, settle: number, bounce: number) => (t >= start + settle * 1.8 ? 1 : spring(t, start, settle, bounce));

    /** A caret's blink after `from`: on, then off and on again every 1.06 s, with soft edges. */
    const blink = (t: number, from: number) => clamp(0.5 + 1.8 * Math.cos((Math.max(0, t - from) / 1.06) * Math.PI * 2));

    /** How strongly each of the save state's two words shows: 儲存中⋯ from a pause, 已儲存 once it is kept. */
    const saveWords = (t: number) => {
      const fade = (a: number) => ease.inOutQuad(prog(t, a, a + 0.14));
      const sv1 = fade(T.save1[0]) * (1 - fade(T.save1[1]));
      const sv2 = fade(T.save2[0]) * (1 - fade(T.save2[1]));
      const kept = fade(T.save1[1]) * (1 - fade(T.save2[0])) + fade(T.save2[1]);
      return { saving: Math.max(sv1, sv2), saved: clamp(kept) };
    };

    const update = (t: number) => {
      const g = t + TIMELINE.write.start;
      blobs.forEach((b) =>
        place(b.el, {
          x: b.x + drift(g, b.period, b.phase) * 22,
          y: b.y + drift(g, b.period * 1.3, b.phase + 0.5) * 16,
          r: drift(g, b.period * 2, b.phase) * 6,
          // Gone once the page has come, so every chapter sits on the same plain paper.
          opacity: b.opacity * (1 - ease.inOutCubic(prog(t, 1.0, 2.0))),
        }),
      );
      n.update(t, 0.2, duration);

      // ── The page: in; then, once ✓ is pressed, its words step away to the left and its paper goes ──
      const inP = ease.outCubic(prog(t, T.pane[0], T.pane[1]));
      const wordsAway = ease.inOutCubic(prog(t, T.away, T.away + 0.32));
      const paperAway = ease.inOutCubic(prog(t, T.away + 0.1, T.away + 0.5));
      place(paneOuter, { y: (1 - inP) * 18, s: 1 - 0.015 * paperAway, opacity: inP * (1 - paperAway), origin: '50% 50%' });
      pen.drawStroke(ease.inOutCubic(prog(t, T.pane[0] - 0.05, T.pane[1] + 0.15)));
      place(column, { x: -14 * wordsAway, opacity: 1 - wordsAway });
      place(action, { opacity: ease.outCubic(prog(t, T.pane[0] + 0.3, T.pane[1] + 0.2)) * (1 - wordsAway) });

      // The placeholders wait until the first character.
      const typedCount = keys.filter((k) => t >= k).length;
      const placeholdersIn = ease.outCubic(prog(t, T.pane[0] + 0.35, T.pane[1] + 0.25));
      place(titlePh, { opacity: typedCount > 0 ? 0 : placeholdersIn });

      // The title, typed.
      titleOn.show(t >= T.title[1] ? Infinity : titleOn.stops[typedCount]);

      // The story, written on a paragraph at a time at a quick hand's pace.
      const sp = prog(t, T.story[0], T.story[1]);
      const d = storyTotal * (0.3 * sp + 0.7 * ease.inOutSine(sp));
      place(storyPh, { opacity: t >= T.story[0] && d > 0 ? 0 : placeholdersIn });
      let before = 0;
      storyOn.forEach((o, i) => {
        o.show(t >= T.story[1] ? Infinity : d - before, SOFT);
        before += runs[i];
      });

      // The ✓: faint while the page is empty, in full ink from the first character; its disc under the press.
      const ready = ease.outCubic(prog(t, T.title[0], T.title[0] + 0.18));
      place(check.el, { opacity: 0.4 + 0.6 * ready });
      const press = tapAt(t, T.tap);
      place(washSvg, { s: 0.4 + 0.6 * press.press, opacity: press.press, origin: '50% 50%' });
      place(checkBtn, { s: 1 - 0.06 * press.press, origin: '50% 50%' });

      // The save state: 儲存中⋯ at each pause, then 已儲存.
      const sw = saveWords(t);
      place(saving, { opacity: sw.saving });
      place(saved, { opacity: sw.saved });

      // The caret: waits in the title, types it, goes on to the story with Enter, rides its front, blinks, goes.
      let c: { x: number; y: number; h: number };
      let caretOn: number;
      if (t < T.enter) {
        c = titleOn.caret(titleOn.stops[typedCount]);
        const typing = t >= T.title[0] && t < T.title[1];
        caretOn = typing ? 1 : t < T.title[0] ? blink(t, T.caretIn) : blink(t, T.title[1]);
        caretOn *= ease.outCubic(prog(t, T.caretIn, T.caretIn + 0.2));
      } else {
        const front = clamp(d - SOFT * 0.3, 0, storyTotal);
        let i = 0;
        let rem = front;
        while (i < storyOn.length - 1 && rem > storyOn[i].total + SOFT * 0.7) {
          rem -= runs[i];
          i++;
        }
        c = storyOn[i].caret(clamp(rem, 0, storyOn[i].total));
        caretOn = t < T.story[0] ? 1 : t < T.story[1] ? 1 : blink(t, T.story[1]);
      }
      caretOn *= 1 - ease.inOutCubic(prog(t, T.tap - 0.1, T.tap + 0.1));
      const pad = c.h * 0.1;
      css(caretBar, { left: c.x + 0.6, top: c.y + pad, height: c.h - pad * 2 });
      place(caretBar, { opacity: caretOn });

      // ── The finger: comes to ✓, presses it, and is gone ──
      const come = ease.outCubic(prog(t, T.tap - 0.45, T.tap - 0.05));
      const gone = ease.inOutCubic(prog(t, T.tap + 0.24, T.tap + 0.44));
      tap.set({
        x: checkAt.x + (1 - come) * 60 + gone * 12,
        y: checkAt.y + (1 - come) * 78 + gone * 18 + 8,
        opacity: come * (1 - gone),
        press: press.press,
        ring: t >= T.tap ? press.ring : 0,
      });

      // ── The card: in from the right as the writing leaves, pen line round, the words on it, the cover drawn ──
      const cardIn = ease.outCubic(prog(t, T.card, T.card + 0.62));
      card.pen.drawStroke(ease.inOutCubic(prog(t, T.card, T.card + 0.75)));
      place(card.paper.el, { opacity: ease.outCubic(prog(t, T.card + 0.05, T.card + 0.6)) });
      const words1 = ease.outCubic(prog(t, T.card + 0.18, T.card + 0.62));
      [card.title, card.excerpt].forEach((el) => place(el, { x: (1 - words1) * 10, opacity: words1 }));
      card.sep.draw(ease.inOutCubic(prog(t, T.card + 0.3, T.card + 0.75)));
      const av = rest(t, T.card + 0.4, 0.6, 0.22);
      place(card.avatar.el, { s: 0.5 + 0.5 * av, opacity: clamp(av * 1.6), origin: '50% 50%' });
      const by = ease.outCubic(prog(t, T.card + 0.48, T.card + 0.9));
      [card.name, card.read].forEach((el) => place(el, { x: (1 - by) * -10, opacity: by }));
      place(card.arrow, { x: (1 - by) * -8, opacity: 0.28 * by });

      // The cover, drawn as a doodle of the story, the train rolling in.
      doodle.draw(prog(t, T.cover[0], T.cover[1]));
      doodle.train(prog(t, T.train[0], T.train[1]));

      // The tags, one after another.
      card.tags.forEach((tag, i) => {
        const sp2 = rest(t, T.tags + i * 0.14, 0.62, 0.26);
        place(tag.el, { s: 0.55 + 0.45 * sp2, y: (1 - Math.min(1, sp2)) * 6, opacity: clamp(sp2 * 1.6), origin: '50% 60%' });
      });

      // In from the right, then one slow breath, then still at MY_CARD from 7.9 for the hand-over.
      const fp = ease.inOutSine(prog(t, T.settle[0], T.settle[1]));
      const lift = t > T.settle[0] && t < T.settle[1] ? -2.5 * Math.sin(Math.PI * fp) : 0;
      place(holder, { x: (1 - cardIn) * 46, y: lift, opacity: ease.outQuad(prog(t, T.card, T.card + 0.3)) });
    };

    return { root, update };
  },
};

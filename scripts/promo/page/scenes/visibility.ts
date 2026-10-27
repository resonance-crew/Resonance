/**
 * 14.4 – 25.0 s. 公開、匿名、私人: the card "write" made stays where it left
 * it, then becomes the publish step's preview (PublishStep, the writer's
 * second step, as it stands at the split): it steps into the step's column
 * and the step comes in around it — its heading row (← 發布這張卡片, the save
 * state under it), the mirror moment's echo, the card with its cover's chip
 * (更換封面), 卡片類型 — 公開 · 匿名公開 · 私人卡, no line under it: the
 * preview's byline says whose name is on it — then the rule and the one
 * button, whose verb follows the choice. 公開 is chosen. A finger comes in and
 * picks 匿名公開: the card's own byline turns to 「·」 匿名 and the verb with
 * it (發布 → 匿名發布), and the finger is gone; after a hold it comes back and
 * taps 匿名發布. The step clears away, the card comes forward published,
 * holds, steps into the middle of a row, and the same card slides out from
 * under it on either side: one card three ways in the choice's own order —
 * 公開, 匿名公開, 私人卡 — its colour its own, each named above in the step's
 * own words and explained below. The row has left by 24.4 s, so the next
 * chapter fades in over plain paper.
 */
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { fill } from '../copy';
import { css, drawable, html, place, svg } from '../dom';
import { avatar, button, C, face, family, icon, INK, measure, segmentedBar, storyCard, tapMark, wavyLine, wobCircle, wobRect, type IconName } from '../kit';
import { centredTop, DEMO_CY, MY_CARD, STAGE } from '../layout';
import { myCardCover } from './write-cover';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { clamp, drift, ease, lerp, prog, spring } from '../time';

const DUR = TIMELINE.visibility.end - TIMELINE.visibility.start;

/** When things happen (local seconds; global = 14.4 + local). */
const T = {
  /** The card steps into the publish step (after the chapter's cross-fade); the step comes in around it. */
  open: 0.6,
  /** The finger picks 匿名公開; the byline and the verb follow; the finger is gone by 2.6. */
  tapAnon: 2.1,
  /** …held on the anonymous byline with nothing else moving, then the finger comes back for 匿名發布. */
  tapPublish: 4.4,
  /** The step clears away (its words first) and the card comes forward, published. */
  close: 4.58,
  /** The published card held whole (from about 5.35), then it steps to the middle of the row; the other two slide out from under it. */
  shrink: 6.05,
  dealPublic: 6.15,
  dealPrivate: 6.23,
  /** Names above, words below, left to right as the cards land (all read by about 7.35). */
  labels: 6.62,
  /** The row steps away, gone by 9.96 (global 24.36), before the next chapter's paper comes over it. */
  exit: 9.56,
} as const;

/** The publish step at video size (its 1× text reads as 16–20 px), its column's 1× width, and the step's own gap. */
const STEP_ZOOM = 1.35;
const STEP_W = 440;
const STEP_GAP = 22;
/** The band of the stage the step fills, centred in it; the card's zoom in it is what the band leaves. */
const STEP_BAND = { top: DEMO_CY - 425, bottom: DEMO_CY + 425 };

/**
 * The chapter's words at the tour's width, each sentence of the body on a line
 * of its own — zh 「公開給每個人，或只留給自己。」/「不敢署名的故事，就匿名發布。」,
 * en "Share it … to yourself." / "For a story … anonymously." (left to the
 * width alone, the en line takes "For a" with it, and no width keeps both
 * sentences whole without a margin of a few pixels).
 */
function bodyBySentence(body: HTMLElement) {
  const text = body.textContent ?? '';
  const sentences = text.split(/(?<=[。.!?！？])\s*/u).filter(Boolean);
  if (sentences.length < 2) return;
  body.textContent = '';
  body.append(...sentences.map((line) => html('span', { text: line, style: { display: 'block' } })));
}

/** The row of three: its span on the stage (the demonstration's own), the gap between cards, its middle. */
const ROW = { left: STAGE.demo.left, right: 1800, gap: 34, cy: DEMO_CY };

/** A finger's press: down fast, up softer; the ring goes out after it. */
function tapAt(t: number, t0: number) {
  const down = ease.outQuad(prog(t, t0, t0 + 0.09));
  const up = ease.inOutQuad(prog(t, t0 + 0.12, t0 + 0.32));
  return { press: down * (1 - up), ring: ease.outCubic(prog(t, t0 + 0.03, t0 + 0.62)) };
}

/** A label pill at video size: a filled wobble with grain, the choice's icon, its word. */
function labelPill(text: string, name: IconName, fillColor: string, seed: number) {
  const ic = icon(name, 19, C.text);
  const mark = html('span', { style: { position: 'relative', zIndex: 1, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, [ic.el]);
  const word = html('span', { text, style: { position: 'relative', zIndex: 1 } });
  const el = html('div', {
    class: 'abs',
    style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px 9px 15px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 18, lineHeight: 1.2, letterSpacing: '0.04em', color: C.text, whiteSpace: 'nowrap' },
  }, [mark, word]);
  const { w, h } = measure(el);
  const f = face(
    wobRect(w, h, h / 2, seed, autoMag(w, h), { segmentsH: autoSegments(w), segmentsV: 2, curve: autoCurve(w, h), cornerJitter: 1, cornerOffset: 0 }),
    w,
    h,
    { fill: fillColor, grain: { opacity: 0.3, frequency: 1.1, seed } },
  );
  el.prepend(f.el);
  css(el, { width: w, height: h });
  return { el, w, h, icon: ic };
}

/**
 * Divider: the atom's 240-wide wave stretched across `w` with an unscaled
 * stroke — drawn here at its real width (x scaled, y kept), so the pen can
 * draw it on.
 */
function divider(w: number, seed: number) {
  const amp = 1.4;
  const h = amp * 2 + 1.2 * 2;
  const sx = w / 240;
  const d = wavyLine(240, seed, amp, 7).replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x: string, y: string) => `${(Number(x) * sx).toFixed(2)},${y}`);
  const path = svg('path', { d, fill: 'none', stroke: 'color-mix(in oklch, var(--field-border-hover) 35%, transparent)', 'stroke-width': 1.2, 'stroke-linecap': 'round' });
  const el = html('div', { style: { width: w, margin: '2px auto', lineHeight: 0 } }, [
    svg('svg', { viewBox: `0 ${-h / 2} ${w} ${h}`, width: w, height: h, style: 'display:block;overflow:visible' }, [path]),
  ]);
  return { el, draw: drawable(path) };
}

export const visibility: Scene = {
  id: 'visibility',
  ...TIMELINE.visibility,
  build({ copy, locale }) {
    const s = copy.stories;
    const ui = copy.ui;
    const words = copy.narration.visibility;
    const root = html('div', { class: 'scene', style: { background: C.cream } });

    // ── The chapter's words ──────────────────────────────────────────
    const nar = narration({ icon: 'eye', eyebrow: words.eyebrow, title: words.title, body: words.body });
    bodyBySentence(nar.body);

    // ── The card, as "write" leaves it ───────────────────────────────
    // The same call "write" makes, with the same doodle for a cover (write-cover.ts).
    const card = storyCard({ index: 0, width: MY_CARD.width, title: s.myCard.title, excerpt: s.myCard.excerpt, tags: s.myCard.tags, minutes: s.myCard.minutes, author: s.me, cover: myCardCover().cover });
    const cardInner = html('div', { style: { position: 'relative', width: card.w, height: card.h, zoom: MY_CARD.zoom } }, [card.el]);
    /** Where "write" leaves it: centred on the demonstration's middle. */
    const myY = centredTop(card.h * MY_CARD.zoom);
    const cardOuter = html('div', { class: 'abs', style: { left: MY_CARD.x, top: myY, width: card.w * MY_CARD.zoom, height: card.h * MY_CARD.zoom } }, [cardInner]);
    const CW = card.w * MY_CARD.zoom;
    const cardCx = MY_CARD.x + CW / 2;

    // Its byline, ready to turn anonymous as the step's preview does: the "·" avatar under the named one, the two names in one cell.
    const anonAv = avatar(30, '·', card.fam.fill, 31 * 7);
    css(anonAv.el, { position: 'absolute', left: 0, top: 0 });
    card.avatar.el.append(anonAv.el);
    const named = html('span', { text: s.me.name, style: { gridArea: '1 / 1' } });
    const nameless = html('span', { text: ui.anonymousAuthor, style: { gridArea: '1 / 1' } });
    card.name.textContent = '';
    card.name.append(html('span', { style: { display: 'grid' } }, [named, nameless]));

    // ── The publish step ─────────────────────────────────────────────
    // Its heading row, as the step names itself at the split: ← (back to writing), its name, the save state under it.
    const back = icon('arrow-right', 18, C.text);
    css(back.el, { transform: 'scaleX(-1) translateY(1px)' });
    const backBox = html('span', { style: { width: 36, height: 36, marginLeft: -9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, [back.el]);
    const heading = html('div', { text: ui.stepTitle, style: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: C.text, whiteSpace: 'nowrap' } });
    const headState = html('div', { text: ui.saved, style: { marginTop: 1, fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.4, color: C.muted, whiteSpace: 'nowrap' } });
    const headRow = html('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 38 } }, [backBox, html('div', { style: { display: 'flex', flexDirection: 'column' } }, [heading, headState])]);

    // The mirror moment, already read: the sparkle and the echo.
    const sparkle = icon('sparkle', 16, C.terracotta);
    const glyph = html('span', { style: { flexShrink: 0, marginTop: 2, display: 'inline-block' } }, [sparkle.el]);
    const insightText = html('span', { text: fill(ui.insight, { coreInsight: s.myCard.insight }) });
    const insightRow = html('div', { style: { display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7, color: C.text } }, [glyph, insightText]);

    // What the card is: one choice of three (公開 chosen), with no line under it — the preview's byline says it.
    const label = html('span', { text: ui.visibilityLabel, style: { fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.06em', color: C.muted } });
    const bar = segmentedBar(
      [
        { labels: [ui.visibilityPublic], icons: ['globe'] },
        { labels: [ui.visibilityAnonymous], icons: ['mask'] },
        { labels: [ui.visibilityPrivate], icons: ['lock'] },
      ],
      { mode: 'choice' },
    );
    const barRow = html('div', { style: { display: 'flex' } }, [bar.el]);
    const group = html('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [label, barRow]);

    const rule = divider(STEP_W, 47);

    // The foot, right-aligned: the one button, whose verb follows the choice. 匿名發布's face is the one
    // drawn, narrowed to 發布's width until it is chosen, and 發布's own words ride over it (its face
    // hidden), so the button reads as one that widens.
    const verbs = [button(ui.publish, 'solid'), button(ui.publishAnonymously, 'solid')];
    const [wPub, wAnon] = verbs.map((v) => v.w);
    verbs[0].face.el.style.display = 'none';
    const footH = Math.max(...verbs.map((v) => v.h));
    verbs.forEach((v) => css(v.el, { position: 'absolute', left: STEP_W - v.w, top: (footH - v.h) / 2 }));
    const foot = html('div', { style: { position: 'relative', width: STEP_W, height: footH } }, [verbs[1].el, verbs[0].el]);

    // The column, top to bottom as the step stands: the heading row, the echo, the card (its place kept;
    // the card itself moves on its own), the choice, the rule, the foot. The card takes the height the band leaves.
    const cardSpace = html('div');
    const stepInner = html('div', { style: { width: STEP_W, display: 'flex', flexDirection: 'column', gap: STEP_GAP } }, [headRow, insightRow, cardSpace, group, rule.el, foot]);
    const bandH = STEP_BAND.bottom - STEP_BAND.top;
    const bare = measure(stepInner).h;
    const aboveCard = measure(headRow).h + STEP_GAP + measure(insightRow).h + STEP_GAP;
    const CARD_ZOOM = clamp((bandH - bare * STEP_ZOOM) / card.h, 1, MY_CARD.zoom);
    css(cardSpace, { height: (card.h * CARD_ZOOM) / STEP_ZOOM });
    css(stepInner, { zoom: STEP_ZOOM });
    const stepX = Math.round(cardCx - (STEP_W * STEP_ZOOM) / 2);
    const stepY = Math.round(STEP_BAND.top + (bandH - bare * STEP_ZOOM - card.h * CARD_ZOOM) / 2);
    const stepOuter = html('div', { class: 'abs', style: { left: stepX, top: stepY, width: STEP_W * STEP_ZOOM } }, [stepInner]);
    /** Where the card stands as the step's preview: top-left on the stage, and its scale against MY_CARD's. */
    const inStep = { x: stepX, y: stepY + aboveCard * STEP_ZOOM, k: CARD_ZOOM / MY_CARD.zoom };

    // The cover's one chip (更換封面) on the preview's picture, at its bottom-right: the family's fill, pen and deep ink.
    const CHIP = 34;
    const chipFace = svg('svg', { width: CHIP, height: CHIP, viewBox: `0 0 ${CHIP} ${CHIP}`, class: 'abs', style: 'left:0;top:0;overflow:visible' }, [
      svg('path', { d: wobCircle(CHIP / 2, CHIP / 2, CHIP / 2, 41, { segments: 8, mag: 0.7, cpJitter: 0.5 }), fill: card.fam.fill, stroke: card.fam.border, 'stroke-width': INK }),
    ]);
    const chipIcon = icon('image', 17, card.fam.border);
    css(chipIcon.el, { position: 'relative', zIndex: 1 });
    const coverW = card.w - 44;
    const coverH = Number(card.cover.getAttribute('height'));
    const chip = html('div', {
      class: 'abs',
      style: { left: 22 + coverW - 18 - CHIP, top: 22 + coverH - 16 - CHIP, width: CHIP, height: CHIP, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
    }, [chipFace, chipIcon.el]);
    card.el.append(chip);

    // ── The row of three ─────────────────────────────────────────────
    const cw = (ROW.right - ROW.left - ROW.gap * 2) / 3;
    const ZR = cw / card.w;
    const ch = card.h * ZR;
    const slotX = [0, 1, 2].map((i) => ROW.left + i * (cw + ROW.gap));
    /**
     * The card in the row, public on the left and private on the right, signed;
     * the anonymous one between them is the card itself. The same card each
     * time — its own family and picture: a card's colour never changes with who
     * can read it, so the names above, the words below and the byline tell the
     * three apart.
     */
    const kinds = [
      { slot: 0, at: T.dealPublic, lean: -2 },
      { slot: 2, at: T.dealPrivate, lean: 2 },
    ].map((k) => {
      const c = storyCard({ index: 0, width: MY_CARD.width, title: s.myCard.title, excerpt: s.myCard.excerpt, tags: s.myCard.tags, minutes: s.myCard.minutes, author: s.me, cover: myCardCover().cover });
      const inner = html('div', { style: { position: 'relative', width: c.w, height: c.h, zoom: ZR } }, [c.el]);
      const outer = html('div', { class: 'abs', style: { left: 0, top: 0, width: cw, height: ch } }, [inner]);
      return { ...k, outer };
    });

    // Names above, in the step's own words and icons, only the chips tinted apart: 🌐 公開 · 🎭 匿名公開 · 🔒 只有自己.
    const pills = [
      labelPill(ui.visibilityPublic, 'globe', family(2).fill, 401),
      labelPill(ui.visibilityAnonymous, 'mask', card.fam.fill, 409),
      labelPill(ui.visibilityPrivate, 'lock', family(1).fill, 403),
    ];
    // A caption with a comma turns its line there (「每個人都讀得到，」/「只是不署名」, "Anyone can read it," / "just without …").
    const captions = [words.publicCaption, words.anonymousCaption, words.privateCaption].map((text) =>
      html('p', {
        class: 'abs',
        text: text.replace(/([，,])\s*/u, '$1\n'),
        style: {
          width: cw,
          textAlign: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 21,
          lineHeight: 1.45,
          letterSpacing: locale === 'en' ? '0' : '0.04em',
          color: C.muted,
          textWrap: 'balance',
          whiteSpace: 'pre-line',
          wordBreak: locale === 'en' ? 'normal' : 'keep-all',
          overflowWrap: 'anywhere',
        },
      }),
    );
    const capH = Math.max(...captions.map((c) => measure(c).h));
    const pillH = Math.max(...pills.map((p) => p.h));
    const PILL_GAP = 20;
    const CAP_GAP = 22;
    const blockH = pillH + PILL_GAP + ch + CAP_GAP + capH;
    const rowTop = Math.round(ROW.cy - blockH / 2 + pillH + PILL_GAP);
    pills.forEach((p, i) => css(p.el, { left: slotX[i] + cw / 2 - p.w / 2, top: rowTop - PILL_GAP - pillH + (pillH - p.h) / 2 }));
    captions.forEach((c, i) => css(c, { left: slotX[i], top: rowTop + ch + CAP_GAP }));
    kinds.forEach((k) => css(k.outer, { left: slotX[k.slot], top: rowTop }));

    // ── The finger ───────────────────────────────────────────────────
    const tap = tapMark();

    root.append(
      // The two signed cards under the card they slide out from.
      ...kinds.map((k) => k.outer),
      cardOuter,
      nar.el,
      stepOuter,
      ...pills.map((p) => p.el),
      ...captions,
      tap.el,
    );

    /** A point of an element's box on the stage, as laid out this frame (fx, fy: 0 → 1 across it). */
    const pointOf = (el: Element, rb: DOMRect, fx = 0.5, fy = 0.5) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width * fx - rb.left, y: r.top + r.height * fy - rb.top };
    };

    const update = (t: number) => {
      nar.update(t, 0.35, DUR);

      // ── The step's one change: 匿名公開 chosen ──
      const pick = ease.outQuart(prog(t, T.tapAnon + 0.04, T.tapAnon + 0.32));
      bar.setFilled(0, 1 - pick);
      bar.setFilled(1, pick);
      bar.setFilled(2, 0);
      // The verb widens from 發布 to 匿名發布, its words changing as it goes.
      const verbP = ease.inOutCubic(prog(t, T.tapAnon + 0.14, T.tapAnon + 0.5));
      const wVerb = lerp(wPub, wAnon, verbP);
      verbs[1].face.el.style.transformOrigin = '100% 50%';
      verbs[1].face.el.style.transform = `scaleX(${(wVerb / wAnon).toFixed(4)})`;
      place(verbs[1].label, { x: (wAnon - wVerb) / 2, opacity: prog(verbP, 0.5, 1) });
      place(verbs[0].el, { x: -(wVerb - wPub) / 2, opacity: 1 - prog(verbP, 0, 0.5) });
      place(verbs[1].el, { s: 1 - 0.06 * tapAt(t, T.tapPublish).press });

      // The card's byline turns over with the choice: the avatar flips, the name changes.
      const flip = ease.inOutCubic(prog(t, T.tapAnon + 0.08, T.tapAnon + 0.5));
      card.avatar.face.el.style.opacity = flip < 0.5 ? '1' : '0';
      card.avatar.label.style.opacity = flip < 0.5 ? '1' : '0';
      card.avatar.el.style.transform = `scaleX(${Math.abs(Math.cos(flip * Math.PI)).toFixed(3)})`;
      anonAv.el.style.opacity = flip >= 0.5 ? '1' : '0';
      const nameP = ease.inOutCubic(prog(t, T.tapAnon + 0.12, T.tapAnon + 0.5));
      place(named, { y: -7 * nameP, opacity: 1 - prog(nameP, 0, 0.5) });
      place(nameless, { y: 7 * (1 - nameP), opacity: prog(nameP, 0.5, 1) });

      // ── The step: in around the card, each part a beat after the one above; out once 匿名發布 is
      // pressed, the echo lifting away and the rest dropping, eased all the way ──
      const into = (at: number) => ease.outCubic(prog(t, T.open + at, T.open + at + 0.5));
      const away = (at: number) => ease.inOutQuad(prog(t, T.close + at, T.close + at + 0.28));
      place(headRow, { y: (1 - into(0.1)) * 10 - away(0) * 8, opacity: into(0.1) * (1 - away(0)) });
      place(insightRow, { y: (1 - into(0.2)) * 10 - away(0) * 8, opacity: into(0.2) * (1 - away(0)) });
      // The cover's chip, while the card is the step's preview.
      place(chip, { s: 0.7 + 0.3 * into(0.3), opacity: into(0.3) * (1 - away(0)), origin: '50% 50%' });
      sparkle.paths.forEach((path, j) => {
        path.setAttribute('pathLength', '1');
        path.style.strokeDasharray = '1 1';
        path.style.strokeDashoffset = String(1 - ease.outCubic(prog(t, T.open + 0.3 + j * 0.06, T.open + 0.7 + j * 0.06)));
      });
      place(group, { y: (1 - into(0.35)) * 12 + away(0.03) * 10, opacity: into(0.35) * (1 - away(0.03)) });
      rule.draw(ease.inOutCubic(prog(t, T.open + 0.45, T.open + 0.9)));
      place(rule.el, { opacity: 1 - away(0.05) });
      place(foot, { y: (1 - into(0.5)) * 12 + away(0.06) * 10, opacity: into(0.5) * (1 - away(0.06)) });

      // ── The card: into the step, forward again once published, then into the middle of the row ──
      const enter = ease.inOutCubic(prog(t, T.open, T.open + 0.7));
      const forward = ease.inOutCubic(prog(t, T.close + 0.1, T.close + 0.75));
      // As the step's preview the card has no arrow (StoryCard's preview); published, a list's card has it again.
      place(card.arrow, { opacity: 0.28 * (1 - enter * (1 - forward)) });
      const shrink = ease.inOutCubic(prog(t, T.shrink, T.shrink + 0.85));
      const settled = ease.outCubic(prog(t, T.shrink + 0.85, T.shrink + 1.6));
      const bob = (i: number) => drift(t, 7.2, i * 0.22) * 2.2 * settled;
      // Each column leaves on its own beat, left to right.
      const leave = (i: number) => ease.inOutCubic(prog(t, T.exit + i * 0.04, T.exit + 0.32 + i * 0.04));
      // Where the card stands now (top-left on the stage, its scale against MY_CARD's): one slow breath while it is held alone.
      const breath = Math.sin(Math.PI * prog(t, T.close + 0.3, T.shrink + 0.85)) * -3;
      const k0 = lerp(lerp(1, inStep.k, enter), 1, forward);
      const restX = lerp(lerp(MY_CARD.x, inStep.x, enter), MY_CARD.x, forward);
      const restY = lerp(lerp(myY, inStep.y, enter), myY, forward) + breath;
      const bx = lerp(restX, slotX[1], shrink);
      const by = lerp(restY, rowTop, shrink) + bob(1);
      const k = lerp(k0, ZR / MY_CARD.zoom, shrink);
      const bw = CW * k;
      place(cardOuter, { x: bx - MY_CARD.x, y: by - myY - leave(1) * 16, s: k, opacity: 1 - leave(1), origin: '0 0' });

      // The other two slide out from under it, one to each side: each starts exactly
      // where the card is (hidden by it), leans a little on the way, and lands in its slot.
      kinds.forEach((kd) => {
        const go = spring(t, kd.at, 1.25, 0.1);
        const x = lerp(bx, slotX[kd.slot], go);
        const y = lerp(by, rowTop + bob(kd.slot), go);
        place(kd.outer, {
          x: x - slotX[kd.slot],
          y: y - rowTop - leave(kd.slot) * 16,
          s: lerp(bw / cw, 1, go),
          r: Math.sin(Math.PI * clamp(go)) * kd.lean,
          opacity: ease.outQuad(prog(t, kd.at, kd.at + 0.1)) * (1 - leave(kd.slot)),
          origin: '0 0',
        });
      });

      // Names pop above, words rise below, left to right.
      pills.forEach((p, i) => {
        const at = T.labels + i * 0.1;
        const sp = spring(t, at, 0.6, 0.22);
        place(p.el, { y: (1 - sp) * 10 + bob(i) - leave(i) * 16, s: 0.7 + 0.3 * sp, opacity: clamp(sp * 1.6) * (1 - leave(i)), origin: '50% 100%' });
        p.icon.paths.forEach((path, j) => {
          path.setAttribute('pathLength', '1');
          path.style.strokeDasharray = '1 1';
          path.style.strokeDashoffset = String(1 - ease.outCubic(prog(t, at + 0.08 + j * 0.06, at + 0.45 + j * 0.06)));
        });
      });
      captions.forEach((c, i) => {
        const cp = ease.outCubic(prog(t, T.labels + 0.1 + i * 0.1, T.labels + 0.5 + i * 0.1));
        place(c, { y: (1 - cp) * 14 + bob(i) - leave(i) * 16, opacity: cp * (1 - leave(i)) });
      });

      // ── The finger: comes in, picks 匿名公開 and is gone; comes back fresh for 匿名發布, presses, and is gone ──
      // (never left waiting on the step, where a pale disc reads as one more control).
      const rb = root.getBoundingClientRect();
      const second = t >= (T.tapAnon + T.tapPublish) / 2;
      const t0 = second ? T.tapPublish : T.tapAnon;
      // On 匿名公開, below its word; on 匿名發布's right end, in its padding, so the verb stays readable under the press.
      const at = second ? pointOf(verbs[1].el, rb, 0.88, 0.7) : pointOf(bar.segments[1].el, rb, 0.66, 0.76);
      const come = ease.outCubic(prog(t, t0 - 0.5, t0 - 0.1));
      // After 匿名發布 it lifts a beat sooner, going with the step rather than staying on what is leaving.
      const lift = second ? 0.22 : 0.28;
      const gone = ease.inOutCubic(prog(t, t0 + lift, t0 + lift + 0.2));
      const press = tapAt(t, t0);
      tap.set({
        x: at.x + (1 - come) * 64 + gone * 12,
        y: at.y + (1 - come) * 80 + gone * 18,
        opacity: come * (1 - gone),
        press: press.press,
        ring: t >= t0 ? press.ring : 0,
      });
    };

    return { root, update };
  },
};

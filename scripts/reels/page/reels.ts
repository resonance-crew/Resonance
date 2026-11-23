/**
 * The three launch reels (2026-11), each 15–17 s, one idea per beat:
 *
 * - `likes`  不是按讚: what you won't get here (按讚數, 追蹤數字, 演算法餵養,
 *   struck out), what you get instead (someone telling you which passage moved
 *   them), then 共振 and the passage dialog on the phone.
 * - `kept`   被留下來的那一段: the author's side — a 共振 notice, their card with
 *   faces beside the passages that stayed with people, who they were and the
 *   note one left, and the reply that connects them.
 * - `write`  寫一張故事卡: writing, the card it becomes, and who can read it
 *   (公開 / 連結的人 / 匿名公開 / 私人卡), then 發布.
 */
import zhTW from '../../../src/messages/zh-TW.json';
import { css, html, place } from '../../promo/page/dom';
import { autoRect, avatar, bubble, button, C, face, family, icon, measure, storyCard, tapMark } from '../../promo/page/kit';
import { myCardCover } from '../../promo/page/scenes/write-cover';
import { typed } from '../../promo/page/time';
import { carousel } from './carousel';
import { THEATER } from './theater-reels';
import { cardPage, LABELS, PAGE_TEXT, passageDialog, PEOPLE, pickedDialog, STORY } from './cardpage';
import { ease, endCard, H, lerp, paper, phone, prog, SAFE_X, spring, sticker, strike, tornSheet, W, window01, words, type Reel } from './lib';

const m = zhTW;
const [ASHU, MO, LIN, YOU] = PEOPLE;
const CAST = ['pip/hi', 'nod/so-moved', 'hush/listening', 'tuck/take-your-time', 'twine/for-you'] as const;

/** A finger's tap at twice the kit's size, at a stage point. */
function bigTap() {
  const tap = tapMark();
  const root = html('div', { class: 'abs', style: { left: 0, top: 0, zoom: 2, zIndex: 35 } }, [tap.el]);
  const update = (t: number, x: number, y: number, at: number) => {
    const opacity = ease.outCubic(prog(t, at - 0.45, at - 0.1)) * (1 - ease.inCubic(prog(t, at + 0.4, at + 0.7)));
    const press = prog(t, at - 0.08, at) - prog(t, at + 0.06, at + 0.2);
    tap.set({ x: x / 2, y: y / 2, opacity, press, ring: prog(t, at, at + 0.55) });
  };
  return { root, update };
}

/** A point after the camera (scale s about f, then `lift`). */
const viaCamera = (p: { x: number; y: number }, s: number, fx: number, fy: number, lift = 0) => ({ x: fx + (p.x - fx) * s, y: fy + (p.y - fy) * s + lift });

/** Places `el` (1× w × h) in the phone's overlay at its centre and returns where. */
function inOverlay(ph: ReturnType<typeof phone>, el: HTMLElement, w: number, h: number) {
  const at = ph.centre(w, h);
  css(el, { position: 'absolute', left: at.x, top: at.y, width: w, transformOrigin: '50% 60%' });
  ph.overlay.append(el);
  return at;
}

// ── 不是按讚 ──────────────────────────────────────────────────────────

const LIKES = {
  lead: '在共振，你不會收到',
  gone: ['按讚數', '追蹤數字', '演算法餵養'],
  instead: '你會收到的是',
  tapCaption: '讀到被打動的地方，\n按一下共振',
  pickCaption: '再挑出\n打動你的那一段',
};
const PICKED = 2;

const likes: Reel = {
  id: 'likes',
  duration: 15.6,
  endAt: 12.4,
  coverAt: 2.9,
  text: Object.values(LIKES).flat().join('') + PAGE_TEXT,
  cues: [
    { t: 0.0, sfx: 'paper', gain: -6 },
    { t: 0.52, sfx: 'scribble' },
    { t: 1.22, sfx: 'scribble' },
    { t: 1.92, sfx: 'scribble' },
    { t: 3.0, sfx: 'paper' },
    { t: 4.0, sfx: 'flip', gain: -4 },
    { t: 5.4, sfx: 'chime' },
    { t: 7.7, sfx: 'paper' },
    { t: 9.6, sfx: 'tap' },
    { t: 9.68, sfx: 'chime', gain: -5 },
    { t: 11.3, sfx: 'tap' },
    { t: 12.5, sfx: 'whoosh', gain: -6 },
  ],
  build() {
    // Beat 1: what you won't get.
    const lead = words(LIKES.lead, { size: 72, weight: 700, color: C.text });
    const leadBox = html('div', { class: 'abs', style: { left: SAFE_X, top: 470 } }, [lead.el]);
    const gone = LIKES.gone.map((g, i) => {
      const w = words(g, { size: 150 });
      const box = html('div', { class: 'abs', style: { left: SAFE_X, top: 610 + i * 210 } }, [w.el]);
      const width = measure(box).w;
      const s = strike(width + 40, 31 + i * 17);
      css(s.el, { left: -20, top: 150 * 0.52 });
      box.append(s.el);
      return { w, box, s, at: 0.1 + i * 0.7 };
    });
    const beat1 = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H } }, [paper(C.cream), leadBox, ...gone.map((g) => g.box)]);

    // Beat 2: what you get — a passage someone marked, on a card.
    const sheet2 = tornSheet(family(2).fill, 202, 5);
    const instead = words(LIKES.instead, { size: 64, weight: 700, color: C.text });
    const insteadBox = html('div', { class: 'abs', style: { left: SAFE_X, top: 380, zIndex: 6 } }, [instead.el]);
    const quoteText = html('div', { class: 'quote-text' }, [html('span', { class: 'quote-mark', text: STORY.passages[PICKED].replace(/。$/, '').replace('。是', '\n是') })]);
    const pickers = [ASHU, MO].map((p) => avatar(64, p.initials, family(p.fam).fill));
    const byText = html('span', { text: LABELS.pickedBy.replace('{names}', `${ASHU.name}、${MO.name}`) });
    const byline = html('div', { class: 'quote-by' }, [
      html('div', { style: { display: 'flex' } }, pickers.map((a, i) => (css(a.el, { marginLeft: i ? -14 : 0 }), a.el))),
      byText,
    ]);
    const quoteCard = html('div', { class: 'quote-card' }, [quoteText, byline]);
    const q = measure(quoteCard);
    quoteCard.prepend(face(autoRect(q.w, q.h, 34, 77), q.w, q.h, { fill: family(0).interior, stroke: family(0).border, chalkSeed: 11 }).el);
    css(quoteCard, { height: q.h });
    const quoteBox = html('div', { class: 'abs', style: { left: (W - q.w) / 2, top: 560, zIndex: 6, transformOrigin: '50% 80%' } }, [quoteCard]);
    const love = sticker('nod/love-this-line', 400);
    css(love.el, { left: W - 430, top: 560 + q.h - 40, zIndex: 7 });

    // Beat 3: the phone — 共振, then the passage.
    const sheet3 = tornSheet(C.cream, 303, 10);
    const capTap = words(LIKES.tapCaption, { size: 78 });
    const capPick = words(LIKES.pickCaption, { size: 78 });
    const caps = html('div', { class: 'abs', style: { left: SAFE_X, top: 280, zIndex: 12 } }, [capTap.el, html('div', { class: 'abs', style: { left: 0, top: 0 } }, [capPick.el])]);
    const cp = cardPage({ faces: [ASHU, MO, YOU] });
    const ph = phone(cp.page, { width: 820, top: 640, zoom: 1.96, seed: 913 });
    css(ph.el, { zIndex: 11 });
    const dlg = passageDialog();
    const dlgAt = inOverlay(ph, dlg.el, dlg.w, dlg.h);
    const barBottom = cp.where.bar.y + cp.where.bar.h;
    const SCROLL = Math.max(0, barBottom - 370);
    const tap = bigTap();

    const end = endCard(LABELS.heroLine, [...CAST]);
    const root = html('div', { class: 'scene' }, [beat1, sheet2.el, insteadBox, quoteBox, love.el, sheet3.el, caps, ph.el, tap.root, end.root]);

    const update = (t: number) => {
      // 1
      lead.update(t + 0.25);
      gone.forEach((g) => {
        g.w.update(t - g.at);
        g.s.draw(ease.inOutCubic(prog(t, g.at + 0.42, g.at + 0.72)));
      });
      // 2
      sheet2.set(ease.inOutCubic(prog(t, 3.0, 3.5)));
      instead.update(t - 3.45, t - 7.6);
      const qIn = spring(t, 3.95, 0.7, 0.18);
      place(quoteBox, { y: lerp(260, 0, qIn), r: lerp(4, -1.2, qIn), opacity: t < 3.95 ? 0 : Math.min(1, qIn * 2) });
      quoteText.style.setProperty('--wash', `${Math.round(ease.inOutCubic(prog(t, 4.7, 5.3)) * 100)}%`);
      pickers.forEach((a, i) => place(a.el, { s: Math.max(0.001, spring(t, 5.35 + i * 0.12, 0.5, 0.3)) }));
      place(byText, { opacity: ease.outCubic(prog(t, 5.5, 5.9)) });
      love.update(t, 5.9, 7.55);
      // 3
      sheet3.set(ease.inOutCubic(prog(t, 7.6, 8.1)));
      capTap.update(t - 8.1, t - 10.0);
      capPick.update(t - 10.2, t - 12.2);
      const rise = ease.outCubic(prog(t, 7.9, 8.7));
      const scroll = SCROLL * ease.inOutCubic(prog(t, 8.5, 9.1));
      ph.scroll(scroll);
      // The camera: in on the bar for 共振, back out for the dialog.
      const barPt = ph.at(cp.where.bar.x + cp.bar.centre(0).x, cp.where.bar.y + cp.bar.centre(0).y, scroll);
      const zin = ease.inOutCubic(prog(t, 8.7, 9.3)) * (1 - ease.inOutCubic(prog(t, 9.9, 10.4)));
      const s = 1 + 0.22 * zin;
      const fx = barPt.x;
      const fy = barPt.y;
      const lift = lerp(420, 0, rise) - 120 * zin;
      ph.camera(s, fx, fy, lift);
      place(ph.el, { opacity: t < 7.9 ? 0 : 1 });
      // 共振: the tap, the bar answers, the reader's face joins.
      const tapPt = viaCamera(barPt, s, fx, fy, lift);
      const row = dlg.rowsAt[PICKED];
      const pickPt = viaCamera(ph.atOverlay(dlgAt.x + row.x + row.w / 2, dlgAt.y + row.y + row.h / 2), s, fx, fy, lift);
      if (t < 10.4) tap.update(t, tapPt.x, tapPt.y, 9.6);
      else tap.update(t, pickPt.x, pickPt.y, 11.3);
      place(cp.bar.el, { s: 1 - 0.05 * (prog(t, 9.52, 9.6) - prog(t, 9.66, 9.85)), origin: '15% 50%' });
      cp.faces.forEach((f, i) => {
        if (i < 2) return;
        const k = spring(t, 9.75, 0.55, 0.28);
        place(f.el, { s: Math.max(0.001, k), opacity: Math.min(1, k * 1.6), origin: '50% 70%' });
      });
      // The dialog.
      const shown = window01(t, 10.15, 12.05, 0.35, 0.3);
      place(ph.dim, { opacity: shown });
      place(dlg.el, { opacity: shown, s: lerp(0.94, 1, ease.outCubic(prog(t, 10.15, 10.5))) });
      dlg.pick(PICKED, ease.outCubic(prog(t, 11.3, 11.5)));
      end.update(t - 12.4);
    };
    return { root, update };
  },
};

// ── 被留下來的那一段 ──────────────────────────────────────────────────

const KEPT = {
  hook: '你寫下的故事，\n有人讀到了',
  seen: '他們會告訴你，\n哪一段留住了他們',
  note: '有人還留了\n一張小紙條',
  connect: '回覆紙條，\n你們就連結了',
  noteText: '我搬出去那年，也是坐在地上吃泡麵',
  reply: '原來不只我這樣。那年你搬去哪裡？',
  now: '現在',
};

const kept: Reel = {
  id: 'kept',
  duration: 16.4,
  endAt: 13.3,
  coverAt: 1.9,
  text: Object.values(KEPT).join('') + PAGE_TEXT,
  cues: [
    { t: 0.0, sfx: 'paper', gain: -4 },
    { t: 0.15, sfx: 'chime', gain: -6 },
    { t: 2.7, sfx: 'paper' },
    { t: 4.0, sfx: 'chime', gain: -6 },
    { t: 4.7, sfx: 'chime', gain: -9 },
    { t: 6.9, sfx: 'tap' },
    { t: 7.1, sfx: 'flip', gain: -6 },
    { t: 9.6, sfx: 'paper' },
    { t: 10.5, sfx: 'tap', gain: -4 },
    { t: 11.6, sfx: 'tap', gain: -4 },
    { t: 13.3, sfx: 'whoosh', gain: -6 },
  ],
  build() {
    // Beat 1: the notice, and the words.
    const notice = html('div', { class: 'notice' }, [
      avatar(84, ASHU.initials, family(ASHU.fam).fill).el,
      html('div', { style: { flex: 1 } }, [
        html('div', { class: 'notice-title', text: LABELS.tapNotice.replace('{handle}', ASHU.name) }),
        html('div', { class: 'notice-sub', text: `${STORY.title}・${KEPT.now}` }),
      ]),
    ]);
    const n = measure(notice);
    notice.prepend(face(autoRect(n.w, n.h, 40, 55), n.w, n.h, { fill: C.cardBg, stroke: C.sheetPen, chalkSeed: 5 }).el);
    css(notice, { height: n.h });
    const noticeBox = html('div', { class: 'abs', style: { left: (W - n.w) / 2, top: 360 } }, [notice]);
    const hook = words(KEPT.hook, { size: 120 });
    const hookBox = html('div', { class: 'abs', style: { left: SAFE_X, top: 720 } }, [hook.el]);
    const tuck = sticker('tuck/take-your-time', 300);
    css(tuck.el, { left: W - 400, top: 1100 });
    const beat1 = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H } }, [paper(family(1).fill), noticeBox, hookBox, tuck.el]);

    // Beat 2: the author's card page, faces beside the passages.
    const sheet2 = tornSheet(C.cream, 404, 5);
    const capSeen = words(KEPT.seen, { size: 76 });
    const capNote = words(KEPT.note, { size: 76 });
    const caps = html('div', { class: 'abs', style: { left: SAFE_X, top: 280, zIndex: 7 } }, [capSeen.el, html('div', { class: 'abs', style: { left: 0, top: 0 } }, [capNote.el])]);
    const cp = cardPage({ faces: [ASHU, MO, LIN], inline: { 2: [ASHU, MO], 1: [LIN] } });
    const ph = phone(cp.page, { width: 820, top: 640, zoom: 1.96, seed: 917 });
    css(ph.el, { zIndex: 6 });
    const picked = pickedDialog(STORY.passages[2], [{ who: ASHU, note: KEPT.noteText }, { who: MO }]);
    inOverlay(ph, picked.el, picked.w, picked.h);
    const SCROLL = Math.max(0, cp.where.paras[1].y - 20);
    const listening = sticker('hush/listening', 280);
    css(listening.el, { left: W - 320, top: 250, zIndex: 8 });
    const tap = bigTap();

    // Beat 3: the note and the reply.
    const sheet3 = tornSheet(family(4).fill, 505, 10);
    const capConnect = words(KEPT.connect, { size: 104 });
    const connectBox = html('div', { class: 'abs', style: { left: SAFE_X, top: 380, zIndex: 11 } }, [capConnect.el]);
    const theirs = bubble(KEPT.noteText, { own: false, maxWidth: 250, seedKey: 'kept-note' });
    const mine = bubble(KEPT.reply, { own: true, maxWidth: 250, seedKey: 'kept-reply' });
    const ashuFace = avatar(30, ASHU.initials, family(ASHU.fam).fill);
    const chat = html('div', { class: 'chat' }, [
      html('div', { class: 'chat-row' }, [ashuFace.el, theirs.el]),
      html('div', { class: 'chat-row own' }, [mine.el]),
    ]);
    const chatBox = html('div', { class: 'abs', style: { left: 50 / 2.9, top: 820 / 2.9, zoom: 2.9, width: (W - 100) / 2.9, zIndex: 11 } }, [chat]);
    const thanks = sticker('nod/thanks-for-sharing', 360);
    css(thanks.el, { left: 60, top: 1110, zIndex: 12 });

    const end = endCard(LABELS.heroLine, [...CAST]);
    const root = html('div', { class: 'scene' }, [beat1, sheet2.el, caps, ph.el, listening.el, sheet3.el, connectBox, chatBox, thanks.el, tap.root, end.root]);

    const update = (t: number) => {
      // 1
      const nIn = spring(t + 0.2, 0, 0.6, 0.2);
      place(noticeBox, { y: lerp(-260, 0, nIn) });
      hook.update(t - 0.45);
      tuck.update(t, 1.2, 2.6);
      // 2
      sheet2.set(ease.inOutCubic(prog(t, 2.6, 3.1)));
      capSeen.update(t - 3.05, t - 6.8);
      capNote.update(t - 7.05, t - 9.55);
      const rise = ease.outCubic(prog(t, 2.9, 3.6));
      const scroll = SCROLL * ease.inOutCubic(prog(t, 3.3, 3.9));
      ph.scroll(scroll);
      // Washes and faces: the last passage first (two people), then the middle one.
      const wash = (i: number, at: number) => {
        const p = ease.inOutCubic(prog(t, at, at + 0.5));
        cp.passages[i].style.background = `color-mix(in oklch, var(--color-terracotta-light) ${Math.round(p * 46)}%, transparent)`;
        (cp.inline[i] ?? []).forEach((a, k) => {
          const s = spring(t, at + 0.3 + k * 0.14, 0.55, 0.25);
          place(a.el, { s: Math.max(0.001, s), opacity: Math.min(1, s * 1.6), origin: '50% 70%' });
        });
      };
      wash(2, 3.7);
      wash(1, 4.4);
      // The camera: in on the last passage, then press its faces.
      const facePos = cp.where.inline[2][0];
      const facePt = ph.at(facePos.x + facePos.w / 2, facePos.y + facePos.h / 2, scroll);
      const pp = cp.where.paras[2];
      const passPt = ph.at(pp.x + pp.w / 2, pp.y + pp.h / 2, scroll);
      const zin = ease.inOutCubic(prog(t, 5.2, 6.0)) * (1 - ease.inOutCubic(prog(t, 7.0, 7.5)));
      const s = 1 + 0.2 * zin;
      const lift = lerp(420, 0, rise) - 60 * zin;
      ph.camera(s, passPt.x, passPt.y, lift);
      place(ph.el, { opacity: t < 2.9 ? 0 : 1 });
      const tp = viaCamera(facePt, s, passPt.x, passPt.y, lift);
      tap.update(t, tp.x, tp.y, 6.9);
      const shown = window01(t, 7.1, 9.5, 0.35, 0.3);
      place(ph.dim, { opacity: shown });
      place(picked.el, { opacity: shown, s: lerp(0.94, 1, ease.outCubic(prog(t, 7.1, 7.45))) });
      listening.update(t, 7.7, 9.4);
      // 3
      sheet3.set(ease.inOutCubic(prog(t, 9.55, 10.05)));
      capConnect.update(t - 10.0, t - 13.2);
      const b1 = spring(t, 10.5, 0.55, 0.25);
      const b2 = spring(t, 11.6, 0.55, 0.25);
      place(theirs.el, { s: Math.max(0.001, b1), opacity: Math.min(1, b1 * 2), origin: '0% 100%' });
      place(ashuFace.el, { opacity: Math.min(1, b1 * 2) });
      place(mine.el, { s: Math.max(0.001, b2), opacity: Math.min(1, b2 * 2), origin: '100% 100%' });
      place(chatBox, { opacity: t < 10.3 ? 0 : 1 - ease.inCubic(prog(t, 13.0, 13.3)) });
      thanks.update(t, 12.2, 13.1);
      end.update(t - 13.3);
    };
    return { root, update };
  },
};

// ── 寫一張故事卡 ──────────────────────────────────────────────────────

const WRITE = {
  hook: '今天有件小事，\n想寫下來',
  card: '寫成一張\n故事卡',
  who: '誰能讀到，\n由你決定',
  connectionsLine: '只有和你連結的人看得到',
  privateLine: m.card.trashed.onlyYou,
  author: '阿樹',
  title: '第一次一個人旅行',
  story: '在花蓮的車站，我第一次發現，迷路也可以是一種自由。那天的海很藍，藍到我忘了害怕…',
  tags: ['旅行', '勇氣', '成長'],
};
const AUDIENCES = ['public', 'connections', 'anonymous', 'private'] as const;

const write: Reel = {
  id: 'write',
  duration: 17.2,
  endAt: 13.9,
  coverAt: 6.3,
  text: Object.values(WRITE).flat().join('') + JSON.stringify(LABELS) + '9:41',
  cues: [
    { t: 0.0, sfx: 'paper', gain: -6 },
    { t: 1.25, sfx: 'scribble', gain: -3 },
    { t: 2.3, sfx: 'scribble', gain: -3 },
    { t: 4.0, sfx: 'paper' },
    { t: 4.6, sfx: 'flip', gain: -4 },
    { t: 6.6, sfx: 'paper', gain: -5 },
    { t: 7.5, sfx: 'tap', gain: -3 },
    { t: 8.5, sfx: 'tap', gain: -3 },
    { t: 9.5, sfx: 'tap', gain: -3 },
    { t: 10.5, sfx: 'tap', gain: -3 },
    { t: 11.4, sfx: 'tap', gain: -3 },
    { t: 12.9, sfx: 'tap' },
    { t: 13.0, sfx: 'chime', gain: -4 },
    { t: 13.25, sfx: 'whoosh' },
  ],
  build() {
    // Beat 1: the words, then the writer on the phone.
    const hook = words(WRITE.hook, { size: 104 });
    const hookBox = html('div', { class: 'abs', style: { left: SAFE_X, top: 280, zIndex: 2 } }, [hook.el]);
    const titleEl = html('div', { class: 'wr-title' });
    const storyEl = html('div', { class: 'wr-story' });
    const caret = html('span', { class: 'wr-caret' });
    const back = icon('arrow-right', 22, C.text);
    css(back.el, { transform: 'scaleX(-1)' });
    const writer = html('div', { class: 'cp' }, [
      html('div', { class: 'cp-top' }, [back.el, html('div', { style: { flex: 1 } }), icon('check', 22, C.text).el]),
      html('div', { class: 'cp-rule' }),
      html('div', { class: 'cp-body', style: { minHeight: 900 } }, [titleEl, storyEl]),
    ]);
    const ph = phone(writer, { width: 820, top: 700, zoom: 1.96, seed: 921 });
    css(ph.el, { zIndex: 1 });
    const beat1 = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H } }, [paper(C.cream)]);

    // Beat 2: the card, alone.
    const sheet2 = tornSheet(family(3).fill, 606, 5);
    const capCard = words(WRITE.card, { size: 104 });
    const capWho = words(WRITE.who, { size: 96 });
    const caps = html('div', { class: 'abs', style: { left: SAFE_X, top: 280, zIndex: 7 } }, [capCard.el, html('div', { class: 'abs', style: { left: 0, top: 0 } }, [capWho.el])]);
    const art = myCardCover();
    const card = storyCard({ index: 0, width: 340, title: WRITE.title, excerpt: WRITE.story, tags: WRITE.tags, author: { name: WRITE.author, initials: WRITE.author }, minutes: 4, cover: art.cover });
    const CARD_Z = 1.9;
    const cardBox = html('div', { class: 'abs', style: { left: (W - 340 * CARD_Z) / 2 / CARD_Z, top: 0, zoom: CARD_Z, zIndex: 6, transformOrigin: '50% 0%' } }, [card.el]);

    // Beat 3: who can read it — the four audiences as four rows, each with what it means, one chosen at a time.
    const icons = { public: 'globe', connections: 'users', anonymous: 'mask', private: 'lock' } as const;
    const ROW_W = 920;
    const ROW_TOP = 620;
    const ROW_GAP = 200;
    const rows = AUDIENCES.map((a, i) => {
      const line =
        a === 'public' ? LABELS.vis.publicLine.replace('{handle}', WRITE.author) : a === 'anonymous' ? LABELS.vis.anonymousLine : a === 'connections' ? WRITE.connectionsLine : WRITE.privateLine;
      const check = icon('check', 46, C.terracotta);
      const el = html('div', { class: 'aud-row', style: { width: ROW_W } }, [
        icon(icons[a], 46, C.text).el,
        html('div', { style: { flex: 1 } }, [html('div', { class: 'aud-label', text: LABELS.vis[a] }), html('div', { class: 'aud-line', text: line })]),
        check.el,
      ]);
      const { w, h } = measure(el);
      const idle = face(autoRect(w, h, 34, 700 + i * 13), w, h, { fill: C.cardBg, stroke: C.penSoft, strokeWidth: 2 });
      const chosen = face(autoRect(w, h, 34, 700 + i * 13), w, h, { fill: C.buttonTonal });
      el.prepend(idle.el, chosen.el);
      css(el, { height: h });
      const box = html('div', { class: 'abs', style: { left: (W - ROW_W) / 2, top: ROW_TOP + i * ROW_GAP, zIndex: 7 } }, [el]);
      return { box, chosen: chosen.el, check: check.el, h };
    });
    // Beat 4: the card again, and 發布 under it.
    const publish = button(LABELS.publish, 'solid', { size: 'md' });
    const PUB_Z = 2.4;
    const CARD2_TOP = 330;
    const CARD2_K = 0.85;
    const PUB_TOP = CARD2_TOP + card.h * CARD_Z * CARD2_K + 70;
    const pubBox = html('div', { class: 'abs', style: { left: (W - publish.w * PUB_Z) / 2 / PUB_Z, top: PUB_TOP / PUB_Z, zoom: PUB_Z, zIndex: 7 } }, [publish.el]);
    const forYou = sticker('twine/for-you', 300);
    css(forYou.el, { left: W - 330, top: 230, zIndex: 8 });
    const tap = bigTap();

    const end = endCard(LABELS.heroLine, [...CAST]);
    const root = html('div', { class: 'scene' }, [beat1, hookBox, ph.el, sheet2.el, caps, cardBox, ...rows.map((r) => r.box), pubBox, forYou.el, tap.root, end.root]);

    // The choice: 公開 first, then each in turn, then back to 公開 to publish.
    const steps: [number, number][] = [[7.5, 0], [8.5, 1], [9.5, 2], [10.5, 3], [11.4, 0]];
    const chosenAt = (t: number) => {
      let at = -1;
      for (const [s0, i] of steps) if (t >= s0) at = i;
      return at;
    };

    const update = (t: number) => {
      // 1
      hook.update(t + 0.2, t - 3.95);
      const rise = ease.outCubic(prog(t, 0.5, 1.2));
      // In on the words while they're written, back out before the cut.
      const zin = ease.inOutCubic(prog(t, 1.0, 1.6)) * (1 - ease.inOutCubic(prog(t, 3.6, 4.0)));
      const fp = ph.at(195, 120);
      ph.camera(1 + 0.3 * zin, fp.x, fp.y, lerp(500, 0, rise) - 40 * zin);
      place(ph.el, { opacity: t < 0.5 ? 0 : 1 });
      const tp = prog(t, 1.25, 2.1);
      const sp = prog(t, 2.3, 3.8);
      titleEl.textContent = tp > 0 ? typed(WRITE.title, tp) : LABELS.titlePlaceholder;
      titleEl.classList.toggle('placeholder', tp <= 0);
      storyEl.textContent = sp > 0 ? typed(WRITE.story.replace('…', ''), sp) : LABELS.storyPlaceholder;
      storyEl.classList.toggle('placeholder', sp <= 0);
      (sp > 0 ? storyEl : titleEl).append(caret);
      place(caret, { opacity: Math.floor(t * 2.4) % 2 === 0 || (tp > 0 && tp < 1) || (sp > 0 && sp < 1) ? 1 : 0 });
      // 2 — the card arrives, its cover drawn; it steps aside for the choice and comes back to be published.
      sheet2.set(ease.inOutCubic(prog(t, 3.95, 4.45)));
      capCard.update(t - 4.4, t - 6.5);
      capWho.update(t - 6.9, t - 11.95);
      const cIn = spring(t, 4.6, 0.7, 0.18);
      const away = ease.inCubic(prog(t, 6.4, 6.8));
      const back2 = spring(t, 12.15, 0.6, 0.18);
      const fly = ease.inCubic(prog(t, 13.15, 13.6));
      if (t < 12.0) {
        place(cardBox, { y: (lerp(920, 620, cIn) + 700 * away) / CARD_Z, r: lerp(3, -1, cIn) + 4 * away, opacity: t < 4.6 ? 0 : Math.min(1, cIn * 2) * (1 - away) });
      } else {
        place(cardBox, { y: (lerp(CARD2_TOP + 260, CARD2_TOP, back2) - 1000 * fly) / CARD_Z, s: CARD2_K, r: lerp(2, -1, back2) + 8 * fly, opacity: Math.min(1, back2 * 2) * (1 - fly) });
      }
      art.draw(ease.inOutCubic(prog(t, 4.75, 6.2)));
      art.train(ease.inOutCubic(prog(t, 5.6, 6.6)));
      // 3 — the rows.
      const now = chosenAt(t);
      rows.forEach((r, i) => {
        const inP = ease.outCubic(prog(t, 7.0 + i * 0.08, 7.4 + i * 0.08));
        const outP = ease.inCubic(prog(t, 11.85 + i * 0.04, 12.1 + i * 0.04));
        place(r.box, { opacity: inP * (1 - outP), y: lerp(40, 0, inP) - 30 * outP });
        // The chosen row fills as the tap lands.
        const last = steps.filter(([s0, k]) => k === i && t >= s0).map(([s0]) => s0).pop() ?? -1;
        const on = now === i ? ease.outCubic(prog(t, last, last + 0.18)) : 0;
        place(r.chosen, { opacity: on });
        place(r.check, { opacity: on, s: lerp(0.6, 1, on) });
      });
      // 4 — 發布.
      const pubIn = window01(t, 12.4, 13.5, 0.3, 0.25);
      place(pubBox, { opacity: pubIn, y: lerp(20, 0, ease.outCubic(prog(t, 12.4, 12.7))) / PUB_Z, s: 1 - 0.05 * (prog(t, 12.82, 12.9) - prog(t, 12.95, 13.15)) });
      const pubPt = { x: W / 2, y: PUB_TOP + (publish.h * PUB_Z) / 2 };
      if (t < 12.2) {
        const [s0, i] = steps.filter(([at]) => t >= at - 0.5).pop() ?? steps[0];
        tap.update(t, W / 2 + ROW_W / 2 - 160, ROW_TOP + i * ROW_GAP + rows[i].h / 2, s0);
      } else tap.update(t, pubPt.x, pubPt.y, 12.9);
      forYou.update(t, 13.0, 13.8);
      end.update(t - 13.9);
    };
    return { root, update };
  },
};

export const REELS: Record<string, Reel> = { likes, kept, write, passage: carousel, ...THEATER };

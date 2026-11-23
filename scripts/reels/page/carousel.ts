/**
 * 那句留下來的話: the weekly carousel (4:5, 1080 × 1350), four slides, slide i
 * shown at t = i. Its words come from the page's `?data=` (JSON, a Passage):
 *
 *  1. the passage, big, on its card's paper — what stopped someone;
 *  2. the story it comes from: title, author, the lines around it;
 *  3. who it stayed with: their faces, and the app's own line for it;
 *  4. where to read the rest.
 *
 * Only a public, named card, and only with its author's yes: an anonymous card
 * is never shown here (nothing may tell who wrote it).
 */
import zhTW from '../../../src/messages/zh-TW.json';
import { css, html, place } from '../../promo/page/dom';
import { autoRect, avatar, C, face, family, icon, measure } from '../../promo/page/kit';
import { paper, sticker, type Reel } from './lib';
import type { StickerName } from './stickers';

export interface Passage {
  passage: string;
  title: string;
  author: string;
  /** The story around the passage, a few sentences. */
  context: string;
  /**
   * The people who picked the passage (their pen names), as the app would show them — only
   * when it's true and they may be named. Empty: the team chose the passage, and slide 3
   * asks the reader `prompt` instead.
   */
  pickers: string[];
  /** Slide 3's question to readers when there are no pickers to show. */
  prompt?: string;
  /** The author's avatar letters, as the app shows them (the first two of the pen name by default). */
  initials?: string;
  /** The card's colour family (0–5), as the app gave it. */
  family?: number;
  /** A week label, e.g. 第 1 週. */
  week?: string;
}

const CW = 1080;
const CH = 1350;
const m = zhTW;

export const SAMPLE: Passage = {
  passage: '原來長大不是離開。是多了一個可以回去的地方。',
  title: '搬家後的第一個晚上',
  author: '小夏',
  context: '搬進來的第一晚，箱子都還沒拆。我坐在地板上，吃完一碗泡麵。樓下有人在收衣服，衣架碰來碰去。',
  pickers: ['阿樹', 'Mo'],
  family: 0,
  week: '第 1 週',
};

function data(): Passage {
  // make.ts reads REELS in Node, where there is no page (and no `location`)
  const raw = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('data');
  return raw ? { ...SAMPLE, ...JSON.parse(raw) } : SAMPLE;
}

/** A slide: a full sheet of paper, its own layer. */
function slide(fill: string, kids: (HTMLElement | null)[]) {
  return html('div', { class: 'abs', style: { left: 0, top: 0, width: CW, height: CH, overflow: 'hidden' } }, [paper(fill), ...kids]);
}

/** A small label in the slide's top-left corner, the mark beside it. */
function label(text: string) {
  return html('div', { class: 'abs car-label', style: { left: 90, top: 86 } }, [icon('wave', 34, C.terracotta).el, html('span', { text })]);
}

/** The slide's page number, bottom right. */
const pageNo = (i: number) => html('div', { class: 'abs car-page', text: `${i} / 4`, style: { right: 90, bottom: 80 } });

export const carousel: Reel = {
  id: 'passage',
  duration: 4,
  endAt: 4,
  coverAt: 0,
  text: JSON.stringify(data()) + '換你說說我們想留下的一段那句留下來的話整篇故事在共振讀到打動你的段落按一下共振連結在個人檔案' + m.card.tap.pickedBy + '1234/',
  cues: [],
  build() {
    const d = data();
    const fam = family(d.family ?? 0);
    // A sentence a line; a big quote's lines end without a full stop (the copy rule), ！ and ？ stay.
    const sentences = d.passage.replace(/([。！？])(?=.)/g, '$1\n').replace(/。$/gm, '');

    // 1 — the passage.
    // A passage of whole sentences: one line each when short, wrapped when long (2–3 sentences can run to 80 characters).
    const q = { el: html('div', { class: 'car-quote', text: sentences, style: { width: CW - 180, fontSize: d.passage.length > 50 ? 56 : 62 } }) };
    const rule = html('div', { class: 'abs', style: { left: 90, top: 0, width: 120, height: 6, borderRadius: 3, background: fam.border } });
    const by = html('div', { class: 'abs car-by', text: `${d.title}・${d.author}`, style: { left: 90, bottom: 150 } });
    const qh = measure(q.el).h;
    const qTop = Math.round((CH - qh) / 2 - 20);
    css(rule, { top: qTop - 60 });
    const s1 = slide(fam.interior, [label(d.week ? `那句留下來的話・${d.week}` : '那句留下來的話'), rule, html('div', { class: 'abs', style: { left: 90, top: qTop, width: CW - 180 } }, [q.el]), by, pageNo(1)]);

    // 2 — the story around it.
    const story = html('div', { class: 'car-story' }, [
      html('span', { text: d.context }),
      html('span', { class: 'car-story-mark', text: d.passage }),
    ]);
    const s2Body = html('div', { class: 'abs', style: { left: 90, top: 300, width: CW - 180 } }, [
      html('div', { class: 'car-title', text: d.title }),
      html('div', { class: 'car-author' }, [avatar(68, d.initials ?? d.author.slice(0, 2), fam.fill).el, html('span', { text: d.author })]),
      story,
    ]);
    const s2 = slide(C.cream, [label('這段話的上下文'), s2Body, pageNo(2)]);

    // 3 — who it stayed with.
    const faces = d.pickers.map((p, i) => {
      const a = avatar(118, p.slice(0, 2), family(i + 2).fill);
      css(a.el, { marginLeft: i ? -20 : 0 });
      return a.el;
    });
    const names = d.pickers.slice(0, 3).join('、');
    const line = (d.pickers.length > 3 ? m.card.tap.pickedByMore : m.card.tap.pickedBy).replace('{names}', names);
    const nod = sticker('nod/love-this-line' as StickerName, 340);
    css(nod.el, { left: CW - 400, top: 840 });
    const asked = d.pickers.length === 0;
    const s3 = slide(family(2).fill, [
      label(asked ? '換你說說' : '留下來的人'),
      asked ? null : html('div', { class: 'abs', style: { left: 90, top: 360, display: 'flex' } }, faces),
      html('div', { class: 'abs', style: { left: 90, top: asked ? 330 : 560, width: CW - 180, display: 'flex', flexDirection: 'column', gap: 64 } }, [
        html('div', { class: 'car-big', text: asked ? (d.prompt ?? '') : line, style: { whiteSpace: 'pre-line' } }),
        html('div', { class: 'car-small', text: '讀到打動你的段落，\n按一下共振，作者就會知道' }),
      ]),
      nod.el,
      pageNo(3),
    ]);
    nod.update(1, 0);

    // 4 — where to read the rest.
    const brand = html('div', { style: { display: 'flex', alignItems: 'center', gap: 20 } }, [icon('wave', 120, C.terracotta).el, html('div', { class: 'end-word', text: 'Resonance' })]);
    const card = html('div', { class: 'car-cta' }, [
      html('div', { class: 'car-big', text: '整篇故事在共振', style: { textAlign: 'center' } }),
      html('div', { class: 'car-small', text: `搜尋「${d.title}」\n或點個人檔案的連結`, style: { textAlign: 'center' } }),
    ]);
    const cs = measure(card);
    card.prepend(face(autoRect(cs.w, cs.h, 40, 88), cs.w, cs.h, { fill: C.cardBg, stroke: C.sheetPen, chalkSeed: 9 }).el);
    css(card, { height: cs.h });
    const pals = (['pip/hi', 'hush/listening', 'tuck/take-your-time'] as StickerName[]).map((n, i) => {
      const s = sticker(n, 260);
      css(s.el, { left: 150 + i * 270, top: 960 });
      return s;
    });
    const s4 = slide(C.cream, [
      html('div', { class: 'abs', style: { left: 0, top: 230, width: CW, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 70 } }, [brand, card]),
      ...pals.map((p) => p.el),
      pageNo(4),
    ]);
    pals.forEach((p) => p.update(1, 0));

    const slides = [s1, s2, s3, s4];
    const root = html('div', { class: 'scene', style: { width: CW, height: CH } }, slides);
    const update = (t: number) => slides.forEach((s, i) => place(s, { opacity: Math.floor(t + 1e-6) === i ? 1 : 0 }));
    return { root, update };
  },
};

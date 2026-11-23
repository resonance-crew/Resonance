/**
 * The app's card page at a phone's 1× (390 wide), as the reels show it inside
 * the paper phone: the top bar, the title, the byline, the story in its
 * passages (2–3 whole sentences each, as the app picks them), tags, the faces
 * of those who resonated, and the bar 共振 | 寄小紙條 | 用卡片回應. Words on
 * the app's own controls come from src/messages.
 *
 * Also the passage dialog (哪一段讓你有共鳴) and the picked-passage list
 * (對這一段有共鳴的人), drawn as the app draws its dialogs: paper, one pen line.
 */
import zhTW from '../../../src/messages/zh-TW.json';
import { css, html, place } from '../../promo/page/dom';
import { autoRect, avatar, button, C, face, family, icon, measure, segmentedBar, tagPill, wavyRule } from '../../promo/page/kit';

const m = zhTW;

export interface Person {
  initials: string;
  name: string;
  fam: number;
}

export const STORY = {
  title: '搬家後的第一個晚上',
  author: { name: '小夏', initials: '小夏', fam: 0 },
  meta: '2 分鐘・11月20日',
  passages: [
    '搬進來的第一晚，箱子都還沒拆。我坐在地板上，吃完一碗泡麵。',
    '樓下有人在收衣服，衣架碰來碰去。聽著聽著，突然覺得這裡會變成家。',
    '原來長大不是離開。是多了一個可以回去的地方。',
  ],
  tags: ['日常', '搬家'],
};

export const PEOPLE: Person[] = [
  { initials: '阿樹', name: '阿樹', fam: 2 },
  { initials: 'Mo', name: 'Mo', fam: 4 },
  { initials: '小林', name: '小林', fam: 3 },
  { initials: '你', name: '你', fam: 1 },
];

/** Where an element sits inside `within`, in 1× px (both laid out, before any zoom). */
export function offsetIn(el: Element, within: Element) {
  const a = el.getBoundingClientRect();
  const b = within.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

/**
 * The card page. `inline` puts faces after passages (what the author sees: who
 * a passage stayed with); `faces` is the row above the bar.
 */
export function cardPage(o: { inline?: Record<number, Person[]>; faces: Person[] }) {
  const back = icon('arrow-right', 22, C.text);
  css(back.el, { transform: 'scaleX(-1)' });
  const dots = icon('dots', 22, C.text);
  const top = html('div', { class: 'cp-top' }, [back.el, html('div', { style: { flex: 1 } }), dots.el]);
  // The header's rule: a faint grey wave across the page, as the app draws it.
  const rule = html('div', { class: 'cp-rule' }, [wavyRule(390, 211, 'oklch(55% 0.05 60 / 0.45)', { amp: 1.2, steps: 9, width: 1.4 }).el]);

  const passages = STORY.passages.map((p) => html('span', { class: 'cp-pass', text: p }));
  const inline: Record<number, ReturnType<typeof avatar>[]> = {};
  const paras = passages.map((p, i) => {
    const people = o.inline?.[i];
    if (!people) return html('p', { class: 'cp-para' }, [p]);
    inline[i] = people.map((q) => avatar(22, q.initials, family(q.fam).fill));
    return html('p', { class: 'cp-para' }, [p, html('span', { class: 'cp-faces-inline' }, inline[i].map((a) => a.el))]);
  });
  const faces = o.faces.map((q) => avatar(28, q.initials, family(q.fam).fill));
  // The bar runs the column's width (346 at 1×), as on a phone.
  const bar = segmentedBar(
    [
      { labels: [m.card.tap.label], icons: ['wave'] },
      { labels: [m.card.note.entryShort], icons: ['note'] },
      { labels: [m.card.reply.label], icons: ['cards'] },
    ],
    { fontSize: 15, pad: 12, width: 346 },
  );
  const bookmark = icon('bookmark', 20, C.text);
  const page = html('div', { class: 'cp' }, [
    top,
    rule,
    html('div', { class: 'cp-body' }, [
      html('h1', { class: 'cp-title', text: STORY.title }),
      html('div', { class: 'cp-byline' }, [
        avatar(44, STORY.author.initials, family(STORY.author.fam).fill).el,
        html('div', {}, [html('div', { class: 'cp-name', text: STORY.author.name }), html('div', { class: 'cp-meta', text: STORY.meta })]),
      ]),
      html('div', { class: 'cp-story' }, paras),
      html('div', { class: 'cp-tags' }, [...STORY.tags.map((t) => tagPill(t, family(0).fill, { uppercase: false, fontSize: 13 }).el), html('div', { style: { flex: 1 } }), bookmark.el]),
      html('div', { class: 'cp-faces' }, faces.map((a) => a.el)),
      html('div', { class: 'cp-bar' }, [bar.el]),
    ]),
  ]);
  measure(page);
  return {
    page,
    passages,
    paras,
    inline,
    faces,
    bar,
    /** Positions at 1× inside the page (measured now, before the page is zoomed). */
    where: {
      bar: offsetIn(bar.el, page),
      paras: paras.map((p) => offsetIn(p, page)),
      passages: passages.map((p) => offsetIn(p, page)),
      faces: faces.map((f) => offsetIn(f.el, page)),
      inline: Object.fromEntries(Object.entries(inline).map(([k, v]) => [k, v.map((a) => offsetIn(a.el, page))])) as Record<number, ReturnType<typeof offsetIn>[]>,
    },
  };
}

/** A dialog's paper: a filled wobble with one pen line, at the page's 1×. */
function dialogPaper(el: HTMLElement, seed: number) {
  const { w, h } = measure(el);
  el.prepend(face(autoRect(w, h, 30, seed), w, h, { fill: C.cardBg, stroke: C.sheetPen, strokeWidth: 2.2, chalkSeed: 7 }).el);
  css(el, { height: h });
  return { w, h };
}

/** 哪一段讓你有共鳴: the passages as rows, one of which a reader picks, and 略過. */
export function passageDialog() {
  const rows = STORY.passages.map((p) => {
    const check = icon('check', 18, C.terracotta);
    const text = html('span', { class: 'pp-row-mark', text: p });
    const row = html('div', { class: 'pp-row' }, [html('div', { class: 'pp-row-text' }, [text]), html('div', { style: { position: 'relative', width: 18, paddingTop: 7 } }, [check.el])]);
    return { row, text, check };
  });
  const skip = button(m.card.tap.passageSkip, 'tonal');
  const el = html('div', { class: 'pp' }, [
    html('div', { class: 'pp-title', text: m.card.tap.passageTitle }),
    html('div', { class: 'pp-rows' }, rows.map((r) => r.row)),
    html('div', { class: 'pp-foot' }, [skip.el]),
  ]);
  const size = dialogPaper(el, 404);
  const rowsAt = rows.map((r) => offsetIn(r.row, el));
  const pick = (i: number, p: number) =>
    rows.forEach((r, k) => {
      const on = k === i ? p : 0;
      // The pick is marked as the card page marks a passage: a soft wash under its words, and the check.
      r.text.style.background = `color-mix(in oklch, var(--color-terracotta-light) ${Math.round(on * 46)}%, transparent)`;
      place(r.check.el, { opacity: on, s: 0.6 + 0.4 * on });
    });
  pick(-1, 0);
  return { el, ...size, rowsAt, pick };
}

/** 對這一段有共鳴的人: the passage quoted, then each person with the note they left (if any). */
export function pickedDialog(passage: string, people: { who: Person; note?: string }[]) {
  const rows = people.map(({ who, note }) =>
    html('div', { class: 'pk-row' }, [
      avatar(40, who.initials, family(who.fam).fill).el,
      html('div', { style: { flex: 1, minWidth: 0 } }, [
        html('div', { class: 'pk-name', text: who.name }),
        note ? html('div', { class: 'pk-note', text: note }) : null,
      ]),
    ]),
  );
  const close = button(m.native.close, 'tonal');
  const el = html('div', { class: 'pp' }, [
    html('div', { class: 'pp-title', text: m.card.tap.pickedTitle }),
    html('div', { class: 'pk-quote', text: m.card.tap.passageQuote.replace('{text}', passage) }),
    html('div', { class: 'pk-rows' }, rows),
    html('div', { class: 'pp-foot' }, [close.el]),
  ]);
  const size = dialogPaper(el, 512);
  return { el, ...size, rows };
}

export const LABELS = {
  tap: m.card.tap.label,
  note: m.card.note.entryShort,
  reply: m.card.reply.label,
  passageTitle: m.card.tap.passageTitle,
  passageSkip: m.card.tap.passageSkip,
  pickedTitle: m.card.tap.pickedTitle,
  pickedBy: m.card.tap.pickedBy,
  tapNotice: m.app.notifications.tap,
  noteNotice: m.app.notifications.note,
  heroLine: `${m.hero.headlinePrefix}${m.hero.headlineAccent}${m.hero.headlineSuffix}`,
  close: m.native.close,
  vis: {
    label: m.write.visibility.label,
    public: m.write.visibility.public,
    connections: m.write.visibility.connections,
    anonymous: m.write.visibility.anonymous,
    private: m.write.visibility.draft,
    publicLine: m.write.visibility.publicLine,
    anonymousLine: m.write.visibility.anonymousLine,
  },
  publish: m.write.publishPanel.publish,
  anonymousName: m.write.publishPanel.anonymousName,
  titlePlaceholder: m.write.titlePlaceholder,
  storyPlaceholder: m.write.storyPlaceholder,
};

/** Every character the card page and its dialogs can show. */
export const PAGE_TEXT =
  STORY.title + STORY.passages.join('') + STORY.tags.join('') + STORY.author.name + STORY.meta + PEOPLE.map((p) => p.name).join('') +
  JSON.stringify(LABELS) + '「」';

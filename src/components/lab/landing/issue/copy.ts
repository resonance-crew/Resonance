/**
 * The issue's own words (prototype B · 對頁). zh-TW is the one judged; en must read sensibly. No full stop ends a
 * subtitle, a line or the footer (CLAUDE.md, Copy). Names and lines of the five come from `pals.*` (next-intl).
 */
export interface IssueCopy {
  runningHead: { brand: string; issue: (n: number) => string };
  rest: { off: string; on: string; label: string };
  cover: {
    kicker: string;
    /** The h1 as one string (the screen reader's), and its parts for the drawing. */
    title: string;
    dek: string;
    /** The dek in the units a line may break between (zh: never inside 回應它 or 自己的故事); en: one. */
    dekUnits: string[];
    coverLine: string;
    read: string;
    unsigned: string;
    minutes: (n: number) => string;
    /** en: the two lines. zh: the two columns, read right to left (用故事 | 回應故事). */
    enLines: [string, string];
  };
  contents: {
    folio: string;
    title: string;
    /** "六篇新故事，來自 A、B、C，和不署名的作者" — named authors named, the anonymous never counted. */
    dek: (count: number, names: string[], unsigned: boolean) => string;
    all: string;
    readThis: string;
    pip: string;
  };
  spread: {
    title: string;
    dek: string;
    story: string;
    answer: string;
    answers: (title: string) => string;
    readAll: string;
    pull: string;
    /** The quiet tag on a pair set as if one answered the other. */
    sample: string;
  };
  last: {
    kicker: string;
    title: string;
    line: string;
    write: string;
    read: string;
    finish: string;
    phone: string;
    nod: string;
  };
  staff: {
    title: string;
    roles: Record<'tuck' | 'dot' | 'tag' | 'card' | 'night', string>;
    meet: string;
  };
  back: { night: string };
}

const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const zhCount = (n: number) => (n >= 0 && n <= 10 ? ZH_DIGITS[n] : String(n));
const EN_COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function enList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const COPY: Record<'zh-TW' | 'en', IssueCopy> = {
  'zh-TW': {
    runningHead: { brand: '共振 RESONANCE', issue: (n) => `本期${zhCount(n)}篇新故事` },
    rest: { off: '讓小紙團休息', on: '叫醒小紙團', label: '小紙團' },
    cover: {
      kicker: '真實的人生故事',
      title: '用故事回應故事',
      dek: '讀到打動你的故事，不必按讚——寫一張自己的故事回應它，兩個故事從此相連',
      dekUnits: ['讀到', '打動你的故事，', '不必按讚——', '寫一張', '自己的故事', '回應它，', '兩個故事', '從此相連'],
      coverLine: '本期封面',
      read: '讀這篇',
      unsigned: '不署名',
      minutes: (n) => `${n} 分鐘`,
      enLines: ['Answer stories', 'with stories'],
    },
    contents: {
      folio: '02',
      title: '本期目次',
      dek: (count, names, unsigned) => {
        const head = `${zhCount(count)}篇新故事`;
        if (!names.length) return unsigned ? `${head}，都來自不署名的作者` : head;
        return `${head}，來自 ${names.join('、')}${unsigned ? '，和不署名的作者' : ''}`;
      },
      all: '翻閱所有故事',
      readThis: '讀這篇',
      pip: '這是我的故事嗎？',
    },
    spread: {
      title: '一個故事，和回應它的故事',
      dek: '在這裡，喜歡一個故事的方式，是寫一個故事回它',
      story: '故事',
      answer: '回應',
      answers: (t) => `回應〈${t}〉`,
      readAll: '讀全文',
      pull: '拉開看看 →',
      sample: '示意',
    },
    last: {
      kicker: '最後一頁',
      title: '這一頁，等你來寫',
      line: '不必寫得很好，只要是真的——你的故事，也許正好回應了某個人',
      write: '寫下你的故事',
      read: '先讀讀大家的故事',
      finish: '讀完它',
      phone: '在手機上寫也可以',
      nod: '嗯，我在聽',
    },
    staff: {
      title: '本期編輯部',
      roles: { tuck: '封面', dot: '找稿', tag: '傳信', card: '旁註', night: '夜班' },
      meet: '認識小紙團',
    },
    back: { night: '晚安……再說一個就好' },
  },
  en: {
    runningHead: { brand: 'RESONANCE', issue: (n) => `${EN_COUNT[n] ?? n} new ${n === 1 ? 'story' : 'stories'} in this issue` },
    rest: { off: 'Let the Pals rest', on: 'Wake the Pals', label: 'Paper Pals' },
    cover: {
      kicker: 'Real life stories',
      title: 'Answer stories with stories',
      dek: 'No likes here — when a story moves you, answer it with one of your own, and the two stay linked',
      dekUnits: ['No likes here — when a story moves you, answer it with one of your own, and the two stay linked'],
      coverLine: 'Cover story',
      read: 'Read it',
      unsigned: 'Unsigned',
      minutes: (n) => `${n} min`,
      enLines: ['Answer stories', 'with stories'],
    },
    contents: {
      folio: '02',
      title: 'In this issue',
      dek: (count, names, unsigned) => {
        const head = `${EN_COUNT[count] ?? count} new ${count === 1 ? 'story' : 'stories'}`;
        if (!names.length) return unsigned ? `${head}, all of them unsigned` : head;
        return `${head}, from ${enList(unsigned ? [...names, 'the unsigned'] : names)}`;
      },
      all: 'Browse every story',
      readThis: 'Read it',
      pip: 'Is this my story?',
    },
    spread: {
      title: 'A story, and the story that answered it',
      dek: 'Here, the way to love a story is to write one back',
      story: 'Story',
      answer: 'Answer',
      answers: (t) => `In answer to “${t}”`,
      readAll: 'Read it all',
      pull: 'pull it apart →',
      sample: 'Example',
    },
    last: {
      kicker: 'The last page',
      title: 'This page is waiting for you',
      line: 'It needn’t be polished, only true — your story may be the answer someone was waiting for',
      write: 'Write your story',
      read: 'Read stories first',
      finish: 'Finish it',
      phone: 'You can write on your phone too',
      nod: 'Mm-hm, I’m listening',
    },
    staff: {
      title: 'This issue’s staff',
      roles: { tuck: 'Cover', dot: 'Story finder', tag: 'Post', card: 'Margin notes', night: 'Night shift' },
      meet: 'Meet the Paper Pals',
    },
    back: { night: 'Goodnight… just one more story' },
  },
};

export function copyFor(locale: string): IssueCopy {
  return locale === 'en' ? COPY.en : COPY['zh-TW'];
}

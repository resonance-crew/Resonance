/**
 * The words of 一天的戲 (One Day), by locale. zh-TW is the one judged; en must read sensibly. No full stop ends a
 * subtitle, a line or the footer (the owner's rule): thoughts are joined with a comma, a dash or a semicolon.
 */
export interface OneDayCopy {
  hero: {
    /** The h1's two lines; `accent` is the word with the pen wave (回應 / Answer). */
    lineA: { before: string; accent: string; after: string };
    lineB: { before: string; accent: string; after: string };
    sub: string;
    read: string;
  };
  rest: { off: string; on: string };
  stories: {
    title: string;
    sub: string;
    prev: string;
    next: string;
    /** 第 {n} 張，共 {total} 張 */
    position: (n: number, total: number) => string;
    all: string;
    minutes: (n: number) => string;
    anonymous: string;
    /** The kamishibai's name for a screen reader. */
    frame: string;
  };
  answer: {
    title: string;
    sub: string;
    beats: { title: string; line: string }[];
    /** What the stage is, for a screen reader (the beats beside it say what happens). */
    stage: string;
  };
  dusk: {
    title: string;
    line: string;
    write: string;
    read: string;
    blank: string;
  };
  night: {
    title: string;
    sub: string;
    pals: string;
    hush: string;
  };
}

const zh: OneDayCopy = {
  hero: {
    lineA: { before: '用故事', accent: '', after: '' },
    lineB: { before: '', accent: '回應', after: '故事' },
    sub: '讀到觸動你的故事，不必按讚——寫一張自己的卡片回應它',
    read: '先讀讀大家的故事',
  },
  rest: { off: '讓小紙團休息', on: '叫醒小紙團' },
  stories: {
    title: '值得閱讀的故事',
    sub: '真實的人、真實的經歷——每個聲音都承載著一個世界',
    prev: '上一張',
    next: '下一張',
    position: (n, total) => `第 ${n} 張，共 ${total} 張`,
    all: '瀏覽所有故事',
    minutes: (n) => `${n} 分鐘`,
    anonymous: '匿名',
    frame: '最新的故事',
  },
  answer: {
    title: '這裡沒有讚，只有回應',
    sub: '被一個故事觸動的時候，你回的不是一顆愛心，是一張卡片',
    beats: [
      { title: '讀一個故事', line: '有人把自己的一段人生寫成了一張卡片' },
      { title: '不按讚，寫一張回應', line: '回應一個故事，用的是你自己的故事' },
      { title: '兩張卡片，從此相連', line: '公開署名的回應會讓作者知道是你，你們就能開始聊聊' },
    ],
    stage: '小紙團演出的三幕：讀一個故事、寫一張回應、兩張卡片相連',
  },
  dusk: {
    title: '下一個上台的是你',
    line: '每一個故事都有意義——你的故事，也許正是改變某個人那天的那個故事',
    write: '寫下你的故事',
    read: '先讀讀大家的故事',
    blank: '最後一頁，留給你',
  },
  night: {
    title: '在 App 裡，故事不打烊',
    sub: 'iPhone、iPad、Mac 與 Android 都能讀、都能寫，睡前再讀一個也好',
    pals: '認識小紙團',
    hush: '「晚安……再說一個就好」',
  },
};

const en: OneDayCopy = {
  hero: {
    lineA: { before: '', accent: 'Answer', after: ' stories' },
    lineB: { before: 'with stories', accent: '', after: '' },
    sub: 'When a story moves you, skip the like — answer it with a card of your own',
    read: 'Read the stories first',
  },
  rest: { off: 'Let the Paper Pals rest', on: 'Wake the Paper Pals' },
  stories: {
    title: 'Stories worth reading',
    sub: 'Real people, real experiences — every voice carries a world',
    prev: 'Previous',
    next: 'Next',
    position: (n, total) => `Card ${n} of ${total}`,
    all: 'View all stories',
    minutes: (n) => `${n} min read`,
    anonymous: 'Anonymous',
    frame: 'The latest stories',
  },
  answer: {
    title: 'No likes here, only answers',
    sub: 'When a story moves you, you send back a card, not a heart',
    beats: [
      { title: 'Read a story', line: 'Someone wrote a piece of their life onto a card' },
      { title: 'Don’t like it — answer it', line: 'You answer a story with a story of your own' },
      { title: 'Two cards, linked for good', line: 'Answer in public, under your name, and the author knows it’s you — you two can start talking' },
    ],
    stage: 'The Paper Pals act it out in three scenes: reading a story, writing an answer, two cards linked',
  },
  dusk: {
    title: 'You’re on next',
    line: 'Every story matters — yours might be the one that changes someone’s day',
    write: 'Write your story',
    read: 'Read stories first',
    blank: 'The last page is yours',
  },
  night: {
    title: 'In the app, stories never close',
    sub: 'Read and write on iPhone, iPad, Mac and Android — one more before bed',
    pals: 'Meet the Paper Pals',
    hush: '“Goodnight… just one more story”',
  },
};

export function copyFor(locale: string): OneDayCopy {
  return locale === 'en' ? en : zh;
}

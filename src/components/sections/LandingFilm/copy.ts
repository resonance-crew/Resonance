/**
 * The film's words, by locale (zh-TW is the one judged; en must read sensibly). A one-sentence string ends without a
 * full stop (the owner's rule), and so do the subtitles and the footer.
 */
export interface FilmCopy {
  hero: {
    /** The h1's two lines; `accent` carries the pen wave (回應 / Answer). */
    lineA: { before: string; accent: string; after: string };
    lineB: { before: string; accent: string; after: string };
    sub: string;
  };
  scenes: { name: string; line: string }[];
  lip: {
    play: string;
    pause: string;
    progress: (n: number, name: string) => string;
    skipLink: string;
    playFilm: string;
    /** The arrow once the film is over. */
    next: string;
    /** A short landscape window has no room for the film. */
    turn: string;
    controls: string;
    progressName: string;
  };
  card: { minutes: (n: number) => string; anonymous: string; drawn: string };
  /** The night's card: its title, the one line under it, its action; and the end's 重看一次. */
  cta: { line: string; sub: string; write: string; replay: string };
  end: {
    title: string;
    /** The pill over the title, as the landing page's card section wears one. */
    tag: string;
    subtitle: string;
    all: string;
    ctaTitle: string;
    ctaLine: string;
    kinBanner: string;
    region: string;
  };
  announce: (n: number, name: string) => string;
}

const zh: FilmCopy = {
  hero: {
    lineA: { before: '用故事', accent: '', after: '' },
    lineB: { before: '', accent: '回應', after: '故事' },
    sub: '讀到觸動你的故事，不必按讚——寫一張自己的卡片回應它',
  },
  scenes: [
    { name: '寫下', line: '有人把自己的一段人生，寫成了一張卡片' },
    { name: '回應', line: '讀到它的人，不按讚，寫一張自己的卡片回應' },
    { name: '相遇', line: '兩張卡片連在一起，兩個人就能開始聊聊' },
    { name: '換你', line: '下一個故事，由你來寫' },
  ],
  lip: {
    play: '播放',
    pause: '暫停播放',
    progress: (n, name) => `第 ${n} 幕，共 4 幕：${name}`,
    skipLink: '略過動畫，直接看故事',
    playFilm: '播放動畫',
    next: '往下看今晚的故事',
    turn: '把手機轉直，看小紙團演一遍',
    controls: '動畫播放器',
    progressName: '動畫進度',
  },
  card: { minutes: (n) => `${n} 分鐘`, anonymous: '匿名', drawn: '聆聆畫的回應卡' },
  cta: { line: '下一個故事，由你來寫', sub: '把你的一段人生，寫成一張卡片', write: '寫下你的故事', replay: '重看一次' },
  end: {
    title: '今晚的故事',
    tag: '推薦故事',
    subtitle: '真實的人、真實的經歷 — 每個聲音都承載著一個世界',
    all: '瀏覽所有故事',
    ctaTitle: '換你寫下一個故事',
    ctaLine: '讀到觸動你的故事，不必按讚——寫一張自己的卡片回應它',
    kinBanner: '預覽：第二張卡片是最相近的故事，還不是真的回應',
    region: '小紙團的動畫',
  },
  announce: (n, name) => `第 ${n} 幕：${name}`,
};

const en: FilmCopy = {
  hero: {
    lineA: { before: '', accent: 'Answer', after: ' stories' },
    lineB: { before: 'with stories', accent: '', after: '' },
    sub: 'When a story moves you, skip the like — answer it with a card of your own',
  },
  scenes: [
    { name: 'Write', line: 'Someone writes a piece of their life on a card' },
    { name: 'Answer', line: 'Whoever it moves skips the like and answers with a card of their own' },
    { name: 'Meet', line: 'Two cards linked, and two people can start to talk' },
    { name: 'Your turn', line: 'The next story is yours to write' },
  ],
  lip: {
    play: 'Play',
    pause: 'Pause',
    progress: (n, name) => `Scene ${n} of 4: ${name}`,
    skipLink: 'Skip the film and go to the stories',
    playFilm: 'Play the film',
    next: "On to tonight's stories",
    turn: 'Turn your phone upright to watch the film',
    controls: 'Film player',
    progressName: 'Film progress',
  },
  card: { minutes: (n) => `${n} min`, anonymous: 'Anonymous', drawn: 'An answer card Nod drew' },
  cta: { line: 'The next story is yours to write', sub: 'Write a piece of your life on a card', write: 'Write your story', replay: 'Watch again' },
  end: {
    title: "Tonight's stories",
    tag: 'Recommended stories',
    subtitle: 'Real people, real experiences — every voice carries a world',
    all: 'Browse all stories',
    ctaTitle: 'Your turn to write one',
    ctaLine: 'When a story moves you, skip the like — answer it with a card of your own',
    kinBanner: 'Preview: the second card is the nearest story, not yet a real reply',
    region: 'The Paper Pals film',
  },
  announce: (n, name) => `Scene ${n}: ${name}`,
};

export const copyFor = (locale: string): FilmCopy => (locale === 'en' ? en : zh);

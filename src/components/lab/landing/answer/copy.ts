/**
 * The words of prototype A (換你說 · Your Turn), by locale. zh-TW is the one judged; en must read sensibly.
 * No full stop at the end of any one-sentence string (the site's copy rule).
 */
export interface AnswerCopy {
  h1: { prefix: string; accent: string; suffix: string };
  sub: string;
  story: {
    label: string;
    another: string;
    anotherAria: string;
    readAll: string;
    minutes: (n: number) => string;
    anonymous: string;
  };
  answer: {
    label: string;
    prompt: string;
    chips: string[];
    chipAria: (chip: string) => string;
    placeholder: string;
    fieldLabel: string;
    honesty: string;
    send: string;
    nudge: string;
    you: string;
    answering: (title: string) => string;
    captions: [string, string, string];
    finish: string;
    inApp: string;
    again: string;
  };
  pause: { rest: string; wake: string };
  shelf: { title: string; sub: string; answerThis: string; answerThisAria: (title: string) => string; browse: string; prev: string; next: string };
  night: {
    title: string;
    line: string;
    answered: (line: string) => string;
    write: string;
    finish: string;
    read: string;
    oneMore: string;
    tagline: string;
  };
}

export const COPY: Record<'zh-TW' | 'en', AnswerCopy> = {
  'zh-TW': {
    h1: { prefix: '用故事', accent: '回應', suffix: '故事' },
    sub: '在這裡，你不按讚——讀完一個故事，就用自己的故事回應它',
    story: {
      label: '有人寫下',
      another: '換一個故事',
      anotherAria: '換一個故事來回應',
      readAll: '讀完整個故事',
      minutes: (n) => `${n} 分鐘`,
      anonymous: '匿名',
    },
    answer: {
      label: '換你說',
      prompt: '這個故事讓你想起什麼？',
      chips: ['我也曾經……', '這讓我想起一個人……', '讀完，我想說……'],
      chipAria: (chip) => `插入：${chip}`,
      placeholder: '寫下第一句',
      fieldLabel: '你的第一句',
      honesty: '只是試試看，不會發布、也不會送出',
      send: '回應',
      nudge: '先寫一句，或點一個開頭',
      you: '你 · 剛剛',
      answering: (title) => `回應〈${title}〉`,
      captions: ['你的卡片和它連在一起了', '真的寫的時候，作者會收到你的回應', '回應被接住，你們就連上了，可以開始聊'],
      finish: '寫完這張卡',
      inApp: '在 App 裡繼續',
      again: '再回應一個',
    },
    pause: { rest: '讓小紙團休息', wake: '叫醒小紙團' },
    shelf: {
      title: '還有人在等一個回應',
      sub: '真實的人、真實的經歷，每一張都可以回應',
      answerThis: '回應這個',
      answerThisAria: (title) => `回應〈${title}〉`,
      browse: '瀏覽所有故事',
      prev: '上一張',
      next: '下一張',
    },
    night: {
      title: '每個人都有幾行，一直折著的字',
      line: '準備好了再掀開——寫下來，也許正好回應了某個人',
      answered: (line) => `你剛剛寫了「${line}」——把它寫完`,
      write: '寫下你的故事',
      finish: '寫完這張卡',
      read: '先讀讀大家的故事',
      oneMore: '晚安，再讀一個就好',
      tagline: '用故事回應故事',
    },
  },
  en: {
    h1: { prefix: '', accent: 'Answer', suffix: ' stories with stories' },
    sub: 'No likes here — read a story, then answer it with one of your own',
    story: {
      label: 'Someone wrote',
      another: 'Another story',
      anotherAria: 'Show another story to answer',
      readAll: 'Read the whole story',
      minutes: (n) => `${n} min read`,
      anonymous: 'Anonymous',
    },
    answer: {
      label: 'Your turn',
      prompt: 'What does this story bring back?',
      chips: ['I once…', 'This reminds me of someone…', 'Reading this, I want to say…'],
      chipAria: (chip) => `Insert: ${chip}`,
      placeholder: 'Write a first line',
      fieldLabel: 'Your first line',
      honesty: 'Just trying it — nothing is posted or sent',
      send: 'Answer',
      nudge: 'Write a line first, or tap a beginning',
      you: 'You · just now',
      answering: (title) => `Answering “${title}”`,
      captions: ['Your card is linked to it', 'For real, its writer would get your answer', 'Once it lands, you’re connected — and can talk'],
      finish: 'Finish this card',
      inApp: 'Continue in the app',
      again: 'Answer another',
    },
    pause: { rest: 'Let the Paper Pals rest', wake: 'Wake the Paper Pals' },
    shelf: {
      title: 'Still waiting for an answer',
      sub: 'Real people, real lives — every one can be answered',
      answerThis: 'Answer this',
      answerThisAria: (title) => `Answer “${title}”`,
      browse: 'Browse all stories',
      prev: 'Previous',
      next: 'Next',
    },
    night: {
      title: 'Everyone has a few lines, folded away',
      line: 'Unfold them when you’re ready — written down, they may answer someone',
      answered: (line) => `You just wrote “${line}” — finish it`,
      write: 'Write your story',
      finish: 'Finish this card',
      read: 'Read the stories first',
      oneMore: 'Goodnight — just one more',
      tagline: 'Answer stories with stories',
    },
  },
};

export function copyFor(locale: string): AnswerCopy {
  return locale === 'en' ? COPY.en : COPY['zh-TW'];
}

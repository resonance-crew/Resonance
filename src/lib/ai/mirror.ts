import { draftScript, measure, readableProse, SCRIPT_READ_CHARS, type DraftScript } from '@/lib/text/script';

/**
 * The pre-publish "mirror moment" (POST /api/cards/insight): one sentence
 * handing the author back what their draft seems to say, shown in the publish
 * panel inside 「…」 / “…”. Pure rules here (which language the draft is in,
 * whether there is enough to read, whether an answer is a line worth showing);
 * the model call is `mirrorInsight` in ./tasks.
 *
 * Silence is an answer: a draft too short to read, a model that finds no
 * realization, or anything that reads as the model talking about the draft
 * ("I need the actual story…") instead of reflecting it, is null — the panel
 * then shows no line at all.
 */

// The draft's script is lib/text/script's — the same rule that sets a story's type — so the
// mirror never answers in one language while the page sets the draft in the other's type.
export { draftScript, type DraftScript };

/** Less than this — CJK characters and other words together — is too little to reflect: no model call. */
export const MIN_DRAFT_UNITS = 15;
/** The longest line the panel shows; longer is commentary, not a mirror. */
export const MAX_INSIGHT_CHARS = 160;
/**
 * How much of a story the mirror reads — the route keeps no more of it than
 * this (`mirrorDraft`), and its length and language are measured on no more;
 * a story may be 200 000 characters, which nothing here should read through
 * before the author's budget is spent (or at all).
 */
export const DRAFT_READ_CHARS = SCRIPT_READ_CHARS;

/**
 * A longer story is read at both ends: its opening, and more of its close —
 * where a personal story most often turns. Read from the start alone (its
 * first 1 200 characters, once), every story past that lost its ending, and
 * with it the realization the mirror is there to hand back.
 */
const HEAD_CHARS = 1_400;
const GAP = '\n\n……\n\n';
const TAIL_CHARS = DRAFT_READ_CHARS - HEAD_CHARS - GAP.length;

/** Within a UTF-16 string, never between the two halves of one character. */
const lowSurrogate = (s: string, i: number) => {
  const c = s.charCodeAt(i);
  return c >= 0xdc00 && c <= 0xdfff;
};

/**
 * The story as the mirror reads it: whole up to DRAFT_READ_CHARS, else its
 * first HEAD_CHARS and its last characters with an elision between, no
 * longer than that in all (so reading it again changes nothing). Takes no
 * look at what lies between the two ends.
 */
export function mirrorDraft(story: string): string {
  if (story.length <= DRAFT_READ_CHARS) return story;
  let head = HEAD_CHARS;
  if (lowSurrogate(story, head)) head -= 1;
  let tail = story.length - TAIL_CHARS;
  if (lowSurrogate(story, tail)) tail += 1;
  return story.slice(0, head) + GAP + story.slice(tail);
}

const CJK_CHAR = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}]/u;

/** How much there is to read: CJK characters and other words, as the read time counts them (of DRAFT_READ_CHARS at most). */
export function draftUnits(title: string, story: string): number {
  const m = measure(readableProse(title, story));
  return m.cjk + m.words;
}

/** The language instruction the model is given for a draft in this script. */
export function languageInstruction(script: DraftScript): string {
  switch (script) {
    case 'han':
      return 'Write it in Chinese, in the same script as the draft (Traditional Chinese for a Traditional Chinese draft).';
    case 'kana':
      return 'Write it in Japanese.';
    case 'hangul':
      return 'Write it in Korean.';
    case 'latin':
      return 'Write it in the language the draft is written in: English for an English draft. Never in Chinese.';
    default:
      return 'Write it in the language the draft is written in.';
  }
}

/**
 * Phrases of a model talking about the draft or to the author instead of
 * reflecting it — asking for more, saying what it lacks, refusing — in
 * English and Chinese. Narrow on purpose: a reflection may speak in the
 * author's own first person ("I need rest too") and of stories and writing;
 * it never asks for details or names the draft.
 */
const META = [
  /\b(?:please|could you|can you|would you)\s+(?:provide|share|tell|give|add)\b/i,
  /\b(?:more|further|additional)\s+(?:details?|context|information)\b/i,
  /\b(?:story|actual)\s+details\b/i,
  /\bnot enough\s+(?:information|details?|context|content|to go on)\b/i,
  /\b(?:the|this|your)\s+draft\b/i,
  /\bI(?:'m| am)\s+unable\b|\bI\s+(?:cannot|can't|can not)\s+(?:extract|identify|determine|find|tell|infer|see)\b/i,
  /\bno (?:clear |real |discernible )?(?:insight|realization)\b/i,
  /請(?:提供|分享|補充)|需要更多(?:的)?(?:細節|資訊|內容|背景|故事)|(?:資訊|內容|細節)(?:不足|太少)|無法(?:判斷|提煉|萃取|分析|得知)|(?:這篇|這段|你的)(?:草稿|文字)|沒有(?:明確的)?(?:洞見|領悟)/,
];

const WRAPPING_QUOTES = /^[\s"'“”‘’「」『』«»]+|[\s"'“”‘’「」『』«»]+$/g;

/**
 * The model's answer as the line the panel shows, or null: not a string, an
 * empty or over-long one, one in the wrong language for the draft (an English
 * draft answered in Chinese), or one that talks about the draft. Quotes
 * around it go (the panel puts its own), and so does one closing full stop
 * (the line is a fragment inside quotes); ？！… stay.
 */
export function acceptInsight(answer: unknown, script: DraftScript): string | null {
  if (typeof answer !== 'string') return null;
  const line = answer.replace(/\s+/g, ' ').replace(WRAPPING_QUOTES, '').replace(/[。．.]$/u, '').trim();
  if (!line || Array.from(line).length > MAX_INSIGHT_CHARS) return null;
  if (META.some((pattern) => pattern.test(line))) return null;
  const m = measure(line);
  if (script === 'latin' && m.cjk > 0) return null;
  if ((script === 'han' || script === 'kana' || script === 'hangul') && !CJK_CHAR.test(line)) return null;
  return line;
}

import type { CardTapBody, TapPassageBody } from '@/lib/api/v1/schemas';

/**
 * The card's tap as a reader reading it in translation sees it (round 31 §R1–§R2; the owner, 2026-11-23:
 * 「如果我讀翻譯的文章……那我這邊顯示的清單三句應該也要都翻成英文才對……它這個句子還要可以對應回去原本的那個
 * 標在畫面上」): its passages and its picked sentences in the translation's words, by id.
 *
 * `passages` is the translation's answer (`TranslationResponse.passages`): the card's passages as the translation
 * says them. The dialog offers, in the card's own order, the passages the translation has — nothing when it has
 * none, so the dialog is offered in translation exactly where the translation can say it — and a press still sends
 * the id, so the pick is kept in the author's words. A picked sentence is marked where the translation says it; one
 * the translation lacks is not drawn. The original tap is untouched (null and undefined stay as they are).
 */
export function tapInTranslation<T extends CardTapBody | null | undefined>(tap: T, passages: readonly TapPassageBody[] | undefined): T {
  if (!tap) return tap;
  const words = new Map((passages ?? []).map((p) => [p.id, p.text]));
  const shown = (tap.passages ?? []).filter((p) => words.has(p.id)).map((p) => ({ id: p.id, text: words.get(p.id)! }));
  const picked = tap.picked?.filter((p) => words.has(p.id)).map((p) => ({ ...p, text: words.get(p.id)! }));
  return { ...tap, passages: shown, ...(tap.picked ? { picked } : {}) } as T;
}

/**
 * A pick's words in translation, keyed by the author's own words (round 35, the owner: 「如果我已经翻译成英文，是不是应该
 * 这边就都一直显示英文呢？」): the who-resonated lists answer each person's pick as they picked it — the original's words,
 * no id — so a row finds its translation by those words among the card's passages. Empty when the story is shown as
 * written (`passages` undefined): every row quotes its pick as kept.
 */
export function quoteWords(tap: CardTapBody | null | undefined, passages: readonly TapPassageBody[] | undefined): ReadonlyMap<string, string> {
  if (!tap || !passages) return new Map();
  const words = new Map(passages.map((p) => [p.id, p.text]));
  return new Map((tap.passages ?? []).filter((p) => words.has(p.id)).map((p) => [p.text, words.get(p.id)!]));
}

import { createMemo, type Memo } from '@/lib/links/memo';

/**
 * Lists that are the same for every reader — the newest public cards, the
 * recent ones a card page's related cards are picked from — kept on this
 * instance for a few seconds (B3), so a feed page or a card page doesn't read
 * the same dozen cards, their authors and summaries for each reader.
 *
 * Only what no viewer changes sits in here: public, published cards, without
 * any byline an anonymous card would never carry (toFeedCard drops it), and
 * no one's blocks. Whatever depends on who asks — blockHides, unlistedCard,
 * blankFeedCard, a card in the trash, visibility for the viewer — is applied
 * to what comes out, every time, after the cache. A card made private or
 * trashed is out of these lists within PUBLIC_LIST_MS, the delay the
 * signed-out routes' `s-maxage=30` already has.
 */
export const PUBLIC_LIST_MS = 30_000;

/** How long a list is kept now: never in tests, which write and read within the same instant (setPublicListMs to try it). */
let keepMs = process.env.NODE_ENV === 'test' ? 0 : PUBLIC_LIST_MS;

/** For tests: keep lists for `ms` (0 = not at all). */
export function setPublicListMs(ms: number) {
  keepMs = ms;
}

const memos = new WeakMap<object, Memo<unknown>>();

/**
 * `make()`'s answer for `key` against `scope` — the database behind the
 * cards repository (`ctx.data.cards.scope`), so every context on one database
 * shares it — kept for every reader for a while; a failure is never kept.
 */
export function publicList<T>(scope: object, key: string, make: () => Promise<T>): Promise<T> {
  if (keepMs <= 0) return make();
  let memo = memos.get(scope);
  if (!memo) {
    memo = createMemo<unknown>({ max: 64, keep: (outcome) => (outcome.ok ? keepMs : 0) });
    memos.set(scope, memo);
  }
  return memo.get(key, make) as Promise<T>;
}

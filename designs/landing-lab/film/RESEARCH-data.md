No newer owner message reached me; this covers only my part, which is choosing the cards.

# Which real cards the film shows

## Two facts in the brief are wrong

1. **The card page's `related` list doesn't use the vector store.** `getRelated` / `relatedPool` in `src/lib/api/v1/reads.ts` take the 9 newest public cards and sort them by shared tags. The only code that searches vectors is the recommended feed (`funnel.ts`), which starts from a reader's profile. Nothing looks up the nearest card to another card. The film's "answer" lookup is therefore new code, but it runs on the existing `(visibility, channel, vector)` index, which I confirmed works in production.
2. **No card has translations.** All 18 public cards store `translations: {}`, and nothing in the codebase writes that field. Only `og.ts` reads it.

## The rule: choose a pair, not a single card

**What I tried first, and why I dropped it.** I ranked cards by `insightScore` and took the nearest vector as the answer. Today that gives 〈換我坐副駕駛〉 → 〈生活中無處不在的臣服練習〉 at distance 0.423, and the two don't match. One core insight says real hospitality goes both ways; the other says to keep checks and limits in dealings, even with people who seem friendly. The distances are squeezed together because every core insight is written to the same pattern (真正…不是…而是…). Across all 105 pairs of eligible cards: min 0.352, p10 0.452, median 0.555. So "nearest" alone isn't enough, and the rule needs a distance cutoff.

```ts
// .lab-tmp/filmCards.ts (sketch; meant to move to src/lib/db/firestore/landingFilm.ts)
export async function filmCards(db: Firestore, opts: { storageBases: readonly string[]; now?: Date })
  : Promise<{ written: Card; answer: Card | null; relation: 'resonance' | 'kin' | 'alone';
              pinned: boolean; sky: Card[]; authors: Record<string, User> } | null>
```

**Who can be a lead (written or answer).** This is decided only from stored fields, never from who is viewing:
- Public, published, not trashed.
- Named (`anonymous !== true`) and the author has a pen name.
- Listed and not blank (`unlistedCard`, `blankBySummary`).
- Cover stored on our own storage.
- Title 2–32 graphemes; stored excerpt at least 60.
- `signature.insightScore ≥ 0.8`.

All of these come from one query of the newest 120 public cards, reading `LIST_FIELDS` plus `signature.insightScore`. No stories are read at this step.

**How the pair is chosen, in order:**
- **0. Owner pin.** A server-only `config/landingFilm` document: `{ written, answer?, until? }`. `firestore.rules` already denies all client reads and writes to `config/*`. The pin only sets a preference: if a pinned card is no longer eligible, it's silently ignored.
- **1. A real resonance.** An eligible answer by someone else, pointing at an eligible original. Ranked by the lower of the two insight scores; rotates daily among the top 3.
- **2. Kin.** Take the best eligible card of each author, then the top 6 authors by score. For each, run one `findNearest` on the insight channel (`k = 10`, selecting only `cardId` and `__distance`). The kin is the first hit that is eligible and by a different author.
  - It must pass `d_insight ≤ 0.40`, and the two situation vectors (read by id) must be within `d_situation ≤ 0.70`.
  - The higher-scoring card of the pair is the written one. Mirror pairs are removed, the rest sorted by distance, and the film rotates daily among the top 3.
- **3. Alone.** If no pair passes, the best card plays alone (rotating among the top 3) and the answer beat shows a blank card, the visitor's own still to come.

The day turns at Taipei midnight: `floor((now + 8h) / 1 day)`. With the landing page's `revalidate = 3600`, the new pair appears within an hour of midnight.

Finally, the chosen two are read again with `LANDING_CARD_FIELDS`, `blankCard` is re-checked, and both are stripped exactly as `latestForLanding` strips cards.

**The night sky.** `latestForLanding(db, 14)` minus the two leads, at most 12 cards. Anonymous cards may appear, with no author id, because whether a card is in the sky never depends on who wrote it.

## Today, run read-only against production

`npx tsx .lab-tmp/film-rule-run.ts` (no writes of any kind; `config/landingFilm` doesn't exist):

| Day | Written | Answer (`kin`) | d insight / situation |
|---|---|---|---|
| **11-09 (today)** | 〈Let's Enjoy Me Time! 🌿〉 `/card/enjoying-alone-time`, Winnie, insight 0.92 | 〈不要只有在狀態好的時候才喜歡自己〉 `/card/self-acceptance-despite-flaws`, Starry, 0.88 | 0.352 / 0.481 |
| 11-10 | 〈感動的感覺 忘記它 或者延續它〉, 海狸大師 | 〈把自己活成一道光，因為你不知道，誰會藉著你的光，走出了黑暗〉, 念誠 | 0.376 / 0.593 |
| 11-11 | 〈湖中央，我看見了知行合一〉, Neo | 〈把自己活成一道光…〉, 念誠 | 0.397 / 0.689 |

Today's two cards in detail:
- Both have a cover on img.resonance.channel.
- The stored excerpt is 96 characters plus "…" for both. The plain story is 1525 characters for Winnie's card and 159 for Starry's.
- Title lengths are 22 and 16 graphemes.

Core insights, for judging only (they never go to the page):
- **Written:** 「當我們不再用忙碌逃避內在空白，願意誠實陪伴自己時，孤單就能慢慢轉化成滋養與安定。」
- **Answer:** 「不要把自我接納建立在表現或狀態上；連同不安、失常和脆弱一起承認，反而更能讓自己安穩。」

This pair really does resonate: being alone turns into keeping yourself company, and that meets accepting yourself even when you're not at your best. It is the closest pair on both channels, and each card is the other's nearest neighbour.

The other two pairs also hold up:
- 「把曾經純粹的快樂找回來」 pairs with 「把得到的鼓勵…再傳給下一個人」.
- 「持續把善意做出來」 pairs with 「讓興趣變成能陪人走出黑暗的力量」.

Two concerns:
- The 〈一道光〉 title is 29 graphemes; check that it fits on the phone card.
- Neo wrote 5 of the 15 eligible cards. Without the one-card-per-author pool, Neo would lead on two days in a row.

**Sky today (12):** 結巴影響我的事, 換我坐副駕駛, 放鬆的心，才接得住靈感, 一句「很早就買了」沒說的事, 你說的這個詞，指的是什麼？, from FOMO to soul Resonance (anonymous, author id `""`), 1. e4 e5…, 湖中央…, 錢是什麼？, 感動的感覺…, 重新理解一句話, 生活中無處不在的臣服練習.

**Speed and cost.** From this Mac, which is in Taiwan like the database:
- The whole function took 2.3 s cold and 0.9–1.3 s warm.
- A single `findNearest` took 125–1123 ms; the cards query took 1.3 s cold.

Under ISR this runs in the background, so visitors wait for it only on the first render after a deploy.

On cost, my estimate is about 130 Firestore reads per render: 18 window cards, about 10 profiles, 6 vector searches at roughly 11 each, plus the leads and the sky. That assumes vector search is billed at about one read per 100 index entries plus one per returned document, which I recall but didn't check. With 2 locales re-rendering hourly, that's around 6k reads a day.

None of this touches OpenAI. The function doesn't import `funnel.ts` or `indexCard.ts`, so the regions test stays green.

## Privacy

- **The scores never reach the HTML.** The score is read only for choosing. The final cards are read again through `LANDING_CARD_FIELDS`, which carries only `signature.placeholder`, and then stripped. I checked the serialized result: it contains neither "coreInsight" nor "insightScore". The `findNearest` query never selects the core-insight, situation or vector fields the vector records carry. `relation: 'kin'` comes with no number.
- **Anonymous cards are out of both lead roles.** The film says "the two connect", but an anonymous card connects no one. Leaving them out also keeps the same-author check from ever reading a hidden author.
- **Trashed, thin, placeholder and blank cards are out**, both by the query and by the code checks.
- **Two problems in today's landing grid, which the sky must not copy.** I'm flagging these to you as lead; they're outside my part.
  - **Anonymous cards are linked by slug.** `latestForLanding` puts their `slug` in the HTML, and `CardLinkGrid` links to `/card/${slug}`. A card published under a name and made anonymous later keeps its slug, which can carry the pen name; that's why the share rule always uses the id. The sky should link anonymous cards by id and set `slug: null`.
  - **`readCount` is serialized** even though no surface shows it. CLAUDE.md says it is "shown to no one yet".
- **The sky must drop stories.** With full stories the sky is 108.9 KB; without them it is 6.6 KB. The two leads with stories are 6.3 KB.

**Revalidation.** Every path that makes a listable card private, anonymous, trashed or deleted already drops `/` in both locales: PATCH and DELETE (`cards.ts:129` / `:213`), trash and restore (`trash.ts:149` / `:254`), applying an edit (`edits.ts:108`), and the account purge (`deletion.ts:198`). If the film lives on `/`, nothing new is needed. Gaps:
- A film page on any path other than `/` has to be added to `landingPagePaths`. The lab route already re-renders every 300 s.
- Resonate and un-resonate (`resonate.ts:300` / `:338`) drop only the card's own pages, so a take-back leaves a stale real-resonance pair for up to an hour. Add `landingPagePaths` there when the film ships.
- An edited pin, a pen-name change, or a card later marked placeholder by the index wait for the hourly re-render.

## Thin data now, more data later

**Today:** 18 public cards, 15 eligible as leads, 0 resonances. Tier 2 gives 3 rotating pairs. If a re-index pushes every pair past the cutoff, tier 3 still gives a written card and a blank answer. If nothing is eligible, `null` means the film plays with blank cards. The cutoffs are tuned on today's spread; re-tune them when the embedding model or `INDEX_VERSION` changes.

**When there are many cards:** real resonances take over, and the 120-newest window keeps them fresh. Vector-search cost grows with the number of public cards. At that point, cache only the chosen ids per day (`unstable_cache(pickIds, ['landing-film', day])`). On every render, re-read the two cards by id and re-check eligibility; if one fails, pick again without the cache.

Never cache card content past that re-check. That way `revalidatePath('/')` still removes a card that went private. A daily cron could later have the model judge the top pairs.

## English visitors

There are no translations to show. On `/en` the overlay should show the original card unchanged: cover, title, excerpt and pen name. Mark it with `lang` from `storyType`, and keep the card chrome (read time, open) in English, as the landing grid does today. The film tells the story without words, and the card is just the invitation to tap.

Optionally, add a quiet 「中文」 marker on the card. Writing real translations would be new work in the publish step, outside the film.

I wrote these to `/Users/ncchen/Documents/Resonance-landing/.lab-tmp/`; all are read-only:
- `filmCards.ts` – the rule as a module sketch
- `film-rule-run.ts` – today's pick and the next three days
- `film-picks.ts` – the full diagnostic, both vector channels
- `film-pairs-matrix.ts` – every pair, compared in memory
- `film-translations.ts`
- `film-size.ts`
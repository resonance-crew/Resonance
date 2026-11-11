/**
 * A signed-in reader's own picks for the end's list: the home feed's recommended feed (GET /api/v1/feed/recommended,
 * as `useRecommendedFeed` asks it), its first cards as the film's tiles. Loaded only once someone is signed in
 * (usePersonalPicks imports it then), so a signed-out visitor's page holds none of this and asks nothing.
 *
 * The API's summaries are already what the reader may see: an anonymous card comes without its author, and `tileOf`
 * links it by its id. Neither a reason nor a score is kept — only the order.
 */
import type { RecommendedFeedBody } from '@/lib/api/v1/schemas';
import { blankFeedCard } from '@/lib/cards/blank';
import { summaryList } from '@/lib/data/summaries';
import { callApi } from '@/lib/db/firestore/client/api';
import type { FilmTile } from './model';
import { tilesOf } from './tiles';

export async function readPersonalPicks(most: number): Promise<FilmTile[]> {
  const body = await callApi<RecommendedFeedBody>('/api/v1/feed/recommended');
  const { cards, authors } = summaryList((body.cards ?? []).filter((c) => !blankFeedCard(c)));
  // a named card goes under its byline or not at all (tileOf would draw it as an anonymous one)
  return tilesOf(cards.filter((c) => c.anonymous === true || authors[c.authorId]).slice(0, most), authors);
}

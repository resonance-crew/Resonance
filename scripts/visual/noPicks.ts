/**
 * The release screenshots' world has no picks (`SEED_PICKS=none`, which stack.ts seeds with): home's capture shows the
 * latest cards on every platform and every run, as its expect line and the baseline have it.
 *
 * Why: since round 26 every published card in the seed carries its offline reading and its parts' vectors (§V3), so the
 * recommender has a pool, and a reader's first ask of the day builds picks inline (lib/recommend/daily: carol's
 * 舊橋上的雨 for alice) and keeps them for the UTC day. Picks lead home when they reach it first — the web takes
 * whichever stream comes first, the apps wait 800 ms for them — so home showed one pick and 顯示更多 or the latest
 * cards depending on whether an earlier capture (any platform's, on the one stack) had built and stored them, on the
 * real day, and on what alice had read since (run 20261118-235458: the apps' light captures a pick, the web and the
 * Android dark tablet the latest cards). No screen needs anyone's picks.
 *
 * How: `recommendations/{uid}` as a build that failed and may not be tried again before the year 9999 — nothing stored
 * to show and no build allowed, which the server answers at once with no picks and no build (`planServe`'s cooldown),
 * whatever the day. The server itself is unchanged; the seed for manual testing keeps its picks.
 */
import { Timestamp } from 'firebase-admin/firestore';

/** Until when no build of picks is tried (the cooldown counts from a failure "then"). */
export const NO_PICKS_UNTIL = Date.UTC(9999, 0, 1);

/** `recommendations/{uid}` for a reader with no picks, and none built. */
export function noPicks() {
  return { date: null, items: [], partial: false, coldStart: false, failedAt: Timestamp.fromMillis(NO_PICKS_UNTIL) };
}

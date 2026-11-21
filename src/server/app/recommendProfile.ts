import { heldBack, tasteOf, type CardEvents, type Taste } from '@/lib/recommend/weights';
import type { ServerCtx } from '@/server/ctx';
import { connectionIdsIn, readerEventsIn } from './recommendSignals';

/**
 * A reader as the recommender knows them (round 26 §A3): their taste — the
 * cards they wrote, answered, tapped, saved and read, weighed by
 * lib/recommend/weights — what not to show them, and who they are connected
 * with. Built at each picks build from what they did (a handful of reads,
 * no model).
 *
 * `userProfiles/{uid}` keeps the taste's card ids and weights only — never a
 * vector (a part's is 12 KB) and never what a card says — for the offline
 * tools and a look at why a reader got what they got.
 */
export interface UserProfile {
  uid: string;
  taste: Taste;
  /** Cards not to pick for them now (lib/recommend/weights heldBack: their own, answered, read lately, paused). */
  held: Set<string>;
  /** How many positive cards they have: 0 is a cold start, 1–2 a mix (§A3.6). */
  positives: number;
  /** Whom they are connected with (for cold start's "your connections' cards first"). */
  connections: string[];
  updatedAt: Date;
}

/** The profile from a reader's events (pure: the reads are the caller's). */
export function profileOf(uid: string, events: CardEvents[], connections: string[], now: number): UserProfile {
  const taste = tasteOf(events, now);
  const held = new Set(events.filter((e) => heldBack(e, now) !== null).map((e) => e.cardId));
  return { uid, taste, held, positives: taste.positive.length, connections, updatedAt: new Date(now) };
}

/**
 * Build and keep a reader's profile (above). The stored copy is card ids and
 * weights only; losing the write loses nothing the build needs.
 */
export async function buildUserProfileIn(ctx: ServerCtx, uid: string, now: number = ctx.clock.now()): Promise<UserProfile> {
  const [events, connections] = await Promise.all([readerEventsIn(ctx, uid), connectionIdsIn(ctx, uid)]);
  const profile = profileOf(uid, events, connections, now);
  await ctx.data.recommend
    .putProfile(
      uid,
      profile.taste.positive.map((t) => ({ cardId: t.cardId, w: t.weight })),
      profile.taste.negative.map((t) => ({ cardId: t.cardId, w: t.weight })),
    )
    .catch((e) => ctx.log.warn('[recommend] keeping the profile', e));
  return profile;
}

import { isReservedId } from '@/lib/db/firestore/reservedId';
import { runPool } from '@/lib/push/pool';
import type { ServerCtx } from '@/server/ctx';
import { groupByLocale } from '@/server/domain/push/devices';
import { utcDay } from '@/server/domain/push/picks';
import { PICKS_CHANNEL, cardRoute, connectionCardText } from '@/server/domain/push/text';
import type { AnnounceCard, PushConnection } from '@/server/ports/repos/pushState';
import { sendGroups, type PushGroup } from './pushSend';

/** "A new card from someone you're connected with" (lib/push/connectionCards tells the story). */

export const CONNECTION_CARD_PUSHES = 'connectionCardPushes';
/** Pushes of this kind one person gets in a (UTC) day. */
export const CONNECTION_CARDS_PER_DAY = 3;
/** The most connections one publish rings. */
export const CONNECTION_FANOUT_MAX = 500;
/** Settings records read at once. */
const SETTINGS_BATCH = 100;
const CONCURRENCY = 8;

/** A card that may be announced: published, public, named, and not blank (lib/cards/blank). */
function announceable(card: AnnounceCard): boolean {
  return card.exists && card.published && card.visibility === 'public' && card.anonymous !== true && !card.blank && !card.unlisted;
}

/** Claim this card's push to `uid` for today: false once it went, or three already did today. */
function claim(ctx: ServerCtx, uid: string, cardId: string, day: string): Promise<boolean> {
  return ctx.uow.run(
    async (tx) => {
      const claims = await tx.pushState.getCardClaims(uid);
      const cards = claims.day === day ? claims.cards : [];
      if (cards.includes(cardId) || cards.length >= CONNECTION_CARDS_PER_DAY) return false;
      tx.pushState.putCardClaims(uid, day, [...cards, cardId]);
      return true;
    },
    { label: 'claim new card' },
  );
}

export type ConnectionCardOutcome = 'sent' | 'muted' | 'blocked' | 'no-device' | 'capped' | 'gone';

export interface ConnectionCardRun {
  /** Why nothing went to anyone (the card, or its author, isn't one to announce). */
  skipped?: 'not-announceable' | 'no-pen-name';
  /** Connections whose settings say yes. */
  recipients: number;
  outcomes: Partial<Record<ConnectionCardOutcome | 'failed', number>>;
  /** Devices the push service took it for. */
  sent: number;
}

/** Announce a just-published card to the author's connections who asked for it. Never throws for one recipient's failure. */
export async function pushConnectionCardIn(
  ctx: ServerCtx,
  cardId: string,
  opts: { now?: number; concurrency?: number; fanoutMax?: number } = {},
): Promise<ConnectionCardRun> {
  const run: ConnectionCardRun = { recipients: 0, outcomes: {}, sent: 0 };
  if (!cardId || cardId.includes('/') || isReservedId(cardId)) return { ...run, skipped: 'not-announceable' };
  const state = ctx.data.pushState;
  const card = await state.getAnnounceCard(cardId);
  if (!announceable(card)) return { ...run, skipped: 'not-announceable' };
  const author = card.authorId ?? '';
  const reference = card.referenceCardId;
  const [profile, connections, answered] = await Promise.all([
    state.getProfile(author),
    state.listConnectionsOf(author),
    reference && !reference.includes('/') && !isReservedId(reference) ? state.getCardAuthor(reference) : '',
  ]);
  const handle = profile.handle.trim();
  if (!handle) return { ...run, skipped: 'no-pen-name' };

  // The original's author hears of a resonance from its own bell already.
  const others = connections
    .map((c: PushConnection) => ({ uid: c.userIds.find((u) => u !== author), mutedBy: c.mutedBy }))
    .filter((c): c is { uid: string; mutedBy: string[] } => typeof c.uid === 'string' && !!c.uid && !c.uid.includes('/') && c.uid !== answered);
  const max = opts.fanoutMax ?? CONNECTION_FANOUT_MAX;
  if (others.length > max) ctx.log.warn(`[push] new card ${cardId}: ${others.length} connections, announcing to the first ${max}`);
  const candidates = others.slice(0, max);

  // Who asked for it: their settings, a batch at a time.
  const wanted: { uid: string; mutedBy: string[] }[] = [];
  for (let i = 0; i < candidates.length; i += SETTINGS_BATCH) {
    const batch = candidates.slice(i, i + SETTINGS_BATCH);
    const settings = await state.getManySettings(batch.map((c) => c.uid));
    settings.forEach((s, j) => {
      if (s.connectionCards) wanted.push(batch[j]);
    });
  }
  run.recipients = wanted.length;
  if (!wanted.length) return run;

  const day = utcDay(opts.now ?? ctx.clock.now());
  const tally = (o: ConnectionCardOutcome | 'failed') => (run.outcomes[o] = (run.outcomes[o] ?? 0) + 1);
  const title = card.thoughtCore;

  await runPool(
    wanted,
    opts.concurrency ?? CONCURRENCY,
    async ({ uid, mutedBy }) => {
      try {
        tally(await announceTo(uid, mutedBy));
      } catch (e) {
        tally('failed');
        throw e;
      }
    },
    { tag: `[push] new card ${cardId}` },
  );
  return run;

  async function announceTo(uid: string, mutedBy: string[]): Promise<ConnectionCardOutcome> {
    if (mutedBy.includes(uid)) return 'muted';
    const [out, inn, targets] = await Promise.all([state.isBlocked(uid, author), state.isBlocked(author, uid), state.listDevices(uid)]);
    if (out || inn) return 'blocked';
    if (!targets.length) return 'no-device';
    // Read again at send time: made private, anonymous or deleted since the publish, it goes to no one.
    const now = await state.getAnnounceCard(cardId);
    if (!announceable(now) || now.authorId !== author) return 'gone';
    if (!(await claim(ctx, uid, cardId, day))) return 'capped';

    const data = { type: 'new_card', cardId, route: cardRoute({ id: cardId, slug: now.slug, anonymous: now.anonymous }) };
    const groups: PushGroup[] = [...groupByLocale(targets)].map(([locale, group]) => ({
      targets: group,
      message: { ...connectionCardText(locale, handle, now.thoughtCore || title), data, channel: PICKS_CHANNEL, tag: `card-${cardId}`, threadId: PICKS_CHANNEL },
    }));
    const { sent, dead } = await sendGroups(ctx, groups);
    run.sent += sent;
    await state.deleteDevices(dead);
    return 'sent';
  }
}

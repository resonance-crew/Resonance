import type { ServerCtx } from '@/server/ctx';
import { otherInPair } from '@/server/domain/conversations';
import { touchesFor, type SignalEvent } from '@/server/domain/realtime';

/**
 * Tell the people a committed write changed things for (domain/realtime.ts
 * touchesFor), side by side. Call it after `uow.run` resolved, never inside:
 * a transaction may run again. Never throws — a signal that fails costs the
 * client at most its 60 s safety pull, never the write.
 */
export async function signal(ctx: Pick<ServerCtx, 'realtime' | 'log' | 'later'>, ...events: SignalEvent[]): Promise<void> {
  const touches = touchesFor(events);
  if (!touches.length) return;
  // After the response (ctx.later.soon): the answer never waits on the signal writes.
  await ctx.later.soon(
    () =>
      Promise.all(
        touches.map((t) =>
          Promise.resolve()
            .then(() => ctx.realtime.touch(t.uid, t.topics))
            .catch((e) => ctx.log.warn('[realtime] touch', t.uid, e)),
        ),
      ),
    'realtime',
  );
}

/**
 * Both people of each of `uid`'s pairs (`connections/{pair}` ids) a committed write connected or disconnected:
 * their connections lists changed (`graph`). After the commit, as {@link signal}.
 */
export function signalConnections(ctx: Pick<ServerCtx, 'realtime' | 'log' | 'later'>, uid: string, pairs: readonly string[]): Promise<void> {
  const uids = pairs.flatMap((pair) => {
    const other = otherInPair(pair, uid);
    return other ? [uid, other] : [];
  });
  return uids.length ? signal(ctx, { kind: 'graph', uids }) : Promise.resolve();
}

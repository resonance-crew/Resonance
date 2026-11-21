import type { ServerCtx } from '@/server/ctx';
import { touchesFor, type SignalEvent } from '@/server/domain/realtime';

/**
 * Tell the people a committed write changed things for (domain/realtime.ts
 * touchesFor), side by side. Call it after `uow.run` resolved, never inside:
 * a transaction may run again. Never throws — a signal that fails costs the
 * client at most its 60 s safety pull, never the write.
 */
export async function signal(ctx: Pick<ServerCtx, 'realtime' | 'log'>, ...events: SignalEvent[]): Promise<void> {
  await Promise.all(
    touchesFor(events).map((t) =>
      Promise.resolve()
        .then(() => ctx.realtime.touch(t.uid, t.topics))
        .catch((e) => ctx.log.warn('[realtime] touch', t.uid, e)),
    ),
  );
}

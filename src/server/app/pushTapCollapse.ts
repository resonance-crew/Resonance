import type { ServerCtx } from '@/server/ctx';
import { TAP_NOTE_WINDOW_MS, tapCollapseKey } from '@/server/domain/push/tap';

/**
 * Whether a note `from` leaves on `cardId` at `at` (ms) rides their tap's
 * collapse id (lib/push/tapCollapse tells why): their tap on the card rang at
 * most TAP_NOTE_WINDOW_MS before. The key, or null. A failed read rides nothing.
 */
export async function noteRidesTap(ctx: ServerCtx, from: string, cardId: string, at: number): Promise<string | null> {
  const key = tapCollapseKey(cardId);
  if (!key || !from || from.includes('/')) return null;
  try {
    const rangAt = await ctx.data.pushState.getTapRangAtMs(cardId, from);
    if (rangAt === null) return null;
    const since = at - rangAt;
    return since >= 0 && since <= TAP_NOTE_WINDOW_MS ? key : null;
  } catch (e) {
    ctx.log.error('[push] tap: collapse', cardId, e);
    return null;
  }
}

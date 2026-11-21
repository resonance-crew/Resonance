import type { ServerCtx } from '@/server/ctx';
import { differences, hashPrefix, parityLine } from '@/server/domain/parity';

/**
 * Shadow reads (plan section 4.4, layer 3; `READ_BACKEND=shadow`, off by
 * default): a v1 GET answers from the primary as always, and after the
 * response the same service runs again on the shadow backend; the two
 * answers are normalised and compared, and a difference is logged as
 * `[parity] <route> <field paths> <sha256(key) prefix>` — paths and a hash
 * only (domain/parity.ts), never a value or an id.
 *
 * `shadow` builds the shadow context from the primary's, or answers null
 * when shadow reads are off — infra/shadow.ts `shadowFromEnv` in the routes.
 */
export type ShadowFactory = (primary: ServerCtx) => Promise<ServerCtx | null>;

export function shadowRead<T>(
  ctx: ServerCtx,
  shadow: ShadowFactory | null,
  route: string,
  key: string,
  answer: T,
  recompute: (shadowCtx: ServerCtx) => Promise<T>,
): void {
  if (!shadow) return;
  ctx.later.later(async () => {
    const other = await shadow(ctx);
    if (!other) return;
    let again: T;
    try {
      again = await recompute(other);
    } catch (e) {
      // The error's name only: its message may quote what it was about.
      ctx.log.warn(`[parity] ${route} error:${e instanceof Error ? e.name : 'unknown'} ${hashPrefix(key)}`);
      return;
    }
    const paths = differences(answer, again);
    if (paths.length) ctx.log.warn(parityLine(route, paths, key));
  }, 'shadow');
}

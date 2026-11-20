import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/api/cronAuth';
import { purgeUnsentChatImagesIn } from '@/server/app/chatImages';
import { purgeUnsentCopiesIn } from '@/server/app/messages';
import { purgeExpiredTrashIn } from '@/server/app/trash';
import { serverCtx } from '@/server/ctx';

export const maxDuration = 300;

/** How long a run starts work: maxDuration less a margin for the deletes under way. Cards not reached wait for the next run. */
const PURGE_BUDGET_MS = (maxDuration - 30) * 1000;

/**
 * Daily purge of the trash (vercel.json, 02:30 Taipei — half an hour after
 * the account purge): every card in it for 30 days or more is deleted for
 * good (purgeExpiredTrash). Beside it, within the same budget, the pictures
 * uploaded for a chat message more than a day ago that no message carries
 * (purgeUnsentChatImages), and the copies of messages unsent 30 days ago or
 * more, kept for moderation, with the pictures they carried
 * (purgeUnsentCopies). Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`; any other caller is refused, and so is every caller when the
 * secret is unset.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const ctx = serverCtx();
  const deadline = started + PURGE_BUDGET_MS;
  // Side by side, each within the whole budget: a long trash purge never starves the pictures.
  const [run, unsent, unsentMessages] = await Promise.all([
    purgeExpiredTrashIn(ctx, {
      budgetMs: PURGE_BUDGET_MS,
      // A purged card must not live on in its cached pages.
      revalidate: (paths) => ctx.pages.revalidate(paths),
    }),
    ctx.chatObjects ? purgeUnsentChatImagesIn(ctx, { now: Date.now(), deadline, clock: Date.now }) : null,
    purgeUnsentCopiesIn(ctx, { now: Date.now(), deadline, clock: Date.now }),
  ]);
  return NextResponse.json({
    purged: run.purged,
    skipped: run.skipped,
    failed: run.failed,
    deferred: run.deferred,
    unsentPictures: unsent,
    unsentMessages,
  });
}

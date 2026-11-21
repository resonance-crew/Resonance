import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/api/cronAuth';
import { purgeDueAccountsIn } from '@/server/app/account';
import { serverCtx } from '@/server/ctx';

export const maxDuration = 300;

/**
 * How long a run starts work: maxDuration less a margin for what is under way
 * (a card or conversation being deleted, an account's last steps). Accounts
 * not reached are left, with their requests, for the next run.
 */
const PURGE_BUDGET_MS = (maxDuration - 30) * 1000;

/**
 * Daily purge of accounts whose deletion grace period has ended (scheduled in
 * vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; any
 * other caller is refused, and so is every caller when the secret is unset.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = serverCtx();
  const run = await purgeDueAccountsIn(
    ctx,
    {
      deleteAuthUser: (uid) => ctx.identity.deleteUser(uid),
      deleteStoragePrefix: (prefix) => ctx.objects.deletePrefix(prefix),
      deleteStorageObjects: (keys) => ctx.objects.deleteObjects(keys),
      deleteChatImageFiles: async (keys) => {
        await ctx.chatObjects?.deleteMany(keys);
      },
      // The deleted writing must not live on in cached card and profile pages.
      revalidate: (paths) => ctx.pages.revalidate(paths),
    },
    { budgetMs: PURGE_BUDGET_MS },
  );
  return NextResponse.json({ purged: run.purged.length, failed: run.failed.length, deferred: run.deferred.length });
}

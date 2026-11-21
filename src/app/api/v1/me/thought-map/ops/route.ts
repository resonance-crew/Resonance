import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { MapOpsRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { applyMapOpsIn } from '@/server/app/writer';

export const dynamic = 'force-dynamic';

/** POST /api/v1/me/thought-map/ops — a batch of changes to your thought map, in order, all together (see applyMapOps). */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const { ops } = parse(MapOpsRequest, body);
  return NextResponse.json(await applyMapOpsIn(serverCtx(), user.id, ops));
});

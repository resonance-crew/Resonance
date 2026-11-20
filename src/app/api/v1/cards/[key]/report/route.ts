import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardKey, ReportCardRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { reportCardIn } from '@/server/app/safety';

export const dynamic = 'force-dynamic';

/** POST /api/v1/cards/{key}/report — report a card, anonymous ones included. */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const key = parse(CardKey, await routeParam(ctx, 'key'));
  const input = parse(ReportCardRequest, await req.json().catch(() => null));
  const server = serverCtx();
  await server.limits.spend(user.id, 'report');
  return NextResponse.json({ id: await reportCardIn(server, user.id, key, input) }, { status: 201 });
});

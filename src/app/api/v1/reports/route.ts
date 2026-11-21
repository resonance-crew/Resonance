import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { CreateReportRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { createReportIn } from '@/server/app/safety';

export const dynamic = 'force-dynamic';

/** POST /api/v1/reports — report a person or a message (see createReport). */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(CreateReportRequest, body);
  const server = serverCtx();
  await server.limits.spend(user.id, 'report');
  return NextResponse.json({ id: await createReportIn(server, user.id, input) }, { status: 201 });
});

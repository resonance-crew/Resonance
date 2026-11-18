import { after } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { reportReading } from '@/lib/api/v1/reading';
import { CardIdParam, ReadingReportRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/cards/{id}/reading — how the reader read the card in one page
 * view, as its running totals (lib/api/v1/reading): kept for their own picks,
 * never shown to anyone by name. Answered 204 at once, whatever the card and
 * whether it was kept; keeping it runs after the response. A quiet write that
 * reaches no one, sent as a page is left (keepalive fetch, or a beacon with
 * the session cookie): this instance's cached word on revocation, as /read.
 */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  // A beacon's body comes as text, whatever it says it is: read it as JSON all the same.
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  }
  const report = parse(ReadingReportRequest, body);
  after(() => reportReading(getAdminDb(), user.id, id, report).catch((err) => console.error(`Reading: ${id} not kept`, err)));
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}, { revocation: 'cached' });

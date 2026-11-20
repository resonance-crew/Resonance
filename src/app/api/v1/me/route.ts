import { NextResponse } from 'next/server';
import { parse, withUser } from '@/lib/api/v1/http';
import { CreateProfileRequest, UpdateProfileRequest } from '@/lib/api/v1/schemas';
import { profilePagePaths } from '@/lib/api/revalidate';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { getMe } from '@/server/app/cardsRead';
import { createProfileIn, updateProfileIn } from '@/server/app/profile';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me — the signed-in account (see openapi/v1/openapi.json). */
export const GET = withUser(async (user, req) => cachedJson(req, await getMe(serverCtx(), user.id), OWN));

/**
 * POST /api/v1/me — onboarding: create the profile (201), or return the
 * existing one (200) — having given it the pen name chosen, when it had none.
 */
export const POST = withUser(async (user, req) => {
  const input = parse(CreateProfileRequest, await req.json().catch(() => null));
  const { me, created, named } = await createProfileIn(serverCtx(), user, input);
  if (named) revalidateProfile(me.handle);
  return NextResponse.json(me, { status: created ? 201 : 200 });
});

/** PATCH /api/v1/me — change the profile fields sent. */
export const PATCH = withUser(async (user, req) => {
  const input = parse(UpdateProfileRequest, await req.json().catch(() => null));
  const { me, previousHandle } = await updateProfileIn(serverCtx(), user.id, input);
  // The public page is cached under the pen name — and under the old one after a rename.
  revalidateProfile(me.handle, previousHandle);
  return NextResponse.json(me);
});

function revalidateProfile(...handles: (string | null)[]) {
  serverCtx().pages.revalidate(handles.flatMap(profilePagePaths));
}

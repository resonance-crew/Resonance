import { logoutRoute } from '@/lib/api/v1/auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/logout — the refresh token's session revoked (src/server/app/auth.ts logoutIn). */
export const POST = logoutRoute();

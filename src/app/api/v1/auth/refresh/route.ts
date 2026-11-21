import { refreshRoute } from '@/lib/api/v1/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/refresh — a refresh token traded, once, for the next
 * pair; a second use revokes its whole session (src/server/app/auth.ts refreshIn).
 */
export const POST = refreshRoute();

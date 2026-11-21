import { exchangeRoute } from '@/lib/api/v1/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/exchange — a sign-in at the identity provider (a
 * Firebase ID token) traded for Resonance's own access and refresh tokens
 * (src/server/app/auth.ts exchangeIn). 503 while RESONANCE_JWT_KEYS is unset.
 */
export const POST = exchangeRoute();

import { APP_CHECK_HEADER, APP_CHECK_TTL_MS } from '@/lib/appCheck/config';
import type { AttestationVerdict } from '@/server/ports/attestation';
import { ensureAdminApp } from '../firebase/app';

/**
 * Firebase App Check through the Admin SDK (loaded when first asked), on the
 * one admin app (infra/firebase/app). src/lib/appCheck/server keeps its
 * exports as facades over this file, and Turnstile's siteverify, the
 * exchange's brake and the monitoring tally, which are no SDK's.
 */
async function adminAppCheck() {
  ensureAdminApp();
  const { getAppCheck } = await import('firebase-admin/app-check');
  return getAppCheck();
}

/** An App Check token for the web app (NEXT_PUBLIC_FIREBASE_APP_ID). */
export async function mintWebToken(): Promise<{ token: string; ttlMillis: number }> {
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!appId) throw new Error('NEXT_PUBLIC_FIREBASE_APP_ID is not set');
  return (await adminAppCheck()).createToken(appId, { ttlMillis: APP_CHECK_TTL_MS });
}

/** Which of the project's apps a token was minted for, from its Firebase app id (`1:…:web:…`). */
export function platformOf(appId: string | undefined): string {
  return appId?.split(':')[2] ?? 'unknown';
}

/** Check a request's App Check token (if any): its verdict and which app it was minted for. */
export async function checkAppCheck(req: Request): Promise<{ verdict: AttestationVerdict; platform: string }> {
  const token = req.headers.get(APP_CHECK_HEADER);
  if (!token) return { verdict: 'missing', platform: 'unknown' };
  try {
    const { appId } = await (await adminAppCheck()).verifyToken(token);
    return { verdict: 'valid', platform: platformOf(appId) };
  } catch {
    return { verdict: 'invalid', platform: 'unknown' };
  }
}

import type { AttestationVerifier } from '@/server/ports/attestation';
import { checkAppCheck, mintWebToken } from './appCheck';

/**
 * App Check (./appCheck.ts, which loads the Admin SDK's App Check when first
 * asked). Not in ServerCtx: the transport (lib/api/v1/http) asks it, after
 * the response.
 */
export function appCheckVerifier(): AttestationVerifier {
  return { verify: checkAppCheck, mintWebToken };
}

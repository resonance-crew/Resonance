import type { AttestationVerifier } from '@/server/ports/attestation';

const appCheck = () => import('@/lib/appCheck/server');

/**
 * App Check, by delegating to src/lib/appCheck/server (loaded on first use).
 * Not in ServerCtx: the transport (lib/api/v1/http) asks it, after the
 * response. The attestation lane moves the code here.
 */
export function appCheckVerifier(): AttestationVerifier {
  return {
    verify: async (req) => (await appCheck()).checkAppCheck(req),
    mintWebToken: async () => (await appCheck()).mintWebToken(),
  };
}

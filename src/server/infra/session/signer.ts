import type { SessionSigner } from '@/server/ports/sessions';
import { envJwtKeys, newFamilyId, newRefreshToken, refreshHash, signAccessToken, type SigningKey } from './jwt';

/** The signer over RESONANCE_JWT_KEYS (or the keys given, for tests). */
export function jwtSessionSigner(keys: () => readonly SigningKey[] = () => envJwtKeys()): SessionSigner {
  return {
    enabled() {
      try {
        return keys().length > 0;
      } catch (e) {
        console.error('[auth] RESONANCE_JWT_KEYS', e instanceof Error ? e.message : e);
        return false;
      }
    },
    sign: (claims) => signAccessToken(claims, keys()),
    newRefreshToken,
    newFamily: newFamilyId,
    hash: refreshHash,
  };
}

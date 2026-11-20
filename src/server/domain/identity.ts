/**
 * The identity service (or the network to it) failed, as opposed to the
 * credential being bad: a 500, never "you are signed out". Every
 * IdentityVerifier (src/server/ports/identity.ts) throws this one class, so
 * the transport (lib/api/v1/http) tells an outage from a sign-out whichever
 * verifier it came from. The message names Firebase Auth, the only one today.
 */
export class AuthUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super('Firebase Auth is unavailable');
  }
}

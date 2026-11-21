/** A request's attestation token (App Check today): checked and logged, never enforced yet. */
export type AttestationVerdict = 'valid' | 'missing' | 'invalid';

export interface AttestationVerifier {
  /** The request's verdict and which app the token was minted for (`web`, `ios`, `android`, `unknown`). */
  verify(req: Request): Promise<{ verdict: AttestationVerdict; platform: string }>;
  /** A token for the web app, and how long it lasts. */
  mintWebToken(): Promise<{ token: string; ttlMillis: number }>;
}

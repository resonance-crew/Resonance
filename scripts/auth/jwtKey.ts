/**
 * A new signing key for Resonance's own access tokens (ADR 0004), as an entry
 * of RESONANCE_JWT_KEYS: an EC P-256 private key (ES256) as a JWK, under a
 * kid naming the month.
 *
 *   npx tsx scripts/auth/jwtKey.ts                      # a fresh list with one key
 *   npx tsx scripts/auth/jwtKey.ts --rotate "$CURRENT"  # the new key first, the current ones kept to verify
 *
 * Prints the variable's value to stdout and nothing else — pipe it straight
 * into `vercel env add RESONANCE_JWT_KEYS production` (docs/adr/0004, Operating it);
 * never paste it into a file in the repository. With --rotate, the keys after
 * the new one lose their private part (`d`): they only verify, for one access
 * token's life (15 minutes), and can be dropped at the next rotation.
 */
import { generateKeyPairSync } from 'node:crypto';

const args = process.argv.slice(2);
const rotateAt = args.indexOf('--rotate');
const current = rotateAt >= 0 ? args[rotateAt + 1] : undefined;
if (rotateAt >= 0 && !current) {
  console.error('--rotate takes the current RESONANCE_JWT_KEYS value');
  process.exit(2);
}

const month = new Date().toISOString().slice(0, 7);
const suffix = Math.random().toString(36).slice(2, 6);
const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const fresh = { kid: `${month}-${suffix}`, jwk };

type Entry = { kid: string; jwk?: Record<string, unknown>; pem?: string };
const kept: Entry[] = current
  ? (JSON.parse(current) as Entry[]).map((e) => (e.jwk ? { kid: e.kid, jwk: Object.fromEntries(Object.entries(e.jwk).filter(([k]) => k !== 'd')) } : e))
  : [];
if (kept.some((e) => e.pem?.includes('PRIVATE KEY'))) {
  console.error('A kept key is a private PEM: replace it with its public key before rotating');
  process.exit(2);
}

process.stdout.write(JSON.stringify([fresh, ...kept]));

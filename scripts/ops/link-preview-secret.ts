/**
 * Prints the `LINK_PREVIEW_SECRET` value that signs link-preview pictures and versions drawn cards
 * exactly as a deployment without one does today (both keys derived from FIREBASE_PRIVATE_KEY,
 * src/lib/links/previewSecret.ts), so the owner can set that very value in Vercel and every stored
 * preview picture keeps its signature (docs/release/owed.md). Local only: it reads this machine's
 * environment and env files, and never calls Vercel, Firebase or anything else.
 *
 *   npx tsx scripts/ops/link-preview-secret.ts [--from <path>] [--check '<stored /api/link-image?u=…&s=… path or URL>']
 *
 * Env files: `--from` when given, else `.env.local` and `.env` in the working directory (a
 * variable already set in the shell wins). The FIREBASE_PRIVATE_KEY read must be production's — the
 * one Vercel holds — or the value printed signs with another key. `--check` takes a picture path a
 * production preview stores (a message's or a story's link card) and says whether the printed value
 * verifies it: the way to know the local key is production's before setting anything.
 *
 * The value printed is a secret: paste it only into Vercel's environment variables. Exit 0 when it
 * printed (and a `--check` passed), 1 when a `--check` failed, 2 when there is nothing to derive from.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyImageSignature } from '../../src/lib/links/imageSigning';
import { derivedKeys, encodeDerivedSecret } from '../../src/lib/links/previewSecret';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const files = arg('--from') ? [resolve(arg('--from')!)] : ['.env.local', '.env'].map((f) => resolve(process.cwd(), f));
for (const file of files) if (existsSync(file)) process.loadEnvFile(file);

const keys = derivedKeys(process.env);
if (!keys) {
  console.error(`No FIREBASE_PRIVATE_KEY in the environment or in ${files.join(', ')}: nothing to derive from.`);
  process.exit(2);
}
if (process.env.LINK_PREVIEW_SECRET?.trim()) {
  console.error('Note: LINK_PREVIEW_SECRET is set locally; it is ignored here — the value below is the one derived from FIREBASE_PRIVATE_KEY.');
}

const value = encodeDerivedSecret(keys);
console.log(value);

const check = arg('--check');
if (check) {
  const url = new URL(check, 'https://resonance.channel');
  const u = url.searchParams.get('u') ?? '';
  const s = url.searchParams.get('s') ?? '';
  const ok = Boolean(u && s) && verifyImageSignature(u, s, keys.link);
  console.error(ok ? 'check: the stored signature verifies with this value' : 'check: the stored signature does NOT verify — this FIREBASE_PRIVATE_KEY is not the one that signed it');
  process.exit(ok ? 0 : 1);
}

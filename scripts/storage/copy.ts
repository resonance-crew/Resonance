/**
 * Copy one bucket into another for a storage move or a backup (plan §3.8,
 * docs/ops/storage-migration.md). A dry run unless --apply; idempotent (an
 * object already at the target with the same size and SHA-256 is skipped);
 * never deletes, at either end; never overwrites other bytes unless
 * --overwrite (UUID keys are never rewritten, so a conflict means look first).
 *
 *   npx tsx scripts/storage/copy.ts --from r2:public --to s3:TARGET [--prefix image/] [--manifest out.json] [--apply]
 *   npx tsx scripts/storage/copy.ts --from r2:chat   --to s3:TARGET_CHAT --apply
 *
 * Buckets: r2:public | r2:chat | s3:<ENV PREFIX> | dir:<path> (scripts/storage/buckets.ts bucketFromSpec).
 * --manifest writes the source's `{ key, size, sha256 }` list (the hashes computed by streaming: R2's
 * multipart ETags are not MD5s); keep it outside the repository — chat keys name conversations.
 * Exit code 1 when anything conflicted or failed.
 */
import { writeFile } from 'node:fs/promises';
import { bucketFromSpec } from './buckets';
import { copyBucket } from './sync';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const from = flag(args, 'from');
  const to = flag(args, 'to');
  if (!from || !to) throw new Error('usage: copy.ts --from <bucket> --to <bucket> [--prefix p] [--manifest file] [--apply] [--overwrite]');
  const apply = args.includes('--apply');
  const report = await copyBucket(bucketFromSpec(from), bucketFromSpec(to), {
    prefix: flag(args, 'prefix'),
    apply,
    overwrite: args.includes('--overwrite'),
    log: console.log,
  });
  for (const key of report.conflicting) console.log(`conflict  ${key}`);
  for (const key of report.failed) console.log(`failed    ${key}`);
  const manifest = flag(args, 'manifest');
  if (manifest) {
    await writeFile(manifest, JSON.stringify(report.manifest, null, 1));
    console.log(`manifest: ${report.manifest.length} object(s) → ${manifest}`);
  }
  if (!apply) console.log('dry run — add --apply to copy');
  if (report.conflicting.length || report.failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});

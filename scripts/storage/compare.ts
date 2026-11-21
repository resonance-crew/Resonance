/**
 * Compare two buckets (plan §3.8, docs/ops/storage-migration.md): reports
 * only the keys missing at the target, extra at the target, or with other
 * bytes (size, then SHA-256 computed by streaming — ETags are not compared:
 * R2's multipart ones aren't MD5s). Reads only.
 *
 *   npx tsx scripts/storage/compare.ts --from r2:public --to s3:TARGET [--prefix image/] [--sizes-only] [--json]
 *
 * Buckets: r2:public | r2:chat | s3:<ENV PREFIX> | dir:<path>. Exit code 0 when identical, 1 when not.
 */
import { bucketFromSpec } from './buckets';
import { compareBuckets, identical } from './sync';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const from = flag(args, 'from');
  const to = flag(args, 'to');
  if (!from || !to) throw new Error('usage: compare.ts --from <bucket> --to <bucket> [--prefix p] [--sizes-only] [--json]');
  const a = bucketFromSpec(from);
  const b = bucketFromSpec(to);
  const report = await compareBuckets(a, b, { prefix: flag(args, 'prefix'), sizesOnly: args.includes('--sizes-only') });
  if (args.includes('--json')) console.log(JSON.stringify(report));
  else {
    for (const key of report.missing) console.log(`missing     ${key}`);
    for (const key of report.extra) console.log(`extra       ${key}`);
    for (const key of report.mismatched) console.log(`mismatched  ${key}`);
    console.log(
      `${a.name} vs ${b.name}: ${report.compared} compared; ${report.missing.length} missing, ${report.extra.length} extra, ` +
        `${report.mismatched.length} mismatched — ${identical(report) ? 'identical' : 'different'}`,
    );
  }
  if (!identical(report)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});

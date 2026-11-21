/**
 * Compare two stores entity by entity (plan §4.4, diff.ts): counts, 256 id-hash buckets, then the rows of
 * the buckets that differ.
 *
 *   npx tsx scripts/portability/parity.ts <export dir A> <export dir B>
 *   npx tsx scripts/portability/parity.ts <export dir> --emulator --project demo-resonance
 *   npx tsx scripts/portability/parity.ts <export dir> --memory-dump <file>
 *
 * Prints an entity, an id's hash and field paths — never a value, never an id (an id can hold a uid),
 * never a map key the schema doesn't name — so nothing it prints says who wrote an anonymous card.
 * Exits 1 when anything differs.
 */
import type { EntitySource } from '@/server/ports/portability';
import { formatParity, parity } from './diff';
import { exportSource } from './format';
import { openSource, parseArgs } from './stores';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [a, b] = args.positional;
  if (!a) throw new Error('parity.ts <export dir> (<export dir> | --emulator --project demo-… | --memory-dump <file>)');
  const left: EntitySource = await exportSource(a);
  const right: EntitySource = b ? await exportSource(b) : (await openSource(args)).source;
  const report = await parity(left, right);
  for (const line of formatParity(report)) console.log(line);
  process.exit(report.same ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});

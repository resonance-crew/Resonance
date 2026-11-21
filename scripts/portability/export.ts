/**
 * Export every registered entity as canonical rows (plan §4.2, format.ts).
 *
 *   npx tsx scripts/portability/export.ts --emulator --project demo-resonance [--out DIR] [--no-zstd] [--lenient] [--objects-dir DIR]
 *   npx tsx scripts/portability/export.ts --memory-dump <file> [--out DIR]
 *   npx tsx scripts/portability/export.ts --i-am-the-owner --project <real project> --out <encrypted volume>   (the owner only)
 *
 * There is no default project, and none but an emulator's (`demo-…`) without `--i-am-the-owner`, which
 * prints a warning: the owner runs that one, never CI and never an agent. Writes
 * `<out>/export-<UTC>-<source>/` — `--out` defaults to `$TMPDIR/resonance-exports`, and a directory inside
 * the repository is refused. `--lenient` writes a value off its schema's kind in the generic encoding (and
 * lists its field path in the manifest) instead of stopping. `--objects-dir` lists a folder standing in for
 * the public bucket (the emulators' local storage: `$EMULATOR_STORAGE_DIR`, else
 * `$TMPDIR/resonance-emulator-storage`); the owner's export lists R2 with `--objects-r2`.
 * Prints counts and the manifest's path, never a row.
 */
import { existsSync } from 'node:fs';
import { writeExport, type ListableStore } from './format';
import { openSource, parseArgs } from './stores';

async function publicStore(args: ReturnType<typeof parseArgs>): Promise<ListableStore | null> {
  if (args.values.has('--objects-dir')) {
    const dir = args.values.get('--objects-dir')!;
    if (!existsSync(dir)) return null;
    const { LocalStorageProvider } = await import('@/server/infra/s3/local');
    return new LocalStorageProvider(dir, 'http://localhost/emulator-storage');
  }
  if (args.flags.has('--objects-r2')) {
    if (!args.flags.has('--i-am-the-owner')) throw new Error('Listing R2 is the owner’s');
    const { publicObjectStore } = await import('@/server/infra/s3/objects');
    return publicObjectStore();
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { source, project } = await openSource(args);
  const { dir, manifest } = await writeExport({
    source,
    project,
    out: args.values.get('--out'),
    zstd: !args.flags.has('--no-zstd'),
    objects: { public: await publicStore(args) },
  });
  const total = Object.values(manifest.entities).reduce((n, e) => n + e.rows, 0);
  console.log(`${total} rows in ${Object.keys(manifest.entities).length} entities (${manifest.compression})`);
  for (const [name, e] of Object.entries(manifest.entities)) {
    const off = Object.keys(e.offSchema).length;
    if (e.rows || off)
      console.log(
        `  ${name}\t${e.rows}${off ? `\toff-schema paths: ${Object.keys(e.offSchema).join(',')}` : ''}${e.extras.length ? `\textras: ${e.extras.join(',')}` : ''}`,
      );
  }
  if (manifest.unregistered.length) console.log(`  not exported (unregistered collections): ${manifest.unregistered.join(', ')}`);
  console.log(dir);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

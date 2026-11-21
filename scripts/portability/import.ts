/**
 * Import an export (plan §4.2) into a store, through the `ImportTarget` seam (ports/portability.ts):
 *
 *   npx tsx scripts/portability/import.ts --from <export dir> --target memory --out <dump file>
 *   npx tsx scripts/portability/import.ts --from <export dir> --target emulator --project demo-resonance
 *
 * `memory` writes the memory state to a file (v8 serialisation: Dates and bytes survive) that
 * `export.ts --memory-dump` and `parity.ts` read; the file is the whole database too, so it is refused
 * inside the repository. `emulator` writes into the Firestore emulator — only an emulator project
 * (`demo-…`), and only with FIRESTORE_EMULATOR_HOST set: an import never writes to a real project (that is
 * Phase 4, decided by the owner). The PostgreSQL target is the sibling lane's: it gives an `ImportTarget`
 * and joins the switch below.
 * Every file is checked against its manifest hash as it is read.
 */
import { MemoryState } from '@/server/infra/memory/state';
import { memoryTarget } from '@/server/infra/memory/canonical';
import type { ImportTarget } from '@/server/ports/portability';
import { assertOutsideRepo, exportSource } from './format';
import { load } from './load';
import { isEmulatorProject, parseArgs, pointAtEmulator, writeMemoryDump } from './stores';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = args.values.get('--from');
  if (!from) throw new Error('--from <export dir> is required');
  const kind = args.values.get('--target');
  let target: ImportTarget;
  let after = async () => {};
  if (kind === 'memory') {
    const out = args.values.get('--out');
    if (!out) throw new Error('--target memory needs --out <dump file>');
    assertOutsideRepo(out);
    const state = new MemoryState();
    target = memoryTarget(state);
    after = () => writeMemoryDump(state, out);
  } else if (kind === 'emulator') {
    const project = args.values.get('--project');
    if (!project || !isEmulatorProject(project))
      throw new Error('--target emulator needs --project demo-… (an import never writes to a real project)');
    pointAtEmulator();
    const { firestoreTarget, openFirestore } = await import('@/server/infra/firestore/canonical');
    target = firestoreTarget(await openFirestore(project, 'emulator'));
  } else {
    throw new Error('--target memory|emulator');
  }
  const counts = await load(await exportSource(from), target);
  await after();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`${total} rows imported into ${target.kind}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

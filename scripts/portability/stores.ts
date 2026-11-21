/**
 * Opening the stores the portability scripts read and write. Never a
 * production default: a Firestore is named with `--project`, a project that
 * isn't an emulator one (`demo-…`) is refused unless `--i-am-the-owner` is
 * given — and then a warning is printed: the owner runs that, never CI, never
 * an agent. An import never writes anywhere but memory or the emulator.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { deserialize, serialize } from 'node:v8';
import { MemoryState, type Row } from '@/server/infra/memory/state';
import { memorySource } from '@/server/infra/memory/canonical';
import type { EntitySource } from '@/server/ports/portability';
import { exportSource } from './format';

export const isEmulatorProject = (project: string) => /^demo-[a-z0-9-]+$/.test(project);

export interface Args {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
}

const VALUED = new Set(['--project', '--out', '--memory-dump', '--from', '--target', '--objects-dir', '--a', '--b']);

export function parseArgs(argv: readonly string[]): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUED.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      values.set(a, v);
    } else if (a.startsWith('--')) flags.add(a);
    else positional.push(a);
  }
  return { flags, values, positional };
}

/**
 * Whether the project may be touched: an emulator project always; any other only for the owner, with a
 * warning on stderr. Throws otherwise.
 */
export function checkProject(
  project: string | undefined,
  owner: boolean,
  warn: (line: string) => void = (l) => console.error(l),
): { project: string; mode: 'emulator' | 'owner' } {
  if (!project) throw new Error('--project is required (there is no default project)');
  if (isEmulatorProject(project)) return { project, mode: 'emulator' };
  if (!owner) throw new Error(`${project} is not an emulator project (demo-…): refused. Only the owner reads a real project, with --i-am-the-owner`);
  warn(
    `WARNING: reading the real project ${project}. The export holds every anonymous card's author, every private message and every report: ` +
      'write it only to the owner’s encrypted storage, never into the repository, never as a CI artifact.',
  );
  return { project, mode: 'owner' };
}

/** Points the Admin SDK at this session's emulator (EMULATOR_FIRESTORE_PORT, else firebase.json's 8080). */
export function pointAtEmulator(): void {
  process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${process.env.EMULATOR_FIRESTORE_PORT || '8080'}`;
}

/** A memory state as a file: v8's structured serialisation, so Dates and bytes survive. */
export async function writeMemoryDump(state: MemoryState, file: string): Promise<void> {
  await writeFile(file, serialize(state.dump()));
}

export async function readMemoryDump(file: string): Promise<MemoryState> {
  const tables = deserialize(await readFile(file)) as Record<string, Record<string, Row>>;
  const state = new MemoryState();
  for (const [table, rows] of Object.entries(tables)) state.seed(table, rows);
  return state;
}

/**
 * A source named on the command line (`prefix` lets parity name two): `--memory-dump <file>`,
 * `--from <export dir>`, or `--emulator --project <demo-…>` (`--i-am-the-owner --project <real>`: the owner).
 */
export async function openSource(args: Args): Promise<{ source: EntitySource; project: string | null }> {
  const lenient = args.flags.has('--lenient');
  if (args.values.has('--memory-dump'))
    return {
      source: memorySource(await readMemoryDump(args.values.get('--memory-dump')!), { lenient }),
      project: null,
    };
  if (args.values.has('--from'))
    return {
      source: await exportSource(args.values.get('--from')!),
      project: null,
    };
  const owner = args.flags.has('--i-am-the-owner');
  if (!args.flags.has('--emulator') && !owner)
    throw new Error('Name a source: --emulator --project demo-…, --memory-dump <file> or --from <export dir>');
  const { project, mode } = checkProject(args.values.get('--project'), owner);
  if (mode === 'emulator') pointAtEmulator();
  else if (args.flags.has('--emulator')) throw new Error('--emulator reads only an emulator project (demo-…)');
  if (mode === 'owner') await import('dotenv/config');
  const { firestoreSource, openFirestore } = await import('@/server/infra/firestore/canonical');
  return {
    source: firestoreSource(await openFirestore(project, mode), {
      lenient,
      kind: mode === 'emulator' ? 'emulator' : 'firestore',
    }),
    project,
  };
}

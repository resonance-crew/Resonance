import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { memoryObjectStore } from '@/server/infra/memory/objects';
import { memorySource, memoryTarget } from '@/server/infra/memory/canonical';
import { MemoryState } from '@/server/infra/memory/state';
import { formatParity, parity } from './diff';
import { assertOutsideRepo, exportFiles, exportSource, readManifest, REPO_ROOT, writeExport } from './format';
import { load } from './load';
import { checkRepo, riskyArtifactUploads, trackedExportFiles } from './repoCheck';
import { checkProject, readMemoryDump, writeMemoryDump } from './stores';

// The export, the import and the parity check on memory (the emulator's
// round trip: test/emulator/portability.roundtrip.emulator.test.ts), and the
// checks that keep an export out of the repository.

const dirs: string[] = [];
const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portability-unit-'));
  dirs.push(dir);
  return dir;
};
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

const AUTHOR = 'u-anon-author-91x';

function world(): MemoryState {
  const state = new MemoryState();
  state.seed('users', { [AUTHOR]: { handle: 'Quiet', joinedAt: new Date('2026-01-02T03:04:05.006Z'), hintsSeen: { map: 2 } } });
  state.seed('cards', {
    c1: { authorId: AUTHOR, anonymous: true, visibility: 'public', publishedAt: '2026-11-20T01:02:03.456789Z', story: 'a secret story' },
    c2: { authorId: 'u-bob', anonymous: false, visibility: 'public', publishedAt: '2026-11-20T01:02:04.000000Z', tags: ['x'] },
  });
  state.seed('cards/c1/edits', { current: { authorId: AUTHOR, story: 'next', rev: 2 } });
  state.seed('conversations', { 'u-a_u-b': { participants: ['u-a', 'u-b'], unread: { 'u-a': 1 }, createdAt: '2026-11-20T00:00:00.000001Z' } });
  state.seed('conversations/u-a_u-b/messages', { m1: { senderId: 'u-a', text: 'hi', sentAt: '2026-11-20T00:00:00.000002Z', reactions: { 'u-b': 'heart' } } });
  state.seed(`resonanceTaps`, { [`c1_${AUTHOR}`]: { cardId: 'c1', userId: AUTHOR, on: true, at: '2026-11-20T05:00:00.000000Z' } });
  state.seed('cardVectors', { 'c1__insight__0': { cardId: 'c1', authorId: AUTHOR, vector: [0.5, 0.25], embedModel: 'text-embedding-3-small', part: 0 } });
  return state;
}

async function bytes(dir: string) {
  const files = await exportFiles(dir);
  return Object.fromEntries(await Promise.all(files.filter((f) => f !== 'manifest.json').map(async (f) => [f, (await readFile(join(dir, f))).toString('base64')])));
}

const comparable = ({ startedAt: _s, finishedAt: _f, source: _src, project: _p, ...rest }: Awaited<ReturnType<typeof readManifest>>) => rest;

describe('an export, imported into memory and exported again', () => {
  it('is the same, byte for byte, file by file', async () => {
    const objects = memoryObjectStore();
    await objects.putObject('image/u/a.webp', 'image/webp', new Uint8Array([1, 2, 3]));
    const out = await scratch();
    const first = await writeExport({ source: memorySource(world()), out, objects: { public: objects }, now: () => new Date('2026-11-21T00:00:00Z') });
    const state = new MemoryState();
    await load(await exportSource(first.dir), memoryTarget(state), 2);
    // Through a dump file too, as `import.ts --target memory` and `export.ts --memory-dump` hand it on.
    const file = join(await scratch(), 'state.memdump');
    await writeMemoryDump(state, file);
    const second = await writeExport({ source: memorySource(await readMemoryDump(file)), out, objects: { public: objects }, now: () => new Date('2026-11-21T00:00:01Z') });

    expect(second.dir).not.toBe(first.dir);
    expect(await bytes(second.dir)).toEqual(await bytes(first.dir));
    expect(comparable(await readManifest(second.dir))).toEqual(comparable(await readManifest(first.dir)));
    const manifest = await readManifest(first.dir);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.entities.cards.rows).toBe(2);
    expect(manifest.entities.edits.rows).toBe(1);
    expect(manifest.objects.public).toMatchObject({ listed: true, objects: 1 });
    expect(Object.keys(manifest.schemaVersions)).toHaveLength(47);
    // The rows sorted by id, one canonical text each.
    const rows = [];
    for await (const r of (await exportSource(first.dir)).read('cards')) rows.push(r.row._id);
    expect(rows).toEqual(['c1', 'c2']);
    // The memory state imported holds what the repos hold: ordering times as Instants, the others as Dates.
    expect(state.get('cards', 'c1')?.publishedAt).toBe('2026-11-20T01:02:03.456789Z');
    expect(state.get('users', AUTHOR)?.joinedAt).toEqual(new Date('2026-01-02T03:04:05.006Z'));
    expect(state.get('cards/c1/edits', 'current')?.rev).toBe(2);
  });

  it('refuses a file changed after the export', async () => {
    const { dir, manifest } = await writeExport({ source: memorySource(world()), out: await scratch(), zstd: false });
    const path = join(dir, 'entities', 'cards', manifest.entities.cards.files[0].name);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, (await readFile(path, 'utf8')).replace('a secret story', 'another story'));
    await expect(load(await exportSource(dir), memoryTarget(new MemoryState()))).rejects.toThrow(/manifest hash/);
  });

  it('splits an entity into files of at most the limit', async () => {
    const { manifest } = await writeExport({ source: memorySource(world()), out: await scratch(), maxRowsPerFile: 1 });
    expect(manifest.entities.cards.files.map((f) => f.name)).toEqual(['000001.ndjson.zst', '000002.ndjson.zst']);
  });
});

describe('parity', () => {
  it('finds nothing between a store and its export', async () => {
    const state = world();
    const { dir } = await writeExport({ source: memorySource(state), out: await scratch() });
    const report = await parity(await exportSource(dir), memorySource(state));
    expect(report.same).toBe(true);
    expect(formatParity(report)).toEqual(['parity: same']);
  });

  it('names a changed row by its id hash and field paths, never a value, an id or a uid key', async () => {
    const a = world();
    const b = world();
    b.merge('cards', 'c1', { authorId: 'u-someone-else', story: 'rewritten words' });
    b.merge('conversations', 'u-a_u-b', { unread: { 'u-a': 0 } });
    b.delete('resonanceTaps', `c1_${AUTHOR}`);
    const report = await parity(memorySource(a), memorySource(b));
    expect(report.same).toBe(false);
    const cards = report.entities.find((e) => e.entity === 'cards')!;
    expect(cards.diffs).toEqual([{ idHash: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'changed', paths: ['authorId', 'story'] }]);
    const convo = report.entities.find((e) => e.entity === 'conversations')!;
    expect(convo.diffs[0].paths).toEqual([expect.stringMatching(/^unread\.#[0-9a-f]{8}$/)]);
    expect(report.entities.find((e) => e.entity === 'resonanceTaps')!.diffs[0].kind).toBe('only-a');
    const text = formatParity(report).join('\n');
    for (const secret of [AUTHOR, 'u-someone-else', 'a secret story', 'rewritten words', 'u-a']) expect(text).not.toContain(secret);
  });
});

describe('never in the repository', () => {
  it('refuses to write an export inside it', async () => {
    expect(() => assertOutsideRepo(join(REPO_ROOT, 'tmp-exports'))).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo(REPO_ROOT)).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo(tmpdir())).not.toThrow();
    await expect(writeExport({ source: memorySource(world()), out: join(REPO_ROOT, 'exports') })).rejects.toThrow(/inside the repository/);
  });

  it('tracks no file shaped like an export, and no workflow uploads one', () => {
    expect(checkRepo()).toEqual({ exportFiles: [], uploads: [] });
  });

  it('would see one', () => {
    const files = ['export-20261121T000000Z-emulator/manifest.json', 'x/entities/cards/000001.ndjson.zst', 'objects/chat.ndjson', 'designs/a/manifest.json', 'b/manifest.json'];
    const read = (p: string) => (p === 'b/manifest.json' ? '{ "schemaVersions": {} }' : '{"parts": []}');
    expect(trackedExportFiles(files, read)).toEqual(['export-20261121T000000Z-emulator/manifest.json', 'x/entities/cards/000001.ndjson.zst', 'objects/chat.ndjson', 'b/manifest.json']);
    const workflow = 'steps:\n  - uses: actions/upload-artifact@v4\n    with:\n      path: ${{ runner.temp }}/resonance-exports\n';
    expect(riskyArtifactUploads([{ name: 'w.yml', text: workflow }])).toEqual(['w.yml:2']);
  });
});

describe('never production by default', () => {
  it('needs a project, refuses a real one, and warns the owner', () => {
    expect(() => checkProject(undefined, false)).toThrow(/required/);
    expect(checkProject('demo-resonance', false)).toEqual({ project: 'demo-resonance', mode: 'emulator' });
    expect(() => checkProject('resonance-stories', false)).toThrow(/refused/);
    const warnings: string[] = [];
    expect(checkProject('resonance-stories', true, (l) => warnings.push(l)).mode).toBe('owner');
    expect(warnings[0]).toMatch(/^WARNING/);
  });
});

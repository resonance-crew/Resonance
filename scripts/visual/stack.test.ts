import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('./util', async (importOriginal) => ({ ...(await importOriginal<typeof import('./util')>()), run: (...a: unknown[]) => run(...a), sleep: async () => {} }));

const { devServerEnv, seed, startSeeder, SeederGone } = await import('./stack');

describe('seed', () => {
  beforeEach(() => {
    run.mockClear();
    run.mockImplementation(() => '');
  });

  it('seeds once more when the emulator cancels a write, and goes on', async () => {
    let calls = 0;
    const once = async () => {
      if (++calls === 1) throw Object.assign(new Error('the seed failed'), { stderr: 'Error: 1 CANCELLED: call already cancelled.\n    at …' });
    };
    const lines: string[] = [];
    await seed((l) => lines.push(l), 2, 0, once);
    expect(calls).toBe(2);
    expect(lines).toEqual([
      'Seeding the test world (scripts/seed-emulator.ts)…',
      '  the seed failed (Error: 1 CANCELLED: call already cancelled.): once more',
      'Seeding the test world again…',
    ]);
  });

  it('stops the run when the seed fails twice', async () => {
    let calls = 0;
    const once = async () => {
      calls++;
      throw new Error('Command failed: npx tsx scripts/seed-emulator.ts');
    };
    await expect(seed(() => {}, 2, 0, once)).rejects.toThrow('Command failed');
    expect(calls).toBe(2);
  });

  it('seeds in a process of its own, with the stack’s seed environment, when the kept-loaded seeder is off', async () => {
    const was = process.env.VISUAL_SEED_RESIDENT;
    process.env.VISUAL_SEED_RESIDENT = '0';
    try {
      await seed(() => {});
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0].slice(0, 2)).toEqual(['npx', ['tsx', 'scripts/seed-emulator.ts']]);
      expect(run.mock.calls[0][2]).toMatchObject({ SEED_RESET: '1', SEED_PICKS: 'none' });
    } finally {
      if (was == null) delete process.env.VISUAL_SEED_RESIDENT;
      else process.env.VISUAL_SEED_RESIDENT = was;
    }
  });
});

describe('the kept-loaded seeder', () => {
  /** A stand-in for seedServer.ts: answers each `seed` line as `answer` says. */
  function fakeServer(answer: (n: number) => string | null) {
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: (s?: string) => boolean };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let n = 0;
    child.kill = () => (child.emit('exit', null), true);
    child.stdin.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        if (line !== 'seed') continue;
        const said = answer(++n);
        // The seed's own words come first, then the answer.
        if (said != null) setTimeout(() => child.stdout.write(`Seeded 4 users into demo-resonance.\n${said}\n`), 1);
      }
    });
    return child as unknown as ChildProcessWithoutNullStreams;
  }

  it('answers each seed in turn, a failed one as an error the retry sees, its own words passed over', async () => {
    const seeder = startSeeder(() => fakeServer((n) => (n === 2 ? 'error "1 CANCELLED"' : 'ok')));
    await seeder.seed();
    await expect(seeder.seed()).rejects.toThrow('the seed failed: "1 CANCELLED"');
    await seeder.seed();
    seeder.stop();
  });

  it('says it is gone — not the world’s fault — when the server stops or never answers', async () => {
    const quiet = startSeeder(() => fakeServer(() => null), 30);
    await expect(quiet.seed()).rejects.toBeInstanceOf(SeederGone);
    const stopped = startSeeder(() => fakeServer(() => 'ok'));
    stopped.stop();
    await expect(stopped.seed()).rejects.toBeInstanceOf(SeederGone);
  });
});

describe('the stack’s dev server keeps what it compiled', () => {
  it('asks for every page kept (VISUAL_KEEP_PAGES), beside its own build folder and tsconfig', () => {
    expect(devServerEnv('.next-visual/3150', '.next-visual/tsconfig.3150.json')).toMatchObject({
      NEXT_DIST_DIR: '.next-visual/3150',
      NEXT_TSCONFIG_PATH: '.next-visual/tsconfig.3150.json',
      VISUAL_KEEP_PAGES: '1',
    });
  });

  it('only that stack keeps every page: next.config sets onDemandEntries under VISUAL_KEEP_PAGES and never otherwise', async () => {
    const load = async (keep: string | undefined) => {
      vi.resetModules();
      if (keep == null) delete process.env.VISUAL_KEEP_PAGES;
      else process.env.VISUAL_KEEP_PAGES = keep;
      try {
        return (await import('../../next.config')).default as { onDemandEntries?: { maxInactiveAge: number; pagesBufferLength: number } };
      } finally {
        delete process.env.VISUAL_KEEP_PAGES;
      }
    };
    expect((await load(undefined)).onDemandEntries).toBeUndefined();
    expect((await load('0')).onDemandEntries).toBeUndefined();
    const kept = (await load('1')).onDemandEntries!;
    // Longer than any run (a release with its flows takes about two hours), more pages than the app has.
    expect(kept.maxInactiveAge).toBeGreaterThanOrEqual(6 * 3600_000);
    expect(kept.pagesBufferLength).toBeGreaterThanOrEqual(200);
  });
});

describe('the emulators’ Java keeps to a heap of its own', () => {
  it('caps the Firestore emulator’s heap (VISUAL_FIRESTORE_HEAP, default 1g) with the serial collector, keeping any JAVA_TOOL_OPTIONS already set', async () => {
    const { emulatorsEnv } = await import('./stack');
    const was = { heap: process.env.VISUAL_FIRESTORE_HEAP, tool: process.env.JAVA_TOOL_OPTIONS };
    try {
      delete process.env.VISUAL_FIRESTORE_HEAP;
      delete process.env.JAVA_TOOL_OPTIONS;
      expect(emulatorsEnv()).toMatchObject({ JAVA_TOOL_OPTIONS: '-Xmx1g -XX:+UseSerialGC', EMULATOR_FIRESTORE_PORT: expect.any(String) });
      process.env.VISUAL_FIRESTORE_HEAP = '768m';
      process.env.JAVA_TOOL_OPTIONS = '-Dfoo=1';
      expect(emulatorsEnv().JAVA_TOOL_OPTIONS).toBe('-Dfoo=1 -Xmx768m -XX:+UseSerialGC');
    } finally {
      for (const [k, v] of [['VISUAL_FIRESTORE_HEAP', was.heap], ['JAVA_TOOL_OPTIONS', was.tool]] as const) {
        if (v == null) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

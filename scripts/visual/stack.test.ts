import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('./util', async (importOriginal) => ({ ...(await importOriginal<typeof import('./util')>()), run: (...a: unknown[]) => run(...a), sleep: async () => {} }));

const { devServerEnv, seed } = await import('./stack');

describe('seed', () => {
  beforeEach(() => {
    run.mockClear();
    run.mockImplementation(() => '');
  });

  it('runs the seed once more when the emulator cancels a write, and goes on', async () => {
    run.mockImplementationOnce(() => {
      throw Object.assign(new Error('Command failed: npx tsx scripts/seed-emulator.ts'), { stderr: 'Error: 1 CANCELLED: call already cancelled.\n    at …' });
    });
    const lines: string[] = [];
    await seed((l) => lines.push(l));
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][2]).toMatchObject({ SEED_RESET: '1', SEED_PICKS: 'none' });
    expect(lines).toEqual([
      'Seeding the test world (scripts/seed-emulator.ts)…',
      '  the seed failed (Error: 1 CANCELLED: call already cancelled.): once more',
      'Seeding the test world again…',
    ]);
  });

  it('stops the run when the seed fails twice', async () => {
    run.mockImplementation(() => {
      throw new Error('Command failed: npx tsx scripts/seed-emulator.ts');
    });
    let stopped: unknown;
    try {
      await seed(() => {});
    } catch (error) {
      stopped = error;
    }
    expect(String(stopped)).toContain('Command failed');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('seeds once when the first seed works', async () => {
    await seed(() => {});
    expect(run).toHaveBeenCalledTimes(1);
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('./util', async (importOriginal) => ({ ...(await importOriginal<typeof import('./util')>()), run: (...a: unknown[]) => run(...a), sleep: async () => {} }));

const { seed } = await import('./stack');

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

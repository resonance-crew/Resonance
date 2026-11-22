import { describe, expect, it } from 'vitest';
import { withRestart } from './retry';
import { CommandTimeout, execTimed, run } from './util';

describe('a device command that never answers', () => {
  it('is stopped once its time runs out, as a CommandTimeout (async and blocking alike)', async () => {
    const started = Date.now();
    await expect(execTimed('sleep', ['30'], { timeoutMs: 200 })).rejects.toBeInstanceOf(CommandTimeout);
    expect(() => run('sleep', ['30'], {}, 200)).toThrow(CommandTimeout);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('answers as before when it finishes in time, and fails as before when it fails', async () => {
    expect(String((await execTimed('echo', ['hi'], { timeoutMs: 5000 })).stdout).trim()).toBe('hi');
    await expect(execTimed('false', [], { timeoutMs: 5000 })).rejects.not.toBeInstanceOf(CommandTimeout);
  });

  it('is tried once more after its device is restarted, and only a timeout is', async () => {
    const said: string[] = [];
    let calls = 0;
    let restarts = 0;
    const answer = await withRestart(
      'Visual iPhone',
      async () => {
        if (++calls === 1) throw new CommandTimeout('simctl bootstatus', 300_000);
        return 'booted';
      },
      () => {
        restarts++;
      },
      { log: (l) => said.push(l) },
    );
    expect([answer, calls, restarts]).toEqual(['booted', 2, 1]);
    expect(said[0]).toMatch(/Visual iPhone: simctl bootstatus gave no answer within 300 s.*restarting it and trying again \(2 of 2\)/);

    // A second timeout ends it; a failure that isn't one never restarts anything.
    await expect(withRestart('x', async () => Promise.reject(new CommandTimeout('adb', 1000)), () => {}, { log: () => {} })).rejects.toBeInstanceOf(CommandTimeout);
    let restarted = false;
    await expect(withRestart('x', async () => Promise.reject(new Error('no such AVD')), () => void (restarted = true), { log: () => {} })).rejects.toThrow('no such AVD');
    expect(restarted).toBe(false);
  });
});

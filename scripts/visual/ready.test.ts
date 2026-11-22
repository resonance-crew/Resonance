import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { logSays, logStream, readyNote, readyToken, restOfWait, waitReady } from './ready';

const dir = mkdtempSync(join(tmpdir(), 'visual-ready-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A clock that moves only when slept on. */
function clock() {
  let t = 0;
  const slept: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (slept.push(ms), (t += ms)), slept };
}

describe('the apps’ ready signal', () => {
  it('goes on as soon as the app says it, and says how long that took', async () => {
    const c = clock();
    let polls = 0;
    const ready = await waitReady(() => ++polls === 4, { now: c.now, sleep: c.sleep, intervalMs: 250, timeoutMs: 12_000 });
    expect(ready).toEqual({ ready: true, waitedMs: 750 });
    // The rest of the old wait is not waited.
    const after = clock();
    await restOfWait(ready, 4000, after.sleep);
    expect(after.slept).toEqual([]);
    expect(readyNote(ready)).toBe('  (ready in 0.8 s)');
  });

  it('gives up after its time, and then never waits less than the old fixed wait', async () => {
    const c = clock();
    const none = await waitReady(() => false, { now: c.now, sleep: c.sleep, intervalMs: 500, timeoutMs: 2000 });
    expect(none).toEqual({ ready: false, waitedMs: 2000 });
    const after = clock();
    await restOfWait(none, 8000, after.sleep);
    expect(after.slept).toEqual([6000]);
    // Waited longer than the old wait already: nothing more.
    const longer = clock();
    await restOfWait({ ready: false, waitedMs: 12_000 }, 4000, longer.sleep);
    expect(longer.slept).toEqual([]);
    expect(readyNote(none)).toBe('  (no ready signal: waited as before)');
    expect(readyNote(null)).toBe('');
  });

  it('counts only this launch’s own word, in logcat’s raw lines or the unified log’s compact ones', () => {
    const a = readyToken();
    const b = readyToken();
    expect(a).not.toBe(b);
    expect(logSays(`ready ${b}\n`, a)).toBe(false);
    expect(logSays(`ready ${b}\nready ${a}\n`, a)).toBe(true);
    expect(logSays(`ready ${a}-2\n`, a)).toBe(false);
    const compact = `2026-11-22 17:40:01.123 Df Resonance[4242:1a2b] [com.resonance.visual:ready] ready ${a}`;
    expect(logSays(`Filtering the log data using "subsystem == ..."\n${compact}\n`, a)).toBe(true);
    expect(logSays(compact.replace(a, b), a)).toBe(false);
  });

  it('reads a stream as it comes, and stops the process it started', async () => {
    const token = readyToken();
    const stream = await logStream('sh', ['-c', `echo started; sleep 0.2; echo "x [com.resonance.visual:ready] ready ${token}"; sleep 30`]);
    expect(stream.says(token)).toBe(false);
    const ready = await waitReady(() => stream.says(token), { timeoutMs: 5000, intervalMs: 50 });
    expect(ready.ready).toBe(true);
    stream.stop();
  });
});

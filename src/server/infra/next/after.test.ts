import { afterEach, describe, expect, it, vi } from 'vitest';

const scheduled: (() => Promise<void>)[] = [];
let inRequest = true;
vi.mock('next/server', () => ({
  after: (fn: () => Promise<void>) => {
    if (!inRequest) throw new Error('`after` was called outside a request scope');
    scheduled.push(fn);
  },
}));

const { nextAfter } = await import('./after');

describe('nextAfter().soon', () => {
  afterEach(() => {
    scheduled.length = 0;
    inRequest = true;
  });

  it('inside a request: answers at once and runs the work after the response', async () => {
    const done: string[] = [];
    await nextAfter().soon(() => done.push('touched'), 'signals');
    expect(done).toEqual([]);
    await scheduled[0]();
    expect(done).toEqual(['touched']);
  });

  it('with no request to answer (a script, a test): runs now, awaited', async () => {
    inRequest = false;
    const done: string[] = [];
    await nextAfter().soon(async () => void done.push('touched'), 'signals');
    expect(done).toEqual(['touched']);
  });

  it('never rejects: a failure is logged under its label', async () => {
    inRequest = false;
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    await expect(nextAfter(log as never).soon(() => Promise.reject(new Error('down')), 'signals')).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith('[signals]', expect.any(Error));
  });
});

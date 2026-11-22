import { describe, expect, it } from 'vitest';
import { launchArgs } from './ios';
import { PORTS, type CaptureContext } from './util';

const ctx = { ports: PORTS } as CaptureContext;
const light = { theme: 'light', locale: 'zh-TW' } as const;

describe('the iOS and Mac launch arguments', () => {
  it('start every launch with no notification-asks memory, as Android’s pm clear does', () => {
    // Kept on the simulator, the card pages earlier captures opened made home's picks invite come and go between runs.
    for (const args of [launchArgs(ctx, 'alice', '/home', light), launchArgs(ctx, null, null, light), launchArgs(ctx, 'bob', '/card/x', light, ['-visualEnd', 'YES'])]) {
      const at = args.indexOf('-visualFreshAsks');
      expect(at, args.join(' ')).toBeGreaterThan(-1);
      expect(args[at + 1]).toBe('YES');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { inXcodeLine } from './ios';
import { PHASES, buildOrder } from './phases';

describe('the apps’ builds start in the order their phases come', () => {
  it('puts the Mac’s build (first phase) ahead of the simulator’s (last phase), whatever order the platforms were named in', () => {
    expect(PHASES).toEqual([['web', 'mac'], ['android'], ['ios']]);
    expect(buildOrder(['ios', 'android', 'mac', 'web'])).toEqual(['mac', 'android', 'ios']);
    expect(buildOrder(['ios', 'mac'])).toEqual(['mac', 'ios']);
    expect(buildOrder(['web'])).toEqual([]);
  });

  it('the Xcode line builds in the order it was joined, one at a time, a failed build not holding up the next', async () => {
    const done: string[] = [];
    let running = 0;
    const build = (name: string, fail = false) =>
      inXcodeLine(async () => {
        running++;
        expect(running).toBe(1);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        done.push(name);
        if (fail) throw new Error(`${name} failed`);
      });
    const results = await Promise.allSettled(buildOrder(['ios', 'mac']).map((p) => build(p, p === 'mac')));
    expect(done).toEqual(['mac', 'ios']);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });
});

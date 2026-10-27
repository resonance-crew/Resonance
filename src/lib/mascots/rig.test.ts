import { describe, expect, it } from 'vitest';
import raw from './stageFixture.json';
import { readManifest, rigInfo } from './rig';

const copy = (m: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(m));

describe('mascot manifests', () => {
  it('reads the kit’s manifests with what the stage build adds', () => {
    const tuck = rigInfo(readManifest(raw.tuck));
    const tag = rigInfo(readManifest(raw.tag));
    const dot = readManifest(raw.dot);
    // the torso's pointer shape, as fractions of its box
    expect(tuck.torso.hit).toHaveLength(32);
    expect(tuck.torso.hit?.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
    // 摺摺's dog-ear is a small secret a mitten lifts; 牽牽's back is the whole sheet, and hides its face
    expect(tuck.revealAt).toEqual([440, 346.2]);
    expect(tag.revealAt).toBeNull();
    expect(tag.hides.get('torso-alt')).toEqual(['face', 'arm-l', 'arm-r', 'deco']);
    expect(dot.walk).toBe('hop');
    // arms by where their brads are, each resting at its drawn angle
    expect(tuck.arms.L.name).toBe('arm-l');
    expect(tuck.arms.R.rest).toBeCloseTo(90 - 58);
  });

  it('refuses what the engine could not draw', () => {
    const broken: [string, (m: Record<string, unknown>) => void][] = [
      ['no torso', m => {
        m.parts = (m.parts as { name: string }[]).filter(p => p.name !== 'torso');
      }],
      ['a part on no known layer', m => {
        (m.parts as Record<string, unknown>[])[1].parent = 'head';
      }],
      ['a pivot that is not a point', m => {
        (m.parts as Record<string, unknown>[])[1].pivot = [1];
      }],
      ['a theme that does not exist', m => {
        (m.parts as Record<string, unknown>[])[1].only = 'dusk';
      }],
      ['a gait that does not exist', m => {
        m.walk = 'run';
      }],
      ['no ground point', m => {
        delete m.ground;
      }],
    ];
    for (const [what, breakIt] of broken) {
      const m = copy(raw.tuck);
      breakIt(m);
      expect(() => readManifest(m), what).toThrow(/mascot manifest/);
    }
    expect(() => readManifest('tuck')).toThrow(/mascot manifest/);
  });
});

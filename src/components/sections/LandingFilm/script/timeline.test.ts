import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FILM_END, SCENES, SEG, SEGMENTS, TRACK_SVH, changeAt, sOfY, sceneAtS, segmentAtS, segmentAtY, yOfS } from './timeline';

describe('the film timeline', () => {
  // round 3 (the owner: slower, with room to breathe): 67.3 s along an 805 svh track, each change 100 svh
  it('lays its thirteen segments end to end, in film time and along an 805 svh track', () => {
    expect(SEGMENTS).toHaveLength(13);
    expect(TRACK_SVH).toBe(805);
    expect(FILM_END).toBe(67.3);
    for (const seg of SEGMENTS) if (seg.kind === 'change') {
      expect(seg.svh, seg.id).toBe(100);
      expect(seg.dur, seg.id).toBeGreaterThanOrEqual(3);
      expect(seg.dur, seg.id).toBeLessThanOrEqual(3.5);
    }
    // the page is as long as the track (and the screen the stage lets go of)
    expect(readFileSync(join(__dirname, '../film.module.css'), 'utf8')).toContain(`height: calc(${TRACK_SVH}svh + 100lvh);`);
    for (let i = 1; i < SEGMENTS.length; i++) {
      expect(SEGMENTS[i].t0).toBe(SEGMENTS[i - 1].t1);
      expect(SEGMENTS[i].y0).toBe(SEGMENTS[i - 1].y1);
    }
    expect(SEGMENTS.map((s) => s.kind).join(',')).toBe('act,travel,change,travel,act,act,act,change,travel,act,change,act,hold');
  });

  it('maps y to s and back (the hold keeps the film at its end)', () => {
    for (let s = 0; s <= FILM_END; s += 0.25) expect(sOfY(yOfS(s))).toBeCloseTo(s, 6);
    for (let y = 0; y < SEG.rest.y0; y += 3.7) expect(yOfS(sOfY(y))).toBeCloseTo(y, 6);
    expect(sOfY(SEG.rest.y0 + 10)).toBe(FILM_END);
    expect(sOfY(TRACK_SVH)).toBe(FILM_END);
    expect(sOfY(-20)).toBe(0);
  });

  it('marks the four scenes where ⏮ ⏭ and the hash go', () => {
    expect(SCENES.map((s) => [s.hash, s.y0])).toEqual([
      ['write', 0],
      ['answer', 180],
      ['meet', 500],
      ['yours', 705],
    ]);
    expect(sceneAtS(15.5).n).toBe(1);
    expect(sceneAtS(15.6).n).toBe(2);
    expect(sceneAtS(43).n).toBe(3);
    expect(sceneAtS(FILM_END).n).toBe(4);
  });

  it('finds the segment of a time and a place, and the changes', () => {
    expect(segmentAtS(0).id).toBe('write');
    expect(segmentAtS(9.4).id).toBe('wind');
    expect(segmentAtS(FILM_END).id).toBe('rest');
    expect(segmentAtY(81).id).toBe('c1');
    expect(changeAt(14)).toMatchObject({ from: 1, to: 2, p: 0.5 });
    expect(changeAt(40.7)).toMatchObject({ from: 2, to: 3 });
    expect(changeAt(56.4)?.to).toBe(4);
    expect(changeAt(17)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { SEG } from '../script/timeline';
import { FilmClock, floorOf, ownerOf, stepAct } from './clock';

const write = SEG.write;
const read = SEG.read;

describe('the act clocks', () => {
  it('play at 1× once the scroll has reached them, never behind the scroll', () => {
    expect(stepAct(read, 0, read.t0, 0.1, false)).toBeCloseTo(0.1);
    expect(stepAct(read, 0.5, read.t0 + 2, 0.1, false)).toBeCloseTo(2); // the floor wins
    expect(stepAct(read, read.dur, read.t1 + 5, 0.1, false)).toBe(read.dur);
    expect(stepAct(read, read.dur - 0.01, read.t0, 0.1, false)).toBe(read.dur);
  });

  it('rewind at 3× when scrolled back above, and are a pure scrub while resting', () => {
    expect(stepAct(read, 1, read.t0 - 1, 0.1, false)).toBeCloseTo(0.7);
    expect(stepAct(read, 0.1, read.t0 - 1, 0.1, false)).toBe(0);
    expect(stepAct(read, 3, read.t0 + 1, 0.1, true)).toBeCloseTo(floorOf(read, read.t0 + 1));
  });

  it('the opening act plays on load, at s = 0', () => {
    const c = new FilmClock();
    for (let i = 0; i < 30; i++) c.tick(0, 0.1);
    expect(c.acts.get(write.index)).toBeCloseTo(3);
    expect(c.state().acting).toBe(true);
    for (let i = 0; i < Math.ceil(write.dur * 10); i++) c.tick(0, 0.1);
    expect(c.acts.get(write.index)).toBe(write.dur);
    expect(c.state().acting).toBe(false);
  });

  it('jumps set every act to its floor at the target (or done, for 略過)', () => {
    const c = new FilmClock();
    c.jump(read.t0 + 1.5);
    expect(c.s).toBe(read.t0 + 1.5);
    expect(c.acts.get(write.index)).toBe(write.dur);
    expect(c.acts.get(read.index)).toBeCloseTo(1.5);
    expect(c.acts.get(SEG.meet.index)).toBe(0);
    c.jump(SEG.rest.t0, { complete: true });
    for (const seg of [write, SEG.catch, read, SEG.reply, SEG.meet, SEG.yours]) expect(c.acts.get(seg.index)).toBe(seg.dur);
  });

  it('the scenery clock follows the scroll with a short lag, and exactly while driven', () => {
    const c = new FilmClock();
    c.tick(10, 0.016);
    expect(c.s).toBeGreaterThan(0);
    expect(c.s).toBeLessThan(10);
    for (let i = 0; i < 60; i++) c.tick(10, 0.016);
    expect(c.s).toBeCloseTo(10, 3);
    c.tick(12, 0.016, { driving: true });
    expect(c.s).toBe(12);
  });
});

// the engineering review, round 3 (WCAG 2.2.2): with ☾ gone, ❚❚ holds an act that plays on its own
describe('❚❚ during an act', () => {
  it('holds every act still — none plays on, none rewinds — while a scroll still scrubs it', () => {
    const c = new FilmClock();
    for (let i = 0; i < 20; i++) c.tick(0, 0.1);
    const A = c.acts.get(write.index)!;
    c.hold();
    expect(c.state().acting).toBe(false);
    for (let i = 0; i < 20; i++) c.tick(0, 0.1);
    expect(c.acts.get(write.index)).toBe(A);
    // a scroll past its floor carries it along (a scrub), never further
    const s = write.t0 + 0.9 * (write.t1 - write.t0);
    for (let i = 0; i < 60; i++) c.tick(s, 0.1);
    expect(c.acts.get(write.index)).toBeCloseTo(floorOf(write, c.s), 3);
    c.release();
    c.tick(s, 0.1);
    expect(c.acts.get(write.index)).toBeGreaterThan(floorOf(write, c.s));
  });

  it('lets the next act a scroll reaches play, as any act a scroll reaches does', () => {
    const c = new FilmClock();
    c.jump(write.t0 + 1);
    c.hold();
    c.jump(read.t0 + 0.2);
    c.tick(read.t0 + 0.2, 0.1);
    expect(c.held).toBe(false);
    expect(c.state().acting).toBe(true);
  });
});

describe('the owner rule', () => {
  it('is the latest segment the film has reached', () => {
    expect(ownerOf(0, new Map()).id).toBe('write');
    expect(ownerOf(SEG.journey.t0 + 1, new Map()).id).toBe('journey');
    expect(ownerOf(SEG.c2.t0 + 0.5, new Map()).id).toBe('c2');
    expect(ownerOf(SEG.rest.t0, new Map()).id).toBe('rest');
  });

  it('keeps a rewinding act as owner until its time is back at 0', () => {
    const acts = new Map([[SEG.catch.index, 0.8]]);
    expect(ownerOf(SEG.catch.t0 - 0.5, acts).id).toBe('catch');
    acts.set(SEG.catch.index, 0);
    expect(ownerOf(SEG.catch.t0 - 0.5, acts).id).toBe('journey');
  });

  it('never lets a far-off act own the stage while it rewinds after a long jump back', () => {
    const acts = new Map([[SEG.meet.index, 5.4]]);
    expect(ownerOf(0, acts).id).toBe('write');
    expect(ownerOf(SEG.c1.t0 + 1.6, acts).id).toBe('c1');
    // just above it, it still keeps its actors
    expect(ownerOf(SEG.meet.t0 - 0.3, acts).id).toBe('meet');
  });

  it('a clock scrolled back over an act rewinds it, keeping its actors meanwhile', () => {
    const c = new FilmClock();
    c.jump(SEG.catch.t0 + 1);
    c.tick(SEG.catch.t0 - 1, 0.1, { driving: true });
    expect(c.state().owner.id).toBe('catch');
    expect(c.state().acting).toBe(true);
    for (let i = 0; i < 10; i++) c.tick(SEG.catch.t0 - 1, 0.1, { driving: true });
    expect(c.state().owner.id).toBe('journey');
  });
});

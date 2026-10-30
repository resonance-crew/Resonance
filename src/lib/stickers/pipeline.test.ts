import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keys, snap, step } from '../../../designs/stickers/kit/timeline';
import {
  contentVersion, CREAM, dieCut, EDGE, frameDurations, heroFrame, phaseOrder, readWebp, sampleTimes, SIZE, SIZE_CAP, SIZE_TARGET,
  sizeVerdict, touchesEdge,
} from '../../../scripts/stickers/pipeline';
import { STICKER_PACKS } from './catalog';
import { STICKER_ART } from './catalog.generated';

const root = resolve(__dirname, '../../..');
const file = (pack: string, name: string) => resolve(root, `public/stickers/${pack}/${name}`);

describe('the sticker pipeline: time', () => {
  it('samples one play 12 times a second, the key pose at 0 and again (as the file’s last frame) at the end', () => {
    expect(sampleTimes(2)).toHaveLength(24);
    expect(sampleTimes(2)[0]).toBe(0);
    expect(sampleTimes(2)[23]).toBeCloseTo(23 / 12);
    expect(sampleTimes(1.5)).toHaveLength(18);
    expect(sampleTimes(2.25).every(t => t < 2.25)).toBe(true);
  });

  it('plays the loop from its hero: the file starts and ends on the hero frame (the thumb), the loop closing in between', () => {
    expect(heroFrame(1.0, 24)).toBe(12);
    expect(heroFrame(0.84, 24)).toBe(10);   // snapped to the nearest frame
    expect(heroFrame(2.0, 24)).toBe(0);   // the very end is the key pose's frame 0 again
    const order = phaseOrder(24, 12);
    expect(order).toHaveLength(24);
    expect(order[0]).toBe(12);
    expect(order[11]).toBe(23);
    expect(order[12]).toBe(0);   // through the key pose, where the loop closes…
    expect(order[23]).toBe(11);   // …and on to the frame before the hero (the file repeats the hero after it)
    expect(new Set(order).size).toBe(24);
    expect(phaseOrder(5, 0)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gives each frame whole milliseconds that never drift off the 12 fps grid', () => {
    const d = frameDurations(25);
    expect(new Set(d)).toEqual(new Set([83, 84]));
    let sum = 0;
    d.forEach((ms, i) => {
      sum += ms;
      expect(Math.abs(sum - ((i + 1) * 1000) / 12)).toBeLessThan(1);
    });
    expect(sum).toBe(2083);
  });

  it('holds the body on stop-motion poses (snap) and on fours (step)', () => {
    const poses = [0, 0.5, 0.75];
    expect(snap(0.3, poses)).toBe(0);
    expect(snap(0.5, poses)).toBe(0.5);
    expect(snap(0.74, poses)).toBe(0.5);
    expect(snap(2, poses)).toBe(0.75);
    expect(step(5 / 12)).toBeCloseTo(2 / 6);
    expect(step(4 / 12)).toBeCloseTo(4 / 12);
    expect(keys(0.5, [[0, 0], [1, 10, u => u]])).toBe(5);
    expect(keys(-1, [[0, 3], [1, 10]])).toBe(3);
  });
});

describe('the sticker pipeline: pictures and files', () => {
  it('cuts a cream margin round what is solid and clips what is faint beyond it', () => {
    const w = 21;
    const px = new Uint8Array(w * w * 4);
    const set = (x: number, y: number, rgba: [number, number, number, number]) => px.set(rgba, (y * w + x) * 4);
    for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) set(x, y, [20, 40, 60, 255]);
    set(1, 1, [0, 0, 0, 40]);   // a faint glue-shadow speck far from the paper
    const out = dieCut(px, w, w, { radius: 2.5 });
    const at = (x: number, y: number) => Array.from(out.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(at(10, 10)).toEqual([20, 40, 60, 255]);   // the art itself is untouched
    expect(at(14, 10)).toEqual([...CREAM, 255]);   // 2 px out: the margin, solid cream
    expect(at(14, 13)[3]).toBeGreaterThan(100);   // its rim (2.24 px out on the diagonal), anti-aliased
    expect(at(14, 13)[3]).toBeLessThan(255);
    expect(at(15, 10)[3]).toBe(0);   // 3 px out: past the margin, nothing
    expect(at(1, 1)[3]).toBe(0);   // the faint speck is clipped away
    expect(touchesEdge(out, w, w)).toBe(false);
    expect(touchesEdge(out, w, w, EDGE)).toBe(false);   // the margin ends 6 px from this little canvas's edge…
    expect(touchesEdge(out, w, w, EDGE + 1)).toBe(true);   // …so a 7 px rule would refuse it
    set(0, 10, [0, 0, 0, 255]);
    expect(touchesEdge(px, w, w)).toBe(true);
  });

  it('judges a file against the target and the cap', () => {
    expect(sizeVerdict(SIZE_TARGET)).toBe('ok');
    expect(sizeVerdict(SIZE_TARGET + 1)).toBe('over-target');
    expect(sizeVerdict(SIZE_CAP + 1)).toBe('over-cap');
  });

  it('every drawn sticker is a 432 px animation that plays twice, 1.5–2.5 s, within the cap, its thumb a 256 px still', () => {
    let drawn = 0;
    for (const p of STICKER_PACKS) {
      for (const st of p.stickers) {
        const anim = readFileSync(file(p.id, `${st.id}.webp`));
        const info = readWebp(anim);
        if (!info.animated) continue;   // a placeholder still, until its pack is drawn
        drawn++;
        const at = `${p.id}/${st.id}`;
        expect([info.width, info.height], at).toEqual([SIZE, SIZE]);
        expect(info.loop, at).toBe(2);
        expect(info.durationMs, at).toBeGreaterThanOrEqual(1500);
        expect(info.durationMs, at).toBeLessThanOrEqual(2600);
        expect(anim.length, at).toBeLessThanOrEqual(SIZE_CAP);
        const thumb = readWebp(readFileSync(file(p.id, `${st.id}.thumb.webp`)));
        expect([thumb.animated, thumb.width, thumb.height], at).toEqual([false, 256, 256]);
      }
    }
    expect(drawn).toBeGreaterThanOrEqual(6);
  });

  it('keeps catalog.generated.ts true to the files (npm run stickers, or npx tsx scripts/stickers/catalog.ts)', () => {
    for (const p of STICKER_PACKS) {
      const icon = file(p.id, 'icon.webp');
      if (existsSync(icon)) {
        const b = readFileSync(icon);
        expect(STICKER_ART[`${p.id}/icon`], `${p.id}/icon`).toEqual({ durationMs: 0, frames: 1, bytes: b.length, v: contentVersion([b]) });
        expect(readWebp(b).width, `${p.id}/icon`).toBe(96);
      }
      for (const st of p.stickers) {
        const at = `${p.id}/${st.id}`;
        const anim = readFileSync(file(p.id, `${st.id}.webp`));
        const info = readWebp(anim);
        expect(STICKER_ART[at], at).toEqual({
          durationMs: info.animated ? info.durationMs : 0, frames: info.frames, bytes: anim.length,
          v: contentVersion([anim, readFileSync(file(p.id, `${st.id}.thumb.webp`))]),
        });
      }
    }
  });
});

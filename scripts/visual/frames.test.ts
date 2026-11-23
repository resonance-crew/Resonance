import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { apartBoxOf, encodeFrame, parseScreencap, sameFrame, settleFrames, type Frame } from './frames';
import { decodePng } from './judge';

const W = 40;
const H = 30;
const frame = (paint: (x: number, y: number) => [number, number, number] = () => [250, 246, 238]): Frame => {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...paint(x, y), 255], (y * W + x) * 4);
  return { data, width: W, height: H };
};
const header = (width: number, height: number, format: number, colourSpace: boolean) => {
  const h = Buffer.alloc(colourSpace ? 16 : 12);
  h.writeUInt32LE(width, 0);
  h.writeUInt32LE(height, 4);
  h.writeUInt32LE(format, 8);
  if (colourSpace) h.writeUInt32LE(1, 12);
  return h;
};

describe('a screen’s frame as pixels', () => {
  it('reads screencap’s own output with either header (Android 9’s 12 bytes, 10’s and later 16), and nothing else', () => {
    const f = frame((x) => [x, 0, 0]);
    for (const colourSpace of [false, true]) {
      const got = parseScreencap(Buffer.concat([header(W, H, 1, colourSpace), f.data]));
      expect(got.width).toBe(W);
      expect(got.height).toBe(H);
      expect(got.data.equals(f.data)).toBe(true);
    }
    expect(() => parseScreencap(Buffer.concat([header(W, H, 4, true), f.data]))).toThrow(/format 4/);
    expect(() => parseScreencap(Buffer.concat([header(W, H, 1, true), f.data.subarray(8)]))).toThrow(/not RGBA_8888/);
    expect(() => parseScreencap(Buffer.alloc(4))).toThrow(/no header/);
  });

  it('keeps the very pixels when the frame kept is encoded: the PNG decodes to them, by pngjs and by the comparison', async () => {
    const f = frame((x, y) => [(x * 7) % 256, (y * 13) % 256, (x * y) % 256]);
    const png = await encodeFrame(f);
    expect(Buffer.from(PNG.sync.read(png).data).equals(f.data)).toBe(true);
    expect(Buffer.from((await decodePng(png)).data).equals(f.data)).toBe(true);
  });

  it('tells frames apart as the PNGs were: the same pixels, and the box round what differs outside what is skipped', () => {
    const a = frame();
    const b = frame((x, y) => (x >= 10 && x < 12 && y >= 5 && y < 20 ? [0, 0, 0] : [250, 246, 238]));
    expect(sameFrame(a, frame())).toBe(true);
    expect(sameFrame(a, b)).toBe(false);
    expect(apartBoxOf(a, b)).toEqual({ x: 10, y: 5, width: 2, height: 15 });
    expect(apartBoxOf(a, b, [{ x: 0, y: 0, width: 20, height: 30 }])).toBeNull();
    expect(apartBoxOf(a, { ...a, width: W + 1 })).toEqual({ x: 0, y: 0, width: W + 1, height: H });
  });

  it('settles on two frames alike in a row, or gives up with the last', async () => {
    const shown = [frame(() => [0, 0, 0]), frame(), frame()];
    let i = 0;
    const settled = await settleFrames(async () => shown[Math.min(i++, shown.length - 1)], { intervalMs: 0, sleep: async () => {} });
    expect(settled.settled).toBe(true);
    expect(i).toBe(3);
    let n = 0;
    const moving = await settleFrames(async () => frame(() => [n++ % 256, 0, 0]), { intervalMs: 1, timeoutMs: 20 });
    expect(moving.settled).toBe(false);
  });
});

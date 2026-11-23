import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { encodeFrame } from './frames';
import { alive, cutFrame } from './mac';

/** A window's capture a point wider and taller than asked for, with coloured "buttons" at the top left. */
function windowPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const button = x < 160 && y < 64;
      png.data.set(button ? [255, 95, 87, 255] : [(x * 3) % 256, (y * 5) % 256, 200, 255], i);
    }
  }
  return PNG.sync.write(png);
}

describe('the Mac window’s frame', () => {
  it('cuts to the size asked for and paints the window’s buttons over with the bar beside them, the pixels the PNG kept', async () => {
    const size = { width: 300, height: 200 };
    const frame = cutFrame(windowPng(602, 402), size);
    expect([frame.width, frame.height]).toEqual([600, 400]);
    const paper = frame.data.subarray((32 * 600 + 168) * 4, (32 * 600 + 168) * 4 + 4);
    expect([...frame.data.subarray(0, 4)]).toEqual([...paper]);
    expect([...frame.data.subarray((63 * 600 + 159) * 4, (63 * 600 + 159) * 4 + 4)]).toEqual([...paper]);
    // Outside the buttons, the window's own pixels.
    const at = (x: number, y: number) => [...frame.data.subarray((y * 600 + x) * 4, (y * 600 + x) * 4 + 4)];
    expect(at(400, 300)).toEqual([(400 * 3) % 256, (300 * 5) % 256, 200, 255]);
    // Encoded once at the end, it decodes to the very same pixels.
    expect(Buffer.from(PNG.sync.read(await encodeFrame(frame)).data).equals(Buffer.from(frame.data))).toBe(true);
  });

  it('tells a process still there from one gone (the copy quit before the next opens)', async () => {
    const child = spawn('sleep', ['5']);
    expect(alive(child.pid!)).toBe(true);
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    expect(alive(child.pid!)).toBe(false);
  });
});

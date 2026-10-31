import { describe, expect, it } from 'vitest';
import { ACT_STANCE } from '../acts';
import { FLOOR_PAD, SIGNATURE, stripLedges } from './stage';
import { PAL_SLUGS } from './still';

describe('Paper Pals strips', () => {
  it('gives a solo strip its floor, its home where the still stands, and a nook across from it', () => {
    const ledges = stripLedges({ kind: 'solo', slug: 'tuck', homeX: 0.4 }, 500, 280, 148);
    expect(ledges.map((l) => l.id)).toEqual(['floor', 'home', 'nook']);
    const home = ledges.find((l) => l.id === 'home')!;
    const nook = ledges.find((l) => l.id === 'nook')!;
    expect(home.kind === 'spot' && home.x).toBe(200);
    expect(home.kind === 'spot' && home.y).toBe(280 - FLOOR_PAD);
    // home on the left half: the nook is on the right, entered from that side
    expect(nook.kind === 'spot' && nook.x).toBeGreaterThan(250);
    expect(nook.kind === 'spot' && nook.from).toBe('right');
    expect(ledges.every((l) => !l.meet)).toBe(true);
  });

  it('pops up at home on the first visit only, and keeps home clear of the strip\'s ends', () => {
    expect(stripLedges({ kind: 'solo', slug: 'dot', homeX: 0.58 }, 500, 280, 148, true).map((l) => l.id)).toContain('home-pop');
    const narrow = stripLedges({ kind: 'solo', slug: 'tag', homeX: 0.98 }, 300, 220, 120);
    const home = narrow.find((l) => l.id === 'home')!;
    expect(home.kind === 'spot' && home.x).toBe(300 - 120 * 0.7);
  });

  it('lets two meet on the meeting strip: a floor to meet on and two ends across from each other', () => {
    const ledges = stripLedges({ kind: 'meet' }, 1000, 240, 128);
    expect(ledges.find((l) => l.id === 'floor')?.meet).toBe(true);
    expect(ledges.find((l) => l.id === 'end-l')?.partner).toBe('end-r');
    expect(ledges.find((l) => l.id === 'end-r')?.partner).toBe('end-l');
  });

  it("opens each one's visit with moves a standing puppet can do", () => {
    for (const s of PAL_SLUGS) for (const act of SIGNATURE[s]) expect(ACT_STANCE.stand).toContain(act);
  });
});

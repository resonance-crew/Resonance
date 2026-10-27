import { tear, spline, side } from '../gen/lib.mjs';
const keys = [[262, 352], [290, 296], [334, 264], [420, 250], [500, 250], [552, 268], [566, 360], [556, 470], [500, 552], [404, 578], [312, 562], [258, 494], [248, 420]];
const body = tear(spline(keys, 8), 41, { jag: 1.3, wander: 11 });
const A = [428, 249], B = [566, 386];
const keep = body.filter(p => side(p, A, B) > 0);
for (const y of [380, 390, 400, 405, 410, 415, 420, 425, 430, 440, 450]) {
  const near = keep.filter(p => Math.abs(p[1] - y) < 5);
  const l = near.filter(p => p[0] < 404).map(p => p[0]); const r = near.filter(p => p[0] > 404).map(p => p[0]);
  console.log(y, 'L', l.length ? Math.min(...l).toFixed(1) : '-', 'R', r.length ? Math.max(...r).toFixed(1) : '-');
}
// top-left edge near the tab
for (const p of keep) if (p[0] < 345 && p[1] < 310) console.log('tl', p.map(v => v.toFixed(1)).join(','));

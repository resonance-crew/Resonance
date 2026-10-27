// The round-4 eye variants: one rig + one exported parts folder each (work/r4/<id>/), the way the deliverable is made.
//   node work/r4/variants.mjs [id …]     (no ids: all)
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const base = { k: [0.72, 0.72], off: [0, 0], glint: [3.2, 3.4], lid: 0.12, w: 2.6, ring: 0 };
export const VARIANTS = [
  { id: 'a', name: 'A 白眼豆瞳', line: '暖白鉛筆眼裡放家族的深色豆豆眼（占眼睛八成），稍微往下，一點反光', eye: { style: 'pupil', k: [0.8, 0.8], off: [0.03, 0.07] } },
  { id: 'b', name: 'B 月牙眼白', line: '豆瞳坐低、往臉中間靠，眼白只剩上外側一彎月牙：睏睏的、溫柔地往下看', eye: { style: 'pupil', k: [0.76, 0.76], off: [0.08, 0.16] } },
  { id: 'c', name: 'C 細白邊豆眼', line: '就是家族的豆豆眼，外面只用白鉛筆描一圈細邊，讓它在深色紙上看得到', eye: { style: 'rim', k: [0.76, 0.76], w: 3.2 } },
  { id: 'd', name: 'D 大一號白眼豆瞳', line: '同 A，眼睛放大 8%（閉眼的弧線不變），補回深色豆瞳融進深藍紙後變小的感覺', eye: { style: 'pupil', k: [0.78, 0.78], off: [0.03, 0.07], scale: 1.08 } },
];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const want = process.argv.slice(2);
  for (const v of VARIANTS.filter(v => !want.length || want.includes(v.id))) {
    const dir = resolve(HERE, v.id);
    execFileSync('node', [resolve(HERE, 'mkrig.mjs'), resolve(dir, 'rig.svg')], { cwd: ROOT, env: { ...process.env, NT_G: JSON.stringify({ eye: { ...base, ...v.eye } }) }, stdio: 'inherit' });
    const out = execFileSync('node', [resolve(ROOT, '../kit/export-parts.mjs'), resolve(dir, 'rig.svg'), resolve(dir, 'parts'), '--scale', '0.8'], { cwd: ROOT }).toString();
    console.log(v.id, out.split('\n').filter(l => /problems|recompose/i.test(l)).join(' '));
  }
}

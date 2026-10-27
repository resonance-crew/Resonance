// Exports a rig (rig.svg, see kit.md "Rig contract") into one trimmed transparent image per part plus a manifest
// the stage engine reads, then recomposes the parts from the manifest and compares that with a direct render.
//
//   node export-parts.mjs <rig.svg> <outDir> [--scale 0.8]
//
// Writes <outDir>/<part>.png, <outDir>/manifest.json, <outDir>/rest.png (direct render) and <outDir>/recomposed.png.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const [inPath, outArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const si = process.argv.indexOf('--scale');
const S = si > 0 ? Number(process.argv[si + 1]) : 0.8;
if (!inPath || !outArg) { console.error('usage: node export-parts.mjs <rig.svg> <outDir> [--scale 0.8]'); process.exit(2); }
const OUT = resolve(outArg); mkdirSync(OUT, { recursive: true });
const svgText = readFileSync(resolve(inPath), 'utf8');
const vb = svgText.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
const [, , W, H] = vb;
const pw = Math.round(W * S), ph = Math.round(H * S);
const html = `<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;background:transparent}svg{display:block;width:${pw}px;height:${ph}px}</style></head><body>${svgText.replace(/<\?xml[^>]*>/, '')}</body></html>`;
const tmp = join(OUT, '_export.html'); writeFileSync(tmp, html);

const b = await launch();
const p = await b.open('file://' + tmp, { width: pw, height: ph, transparent: true, wait: 300 });
const info = await p.eval(`(() => {
  const root = document.querySelector('[data-rig]');
  if (!root) throw new Error('no element with data-rig');
  const parts = [...root.querySelectorAll('[data-part]')];
  const nested = parts.filter(e => e.parentElement.closest('[data-part]'));
  const num = s => s ? s.trim().split(/[\\s,]+/).map(Number) : null;
  return {
    rig: { name: root.getAttribute('data-name'), prefix: root.getAttribute('data-prefix'), ground: num(root.getAttribute('data-ground')),
      faceCenter: num(root.getAttribute('data-face-center')), height: Number(root.getAttribute('data-height')), walk: root.getAttribute('data-walk') || 'walk' },
    nested: nested.map(e => e.getAttribute('data-part')),
    parts: parts.map(e => ({ name: e.getAttribute('data-part'), parent: e.getAttribute('data-parent'), pivot: num(e.getAttribute('data-pivot')),
      angle: e.hasAttribute('data-angle') ? Number(e.getAttribute('data-angle')) : null, len: e.hasAttribute('data-len') ? Number(e.getAttribute('data-len')) : null,
      variantOf: e.getAttribute('data-variant-of'), only: e.getAttribute('data-only'), hides: e.getAttribute('data-hides'), hidden: e.getAttribute('data-variant-of') ? true : false })),
  };
})()`);
const problems = [];
if (info.nested.length) problems.push('nested data-part (parts must be flat): ' + info.nested.join(', '));
const names = info.parts.map(x => x.name);
for (const req of ['shadow', 'leg-l', 'leg-r', 'torso', 'eye-l', 'eye-r', 'eye-l-shut', 'eye-r-shut', 'mouth', 'mouth-o', 'arm-l', 'arm-r', 'deco'])
  if (!names.includes(req)) problems.push('missing part: ' + req);
for (const x of info.parts) {
  if (!['root', 'body', 'face'].includes(x.parent)) problems.push(`${x.name}: data-parent must be root, body or face`);
  if (!x.pivot || x.pivot.length !== 2 || x.pivot.some(Number.isNaN)) problems.push(`${x.name}: data-pivot "x y" missing`);
}
if (!info.rig.ground || !info.rig.faceCenter || !info.rig.height) problems.push('root needs data-ground, data-face-center, data-height');

const shotAlone = async (name) => {
  await p.eval(`(() => { for (const e of document.querySelectorAll('[data-part]')) e.style.display = e.getAttribute('data-part') === ${JSON.stringify(name)} ? 'inline' : 'none'; })()`);
  await p.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  return p.shot({ clip: { x: 0, y: 0, width: pw, height: ph } });
};
const raw = join(OUT, '_raw'); mkdirSync(raw, { recursive: true });
for (const x of info.parts) writeFileSync(join(raw, x.name + '.png'), await shotAlone(x.name));
// the direct render: every default part shown, variants hidden
await p.eval(`(() => { for (const e of document.querySelectorAll('[data-part]')) e.style.display = e.hasAttribute('data-variant-of') || e.getAttribute('data-only') ? 'none' : 'inline'; })()`);
await p.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
writeFileSync(join(OUT, 'rest.png'), await p.shot({ clip: { x: 0, y: 0, width: pw, height: ph } }));
await b.close();

// trim each part to its alpha box (python + PIL), giving offsets in rig units
const boxes = JSON.parse(execFileSync('python3', [join(HERE, 'trim.py'), raw, OUT, String(S), ...info.parts.map(x => x.name)]).toString());
const manifest = { ...info.rig, viewBox: [W, H], scale: S, parts: info.parts.map((x, z) => ({ ...x, z, ...boxes[x.name], img: x.name + '.png' })) };
for (const x of manifest.parts) {
  if (!x.w) problems.push(`${x.name}: empty (nothing drawn)`);
  else if (x.x <= 0.5 || x.y <= 0.5 || x.x + x.w >= W - 0.5 || x.y + x.h >= H - 0.5) problems.push(`${x.name}: touches the canvas edge (enlarge the viewBox)`);
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

// recompose from the manifest alone and compare with the direct render
const b2 = await launch();
const comp = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}.s{position:relative;width:${pw}px;height:${ph}px}.s img{position:absolute}</style></head><body><div class=s>${
  manifest.parts.filter(x => !x.variantOf && !x.only && x.w).map(x => `<img src="${x.img}" style="left:${(x.x * S).toFixed(2)}px;top:${(x.y * S).toFixed(2)}px;width:${(x.w * S).toFixed(2)}px;height:${(x.h * S).toFixed(2)}px">`).join('')}</div></body></html>`;
writeFileSync(join(OUT, '_comp.html'), comp);
const p2 = await b2.open('file://' + join(OUT, '_comp.html'), { width: pw, height: ph, transparent: true, wait: 300 });
writeFileSync(join(OUT, 'recomposed.png'), await p2.shot({ clip: { x: 0, y: 0, width: pw, height: ph } }));
await b2.close();
const diff = execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageChops
a=Image.open(sys.argv[1]).convert('RGBA'); b=Image.open(sys.argv[2]).convert('RGBA')
d=ImageChops.difference(a,b).convert('L'); h=d.histogram(); n=sum(h); big=sum(h[24:])
print(f"{big/n*100:.3f}")`, join(OUT, 'rest.png'), join(OUT, 'recomposed.png')]).toString().trim();
console.log(JSON.stringify({ parts: manifest.parts.length, scale: S, recomposeDiffPct: Number(diff), problems }, null, 1));
if (Number(diff) > 1.5) console.log('WARNING: the recomposed parts differ from the direct render by more than 1.5% of pixels — overlapping filters or a part drawn twice?');

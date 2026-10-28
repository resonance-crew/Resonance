/**
 * Build the native apps' mascot island (native/mascots/src) into one self-contained HTML file:
 * native/mascots/dist/mascots.html — the web's puppet engine, its cast and the reading pages' places, with every
 * part picture of public/mascots inside it (data URLs), so the app loads it from its bundle with nothing to fetch.
 * A transparent page: the app lays it over its feed or card page in a WebView that takes no touch.
 *
 *   npx tsx scripts/native/build-mascots.mjs   (npm run native:mascots)
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = resolve(root, 'native/mascots/src');
const out = resolve(root, 'native/mascots/dist/mascots.html');

const result = await build({
  entryPoints: [resolve(src, 'island.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari17', 'chrome110'],
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text;

const parts = {};
const pics = resolve(root, 'public/mascots');
for (const slug of readdirSync(pics, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  for (const file of readdirSync(join(pics, slug)).filter((f) => f.endsWith('.webp'))) {
    parts[`/mascots/${slug}/${file}`] = `data:image/webp;base64,${readFileSync(join(pics, slug, file)).toString('base64')}`;
  }
}

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>Paper puppets</title>
<style>
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: transparent; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#stage { position: absolute; left: 0; top: 0; width: 100%; height: 400000px; pointer-events: none; overflow: clip; will-change: transform; }
</style>
</head>
<body>
<div id="stage" aria-hidden="true"></div>
<script>window.__MASCOT_PARTS=${JSON.stringify(parts)};</script>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);

/**
 * The palette (src/lib/design/palette.ts) → src/styles/palette.css, and the
 * fixture the apps' tests pin their palettes to (native/fixtures/palette.json).
 * palette.test.ts fails while either is stale.
 *
 *   npx tsx scripts/web/palette-css.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paletteCss } from '../../src/lib/design/paletteCss';
import { paletteFixture } from '../../src/lib/design/paletteFixture';

const root = resolve(__dirname, '../..');
writeFileSync(resolve(root, 'src/styles/palette.css'), paletteCss('oklch'));
writeFileSync(resolve(root, 'native/fixtures/palette.json'), `${JSON.stringify(paletteFixture(), null, 2)}\n`);
console.log('palette.css + native/fixtures/palette.json written');

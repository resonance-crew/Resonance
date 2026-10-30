/**
 * public/stickers/catalog.json — the sticker catalog as the apps bundle it and as the site serves it (a build that
 * bundles an older catalog can read the newer one there): every pack in the picker's order, each sticker's names in
 * both languages and its art's numbers, and the catalog's version. Run by `npm run apps:generate` and by the sticker
 * pipeline; `src/lib/stickers/catalog.test.ts` fails while it is stale.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogJson } from '../../src/lib/stickers/catalogJson';

const out = resolve(__dirname, '../../public/stickers/catalog.json');
writeFileSync(out, catalogJson());
console.log(`wrote ${out}`);

// node gen/sizes.mjs → checks/size-120.svg / size-48.svg: the main pose and the rest pose at exactly that height,
// on the day paper and the night paper, rendered at 1× (what the pixels really are).
import { writeFileSync } from 'node:fs';
import { defs } from './tag.mjs';
import { figure, MAIN } from './concept.mjs';
const FH = 583, FX = 350, FY = 410;
for (const h of [120, 48]) {
  const w = Math.round(h * 2.4), W = w * 4, H = Math.round(h * 1.25);
  const at = (id, x, y) => `<g transform="translate(${x} ${y}) scale(${h / FH}) translate(${-FX} ${-FY})"><use href="#${id}"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}
<g visibility="hidden">${figure(`tg-s${h}m-`, MAIN)}${figure(`tg-s${h}r-`, {})}</g>
<rect width="${W / 2}" height="${H}" fill="oklch(96.5% 0.015 75)"/><rect x="${W / 2}" width="${W / 2}" height="${H}" fill="oklch(21% 0.012 60)"/>
${at(`tg-s${h}m-fig`, w * 0.5, H / 2)}${at(`tg-s${h}r-fig`, w * 1.5, H / 2)}${at(`tg-s${h}m-fig`, w * 2.5, H / 2)}${at(`tg-s${h}r-fig`, w * 3.5, H / 2)}
</svg>`;
  writeFileSync(`checks/size-${h}.svg`, svg);
}

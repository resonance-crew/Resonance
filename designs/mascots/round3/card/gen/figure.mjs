// The rig (flat data-part groups, kit.md "Rig contract") and posed figures for the concept sheet, both from the same
// part builders and the same numbers in card.mjs.
import { G, P, defs, torso, beret, eyeL, eyeR, mouth, cheeks, arm, leg, shadow } from './card.mjs';

export const NAME = '聆聆 Nod';
const pv = p => `${p[0]} ${p[1]}`;

export function rigSvg() {
  const part = (name, parent, pivot, body, extra = '') =>
    ` <g data-part="${name}" data-parent="${parent}" data-pivot="${pv(pivot)}"${extra}>${body}</g>\n`;
  const variant = of => ` data-variant-of="${of}" display="none"`;
  const torsoPivot = [G.cx, G.card.y1];
  const { restL, restR } = G.arm;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 760">
<!-- ${NAME}: the lavender index card of the 摺摺 series. Rig units: ground y = 700, centred on x = 350; top of the card ${G.ground - G.card.y0}
     above the ground. Parts are flat and in paint order; pivots in rig units. Variants are display="none" here
     (the stage swaps them in). Arms are painted behind the torso (their strips tuck under the card's sides); the torso
     carries the visible brad heads, and each arm also carries its own brad at its pivot (hidden under the card), so arm
     and brad stay one part when the stage brings an arm to the front. torso-alt is the same side of the card written
     full round the face, so it hides nothing. -->
${defs()}
<g data-rig data-name="${NAME}" data-prefix="${P}" data-ground="350 700" data-face-center="${pv(G.face)}" data-height="${G.ground - G.card.y0}" data-walk="walk">
${part('shadow', 'root', [350, 700], shadow())}${part('leg-l', 'root', G.hipL, leg('l'), ` data-len="${G.legLen}"`)}${part('leg-r', 'root', G.hipR, leg('r'), ` data-len="${G.legLen}"`)}${part('arm-l', 'body', G.bradL, arm('l', restL), ` data-angle="${restL}"`)}${part('arm-r', 'body', G.bradR, arm('r', restR), ` data-angle="${restR}"`)}${part('torso', 'body', torsoPivot, torso('rig-'))}${part('torso-alt', 'body', torsoPivot, torso('rig-', { alt: true }), variant('torso'))}${part('deco', 'body', G.decoPivot, beret('rig-'))}${part('cheeks', 'face', G.mouth, cheeks())}${part('eye-l', 'face', G.eyeL, eyeL())}${part('eye-r', 'face', G.eyeR, eyeR())}${part('eye-l-shut', 'face', G.eyeL, eyeL({ closed: true }), variant('eye-l'))}${part('eye-r-shut', 'face', G.eyeR, eyeR({ closed: true }), variant('eye-r'))}${part('mouth', 'face', G.mouth, mouth('smile'))}${part('mouth-o', 'face', G.mouth, mouth('o'), variant('mouth'))}${part('mouth-open', 'face', G.mouth, mouth('open'), variant('mouth'))}</g>
</svg>
`;
}

// A posed figure in rig units (for the concept sheet). Arms are regenerated at their pose angles so the glue shadow
// keeps falling down-right, and painted behind the card unless the pose lists them in armsFront (as the stage brings
// them forward when a hand crosses the body); the body (card, beret, face, arms) tilts and moves about the torso pivot;
// legs swing and squash about the hips. deco.about rotates the beret about another point than its rig pivot.
export function figure(inst, o = {}) {
  const p = {
    armL: G.arm.restL, armR: G.arm.restR, tilt: 0, bodyDx: 0, bodyDy: 0, face: [0, 0], look: [0, 0], eyes: 'open',
    mouth: 'smile', alt: false, blush: 0.65, deco: { rot: 0, dx: 0, dy: 0 }, legL: 0, legR: 0, squashL: 1, squashR: 1,
    shadow: true, held: '', front: '', armsFront: [], ...o,
  };
  const [tx, ty] = [G.cx, G.card.y1];
  const legT = (hip, rot, sq) => `translate(${hip[0]} ${hip[1]}) rotate(${rot}) scale(1 ${sq}) translate(${-hip[0]} ${-hip[1]})`;
  const eyes = p.eyes === 'shut' ? eyeL({ closed: true }) + eyeR({ closed: true }) : eyeL({ look: p.look }) + eyeR({ look: p.look });
  const d = p.deco;
  return `<g>
  ${p.shadow ? shadow() : ''}
  <g transform="${legT(G.hipL, p.legL, p.squashL)}">${leg('l')}</g>
  <g transform="${legT(G.hipR, p.legR, p.squashR)}">${leg('r')}</g>
  <g transform="translate(${p.bodyDx} ${p.bodyDy}) rotate(${p.tilt} ${tx} ${ty})">
    ${p.armsFront.includes('l') ? '' : arm('l', p.armL)}${p.armsFront.includes('r') ? '' : arm('r', p.armR)}
    ${torso(inst, { alt: p.alt })}
    <g transform="translate(${d.dx} ${d.dy}) rotate(${d.rot} ${(d.about || G.decoPivot)[0]} ${(d.about || G.decoPivot)[1]})">${beret(inst)}</g>
    <g transform="translate(${p.face[0]} ${p.face[1]})">${cheeks(p.blush)}${eyes}${mouth(p.mouth)}</g>
    ${p.held}
    ${p.armsFront.includes('l') ? arm('l', p.armL) : ''}${p.armsFront.includes('r') ? arm('r', p.armR) : ''}
    ${p.front}
  </g>
</g>`;
}

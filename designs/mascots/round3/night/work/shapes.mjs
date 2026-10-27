// exploration: dome profiles for the body, as silhouettes with legs and resting mittens
import { writeFileSync } from 'node:fs';
import { spline, path } from '../gen/lib.mjs';
const prof = {
  A_ellipse: () => { const p=[]; for(let i=0;i<=60;i++){const t=i/60*Math.PI; p.push([350+172*Math.cos(t),606-306*Math.sin(t)]);} return p; },
  B_super23: () => { const p=[]; for(let i=0;i<=60;i++){const t=i/60*Math.PI,c=Math.cos(t),s=Math.sin(t); p.push([350+172*Math.sign(c)*Math.abs(c)**(2/2.3),606-306*Math.abs(s)**(2/2.3)]);} return p; },
  C_mochi: () => spline([[512,606],[530,566],[534,496],[516,418],[478,350],[420,309],[350,296],[280,308],[222,348],[184,418],[166,496],[170,566],[188,606]],6,false),
  D_wide: () => { const p=[]; for(let i=0;i<=60;i++){const t=i/60*Math.PI,c=Math.cos(t),s=Math.sin(t); p.push([350+196*Math.sign(c)*Math.abs(c)**(2/2.15),606-292*Math.abs(s)**(2/2.15)]);} return p; },
  E_bellyfull: () => spline([[505,606],[526,580],[540,520],[532,440],[498,370],[436,318],[350,298],[264,318],[202,370],[168,440],[160,520],[174,580],[195,606]],6,false),
};
let out=''; let x=0;
for (const [k,f] of Object.entries(prof)) {
  const pts=f(); const d=path(pts.concat([[pts[pts.length-1][0],606],[pts[0][0],606]]));
  const fig=(fillc)=>`<path d="${d}" fill="${fillc}"/><rect x="278" y="600" width="27" height="90" fill="${fillc}"/><rect x="395" y="600" width="27" height="90" fill="${fillc}"/><ellipse cx="282" cy="692" rx="26" ry="10" fill="${fillc}"/><ellipse cx="418" cy="692" rx="26" ry="10" fill="${fillc}"/><circle cx="165" cy="578" r="22" fill="${fillc}"/><circle cx="535" cy="578" r="22" fill="${fillc}"/>`;
  out+=`<g transform="translate(${x} 0)"><g transform="translate(0 0) scale(0.3)">${fig('#111')}</g><g transform="translate(60 200) scale(0.12)">${fig('#111')}</g><g transform="translate(0 260) scale(0.3)">${fig('oklch(40% 0.06 260)')}</g><text x="20" y="500" font-size="14">${k}</text></g>`;
  x+=220;
}
writeFileSync('shapes.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 520" width="1100" height="520"><rect width="1100" height="520" fill="#f8f2ea"/>${out}</svg>`);

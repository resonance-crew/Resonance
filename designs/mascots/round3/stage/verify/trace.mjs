// verify/trace.mjs — the stage's events, one line each, for one seed: node verify/trace.mjs <view> <secs> <seed> [scroll] [theme] [setup JS] [slugs]
import { launch } from '../../kit/cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [view = 'desktop', secs = '60', seed = '1', sc = '0', theme = 'light', setup = '', slugs = ''] = process.argv.slice(2);
const b = await launch();
try {
  const p = await b.open(`file://${join(HERE, '..', 'index.html')}?view=${view}&theme=${theme}&reduced=0&seed=${seed}&scroll=${sc}`, { width: 1440, height: 1000 });
  for (let i = 0; i < 100; i++) { if (await p.eval('!!(window.__msp && window.__msp.stage)')) break; await new Promise(r => setTimeout(r, 30)); }
  await new Promise(r => setTimeout(r, 80));
  console.log(await p.eval(`(() => {
    __msp.stage.destroy();
    const F = __msp.frame, V = F.V, ev = [];
    const TRAITS = { tuck: { likes: ['read', 'reveal'] }, tag: { pace: 1.1, likes: ['reveal', 'wave'] }, card: { pace: 0.85, shuffle: true, likes: ['deco', 'read'] },
      dot: { likes: ['hop'], openStretch: true }, night: { pace: 0.7, naps: true, likes: ['nap', 'twinkle'], zones: { light: { hero: 0.35, cta: 1.5, footer: 2 }, dark: { hero: 1.3, footer: 1.5 } }, often: { light: 0.8, dark: 1.6 } } };
    const cast = MascotStage.CAST.filter(c => !${JSON.stringify(slugs)} || ${JSON.stringify(slugs)}.split(',').includes(c.slug)).map(c => ({ ...c, traits: TRAITS[c.slug] || {} }));
    const st = MascotStage.createStage({ layer: F.page, ledges: V.ledges, content: V.content, unitHeight: V.unitHeight, theme: '${theme}', reducedMotion: false,
      viewport: () => ({ x: 0, y: F.scroll.scrollTop / F.s, w: V.page.w, h: F.scroll.clientHeight / F.s }) }, cast, { seed: ${seed}, onEvent: e => ev.push(e), autoplay: false, observe: false });
    ${setup}
    st.advance(${Number(secs)});
    return ev.map(e => e.t.toFixed(2).padStart(6) + ' ' + e.type.padEnd(6) + ' ' + (e.name || '') + ' ' + [e.how, e.side, e.ledge, e.act, e.label].filter(Boolean).join(' · ')).join('\\n');
  })()`));
} finally { await b.close(); }

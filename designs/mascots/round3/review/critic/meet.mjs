// node meet.mjs <name> <desktop|mobile>[-dark] "<a>+<b>:<variant>:<pair|host@ledge>,…" [secs=18] [step=0.25] [seed=1]
// a stage of exactly these two (the prototype's own is destroyed), so the pair and the variant are chosen
import { browser, proto, geom, sleep, mkdirSync, writeFileSync, join, HERE } from './harness.mjs';
const [name, view = 'desktop', casesArg, secs = '18', step = '0.25', seed = '1'] = process.argv.slice(2);
const [v, theme = 'light'] = view.split('-');
const TRAITS = `({ tuck: { likes: ['read', 'reveal'] }, tag: { pace: 1.1, likes: ['reveal', 'wave'] }, card: { pace: 0.85, shuffle: true, likes: ['deco', 'read'] },
  dot: { likes: ['hop'] }, night: { pace: 0.7, naps: true, likes: ['nap', 'twinkle'] } })`;
const b = await browser();
try {
  const p = await proto(b, `?view=${v}&theme=${theme}&reduced=0&seed=3`, { width: 1440, height: 1000, dpr: 2 });
  await p.eval('__msp.stage.pause()');
  for (const c of casesArg.split(',')) {
    const [pair, variant, mode] = c.split(':');
    const [A, B] = pair.split('+');
    const key = `${A}-${B}-${variant}-${mode.replace('@', '_')}`;
    const dir = join(HERE, 'raw', name, key); mkdirSync(dir, { recursive: true });
    const host = mode.startsWith('host@') ? mode.slice(5) : null;
    const setup = await p.eval(`(() => {
      const F = __msp.frame, T = ${TRAITS};
      if (window.__my) window.__my.destroy(); else __msp.stage.destroy();
      const cast = MascotStage.CAST.filter(c => c.slug === ${JSON.stringify(A)} || c.slug === ${JSON.stringify(B)}).map(c => ({ ...c, traits: T[c.slug] }));
      window.__evs = [];
      const l = F.V.ledges.find(l => l.id === ${JSON.stringify(host || 'hero-wave')});
      const y = l.points ? l.points.reduce((s, p) => s + p[1], 0) / l.points.length : l.y;
      const vh = F.scroll.clientHeight / F.s;
      F.scroll.scrollTop = Math.max(0, Math.min(F.ph - vh, y - vh * 0.7)) * F.s;
      window.__my = MascotStage.createStage({ layer: F.page, ledges: F.V.ledges, unitHeight: F.V.unitHeight, theme: ${JSON.stringify(theme)}, reducedMotion: false,
        viewport: () => ({ x: 0, y: F.scroll.scrollTop / F.s, w: F.pw, h: F.scroll.clientHeight / F.s }) }, cast,
        { size: 1, fps: 12, seed: ${Number(seed)}, autoplay: false, onEvent: e => window.__evs.push([+e.t.toFixed(2), e.type, e.name, e.label || e.act || '', e.how || ''] ) });
      ${host ? `const ok = window.__my.visit({ ledge: ${JSON.stringify(host)}, slug: ${JSON.stringify(A)} }); window.__my.advance(7); const m = window.__my.meet(${JSON.stringify(variant)}); return [ok, m];`
             : `return [true, window.__my.meet(${JSON.stringify(variant)})];`}
    })()`);
    const meta = [], n = Math.round(Number(secs) / Number(step));
    for (let i = 0; i <= n; i++) {
      if (i) await p.eval(`__my.advance(${step})`);
      await sleep(35);
      const g = await geom(p);
      const s = JSON.parse(await p.eval(`JSON.stringify({ t: +__my.time.toFixed(2), v: __my.visitors().map(v => ({ slug: v.slug, x: +v.x.toFixed(1), y: +v.y.toFixed(1), h: +v.h.toFixed(1), mode: v.mode, ledge: v.ledge })), status: '' })`));
      writeFileSync(join(dir, String(i).padStart(3, '0') + '.png'), await p.shot({ clip: { x: g.x, y: g.y, width: g.w, height: g.h } }));
      meta.push({ i, g, ...s });
      if (i > 8 && !s.v.length) break;
    }
    const evs = await p.eval('__evs');
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name: key, case: c, ok: setup, dpr: 2, step: Number(step), frames: meta, events: evs.map(e => [e[0], e.slice(1).join(' ')]), log: await p.eval('__log') }));
    console.log(key, JSON.stringify(setup), evs.map(e => e.join(' ')).join(' | '));
  }
} finally { await b.close(); }

// pixels.mjs — does a character's drawing land on what it must keep clear? Paused stage, stepped by hand; at each step
// a screenshot with the stage and one with it hidden, compared (pixels.py) inside the rects that must stay clean.
//   node pixels.mjs badges   → 1440: 摺摺 points at the store badges (beside the QR code); 834: 聆聆 at badge-l
//   node pixels.mjs climb    → 1440 dark: 牽牽 climbs onto card-2-top (under card 1's words and author row)
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const which = process.argv[2] || 'badges';
mkdirSync('px', { recursive: true });

const PHONE = [2, 3, 4].map(n => ({
  W: 390, H: 844, dark: false, ledge: `card-${n}-top`, slug: 'tuck', acts: ['look', 'look'], scrollTo: n,
  rects: `(() => { const cards = [...document.querySelectorAll('[data-card-id] article')]; const above = cards[${n - 2}];
    const out = []; const rg = document.createRange();
    const foot = above.querySelector('[data-mascot="card-foot"]');
    const walk = document.createTreeWalker(foot, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) { if (!t.data.trim()) continue; rg.selectNodeContents(t); out.push(...rg.getClientRects()); }
    out.push(...[...foot.querySelectorAll('img, svg')].map(e => e.getBoundingClientRect()));
    return out.filter(r => r.width > 1 && r.height > 1); })()` }));
const RUNS = which === 'phone' ? PHONE : which === 'badges'
  ? [
      { W: 1440, H: 900, dark: false, ledge: 'badges', slug: 'tuck', acts: ['point', 'point'], rects: `[...document.querySelectorAll('[data-mascot-zone="hero"] [data-mascot="badge"]')].map(e => e.getBoundingClientRect())` },
      { W: 1440, H: 900, dark: false, ledge: 'qr-point', slug: 'tuck', acts: ['point', 'point'], rects: `[document.querySelector('[data-mascot="qr"]').getBoundingClientRect()]` },
      { W: 834, H: 1194, dark: false, ledge: 'badge-l', slug: 'card', acts: ['point', 'point'], rects: `[...document.querySelectorAll('[data-mascot-zone="hero"] [data-mascot="badge"]')].filter(e => e.getBoundingClientRect().width).map(e => e.getBoundingClientRect())` },
      { W: 834, H: 1194, dark: false, ledge: 'badge-r', slug: 'tuck', acts: ['point', 'point'], rects: `[...document.querySelectorAll('[data-mascot-zone="hero"] [data-mascot="badge"]')].filter(e => e.getBoundingClientRect().width).map(e => e.getBoundingClientRect())` },
    ]
  : [1, 2].map(n => ({
      W: 1440, H: 900, dark: true, ledge: `card-${n === 1 ? 2 : 4}-top`, slug: 'tag', acts: ['look', 'look'], scrollTo: n === 1 ? 2 : 4,
      // the words of the card above (its title, summary, author row): every text box in it and its pictures' boxes
      rects: `(() => { const cards = [...document.querySelectorAll('[data-card-id] article')]; const me = cards[${n === 1 ? 1 : 3}].getBoundingClientRect();
        const above = cards.filter(c => { const r = c.getBoundingClientRect(); return Math.abs(r.left - me.left) < 20 && r.bottom <= me.top + 4; }).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        const out = []; const rg = document.createRange();
        const walk = document.createTreeWalker(above, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) { if (!t.data.trim()) continue; rg.selectNodeContents(t); out.push(...rg.getClientRects()); }
        out.push(...[...above.querySelectorAll('[data-mascot="card-foot"] img, [data-mascot="card-foot"] svg')].map(e => e.getBoundingClientRect()));
        return out.filter(r => r.width > 1 && r.height > 1); })()` }));

const b = await launch();
const report = [];
try {
  for (const run of RUNS) {
    const p = await b.open('http://localhost:3000/zh-TW', { width: run.W, height: run.H, mobile: run.W < 1024, dpr: 1, dark: run.dark });
    for (let i = 0; i < 400; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
    await sleep(400);
    if (run.scrollTo) {
      await p.eval(`(() => { const c = document.querySelectorAll('[data-card-id] article')[${run.scrollTo - 1}]; window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 420, behavior: 'instant' }); window.dispatchEvent(new Event('scroll')); return 1; })()`);
      await sleep(300);
    }
    const ok = await p.eval(`(() => { const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); __landingStage.stage.refresh(); window.__landingStageEvents = []; return st.visit(${JSON.stringify({ ledge: run.ledge, slug: run.slug, acts: run.acts })}); })()`);
    // the parts in, decoded
    await p.eval(`Promise.all([...document.querySelectorAll('.ms-char img')].map(im => im.decode().catch(() => 0))).then(() => 1)`);
    const rects = JSON.parse(await p.eval(`JSON.stringify((${run.rects}).map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height })))`));
    const tag = `${which}-${run.W}-${run.ledge}-${run.slug}`;
    const frames = [];
    if (ok) {
      const steps = which === 'climb' ? 24 * 3 : 24 * 6;
      for (let i = 0; i < steps; i++) {
        await p.eval('__landingStage.stage.advance(1 / 24)');
        if (i % (which === 'badges' ? 4 : 2)) continue;
        const a = await p.shot();
        await p.eval(`document.querySelector('.ms-stage').style.visibility = 'hidden'`);
        const bb = await p.shot();
        await p.eval(`document.querySelector('.ms-stage').style.visibility = ''`);
        const f = `px/${tag}-${String(i).padStart(3, '0')}`;
        writeFileSync(`${f}-on.png`, a);
        writeFileSync(`${f}-off.png`, bb);
        frames.push(f);
      }
    }
    const events = JSON.parse(await p.eval(`JSON.stringify((window.__landingStageEvents || []).map(e => e.type + ':' + (e.act || e.how || '') + '@' + (e.ledge || '')))`));
    report.push({ tag, visited: ok, rects, frames, events, errors: p.errors });
    await p.close();
  }
} finally {
  await b.close();
}
writeFileSync(`px/${which}.json`, JSON.stringify(report, null, 1));
console.log(report.map(r => `${r.tag} visited=${r.visited} frames=${r.frames.length} rects=${r.rects.length} events=${r.events.join(' ')} errors=${r.errors.length}`).join('\n'));

import { launch } from '../cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch();
try {
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: W < 1024, dpr: W < 640 ? 2 : 1 });
    for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
    await p.eval('__landingStage.stage.resetStats()');
    const t0 = Date.now();
    await sleep(20000);
    const s = JSON.parse(await p.eval('JSON.stringify(__landingStage.stage.stats())'));
    const m = await p.send('Performance.getMetrics').catch(() => null);
    console.log(W, JSON.stringify(s), 'frames/s', (s.n / ((Date.now() - t0) / 1000)).toFixed(1), 'imgs', await p.eval('document.querySelectorAll(".ms-char img").length'), 'bytes', await p.eval(`performance.getEntriesByType('resource').filter(e => /mascots\\//.test(e.name)).reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0)`), 'files', await p.eval(`performance.getEntriesByType('resource').filter(e => /mascots\\//.test(e.name)).length`));
    await p.close();
  }
} finally { await b.close(); }
process.exit(0);

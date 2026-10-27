import { launch } from '../cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: 1440, height: 900 });
  for (let i = 0; i < 400; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
  console.log(await p.eval(`performance.getEntriesByType('resource').map(e => e.name).filter(n => /StageLayer|mascots_|LandingStage/.test(n)).join('\\n')`));
} finally { await b.close(); }

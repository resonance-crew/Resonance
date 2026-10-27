import { launch } from '../cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: 1440, height: 900 });
  for (let i = 0; i < 30; i++) {
    const s = await p.eval(`JSON.stringify({ layer: !!document.querySelector('[data-landing-stage]'), stage: !!(window.__landingStage && window.__landingStage.stage), handle: !!window.__landingStage, h1: document.querySelector('h1')?.textContent, ready: document.readyState, chars: document.querySelectorAll('.ms-char').length })`);
    if (i % 5 === 0) console.log(i, s);
    await sleep(1000);
  }
  console.log(p.errors);
} finally { await b.close(); }

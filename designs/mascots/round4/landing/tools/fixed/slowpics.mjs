// slowpics.mjs — every /mascots/ picture held back 1.5 s (a slow phone network): no character may be in view with a
// part still loading (the review's probe5: all 12 visible parts loading for ~2.9 s).
import { launch } from './cdp5.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '390', h = '844'] = process.argv.slice(2);
const b = await launch();
try {
  let held = 0;
  const p = await b.open('http://localhost:3000/zh-TW', {
    width: Number(w), height: Number(h), mobile: Number(w) < 1024, dpr: 2,
    before: async ({ send, on }) => {
      await send('Fetch.enable', { patterns: [{ urlPattern: '*/mascots/*', requestStage: 'Request' }] });
      on(m => {
        if (m.method !== 'Fetch.requestPaused') return;
        held++;
        setTimeout(() => send('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {}), 1500);
      });
    },
  });
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
  const t0 = Date.now();
  let polls = 0, shownWhileLoading = 0, firstSeen = null, maxIncomplete = 0;
  while (Date.now() - t0 < 30000) {
    const s = JSON.parse(await p.eval(`(() => { const out = []; for (const el of document.querySelectorAll('.ms-char')) { const r = el.getBoundingClientRect(); const inView = true; const imgs = [...el.querySelectorAll('img')].filter(im => getComputedStyle(im).visibility !== 'hidden'); out.push({ incomplete: imgs.filter(im => !im.complete || !im.naturalWidth).length, op: +getComputedStyle(el).opacity }); } return JSON.stringify(out); })()`));
    polls++;
    for (const c of s) { if (firstSeen == null) firstSeen = Date.now() - t0; maxIncomplete = Math.max(maxIncomplete, c.incomplete); if (c.incomplete && c.op > 0) shownWhileLoading++; }
    await sleep(100);
  }
  console.log(JSON.stringify({ size: `${w}x${h}`, heldRequests: held, polls, firstVisitorAfterStageMs: firstSeen, pollsWithACharacterMissingParts: shownWhileLoading, maxIncompleteParts: maxIncomplete, errors: p.errors }, null, 1));
} finally { await b.close(); }

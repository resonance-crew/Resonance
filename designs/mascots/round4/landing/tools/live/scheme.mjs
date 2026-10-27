import { launch } from '../cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: 1440, height: 900 });
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
  const cls = () => p.eval(`(() => { const s = document.querySelector('.ms-stage'); return (s ? s.className : 'none') + ' | html data-scheme=' + document.documentElement.getAttribute('data-scheme') + ' class=' + document.documentElement.className.slice(0, 80); })()`);
  console.log('start', await cls());
  await p.eval(`document.documentElement.setAttribute('data-scheme', 'dark')`); await sleep(300);
  console.log('data-scheme=dark', await cls());
  await p.setMedia({ dark: true }); await p.eval(`document.documentElement.setAttribute('data-scheme', 'light')`); await sleep(300);
  console.log('os dark + data-scheme=light', await cls());
  await p.eval(`document.documentElement.removeAttribute('data-scheme')`); await sleep(300);
  console.log('os dark, no attr', await cls());
} finally { await b.close(); }
process.exit(0);

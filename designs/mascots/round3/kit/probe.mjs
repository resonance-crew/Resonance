import { launch } from './cdp.mjs';
const b = await launch();
const p = await b.open('https://resonance.channel/zh-TW', { width: 1440, height: 900, wait: 2500 });
const out = await p.eval(`(() => {
  const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y + scrollY), Math.round(b.width), Math.round(b.height)]; };
  const pick = sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ tag: e.tagName, cls: (e.className && e.className.baseVal === undefined ? e.className : '').toString().slice(0, 60), text: (e.innerText || '').trim().slice(0, 40), rect: r(e) }));
  return { h: document.documentElement.scrollHeight, sections: pick('header, section, footer, main > *'), heads: pick('h1, h2, h3'), links: pick('a, button').slice(0, 60), arts: pick('article, [class*=Card], [class*=card]').slice(0, 40) };
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();

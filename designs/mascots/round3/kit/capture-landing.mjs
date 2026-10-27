// Full-page captures of the live landing page (zh-TW) at desktop and phone width, light and dark, with the
// rectangles of the elements the characters can use (page coordinates, CSS px).
import { writeFileSync } from 'node:fs';
import { launch } from './cdp.mjs';
const OUT = new URL('../landing/', import.meta.url).pathname;
const b = await launch();
const views = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false },
  { name: 'mobile', width: 390, height: 844, dpr: 2, mobile: true },
];
const anchors = {};
for (const v of views) for (const dark of [false, true]) {
  const p = await b.open('https://resonance.channel/zh-TW', { ...v, dark, wait: 3000 });
  const tag = `${v.name}-${dark ? 'dark' : 'light'}`;
  writeFileSync(`${OUT}${tag}.png`, await p.shot({ full: true }));
  if (!dark) anchors[v.name] = await p.eval(`(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const vis = el => el && el.getBoundingClientRect().width > 0;
    const q = s => [...document.querySelectorAll(s)].filter(vis);
    const one = s => q(s)[0];
    const res = { page: { w: innerWidth, h: document.documentElement.scrollHeight, vh: innerHeight } };
    res.header = r(one('header'));
    const hero = one('section[class*=HeroSection_hero]'); res.hero = r(hero);
    res.heroHeadline = r(one('h1'));
    // the hero's small lines: the eyebrow above the headline and the line under it
    res.heroLines = [...hero.querySelectorAll('p, span, div')].filter(e => vis(e) && e.children.length === 0 && e.innerText.trim()).map(e => ({ text: e.innerText.trim().slice(0, 30), ...r(e) }));
    res.badges = q('a[class*=GetTheApp_badge]').map(r);
    res.qr = q('img[src*=download-qr], [class*=qr] img, [class*=Qr] img').map(r);
    res.feedTitle = r(one('h2[class*=CardFeedSection_title]'));
    res.cards = q('section[class*=CardFeedSection] a').filter(a => a.getBoundingClientRect().height > 200).map(a => {
      const img = [...a.querySelectorAll('img')].filter(vis)[0];
      const t = a.querySelector('h3');
      return { ...r(a), cover: img ? r(img) : null, title: t ? { text: t.innerText.trim().slice(0, 20), ...r(t) } : null };
    });
    res.feedMore = q('section[class*=CardFeedSection] a, section[class*=CardFeedSection] button').filter(a => a.getBoundingClientRect().height < 80).map(a => ({ text: a.innerText.trim().slice(0, 20), ...r(a) }));
    res.cta = r(one('section[class*=CTASection]'));
    res.ctaTitle = r(one('h2[class*=CTASection_title]'));
    res.ctaButtons = q('section[class*=CTASection] a, section[class*=CTASection] button').map(a => ({ text: a.innerText.trim().slice(0, 20), ...r(a) }));
    res.footer = r(one('footer'));
    return res;
  })()`);
  console.log('captured', tag);
}
writeFileSync(`${OUT}anchors.json`, JSON.stringify(anchors, null, 1));
await b.close();

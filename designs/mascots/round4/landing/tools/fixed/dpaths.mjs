import { launch } from '../../kit/cdp.mjs';
const b = await launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.open('http://localhost:3000/zh-TW', { width: w, height: h, mobile: w < 1024, dpr: 1 });
    const r = await p.eval(`(() => {
      const out = [];
      const sel = '[data-mascot="card-edge"] path[stroke], [data-mascot-zone] > div[aria-hidden="true"] > svg > path[stroke]';
      for (const path of document.querySelectorAll(sel)) {
        const d = path.getAttribute('d') || '';
        out.push({ cmds: [...new Set(d.match(/[a-zA-Z]/g) || [])].join(''), len: d.length, stroke: path.getAttribute('stroke'), tf: path.getAttribute('transform'), pl: path.getAttribute('pathLength'), vis: !!path.getBoundingClientRect().width, head: d.slice(0, 80) });
      }
      return JSON.stringify(out);
    })()`);
    const arr = JSON.parse(r);
    console.log(w, arr.length, JSON.stringify(arr.slice(0, 4), null, 0));
    console.log('cmd sets', [...new Set(arr.map(a => a.cmds))]);
  }
} finally { await b.close(); }

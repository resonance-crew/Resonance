// prototype.js — the landing page with its visitors, for review: captures of the live page in a browser window (or a
// phone) that scrolls, the stage engine running over them, and a few controls (labels in Traditional Chinese).
//
//   import { mountPrototype } from './stage/prototype.js';
//   const proto = await mountPrototype(el, { base: 'stage/' });   // base: where this folder is, relative to the page
//
// options: cast (default: cast.js), base, ledges (default: fetched from base + 'ledges.json'), flags (a query string:
// view=desktop|mobile, theme=light|dark, fps=12|smooth, size=60…160, reduced=0|1, ledges=1, scroll=<page px>,
// meet=1, seed=<n>). Returns a controller: { stage, view, scrollToPage(y), meet(), next(), setView(v), destroy() }.
import { createStage, loadCast } from './mascot-stage.js';
import { CAST } from './cast.js';

// per-character habits the engine reads (slugs without an entry have none). 悄悄 is the night one: by day it keeps
// to the footer and the CTA more than the bright hero (it is the heaviest dark on the page), and it comes round more
// often on the dark page. 點點 keeps its eyes open while it stretches (shut, its pale face would have no dark mark).
export const TRAITS = {
  tuck: { likes: ['read', 'reveal'] },
  tag: { pace: 1.1, likes: ['reveal', 'wave'] },
  card: { pace: 0.85, shuffle: true, likes: ['deco', 'read'] },
  dot: { likes: ['hop'], openStretch: true },
  night: { pace: 0.7, naps: true, likes: ['nap', 'twinkle'], zones: { light: { hero: 0.35, cta: 1.5, footer: 2 }, dark: { hero: 1.3, footer: 1.5 } }, often: { light: 0.8, dark: 1.6 } },
  tall: { naps: true, likes: ['twinkle'] }, pip: { likes: ['hop'] }, sheet: { likes: ['reveal', 'read'] },
};

const CSS = `
.msp{--_ink:var(--ink,#2f2721);--_muted:var(--muted,#76685c);--_line:var(--line,#ddd1c3);--_surface:var(--surface,#fffaf3);
  --_accent:var(--accent,#b85d36);--_on-accent:var(--on-accent,#fff);--_frame:var(--frame,#2a231f);--_chip:var(--chip,#f1e9de);
  color:var(--_ink);font:14px/1.5 system-ui,-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}
.msp *{box-sizing:border-box}
.msp-bar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:0 0 8px}
.msp-seg{display:inline-flex;align-items:center;border:1px solid var(--_line);border-radius:999px;padding:2px;background:var(--_surface)}
.msp-seg button,.msp-btn{border:0;background:none;color:inherit;font:inherit;min-height:34px;padding:5px 13px;border-radius:999px;cursor:pointer}
.msp-seg button[aria-pressed=true]{background:var(--_ink);color:var(--_surface)}
.msp-seg button:focus-visible,.msp-btn:focus-visible,.msp input:focus-visible{outline:2px solid var(--_accent);outline-offset:2px}
.msp-lab{padding:0 0 0 10px;color:var(--_muted)}
.msp-btn{border:1px solid var(--_line);background:var(--_surface)}
.msp-btn.msp-primary{background:var(--_accent);border-color:transparent;color:var(--_on-accent)}
.msp-btn:active{transform:translateY(1px)}
.msp-range{display:inline-flex;align-items:center;gap:8px}
.msp-range input{width:118px;accent-color:var(--_accent)}
.msp-range output{min-width:3.2em;font-variant-numeric:tabular-nums;color:var(--_muted)}
.msp-scale{font-size:12px;color:var(--_muted);flex-basis:100%;margin:-2px 0 0}
.msp-check{display:inline-flex;align-items:center;gap:6px;cursor:pointer;min-height:34px}
.msp-check input{accent-color:var(--_accent);width:16px;height:16px;margin:0}
.msp-cast{margin:4px 0 2px;font-size:13px;color:var(--_muted)}
.msp-status{min-height:3em;margin:2px 0 12px;color:var(--_muted);font-size:13px}
.msp-status b{color:var(--_ink);font-weight:600}
.msp-box{width:100%}
.msp-window{border:1px solid var(--_line);border-radius:12px;overflow:hidden;background:var(--_surface);box-shadow:0 18px 40px -28px rgb(40 25 10/.45)}
.msp-chrome{display:flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-bottom:1px solid var(--_line);background:var(--_chip)}
.msp-chrome i{width:10px;height:10px;border-radius:50%;background:var(--_line);flex:none}
.msp-chrome span{margin-left:8px;min-width:0;flex:0 1 320px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;color:var(--_muted);background:var(--_surface);border-radius:999px;padding:2px 12px}
.msp-phone{margin:0 auto;width:max-content;max-width:100%;padding:11px;border-radius:46px;background:var(--_frame);box-shadow:0 18px 40px -24px rgb(40 25 10/.6)}
.msp-phone .msp-scroll{border-radius:35px}
.msp-scroll{position:relative;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;overscroll-behavior:contain;background:#f8f3ec}
.msp-scroll::-webkit-scrollbar{display:none}
.msp-sizer{position:relative;overflow:hidden}
.msp-page{position:absolute;left:0;top:0;transform-origin:0 0;background:var(--msp-cap) 0 0/100% 100% no-repeat}
.msp-occ{position:absolute;background-image:var(--msp-cap);background-repeat:no-repeat;pointer-events:auto}
.msp-ledges{position:absolute;left:0;top:0;pointer-events:none;display:none;overflow:visible}
.msp.show-ledges .msp-ledges{display:block}
.msp-ledges text{font:600 var(--fs,13px) system-ui,-apple-system,"PingFang TC",sans-serif;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}
.msp-hint{position:sticky;bottom:10px;margin:-40px auto 0;width:max-content;max-width:90%;z-index:60;pointer-events:none;font-size:12px;color:#fff;background:rgb(40 30 22/.62);border-radius:999px;padding:4px 12px;transition:opacity .6s}
.msp-hint.gone{opacity:0}
`;

const HOW = {
  walk: side => `從${side === 'left' ? '左' : '右'}邊走進來`, climb: () => '從後面爬上來', rise: () => '從後面探出頭',
  slide: () => '從旁邊探出來', pop: () => '從頁面上翻起來（像立體書）',
};

export async function mountPrototype(container, opts = {}) {
  const base = opts.base ?? '';
  const q = new URLSearchParams(opts.flags || '');
  const doc = container.ownerDocument, win = doc.defaultView;
  const getJson = u => fetch(u).then(r => r.json());
  if (!doc.getElementById('msp-style')) {
    const st = doc.createElement('style'); st.id = 'msp-style'; st.textContent = CSS; doc.head.append(st);
  }
  const ledgesAll = opts.ledges || await getJson(base + 'ledges.json');
  const cast = (await loadCast((opts.cast || CAST).map(c => ({ ...c, base: base + c.base })), getJson))
    .map(c => ({ ...c, traits: { ...TRAITS[c.slug], ...c.traits } }));
  const mq = s => !!(win.matchMedia && win.matchMedia(s).matches);
  const rootTheme = doc.documentElement.getAttribute('data-theme');
  const S = {
    view: ['desktop', 'mobile'].includes(q.get('view')) ? q.get('view') : container.clientWidth < 640 ? 'mobile' : 'desktop',
    theme: ['light', 'dark'].includes(q.get('theme')) ? q.get('theme') : rootTheme || (mq('(prefers-color-scheme: dark)') ? 'dark' : 'light'),
    fps: q.get('fps') === 'smooth' ? 0 : 12,
    size: clampN(Number(q.get('size')) || 100, 60, 160),
    reduced: q.has('reduced') ? q.get('reduced') === '1' : mq('(prefers-reduced-motion: reduce)'),
    ledges: q.get('ledges') === '1',
    seed: q.has('seed') ? Number(q.get('seed')) : undefined,
  };

  container.innerHTML = `<div class="msp">
    <div class="msp-bar">
      <div class="msp-seg" role="group" aria-label="裝置"><button type="button" data-view="desktop">桌機</button><button type="button" data-view="mobile">手機</button></div>
      <div class="msp-seg" role="group" aria-label="頁面主題"><button type="button" data-theme-set="light">淺色</button><button type="button" data-theme-set="dark">深色</button></div>
      <button type="button" class="msp-btn" data-do="next">下一位</button>
      <button type="button" class="msp-btn msp-primary" data-do="meet">讓兩隻相遇</button>
    </div>
    <div class="msp-bar">
      <label class="msp-range">大小 <input type="range" min="60" max="160" step="5" data-size aria-label="角色大小"><output data-size-out></output></label>
      <div class="msp-seg" role="group" aria-label="動畫"><span class="msp-lab">動畫：</span><button type="button" data-fps="12">每秒 12 格（紙偶感）</button><button type="button" data-fps="0">流暢</button></div>
      <label class="msp-check"><input type="checkbox" data-reduced> 減少動態</label>
      <label class="msp-check"><input type="checkbox" data-ledges> 顯示落腳點</label>
      <p class="msp-scale" data-scale aria-live="polite"></p>
    </div>
    <p class="msp-cast" data-cast></p>
    <p class="msp-status" data-status aria-live="polite"></p>
    <div class="msp-box" data-box></div>
  </div>`;
  const $ = s => container.querySelector(s);
  const ui = $('.msp'), box = $('[data-box]'), status = $('[data-status]');
  $('[data-cast]').textContent = `上台名單：${cast.map(c => c.manifest.name || c.slug).join('、')}`;
  let stage = null, F = null;   // F: the current frame (elements, page size, scale)

  // --- the frame: a browser window (the 1440-wide page scaled to the column, 900 page px tall) or a 390 × 844 phone
  function buildFrame() {
    const V = ledgesAll[S.view], pw = V.page.w, ph = V.page.h;
    box.innerHTML = '';
    const frame = div(S.view === 'desktop' ? 'msp-window' : 'msp-phone');
    if (S.view === 'desktop') frame.innerHTML = '<div class="msp-chrome"><i></i><i></i><i></i><span>resonance.channel/zh-TW</span></div>';
    const scroll = div('msp-scroll'), sizer = div('msp-sizer'), page = div('msp-page'), hint = div('msp-hint');
    hint.textContent = '在畫面裡捲動，角色會換地方出現';
    page.style.width = `${pw}px`; page.style.height = `${ph}px`;
    page.innerHTML = ledgeSvg(V);
    sizer.append(page); scroll.append(sizer, hint); frame.append(scroll); box.append(frame);
    scroll.addEventListener('scroll', () => hint.classList.add('gone'), { passive: true });
    F = { V, pw, ph, frame, scroll, sizer, page, s: 1 };
    setCapture(); fit();
  }
  function fit() {
    const W = box.clientWidth || container.clientWidth || 360, { pw, ph, scroll, sizer, page, frame } = F;
    queueMicrotask(() => press && press());
    const y = F.s ? scroll.scrollTop / F.s : 0;
    let s;
    const room = Math.max(320, (win.innerHeight || 900) - 60);   // a short browser window gets a shorter frame
    if (S.view === 'desktop') { s = Math.max(0.2, (W - 2) / pw); scroll.style.height = `${Math.round(Math.min(F.V.page.vh * s, room - 34))}px`; scroll.style.width = ''; }
    else { s = Math.min(1, (W - 22) / pw, (room - 22) / F.V.page.vh); scroll.style.width = `${Math.round(pw * s)}px`; scroll.style.height = `${Math.round(F.V.page.vh * s)}px`; }
    F.s = s;
    sizer.style.width = `${pw * s}px`; sizer.style.height = `${ph * s}px`;
    page.style.transform = `scale(${s})`;
    frame.style.setProperty('--fs', `${Math.round(13 / Math.max(s, 0.5))}px`);
    scroll.scrollTop = y * s;
  }
  function setCapture() {
    F.page.style.setProperty('--msp-cap', `url("${base}captures/${S.view}-${S.theme}.webp")`);
  }

  // "behind an element" here = a crop of the capture over the character, clipped to that element's outline. It takes
  // the pointer as the real element in front of the character would (a hidden leg never steals a button's click);
  // on the real page use the engine's clip-path or z-index, never a crop that lets clicks through
  function behind(root, c) {
    const top = c.top && c.top.length ? c.top : null;
    const y0 = top ? Math.min(c.y, ...top.map(p => p[1])) - 1 : c.y, y1 = c.y + c.h + (c.depth || 0);
    const o = div('msp-occ');
    Object.assign(o.style, {
      left: `${c.x}px`, top: `${y0}px`, width: `${c.w}px`, height: `${y1 - y0}px`,
      backgroundPosition: `${-c.x}px ${-y0}px`, backgroundSize: `${F.pw}px ${F.ph}px`, zIndex: String((Number(root.style.zIndex) || 10) + 1),
    });
    if (top) {
      const pts = [[0, top[0][1] - y0], ...top.map(([x, y]) => [x - c.x, y - y0]), [c.w, top[top.length - 1][1] - y0], [c.w, y1 - y0], [0, y1 - y0]];
      o.style.clipPath = `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
    } else if (c.radius) o.style.borderRadius = `${c.radius}px ${c.radius}px 0 0`;   // the card's rounded corners
    root.parentElement.append(o);
    return () => o.remove();
  }

  function startStage() {
    if (stage) stage.destroy();
    const { V, pw, scroll } = F;
    stage = createStage({
      layer: F.page, ledges: V.ledges, content: V.content || [], unitHeight: V.unitHeight, theme: S.theme, reducedMotion: S.reduced, behind,
      viewport: () => ({ x: 0, y: scroll.scrollTop / F.s, w: pw, h: scroll.clientHeight / F.s }),
    }, cast, { size: S.size / 100, fps: S.fps, seed: S.seed, onEvent: say });
    say(S.reduced ? { type: 'still' } : { type: 'wait' });
  }

  // --- what's happening, in words
  const history = [];
  function say(e) {
    let t;
    if (e.type === 'wait') t = '等一下，第一位訪客馬上來…';
    else if (e.type === 'still') t = '減少動態：只有一隻安靜地站著，不走動、不眨眼';
    else if (e.pair || e.type === 'meet') t = e.label;
    else if (e.type === 'enter') t = `<b>${esc(e.name)}</b> ${HOW[e.how] ? HOW[e.how](e.side) : '來了'}，要去${esc(e.label || '')}`;
    else if (e.type === 'arrive') t = `<b>${esc(e.name)}</b> 到了${esc(e.label || '')}`;
    else if (e.type === 'act') t = `<b>${esc(e.name)}</b>：${esc(e.label || e.act)}`;
    else if (e.type === 'leave') t = `<b>${esc(e.name)}</b>：${esc(e.label || '要走了')}`;
    if (!t) return;
    history.unshift(t); history.length = Math.min(history.length, 2);
    status.innerHTML = history.map((h, i) => `<span style="opacity:${i ? 0.55 : 1}">${h}</span>`).join('<br>');
  }

  // --- controls
  const press = () => {
    for (const b of container.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
    for (const b of container.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === S.theme));
    for (const b of container.querySelectorAll('[data-fps]')) b.setAttribute('aria-pressed', String(Number(b.dataset.fps) === S.fps));
    $('[data-size]').value = String(S.size); $('[data-size-out]').textContent = `${S.size}%`;
    if (F) {   // the page is drawn smaller than it is here: say how big the characters are on the real page
      const real = Math.round(F.V.unitHeight * S.size / 100), seen = Math.round(real * F.s);
      $('[data-scale]').textContent = F.s < 0.98
        ? `這裡把 ${F.pw} px 寬的頁面縮成 ${Math.round(F.s * 100)}%：真站上摺摺高 ${real} px，在這個框裡看起來約 ${seen} px。請看牠和頁面元素的比例。`
        : `頁面 1:1：摺摺高 ${real} px。`;
    }
    $('[data-reduced]').checked = S.reduced; $('[data-ledges]').checked = S.ledges;
    ui.classList.toggle('show-ledges', S.ledges);
  };
  function setView(v) { if (v === S.view && F) return; S.view = v; buildFrame(); startStage(); press(); }
  function setTheme(t) { S.theme = t; setCapture(); stage.setTheme(t); press(); }
  async function meet() {
    if (S.reduced) { say({ type: 'still' }); return false; }
    const variant = q.get('variant') || undefined;
    if (stage.meet(variant)) return true;
    // bring a wave everyone can walk along into view first, then call them
    const vh = F.scroll.clientHeight / F.s, now = F.scroll.scrollTop / F.s;
    const lines = F.V.ledges.filter(l => l.meet && l.kind === 'line').map(l => Math.max(...l.points.map(p => p[1])));
    if (!lines.length) return false;
    const y = lines.sort((a, b) => Math.abs(a - now - vh / 2) - Math.abs(b - now - vh / 2))[0];
    scrollToPage(clampN(y - vh * 0.7, 0, F.ph - vh), true);
    await new Promise(r => setTimeout(r, 650));
    return stage.meet(variant);
  }
  // a visitor at a given ledge (by id) — for demos and checks: scroll it into view, then call someone there
  function visitAt(id, slug, acts) {
    const l = F.V.ledges.find(x => x.id === id); if (!l) return false;
    const y = l.points ? l.points.reduce((s, p) => s + p[1], 0) / l.points.length : l.kind === 'peek' ? l.ground ?? l.cover.y + l.cover.h : l.y;
    const vh = F.scroll.clientHeight / F.s;
    scrollToPage(clampN(y - vh * 0.7, 0, F.ph - vh));
    return stage.visit({ ledge: id, slug: slug || undefined, acts: acts ? String(acts).split(/[\s+,]+/).filter(Boolean) : undefined });
  }
  function scrollToPage(y, smooth = false) { F.scroll.scrollTo({ top: y * F.s, behavior: smooth ? 'smooth' : 'auto' }); }

  container.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !container.contains(b)) return;
    if (b.dataset.view) setView(b.dataset.view);
    else if (b.dataset.themeSet) setTheme(b.dataset.themeSet);
    else if (b.dataset.fps != null) { S.fps = Number(b.dataset.fps); stage.setOptions({ fps: S.fps }); press(); }
    else if (b.dataset.do === 'next') stage.next();
    else if (b.dataset.do === 'meet') meet();
  });
  $('[data-size]').addEventListener('input', e => { S.size = Number(e.target.value); stage.setOptions({ size: S.size / 100 }); press(); });
  $('[data-reduced]').addEventListener('change', e => { S.reduced = e.target.checked; stage.setReducedMotion(S.reduced); say({ type: S.reduced ? 'still' : 'wait' }); press(); });
  $('[data-ledges]').addEventListener('change', e => { S.ledges = e.target.checked; press(); });
  const ro = win.ResizeObserver ? new win.ResizeObserver(() => { const w = box.clientWidth; if (w !== F.lastW) { F.lastW = w; fit(); } }) : null;
  if (ro) ro.observe(box);
  const onResize = () => fit();
  win.addEventListener('resize', onResize);

  buildFrame(); startStage(); press();
  if (q.has('scroll')) scrollToPage(Number(q.get('scroll')) || 0);
  if (q.get('meet') === '1') setTimeout(meet, 400);
  if (q.has('at')) setTimeout(() => visitAt(q.get('at'), q.get('who'), q.get('do')), 300);
  return {
    get stage() { return stage; }, get view() { return S.view; }, get frame() { return F; },
    scrollToPage, meet, visitAt, next: () => stage.next(), setView, setTheme,
    destroy() { if (ro) ro.disconnect(); win.removeEventListener('resize', onResize); stage.destroy(); container.innerHTML = ''; },
  };

  function div(cls) { const d = doc.createElement('div'); d.className = cls; return d; }
}

function clampN(v, a, b) { return Math.min(b, Math.max(a, v)); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

// the ledges drawn over the page (顯示落腳點): walk-along lines, sit/stand edges, peek-behind rects, stand spots
function ledgeSvg(V) {
  const { w, h } = V.page, col = { line: '#c2552c', edge: '#2f73a8', peek: '#7b4fb0', spot: '#2e8a4e' };
  const pts = p => p.map(([x, y]) => `${x},${y}`).join(' ');
  const label = (x, y, t, c) => `<text x="${x}" y="${y}" fill="${c}" text-anchor="middle">${esc(t)}</text>`;
  const out = V.ledges.map(l => {
    const c = col[l.kind];
    if (l.kind === 'line' || l.kind === 'edge') {
      const m = l.points[Math.floor(l.points.length / 2)];
      return `<polyline points="${pts(l.points)}" fill="none" stroke="${c}" stroke-width="${l.kind === 'line' ? 4 : 5}" stroke-linecap="round" ${l.kind === 'line' ? 'stroke-dasharray="10 7"' : ''}/>`
        + label(l.kind === 'line' ? Math.min(w - 90, Math.max(90, m[0] + (l.id === 'cta-wave' ? 260 : -260))) : m[0], m[1] - 10, `${l.id}${l.kind === 'edge' ? (l.stance === 'stand' ? '（站）' : '（坐）') : '（走）'}`, c);
    }
    if (l.kind === 'peek') {
      const r = l.cover, arrow = { top: [r.x + r.w / 2, r.y - 4, 0, -22], left: [r.x - 4, r.y + r.h / 2, -22, 0], right: [r.x + r.w + 4, r.y + r.h / 2, 22, 0] }[l.side];
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width="2.5" stroke-dasharray="7 5"/>`
        + `<path d="M${arrow[0]} ${arrow[1]} l${arrow[2]} ${arrow[3]}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`
        + label(arrow[0] + arrow[2] * 1.6, arrow[1] + arrow[3] * 1.6 + (l.side === 'top' ? -4 : -10), `${l.id}（探頭）`, c);
    }
    if (l.kind === 'spot') {
      return `<circle cx="${l.x}" cy="${l.y}" r="7" fill="${c}"/><path d="M${l.x} ${l.y} v-60" stroke="${c}" stroke-width="2.5" stroke-dasharray="4 4"/>`
        + (l.target ? `<path d="M${l.x} ${l.y - 40} L${l.target[0]} ${l.target[1]}" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 5"/>` : '')
        + label(l.x, l.y - 68, `${l.id}（站）`, c);
    }
    return '';
  });
  return `<svg class="msp-ledges" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${out.join('')}</svg>`;
}

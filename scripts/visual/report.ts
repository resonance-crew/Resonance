/**
 * The run's report: `visual/runs/<id>/index.html`, a static page that shows
 * what changed first (baseline · now · diff, with the review's verdict), then
 * what is new or missing, then everything unchanged as thumbnails. Images are
 * linked by relative path, so the page opens straight from disk.
 */
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BASELINE_DIR, readJson } from './util';
import { readVerdicts, type Verdict } from './review';
import type { Result, RunInfo } from './compare';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ORDER: Record<string, number> = { broken: 0, unsure: 1, changed: 2, missing: 3, new: 4, intended: 5, ok: 6, unchanged: 7 };

function figure(label: string, src: string | null) {
  if (!src) return `<figure class="empty"><figcaption>${label}</figcaption><div>—</div></figure>`;
  return `<figure><figcaption>${label}</figcaption><a href="${esc(src)}" target="_blank"><img loading="lazy" src="${esc(src)}" alt="${label}"></a></figure>`;
}

function item(runDir: string, r: Result, v: Verdict | undefined, runId: string) {
  const base = r.status === 'changed' || r.status === 'missing' ? relative(runDir, join(BASELINE_DIR, r.key)) : null;
  const now = r.status === 'missing' ? null : r.key;
  const diff = r.status === 'changed' && !r.sizes ? `_diff/${r.key}` : null;
  const ratio = r.ratio != null && r.status === 'changed' ? ` · ${(r.ratio * 100).toFixed(2)}% of pixels` : '';
  const sizes = r.sizes ? ` · size ${r.sizes.baseline.join('×')} → ${r.sizes.current.join('×')}` : '';
  const tag = v ? `<span class="tag v-${v.verdict}">${v.verdict}</span>` : '';
  const note = v?.note ? `<p class="note">${esc(v.note)}</p>` : '';
  const accept = r.status === 'missing' ? '' : `<code>npm run visual -- accept --run ${esc(runId)} --only ${esc(r.key)}</code>`;
  return `<article data-status="${r.status}" data-verdict="${v?.verdict ?? ''}">
  <header><h3>${esc(r.key)}</h3><span class="tag s-${r.status}">${r.status}</span>${tag}<span class="meta">${ratio}${sizes}</span></header>
  ${note}
  <div class="row">${figure('Baseline', base)}${figure('Now', now)}${r.status === 'changed' ? figure('Diff', diff) : ''}</div>
  ${accept}
</article>`;
}

export function writeReport(runDir: string, results: Result[]): string {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  const verdicts = readVerdicts(runDir);
  const rank = (r: Result) => Math.min(ORDER[r.status], ORDER[verdicts.get(r.key)?.verdict ?? 'unchanged']);
  const attention = results.filter((r) => r.status !== 'unchanged').sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
  const unchanged = results.filter((r) => r.status === 'unchanged');
  const count = (s: string) => results.filter((r) => r.status === s).length;
  const broken = [...verdicts.values()].filter((v) => v.verdict === 'broken').length;
  const unsettled = info?.unsettled ?? [];
  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual run ${esc(info?.id ?? '')}</title>
<style>
:root{--bg:#faf6ee;--fg:#2b2622;--muted:#7a7068;--line:#e3dacb;--card:#fffdf8;--red:#c0392b;--green:#2e7d4f;--amber:#b7791f;--blue:#2c5d8f}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--fg:#ece5da;--muted:#a39888;--line:#3a332c;--card:#26221e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,system-ui,sans-serif;padding:24px 16px}
main{max-width:1400px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 12px}
.sub{color:var(--muted);margin:0 0 16px}.chips{display:flex;gap:8px;flex-wrap:wrap}
.chips button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 12px;cursor:pointer;font:inherit}
.chips button[aria-pressed=true]{border-color:var(--fg)}
article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}
article header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}h3{font-size:14px;margin:0;font-family:ui-monospace,monospace}
.meta{color:var(--muted)}.note{margin:8px 0 0}.tag{font-size:12px;border-radius:6px;padding:1px 8px;border:1px solid currentColor}
.s-changed,.v-unsure{color:var(--amber)}.s-new,.v-intended{color:var(--blue)}.s-missing,.v-broken{color:var(--red)}.v-ok,.s-unchanged{color:var(--green)}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0}
figure{margin:0}figcaption{color:var(--muted);font-size:12px;margin-bottom:4px}
figure img{width:100%;max-height:640px;object-fit:contain;object-position:top;border:1px solid var(--line);border-radius:6px;background:#fff}
figure.empty div{color:var(--muted)}code{font-size:12px;color:var(--muted);word-break:break-all}
.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.thumbs a{font-size:11px;color:var(--muted);text-decoration:none;word-break:break-all}.thumbs img{width:100%;height:220px;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:4px}
.warn{color:var(--amber)}
</style></head><body><main>
<h1>Release screenshots · ${esc(info?.id ?? '')}</h1>
<p class="sub">${esc((info?.platforms ?? []).join(', '))} · commit ${esc(info?.commit?.slice(0, 8) ?? '?')}${info?.dirty ? ' (with uncommitted changes)' : ''} · ${count('changed')} changed · ${count('new')} new · ${count('missing')} missing · ${unchanged.length} unchanged${verdicts.size ? ` · review: ${broken} broken` : ''}</p>
${unsettled.length ? `<p class="warn">Never stopped changing (taken anyway): ${unsettled.map(esc).join(', ')}</p>` : ''}
<div class="chips" role="group" aria-label="Filter">
<button aria-pressed="true" data-f="">All needing a look (${attention.length})</button><button aria-pressed="false" data-f="broken">Broken</button><button aria-pressed="false" data-f="changed">Changed</button><button aria-pressed="false" data-f="new">New</button><button aria-pressed="false" data-f="missing">Missing</button>
</div>
<h2>Needs a look</h2>
${attention.map((r) => item(runDir, r, verdicts.get(r.key), info?.id ?? '')).join('\n') || '<p class="sub">Nothing changed.</p>'}
<details><summary><h2 style="display:inline">Unchanged (${unchanged.length})</h2></summary>
<div class="thumbs">${unchanged.map((r) => `<a href="${esc(r.key)}" target="_blank"><img loading="lazy" src="${esc(r.key)}" alt="">${esc(r.key)}</a>`).join('')}</div>
</details>
</main>
<script>
document.querySelectorAll('.chips button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.chips button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const f=b.dataset.f;document.querySelectorAll('article').forEach(a=>{a.hidden=!!f&&a.dataset.status!==f&&a.dataset.verdict!==f;});
}));
</script></body></html>
`;
  const file = join(runDir, 'index.html');
  writeFileSync(file, html);
  return file;
}

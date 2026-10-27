// cdp4.mjs — kit/cdp.mjs with: reduced motion as an option (the kit's always asks for it), console errors and
// exceptions collected per page (p.errors), and setMedia() to change the scheme / motion live.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'mascot-cdp4-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--font-render-hinting=none',
    '--window-size=1440,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((ok, fail) => {
    let err = '';
    proc.stderr.on('data', c => { err += c; const m = err.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
    proc.on('exit', code => fail(new Error(`Chrome exited (${code}): ${err.slice(-400)}`)));
  });
  const ws = new WebSocket(url);
  await new Promise((ok, fail) => { ws.onopen = () => ok(); ws.onerror = () => fail(new Error('socket')); });
  let next = 1; const pending = new Map(); const sessions = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(String(ev.data));
    if (m.id == null) { const h = m.sessionId && sessions.get(m.sessionId); if (h) h(m); return; }
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result);
  };
  const send = (method, params = {}, sessionId) => { const id = next++; ws.send(JSON.stringify({ id, method, params, sessionId })); return new Promise((ok, fail) => pending.set(id, { ok, fail })); };
  return {
    pid: proc.pid,
    async open(url, { width = 1440, height = 900, dpr = 1, mobile = false, dark = false, reduced = false, wait = 0 } = {}) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const errors = [];
      const hooks = [];
      sessions.set(sessionId, m => {
        for (const h of hooks) h(m);
        if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
        if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning' || m.params.type === 'warn')) errors.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
        if (m.method === 'Log.entryAdded' && (m.params.entry.level === 'error')) errors.push('log: ' + m.params.entry.text.slice(0, 300) + ' ' + (m.params.entry.url || ''));
      });
      const s = (m, p) => send(m, p, sessionId);
      await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable');
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
      if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const media = { dark, reduced };
      const setMedia = async (o = {}) => {
        Object.assign(media, o);
        await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: media.dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: media.reduced ? 'reduce' : 'no-preference' }] });
      };
      await setMedia();
      if (arguments[1] && arguments[1].before) await arguments[1].before({ send: s, on: fn => hooks.push(fn) });
      await s('Page.navigate', { url });
      const evalJs = async expr => {
        const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      };
      for (let i = 0; i < 600; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 50)); }
      await evalJs('document.fonts ? document.fonts.ready.then(() => 1) : 1');
      if (wait) await new Promise(r => setTimeout(r, wait));
      return {
        eval: evalJs, send: s, errors, setMedia, on: fn => hooks.push(fn),
        async resize(w, h, o = {}) {
          await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: o.dpr ?? dpr, mobile: o.mobile ?? mobile });
          width = w; height = h;
        },
        async shot({ clip, full = false, scale = 1 } = {}) {
          let params = { format: 'png', captureBeyondViewport: full };
          if (full) { const h = await evalJs('document.documentElement.scrollHeight'); params.clip = { x: 0, y: 0, width, height: h, scale }; }
          if (clip) params.clip = { ...clip, scale };
          const { data } = await s('Page.captureScreenshot', params);
          return Buffer.from(data, 'base64');
        },
        async close() { sessions.delete(sessionId); await send('Target.closeTarget', { targetId }).catch(() => {}); },
      };
    },
    async close() { ws.close(); proc.kill(); await new Promise(r => setTimeout(r, 200)); try { rmSync(profile, { recursive: true, force: true }); } catch {} },
  };
}

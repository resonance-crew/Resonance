/**
 * Headless Chrome over the DevTools protocol (Node's own WebSocket, no browser library), as scripts/promo/render.ts
 * drives it: CHROME_PATH, else the usual install.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function chromePath(): string {
  const found = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p): p is string => !!p && existsSync(p));
  if (!found) throw new Error('Chrome not found: set CHROME_PATH');
  return found;
}

type Pending = { ok: (v: unknown) => void; fail: (e: Error) => void };

export class Cdp {
  private next = 1;
  private pending = new Map<number, Pending>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id == null) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.fail(new Error(msg.error.message));
      else p.ok(msg.result);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      ws.addEventListener('open', () => ok(), { once: true });
      ws.addEventListener('error', () => fail(new Error('DevTools socket failed')), { once: true });
    });
    return new Cdp(ws);
  }

  send<T = unknown>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<T>((ok, fail) => this.pending.set(id, { ok: ok as (v: unknown) => void, fail }));
  }

  close(): void {
    this.ws.close();
  }
}

export interface Browser {
  cdp: Cdp;
  close(): Promise<void>;
}

export async function launchChrome(): Promise<Browser> {
  const profile = mkdtempSync(join(tmpdir(), 'resonance-stickers-chrome-'));
  const proc: ChildProcess = spawn(chromePath(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
    '--font-render-hinting=none', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--window-size=900,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise<string>((ok, fail) => {
    let err = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      err += chunk.toString();
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) ok(m[1]);
    });
    proc.on('exit', code => fail(new Error(`Chrome exited (${code}): ${err.slice(-500)}`)));
  });
  const cdp = await Cdp.connect(url);
  return {
    cdp,
    async close() {
      cdp.close();
      const exited = new Promise(r => proc.once('exit', r));
      proc.kill();
      await exited;
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

export interface Page {
  eval<T>(expression: string): Promise<T>;
  shot(): Promise<Buffer>;
  close(): Promise<void>;
}

/** A transparent page `width` × `height` CSS px at `dpr`. */
export async function openPage(cdp: Cdp, url: string, { width, height, dpr = 1 }: { width: number; height: number; dpr?: number }): Promise<Page> {
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  const send = <T>(method: string, params: object = {}) => cdp.send<T>(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
      'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return {
    eval: evaluate,
    async shot() {
      const { data } = await send<{ data: string }>('Page.captureScreenshot', {
        format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: false,
      });
      return Buffer.from(data, 'base64');
    },
    async close() {
      await cdp.send('Target.closeTarget', { targetId });
    },
  };
}

/**
 * The flows of one platform in one Maestro session (`VISUAL_FLOWS_SESSION=1`): one `maestro test` with every flow,
 * instead of one per flow — Maestro's JVM started and the device's driver connected once, not 24 times (some 3–4 s of
 * JVM alone each; flows.ts maestroArgs already keeps the driver from being reinstalled).
 *
 * Every flow still starts from a fresh world and a ready device, as when each was a run of its own: the flows run as
 * copies (in `<out>/_session/flows/`, beside copies of `common/` and `assets/`, so their relative paths hold) whose
 * header gains one `onFlowStart` command — `before.js`, which asks this runner over HTTP to put back what the last
 * flow's tags changed, reseed (stack.ts `seed`) and ready the device (`prepareFlow`), and fails the flow if it can't.
 * The repository's flows are never changed, and run alone (the MCP, the old way) they know nothing of it.
 *
 * Each flow's verdict comes from the session's JUnit report (one testcase per flow, by its `name:`, the file's name);
 * a flow the report doesn't name (the session ended early) is run again the old way by the caller.
 */
import { createServer, type Server } from 'node:http';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the runner does before each flow (the hook's answer waits for it). */
export type BeforeFlow = (flow: string) => Promise<void>;

/** The hook a session's flows run first: asks the runner, fails the flow when it says no. Run in Maestro's GraalJS. */
export const BEFORE_JS = `// The runner's turn before this flow in a shared Maestro session (scripts/visual/flowSession.ts): it reseeds the world
// and readies the device, then answers. Written beside the session's copies of the flows; never in the repository.
const res = http.post(HOOK_URL + '/before?flow=' + encodeURIComponent(FLOW), { body: '' });
if (res.status !== 200) throw new Error('the runner could not ready ' + FLOW + ': ' + res.body);
`;

/**
 * A flow's YAML with the runner's hook first in its `onFlowStart` (one made when it has none), its flow name passed in.
 * Only the header (before the first `---`) is touched.
 */
export function withHook(yaml: string, flow: string): string {
  const cut = yaml.search(/^---\s*$/m);
  if (cut < 0) throw new Error(`${flow}: no header to add the session's hook to`);
  const header = yaml.slice(0, cut);
  const rest = yaml.slice(cut);
  const command = `  - runScript:\n      file: before.js\n      env:\n        FLOW: ${flow}\n`;
  if (/^onFlowStart:\s*$/m.test(header)) return header.replace(/^onFlowStart:\s*\n/m, (line) => line + command) + rest;
  return `${header}${header.endsWith('\n') ? '' : '\n'}onFlowStart:\n${command}${rest}`;
}

export type CaseResult = { flow: string; passed: boolean; seconds: number };

/** The testcases of Maestro's JUnit report: each one's name, whether it passed, its time. */
export function parseJunit(xml: string): CaseResult[] {
  const out: CaseResult[] = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = m[1];
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1];
    if (!name) continue;
    const status = /\bstatus="([^"]*)"/.exec(attrs)?.[1];
    const failed = /<(failure|error)\b/.test(m[3] ?? '') || (status != null && status !== 'SUCCESS');
    out.push({ flow: name, passed: !failed, seconds: Math.round(Number(/\btime="([^"]*)"/.exec(attrs)?.[1] ?? 0)) });
  }
  return out;
}

/** The session's copies of the flows, with the hook and copies of what they read (`common/`, `assets/`). */
export function writeSessionFlows(dir: string, flowsDir: string, flows: readonly string[]): string[] {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Copies, not links: Maestro looks for a flow's files inside its workspace and follows no link out of it (a linked
  // assets/ left send-picture's paper.png "not found in workspace", and the whole session stopped before its first flow).
  for (const shared of ['common', 'assets']) cpSync(join(flowsDir, shared), join(dir, shared), { recursive: true });
  writeFileSync(join(dir, 'before.js'), BEFORE_JS);
  return flows.map((flow) => {
    const file = join(dir, `${flow}.yaml`);
    writeFileSync(file, withHook(readFileSync(join(flowsDir, `${flow}.yaml`), 'utf8'), flow));
    return file;
  });
}

/**
 * The runner's side of the hook: an HTTP server on loopback whose `/before?flow=` runs `before` (one at a time) and
 * answers 200, or 500 with why. Answers its address and how to stop it.
 */
export async function hookServer(before: BeforeFlow): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  let line = Promise.resolve();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const flow = url.searchParams.get('flow');
    if (url.pathname !== '/before' || !flow) {
      res.writeHead(404).end('no such hook');
      return;
    }
    line = line.then(async () => {
      try {
        await before(flow);
        res.writeHead(200).end('ok');
      } catch (error) {
        res.writeHead(500).end(String((error as Error)?.message ?? error).slice(0, 300));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, server, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

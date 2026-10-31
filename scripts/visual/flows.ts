/**
 * The interaction flows: Maestro YAML in `maestro/flows/` (see maestro/README.md), run on the
 * harness's own phone — the `Visual iPhone` simulator or the `visual-phone` AVD — against the
 * private stack, the world reseeded before every flow so each starts from the same data.
 *
 *   npx tsx scripts/visual/flows.ts <android|ios> [--only sign-in,send-message] [--run <id>] [--no-stack]
 *   npx tsx scripts/visual/flows.ts <android|ios> --hold   # stack + device + app up, for drafting a flow
 *
 * Reports land in `visual/flows/<run>/<platform>/`: `<flow>.xml` (JUnit) and `<flow>/` (Maestro's
 * commands, logs and the flow's `takeScreenshot`s). `VISUAL_SKIP_BUILD=1` reuses the last build.
 * Exits non-zero when a flow failed. `runFlows(platform, ctx)` is the same run for a caller that
 * already has the stack up (run.ts).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { startStack, seed, type Stack } from './stack';
import { PORTS, ROOT, SEED_PASSWORD, VISUAL_DIR, sleep, type CaptureContext } from './util';

export type FlowPlatform = 'ios' | 'android';
export type FlowResult = { flow: string; passed: boolean; seconds: number };

const FLOWS_DIR = join(ROOT, 'maestro/flows');
/** The flows in the order a run takes them; any other top-level flow follows, by name. */
const ORDER = [
  'sign-in', 'send-message', 'send-sticker', 'react-reply', 'unsend-message', 'chat-draft', 'answer-letter',
  'leave-note', 'resonate', 'open-notification', 'publish-card', 'trash-restore',
];

/** Where Maestro lives (the official installer's place unless MAESTRO_BIN says otherwise) and the Java it runs on. */
const MAESTRO = process.env.MAESTRO_BIN || join(homedir(), '.maestro/bin/maestro');
const ANDROID_STUDIO_JBR = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';

export function maestroEnv(): NodeJS.ProcessEnv {
  const javaHome = process.env.JAVA_HOME || (existsSync(ANDROID_STUDIO_JBR) ? ANDROID_STUDIO_JBR : undefined);
  return {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH}` } : {}),
    MAESTRO_CLI_NO_ANALYTICS: '1',
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  };
}

/** Every flow file at the top of maestro/flows (subflows live in its folders), `only` first narrowing it. */
export function flowsToRun(only: string[]): string[] {
  const all = readdirSync(FLOWS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));
  const known = ORDER.filter((f) => all.includes(f));
  const ordered = [...known, ...all.filter((f) => !ORDER.includes(f)).sort()];
  const unknown = only.filter((o) => !all.includes(o));
  if (unknown.length) throw new Error(`No such flow: ${unknown.join(', ')} (have ${ordered.join(', ')})`);
  return only.length ? ordered.filter((f) => only.includes(f)) : ordered;
}

/** What every flow's launch reads (`-e`): the stack's ports and the seeded accounts' password. */
export function flowEnv(ports: typeof PORTS): Record<string, string> {
  return {
    AUTH_PORT: String(ports.auth),
    FIRESTORE_PORT: String(ports.firestore),
    API_PORT: String(ports.dev),
    PASSWORD: SEED_PASSWORD,
  };
}

/** A device brought up for the flows: its id for `maestro --device`, and how to put it away. */
type Device = { id: string; prepareFlow: () => Promise<void>; close: () => Promise<void> };

async function iosDevice(ctx: CaptureContext): Promise<Device> {
  const ios = await import('./ios');
  await ios.build(ctx);
  const phone = ios.IOS_DEVICES.find((d) => d.phone)!;
  const { udid, booted } = await ios.simulator(phone, ctx);
  spawnSync('xcrun', ['simctl', 'terminate', udid, ios.BUNDLE_ID], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'install', udid, ios.APP], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'ui', udid, 'appearance', 'light'], { stdio: 'ignore' });
  return {
    id: udid,
    prepareFlow: async () => {},
    close: async () => {
      spawnSync('xcrun', ['simctl', 'terminate', udid, ios.BUNDLE_ID], { stdio: 'ignore' });
      if (booted) ios.shutDown(udid);
    },
  };
}

async function androidDevice(ctx: CaptureContext): Promise<Device> {
  const android = await import('./android');
  const phone = android.ANDROID_DEVICES.find((d) => d.phone)!;
  const serial = android.serialOf(phone);
  await Promise.all([android.build(ctx), android.warmUp(ctx)]);
  const booted = await android.boot(phone, ctx);
  await android.holdStill(serial, ctx);
  await android.adb(serial, 'install', '-r', '-t', android.APK);
  // No keyboard while the flows type: Maestro presses keys for plain ASCII, and Gboard would take
  // them as Zhuyin in a Chinese app (and capitalise an email). The system puts a keyboard back when
  // none is enabled, so a quiet one stands in — Google's voice input, which shows nothing and passes
  // keys through as they are; text with other characters goes through Maestro's own input method.
  // Put back as it was when the flows end.
  const listed = async (all: boolean) =>
    (await android.shell(serial, `ime list -s${all ? ' -a' : ''}`)).split('\n').map((l) => l.trim()).filter(Boolean);
  const enabled = await listed(false);
  const quiet = (await listed(true)).find((ime) => /voice/i.test(ime));
  const defaultIme = await android.shell(serial, 'settings get secure default_input_method');
  const keyboardsOff = async () => {
    if (quiet) {
      await android.shell(serial, `ime enable ${quiet}`).catch(() => {});
      await android.shell(serial, `ime set ${quiet}`).catch(() => {});
    }
    for (const ime of await listed(false)) {
      if (ime !== quiet) await android.shell(serial, `ime disable ${ime}`).catch(() => {});
    }
  };
  return {
    id: serial,
    // A fresh install's data, in light mode and Chinese (the app follows its own locale while nothing is
    // saved). Done here rather than by the flow's `clearState`, which would drop the app's locale again.
    prepareFlow: async () => {
      await android.shell(serial, `am force-stop ${android.PACKAGE}`);
      await android.shell(serial, `pm clear ${android.PACKAGE}`);
      await android.shell(serial, `cmd locale set-app-locales ${android.PACKAGE} --locales zh-TW`);
      await android.shell(serial, 'cmd uimode night no');
      await keyboardsOff();
    },
    close: async () => {
      await android.shell(serial, `am force-stop ${android.PACKAGE}`).catch(() => {});
      for (const ime of enabled) await android.shell(serial, `ime enable ${ime}`).catch(() => {});
      if (quiet && !enabled.includes(quiet)) await android.shell(serial, `ime disable ${quiet}`).catch(() => {});
      if (defaultIme && defaultIme !== 'null') await android.shell(serial, `ime set ${defaultIme}`).catch(() => {});
      if (booted && process.env.VISUAL_KEEP_DEVICES !== '1') await android.kill(serial);
    },
  };
}

function maestroTest(deviceId: string, flow: string, outDir: string, ports: typeof PORTS, logFile: string): Promise<boolean> {
  const env = Object.entries(flowEnv(ports)).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const args = [
    '--device', deviceId, 'test', join(FLOWS_DIR, `${flow}.yaml`), ...env,
    '--format', 'junit', '--output', join(outDir, `${flow}.xml`),
    '--test-output-dir', join(outDir, flow), '--debug-output', join(outDir, flow, 'debug'), '--flatten-debug-output',
    '--no-ansi',
  ];
  return new Promise((done) => {
    const child = spawn(MAESTRO, args, { cwd: ROOT, env: maestroEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => out.push(b));
    child.on('close', (code) => {
      mkdirSync(join(outDir, flow), { recursive: true });
      writeFileSync(logFile, Buffer.concat(out));
      done(code === 0);
    });
  });
}

/**
 * Runs the flows on one platform against a stack that is up (`ctx.devUrl`, `ctx.ports`): builds and
 * installs the app, brings up the harness's phone, reseeds before each flow. `ctx.runDir` is the
 * run's folder (`visual/flows/<run>`); reports go to `<runDir>/<platform>/`.
 */
export async function runFlows(platform: FlowPlatform, ctx: CaptureContext): Promise<FlowResult[]> {
  if (!existsSync(MAESTRO)) throw new Error(`No Maestro at ${MAESTRO}: install it (maestro/README.md) or set MAESTRO_BIN`);
  const flows = flowsToRun(ctx.only);
  const outDir = join(ctx.runDir, platform);
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const device = platform === 'ios' ? await iosDevice(ctx) : await androidDevice(ctx);
  const results: FlowResult[] = [];
  try {
    for (const flow of flows) {
      await seed(ctx.log);
      await device.prepareFlow();
      const started = Date.now();
      const passed = await maestroTest(device.id, flow, outDir, ctx.ports, join(outDir, flow, 'maestro.log'));
      const seconds = Math.round((Date.now() - started) / 1000);
      results.push({ flow, passed, seconds });
      ctx.log(`  ${passed ? 'pass' : 'FAIL'}  ${platform}/${flow}  (${seconds} s)${passed ? '' : `  see ${join(outDir, flow, 'maestro.log')}`}`);
    }
  } finally {
    await device.close();
  }
  return results;
}

/** Brings the stack, the phone and the app up and keeps them so until Ctrl-C (drafting a flow with the MCP). */
async function hold(platform: FlowPlatform, ctx: CaptureContext) {
  const device = platform === 'ios' ? await iosDevice(ctx) : await androidDevice(ctx);
  await device.prepareFlow();
  ctx.log(`\nReady: ${platform} device ${device.id}, stack on auth ${ctx.ports.auth} / firestore ${ctx.ports.firestore} / api ${ctx.ports.dev}.`);
  ctx.log(`Flows take: ${Object.entries(flowEnv(ctx.ports)).map(([k, v]) => `-e ${k}=${v}`).join(' ')} --device ${device.id}`);
  ctx.log('Ctrl-C puts everything away.');
  // Ours alone (the stack's own Ctrl-C handler would exit before the device is put away); the
  // stack stops after this returns (main's finally).
  process.removeAllListeners('SIGINT');
  await new Promise<void>((resolve) => process.once('SIGINT', () => resolve()));
  await device.close();
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const platform = args[0] as FlowPlatform;
  if (platform !== 'ios' && platform !== 'android') {
    console.log('Usage: npx tsx scripts/visual/flows.ts <android|ios> [--only sign-in,send-message] [--run <id>] [--no-stack] [--hold]');
    process.exit(platform ? 1 : 0);
  }
  const id = flag(args, 'run') ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const runDir = join(VISUAL_DIR, 'flows', id);
  mkdirSync(join(runDir, '_logs'), { recursive: true });
  const log = (line: string) => console.log(line);
  let stack: Stack | undefined;
  let failed = 0;
  try {
    stack = args.includes('--no-stack')
      ? { devUrl: process.env.VISUAL_DEV_URL || `http://localhost:${PORTS.dev}`, stop: () => {} }
      : await startStack(join(runDir, '_logs'), log);
    const ctx: CaptureContext = {
      runDir,
      devUrl: stack.devUrl,
      ports: PORTS,
      only: (flag(args, 'only') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      devices: [],
      log,
    };
    if (args.includes('--hold')) return await hold(platform, ctx);
    const results = await runFlows(platform, ctx);
    failed = results.filter((r) => !r.passed).length;
    log(`\nFlows ${id} ${platform}: ${results.length - failed} passed · ${failed} failed`);
    log(`Reports: ${join(runDir, platform)}`);
  } finally {
    if (stack) {
      stack.stop();
      // Stopping only signals the emulators and the dev server: wait until their ports are free, so a
      // run started right after this one doesn't find the old stack still answering (and then gone).
      if (!args.includes('--no-stack')) await portsFree([PORTS.auth, PORTS.firestore, PORTS.dev], 30_000);
    }
  }
  if (failed) process.exitCode = 1;
}

async function portsFree(ports: number[], timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  const open = (port: number) =>
    new Promise<boolean>((done) => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => (socket.destroy(), done(true)));
      socket.once('error', () => done(false));
    });
  while (Date.now() < end) {
    if (!(await Promise.all(ports.map(open))).some(Boolean)) return;
    await sleep(500);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

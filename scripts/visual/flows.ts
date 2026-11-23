/**
 * The interaction flows: Maestro YAML in `maestro/flows/` (see maestro/README.md), run on the
 * harness's own phone — the `Visual iPhone` simulator or the `visual-phone` AVD — against the
 * private stack, the world reseeded before every flow so each starts from the same data.
 *
 *   npx tsx scripts/visual/flows.ts <android|ios> [--only sign-in,send-message] [--tags composer,links] [--device phone|tablet] [--run <id>] [--no-stack] [--wait]
 *   npx tsx scripts/visual/flows.ts <android|ios> --hold   # stack + device + app up, for drafting a flow
 *
 * --tags: only the flows carrying one of these tags (each flow's `tags:`: smoke, composer, media, links, tablet, …),
 * so a round runs the group its change touches. --device tablet: the harness's tablet (the `Visual iPad`, the
 * `visual-tablet` AVD) instead of the phone, and only the flows tagged `tablet` (the ones written to hold on two
 * panes and popovers).
 *
 * Reports land in `visual/flows/<run>/<platform>/`: `<flow>.xml` (JUnit) and `<flow>/` (Maestro's
 * commands, logs and the flow's `takeScreenshot`s). `VISUAL_SKIP_BUILD=1` reuses the last build.
 * Exits non-zero when a flow failed. `runFlows(platform, ctx)` is the same run for a caller that
 * already has the stack up (run.ts).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { LockBusy, acquire, resourcesFor } from './lock';
import { startStack, seed, type Stack } from './stack';
import { PORTS, ROOT, SEED_PASSWORD, VISUAL_DIR, sleep, type CaptureContext } from './util';
import { stopwatch } from './timings';

export type FlowPlatform = 'ios' | 'android';
export type FlowResult = { flow: string; passed: boolean; seconds: number };

const FLOWS_DIR = join(ROOT, 'maestro/flows');
/** The flows in the order a run takes them; any other top-level flow follows, by name. */
const ORDER = [
  'sign-in', 'send-message', 'send-sticker', 'react-reply', 'unsend-message', 'chat-draft', 'composer-toggle',
  'sticker-replies', 'send-picture', 'answer-letter', 'leave-note', 'tap', 'tap-passage', 'reply-with-card', 'open-notification', 'open-link',
  'publish-card', 'trash-restore', 'sticker-breath', 'translate-story', 'block-person', 'live-message', 'thought-map',
  'draft-offline',
];

export type FlowDevice = 'phone' | 'tablet';

/** A flow file's `tags:` (the YAML header before `---`): a list of words, one `- tag` a line. */
export function flowTags(yaml: string): string[] {
  const header = yaml.split(/^---\s*$/m)[0];
  const lines = header.split('\n');
  const at = lines.findIndex((l) => /^tags:\s*$/.test(l));
  if (at < 0) return [];
  const tags: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const m = /^\s+-\s+(\S+)\s*$/.exec(line);
    if (!m) break;
    tags.push(m[1]);
  }
  return tags;
}

const tagsOf = (flow: string) => flowTags(readFileSync(join(FLOWS_DIR, `${flow}.yaml`), 'utf8'));

/**
 * Narrows flows to the ones carrying any of `tags` (none: all), and on the tablet to the ones tagged `tablet`.
 * A tag no flow carries is an error: a typo would otherwise run nothing and pass.
 */
export function withTags(flows: string[], tags: string[], device: FlowDevice = 'phone', tagsFor: (flow: string) => string[] = tagsOf): string[] {
  const known = new Set(flows.flatMap(tagsFor));
  const unknown = tags.filter((t) => !known.has(t));
  if (unknown.length) throw new Error(`No flow is tagged ${unknown.join(', ')} (tags: ${[...known].sort().join(', ')})`);
  return flows.filter((f) => {
    const own = tagsFor(f);
    return (!tags.length || tags.some((t) => own.includes(t))) && (device === 'phone' || own.includes('tablet'));
  });
}

/**
 * The stacks a run can ask for besides the usual one (`--stack <name>`): what the dev server is started with,
 * and the tag whose flows that stack is for. client-config answers from the server's environment, so what it
 * decides — the build the server still serves, which of the apps' paths go through /api/v1 — can only be set
 * where the stack starts, never by a flow.
 *   - `update-gate`: no build is new enough (minBuild far above any), for the flows tagged `update-gate`,
 *     which run on no other stack — on the usual one the app goes on to its home.
 *   - `writer-api`: the apps' writer through /api/v1 (`apiDrafts`, `apiThoughtMap`, off by default until checked
 *     on devices — docs/release/owed.md, flags), for the flows tagged `writer`: the same journeys the usual
 *     stack takes over Firestore. A flow also tagged `writer-api` (its `alone`) runs on this stack and no other:
 *     draft-offline, whose usual-stack half is Firestore's offline queue kept on disk — which an emulator build
 *     doesn't have (its Firestore cache is memory only, AppFirebase.kt), so there the words are lost with the app.
 */
export const STACKS: Record<string, { env: Record<string, string>; tag: string; only: boolean; alone?: string }> = {
  'update-gate': { env: { CLIENT_MIN_BUILD_IOS: '999999', CLIENT_MIN_BUILD_ANDROID: '999999' }, tag: 'update-gate', only: true },
  'writer-api': { env: { CLIENT_FEATURES: JSON.stringify({ apiDrafts: true, apiThoughtMap: true }) }, tag: 'writer', only: false, alone: 'writer-api' },
};

/**
 * The flows a stack runs: on a named one, those carrying its tag (but none made for another stack alone); on the
 * usual one, every flow but those made for a stack alone (`only`: the stack's whole tag; `alone`: a second tag on
 * single flows), which would fail there.
 */
export function forStack(flows: string[], stack: string | undefined, tagsFor: (flow: string) => string[] = tagsOf): string[] {
  const aloneOn = (name: string) => [...(STACKS[name].only ? [STACKS[name].tag] : []), ...(STACKS[name].alone ? [STACKS[name].alone!] : [])];
  if (stack !== undefined && !STACKS[stack]) throw new Error(`No such stack: ${stack} (have ${Object.keys(STACKS).join(', ')})`);
  const elsewhere = Object.keys(STACKS).filter((name) => name !== stack).flatMap(aloneOn);
  const here = flows.filter((f) => !tagsFor(f).some((t) => elsewhere.includes(t)));
  return stack === undefined ? here : here.filter((f) => tagsFor(f).includes(STACKS[stack].tag));
}

/**
 * The flows one app alone can run, split from the rest: a flow tagged `android-only` (the iOS simulator cannot cut its
 * network: draft-offline) is left out on iOS, one tagged `ios-only` on Android — skipped, said in the log, never a failure.
 */
export function forPlatform(flows: string[], platform: FlowPlatform, tagsFor: (flow: string) => string[] = tagsOf): { run: string[]; skipped: string[] } {
  const other = platform === 'ios' ? 'android-only' : 'ios-only';
  return {
    run: flows.filter((f) => !tagsFor(f).includes(other)),
    skipped: flows.filter((f) => tagsFor(f).includes(other)),
  };
}

/** Where Maestro lives (the official installer's place unless MAESTRO_BIN says otherwise) and the Java it runs on. */
export const MAESTRO = process.env.MAESTRO_BIN || join(homedir(), '.maestro/bin/maestro');
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
type Device = {
  id: string;
  /** Before a flow: a fresh app (Android), and the device settings its tags ask for ([flowSettings]). */
  prepareFlow: (tags?: string[]) => Promise<void>;
  /** After a flow: puts back what [prepareFlow] changed for it. */
  afterFlow?: (tags?: string[]) => Promise<void>;
  close: () => Promise<void>;
};

/**
 * What a flow's tags ask of the device besides the harness's stillness (round 25 §D): `animations` — the system's
 * animations on (animator scale 1, which the harness otherwise holds at 0) and battery saver on, the state the owner's
 * phone was in when the sticker picker held still — `put` before the flow, `back` after it, as adb shell commands.
 */
export function flowSettings(tags: readonly string[]): { put: string[]; back: string[] } {
  if (!tags.includes('animations')) return { put: [], back: [] };
  return {
    put: ['settings put global animator_duration_scale 1', 'settings put global low_power 1'],
    back: ['settings put global low_power 0', 'settings put global animator_duration_scale 0'],
  };
}

async function iosDevice(ctx: CaptureContext, kind: FlowDevice): Promise<Device> {
  const ios = await import('./ios');
  await ios.build(ctx);
  const phone = ios.IOS_DEVICES.find((d) => d.phone === (kind === 'phone'))!;
  const { udid, booted } = await ios.simulator(phone, ctx);
  spawnSync('xcrun', ['simctl', 'terminate', udid, ios.BUNDLE_ID], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'install', udid, ios.APP], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'ui', udid, 'appearance', 'light'], { stdio: 'ignore' });
  return {
    id: udid,
    prepareFlow: async () => {},
    close: async () => {
      spawnSync('xcrun', ['simctl', 'terminate', udid, ios.BUNDLE_ID], { stdio: 'ignore' });
      if (booted) ios.shutDown(udid, phone.name, ctx.log);
    },
  };
}

async function androidDevice(ctx: CaptureContext, kind: FlowDevice): Promise<Device> {
  const android = await import('./android');
  const phone = android.ANDROID_DEVICES.find((d) => d.phone === (kind === 'phone'))!;
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
  // Gboard first, as a capture finds it: a run cut off before its `close` (a hold stopped by its PID, 2026-11-21)
  // leaves the AVD with voice input as its only keyboard, and the next run would take that for the state to put
  // back — a voice session then opens with the first field ("Tap to speak"), hears nothing, has no keyboard to hand
  // back to, and typing fails with "No active input connection" (publish-card, twice, on both stacks).
  await android.keysOn((command) => android.shell(serial, command));
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
    prepareFlow: async (tags = []) => {
      await android.shell(serial, `am force-stop ${android.PACKAGE}`);
      await android.shell(serial, `pm clear ${android.PACKAGE}`);
      await android.shell(serial, `cmd locale set-app-locales ${android.PACKAGE} --locales zh-TW`);
      await android.shell(serial, 'cmd uimode night no');
      await keyboardsOff();
      for (const command of flowSettings(tags).put) await android.shell(serial, command);
    },
    afterFlow: async (tags = []) => {
      for (const command of flowSettings(tags).back) await android.shell(serial, command).catch(() => {});
    },
    close: async () => {
      await android.shell(serial, `am force-stop ${android.PACKAGE}`).catch(() => {});
      for (const ime of enabled) await android.shell(serial, `ime enable ${ime}`).catch(() => {});
      if (quiet && !enabled.includes(quiet)) await android.shell(serial, `ime disable ${quiet}`).catch(() => {});
      if (defaultIme && defaultIme !== 'null') await android.shell(serial, `ime set ${defaultIme}`).catch(() => {});
      if (booted && process.env.VISUAL_KEEP_DEVICES !== '1') await android.kill(serial, ctx.log);
    },
  };
}

/**
 * One flow's `maestro test` arguments. `reinstall`: Maestro puts its driver on the device again first — its default,
 * on every call (Android's two driver apps, iOS's XCTest runner): the first flow on a device does, so a run never meets
 * a driver from another Maestro; every later one goes on with the one now there (`--no-reinstall-driver`).
 */
export function maestroArgs(deviceId: string, flow: string, outDir: string, ports: typeof PORTS, reinstall: boolean): string[] {
  const env = Object.entries(flowEnv(ports)).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  return [
    '--device', deviceId, 'test', join(FLOWS_DIR, `${flow}.yaml`), ...env,
    '--format', 'junit', '--output', join(outDir, `${flow}.xml`),
    '--test-output-dir', join(outDir, flow), '--debug-output', join(outDir, flow, 'debug'), '--flatten-debug-output',
    ...(reinstall ? [] : ['--no-reinstall-driver']),
    '--no-ansi',
  ];
}

function maestroTest(deviceId: string, flow: string, outDir: string, ports: typeof PORTS, logFile: string, reinstall = true): Promise<boolean> {
  const args = maestroArgs(deviceId, flow, outDir, ports, reinstall);
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
export async function runFlows(platform: FlowPlatform, ctx: CaptureContext, { tags = [], device: kind = 'phone', stack }: { tags?: string[]; device?: FlowDevice; stack?: string } = {}): Promise<FlowResult[]> {
  if (!existsSync(MAESTRO)) throw new Error(`No Maestro at ${MAESTRO}: install it (maestro/README.md) or set MAESTRO_BIN`);
  const { run: flows, skipped } = forPlatform(forStack(withTags(flowsToRun(ctx.only), tags, kind), stack), platform);
  for (const flow of skipped) ctx.log(`  skip  ${platform}/${flow}  (tagged ${platform === 'ios' ? 'android-only' : 'ios-only'})`);
  if (!flows.length) {
    ctx.log(`  no flow to run on the ${platform} ${kind}${tags.length ? ` tagged ${tags.join(', ')}` : ''}`);
    return [];
  }
  // The tablet's reports beside the phone's (`ios-tablet/`), never over them.
  const outDir = join(ctx.runDir, kind === 'phone' ? platform : `${platform}-tablet`);
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const device = platform === 'ios' ? await iosDevice(ctx, kind) : await androidDevice(ctx, kind);
  const results: FlowResult[] = [];
  try {
    for (const [i, flow] of flows.entries()) {
      const timing = stopwatch();
      await seed(ctx.log);
      timing.lap('seed');
      const tags = tagsOf(flow);
      await device.prepareFlow(tags);
      timing.lap('prepare');
      const started = Date.now();
      let passed: boolean;
      try {
        // Maestro's driver put on the device for the first flow only (maestroArgs).
        passed = await maestroTest(device.id, flow, outDir, ctx.ports, join(outDir, flow, 'maestro.log'), i === 0);
      } finally {
        timing.lap('maestro');
        await device.afterFlow?.(tags);
      }
      const seconds = Math.round((Date.now() - started) / 1000);
      results.push({ flow, passed, seconds });
      // In the capture run's own timings when the flows run inside one (`<run>/_flows`), else beside their reports.
      const t = timing.done(basename(ctx.runDir) === '_flows' ? dirname(ctx.runDir) : ctx.runDir, `${platform}/flows/${flow}`, 'flow');
      const steps = Object.entries(t.steps).map(([n, ms]) => `${n} ${(ms / 1000).toFixed(1)} s`).join(' · ');
      ctx.log(`  ${passed ? 'pass' : 'FAIL'}  ${platform}/${flow}  (${seconds} s; ${steps})${passed ? '' : `  see ${join(outDir, flow, 'maestro.log')}`}`);
    }
  } finally {
    await device.close();
  }
  return results;
}

/** Brings the stack, the phone and the app up and keeps them so until Ctrl-C (drafting a flow with the MCP). */
async function hold(platform: FlowPlatform, ctx: CaptureContext, kind: FlowDevice) {
  const device = platform === 'ios' ? await iosDevice(ctx, kind) : await androidDevice(ctx, kind);
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
    console.log('Usage: npx tsx scripts/visual/flows.ts <android|ios> [--only sign-in,send-message] [--tags composer,links] [--device phone|tablet] [--run <id>] [--stack update-gate|writer-api] [--no-stack] [--wait] [--hold]');
    process.exit(platform ? 1 : 0);
  }
  const id = flag(args, 'run') ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const runDir = join(VISUAL_DIR, 'flows', id);
  mkdirSync(join(runDir, '_logs'), { recursive: true });
  const log = (line: string) => console.log(line);
  // A named stack (STACKS): its settings go to the dev server through this process's environment (startGroup).
  const named = flag(args, 'stack');
  if (named !== undefined) {
    if (!STACKS[named]) {
      console.error(`No such stack: ${named} (have ${Object.keys(STACKS).join(', ')})`);
      process.exitCode = 1;
      return;
    }
    if (args.includes('--no-stack')) {
      console.error('--stack starts its own dev server: it cannot go with --no-stack');
      process.exitCode = 1;
      return;
    }
    Object.assign(process.env, STACKS[named].env);
  }
  // The same locks as a capture's (lock.ts): this phone and, unless --no-stack, the stack's ports.
  let lock;
  try {
    lock = await acquire(resourcesFor([platform], args.includes('--no-stack') ? null : PORTS), { wait: args.includes('--wait'), log });
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
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
      retaken: [],
    };
    const kind = (flag(args, 'device') ?? 'phone') as FlowDevice;
    if (kind !== 'phone' && kind !== 'tablet') throw new Error(`--device takes phone or tablet, not "${kind}"`);
    const tags = (flag(args, 'tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (args.includes('--hold')) return await hold(platform, ctx, kind);
    const results = await runFlows(platform, ctx, { tags, device: kind, stack: named });
    failed = results.filter((r) => !r.passed).length;
    log(`\nFlows ${id} ${platform}${named ? ` (stack ${named})` : ''}: ${results.length - failed} passed · ${failed} failed`);
    log(`Reports: ${join(runDir, kind === 'phone' ? platform : `${platform}-tablet`)}`);
  } finally {
    if (stack) {
      stack.stop();
      // Stopping only signals the emulators and the dev server: wait until their ports are free, so a
      // run started right after this one doesn't find the old stack still answering (and then gone).
      if (!args.includes('--no-stack')) await portsFree([PORTS.auth, PORTS.firestore, PORTS.dev], 30_000);
    }
    lock.release();
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

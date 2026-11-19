/**
 * The iOS captures: the Debug app on two simulators of this harness's own
 * (`Visual iPhone`, `Visual iPad`, made on first use — no other simulator is
 * booted, installed onto or shut down), built once per run. Every screen is a
 * fresh launch against the private stack, its page opened by `-route` and its
 * account signed in by `-email`/`-password` (or `-signedOut YES`), with
 * `-visualCapture YES` holding every animation still (ResonanceApp.swift), the
 * appearance and language given by launch arguments (the app's own keys, so
 * nothing kept from a manual run leaks in) and the status bar at 9:41.
 *
 * `VISUAL_SKIP_BUILD=1` reuses the last build and installs it again.
 */
import { execFile, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mayShutDown, noteBooted } from './devices';
import { unspendHints } from './hints';
import { lookNote, secondLook, type Look } from './secondLook';
import { PNG } from 'pngjs';
import { screensFor, shotName, type Account, type Variant } from './screens';
import { ROOT, SEED_PASSWORD, run, settle, shotPath, sleep, type Capture, type CaptureContext } from './util';
import { devicesFor, groups, plan, stateOf } from './variants';
import { MAESTRO, maestroEnv } from './flows';

export const BUNDLE_ID = 'com.resonance.stories';
const IOS_DIR = join(ROOT, 'apps/ios');
const DERIVED = join(IOS_DIR, 'build/visual-sim');
export const APP = join(DERIVED, 'Build/Products/Debug-iphonesimulator/Resonance.app');
const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';

export type IosDevice = { id: string; phone: boolean; name: string; type: string };

export const IOS_DEVICES: IosDevice[] = [
  { id: 'iphone', phone: true, name: 'Visual iPhone', type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro' },
  { id: 'ipad', phone: false, name: 'Visual iPad', type: 'com.apple.CoreSimulator.SimDeviceType.iPad-Air-11-inch-M4' },
];

/** Runs a long tool (xcodegen, xcodebuild) with its output in this run's logs; throws with the log's path. */
/** A long command (a build) without holding up the captures running beside it; its output to `logFile`. */
export function runLogged(command: string, args: string[], logFile: string, cwd = ROOT, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const out = openSync(logFile, 'a');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', out, out] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args[0]} failed (exit ${code}): see ${logFile}`))));
  });
}

/**
 * The Xcode builds (the simulator's, the Mac's) one after the other, never two at once: they share
 * the project xcodegen writes and Swift's package caches. Each build joins the line.
 */
let xcodeLine: Promise<unknown> = Promise.resolve();
export function inXcodeLine<T>(work: () => Promise<T>): Promise<T> {
  const turn = xcodeLine.then(work, work);
  xcodeLine = turn.catch(() => {});
  return turn;
}

/** The project generated afresh (the app's sources may have gained files since), with both islands it bundles. */
let prepared: Promise<void> | null = null;
export function prepareProject(ctx: CaptureContext): Promise<void> {
  prepared ??= (async () => {
    for (const [file, script] of [['native/editor/dist/editor.html', 'native:editor'], ['native/mascots/dist/mascots.html', 'native:mascots']]) {
      if (existsSync(join(ROOT, file))) continue;
    ctx.log(`  ${file} is missing: npm run ${script}`);
      await runLogged('npm', ['run', script], join(ctx.runDir, '_logs', 'islands.log'));
    }
    await runLogged('xcodegen', ['generate'], join(ctx.runDir, '_logs', 'xcodegen.log'), IOS_DIR);
  })();
  return prepared;
}

/**
 * The app's launch arguments for one screen: the private stack, the stillness switch, the variant's
 * appearance and language (the app's own UserDefaults keys, which a launch argument outranks), the
 * account (or none), the page and the screen's own debug arguments (`app.ios`).
 */
export function launchArgs(ctx: CaptureContext, account: Account | null, route: string | null, v: Variant, extra: readonly string[] = []): string[] {
  const args = [
    '-emulator', 'YES',
    '-emulatorAuthPort', String(ctx.ports.auth),
    '-emulatorFirestorePort', String(ctx.ports.firestore),
    '-emulatorApiPort', String(ctx.ports.dev),
    '-visualCapture', 'YES',
    '-appearance.scheme', v.theme,
    '-appearance.accent', 'terracotta',
    '-appearance.mascots', 'NO',
    '-appLanguage', v.locale,
    '-AppleLanguages', v.locale === 'en' ? '(en)' : '(zh-Hant)',
    '-AppleLocale', v.locale === 'en' ? 'en_US' : 'zh_TW',
  ];
  args.push(...(account ? ['-email', `${account}@resonance.test`, '-password', SEED_PASSWORD] : ['-signedOut', 'YES']));
  if (route) args.push('-route', route);
  // The screen's own debug arguments (`app.ios` in screens.ts): a panel open, something riding the composer.
  args.push(...extra);
  return args;
}

function simctl(...args: string[]): string {
  return run('xcrun', ['simctl', ...args]);
}

/**
 * This harness's simulator for `device`, made the first time; booted, with its status bar held at
 * 9:41. Answers whether this run booted it (and so shuts it down after: `shutDown`).
 */
export async function simulator(device: IosDevice, ctx: CaptureContext): Promise<{ udid: string; booted: boolean }> {
  const listed = JSON.parse(simctl('list', 'devices', '-j')) as { devices: Record<string, { name: string; udid: string; state: string }[]> };
  const found = (listed.devices[RUNTIME] ?? []).find((d) => d.name === device.name);
  let udid = found?.udid;
  if (!udid) {
    ctx.log(`  making the ${device.name} simulator`);
    udid = simctl('create', device.name, device.type, RUNTIME).trim();
  }
  const booted = found?.state !== 'Booted';
  // Waited for without holding up the other simulator booting beside it.
  await promisify(execFile)('xcrun', ['simctl', 'bootstatus', udid, '-b'], { cwd: ROOT });
  if (booted) noteBooted(udid);
  // An ISO time (simctl takes it only with milliseconds) sets the iPad's date beside it: the seed's day.
  simctl('status_bar', udid, 'override', '--time', '2026-09-01T09:41:00.000+08:00', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
    '--cellularMode', 'active', '--cellularBars', '4', '--operatorName', '', '--batteryState', 'charged', '--batteryLevel', '100');
  return { udid, booted };
}

/**
 * A simulator this run booted goes down once its screens are taken (VISUAL_KEEP_DEVICES=1 keeps it up);
 * anything else is refused and said (devices.ts: never the owner's, never one another run booted).
 */
export function shutDown(udid: string, name: string, log: (line: string) => void = console.log) {
  if (process.env.VISUAL_KEEP_DEVICES === '1') return;
  const may = mayShutDown(udid, name);
  if (!may.ok) return log(`  left running: ${may.why}`);
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
}

/** The simulator build, once per run however many ask (a capture, the flows, the run's head start). */
let built: Promise<void> | null = null;
export function build(ctx: CaptureContext): Promise<void> {
  built ??= inXcodeLine(async () => {
    if (process.env.VISUAL_SKIP_BUILD === '1' && existsSync(APP)) return ctx.log('  reusing the last simulator build');
    ctx.log('  building the Debug app for the simulator (apps/ios/build/visual-sim)…');
    await prepareProject(ctx);
    await runLogged('xcodebuild', [
    '-project', 'Resonance.xcodeproj', '-scheme', 'Resonance', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED,
    '-skipPackagePluginValidation', '-skipMacroValidation', 'build',
    // This Mac's simulators only: a generic destination builds Intel's slice too, twice the time.
    `ARCHS=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`,
    ], join(ctx.runDir, '_logs', 'ios-build.log'), IOS_DIR);
  });
  return built;
}

function launch(udid: string, args: string[]) {
  spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
  simctl('launch', udid, BUNDLE_ID, ...args);
}

/** Whether the simulator stands wider than tall: its screenshot's own size (simctl reads no orientation). */
function isLandscape(udid: string, file: string): boolean {
  run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file]);
  const { width, height } = PNG.sync.read(readFileSync(file));
  return width > height;
}

/**
 * Turns the simulator itself (simctl can't): `maestro/device/orientation.yaml`, Maestro's setOrientation through
 * XCUIDevice. LANDSCAPE_LEFT stands the iPad on its long side with the status bar along the top, and `simctl io
 * screenshot` then gives the turned screen upright (2360 × 1640). Checked by the screenshot's own shape, so a
 * turn that didn't take is an error rather than a set of pictures that lie.
 */
export async function turn(udid: string, landscape: boolean, ctx: CaptureContext): Promise<void> {
  const file = join(ctx.runDir, '_logs', `ios-${udid}-turn.png`);
  if (isLandscape(udid, file) === landscape) return;
  const orientation = landscape ? 'LANDSCAPE_LEFT' : 'PORTRAIT';
  await runLogged(MAESTRO, ['--device', udid, 'test', join(ROOT, 'maestro/device/orientation.yaml'), '-e', `ORIENTATION=${orientation}`, '--no-ansi'],
    join(ctx.runDir, '_logs', 'ios-turn.log'), ROOT, maestroEnv());
  await sleep(1500);
  if (isLandscape(udid, file) !== landscape) throw new Error(`the simulator ${udid} did not turn ${orientation.toLowerCase()} (see _logs/ios-turn.log)`);
}

async function shoot(udid: string, ctx: CaptureContext, key: string): Promise<Look> {
  const file = join(ctx.runDir, '_logs', `ios-${udid}.png`);
  const take = () =>
    settle(() => {
      run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file]);
      const png = readFileSync(file);
      return Promise.resolve(png);
    }, { timeoutMs: 40_000, intervalMs: 1000 });
  // A launch draws its cover, restores the account and asks the stack: never judged before this.
  await sleep(4000);
  return secondLook(await take(), take, { key });
}

export const captureIos: Capture = async (ctx) => {
  const set = ctx.set ?? 'release';
  const ids = devicesFor('ios', set, ctx.devices);
  // Each simulator with the devices it takes: itself and its states (variants.ts), one after the other on it.
  const lanes = IOS_DEVICES.map((d) => ({ device: d, ids: ids.filter((id) => id === d.id || stateOf('ios', id)?.on === d.id) }))
    .filter((l) => l.ids.some((id) => plan('ios', id, set, ctx.only).length));
  const unsettled: string[] = [];
  if (!lanes.length || !screensFor('ios', ctx.only, set === 'extended').length) return unsettled;
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  await build(ctx);
  // Both simulators at once (VISUAL_PARALLEL=0: one at a time), each booted, captured and shut down.
  const captureOn = async ({ device, ids }: (typeof lanes)[number]) => {
    const { udid, booted } = await simulator(device, ctx);
    spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
    simctl('install', udid, APP);
    // Upright to begin with: a run cut off while the iPad was turned leaves it turned.
    if (!device.phone) await turn(udid, false, ctx);
    for (const id of ids) {
      const state = stateOf('ios', id);
      if (state) ctx.log(`  ${id}: ${state.why}`);
      const landscape = state?.ios?.orientation === 'landscape';
      if (landscape) await turn(udid, true, ctx);
      try {
        let theme: Variant['theme'] | null = null;
        for (const { variant: v, account, screens } of groups(plan('ios', id, set, ctx.only))) {
          // The system's appearance too: the app follows its own choice, the status bar the system's.
          if (theme !== v.theme) simctl('ui', udid, 'appearance', v.theme);
          theme = v.theme;
          // The account signs in on a launch of its own (switching from whoever was there), so a
          // screen's launch only restores it.
          launch(udid, launchArgs(ctx, account, null, v));
          await sleep(10_000);
          for (const screen of screens) {
            // Its hints unspent for its account on the stack (hints.ts), before the app reads the profile.
            await unspendHints(ctx, screen);
            launch(udid, launchArgs(ctx, account, screen.route, v, screen.app?.ios));
            const name = shotName(screen, v);
            const key = `ios/${id}/${name}`;
            const look = await shoot(udid, ctx, key);
            writeFileSync(shotPath(ctx.runDir, 'ios', id, name), look.png);
            if (!look.settled) unsettled.push(key);
            if (look.retaken) ctx.retaken.push(key);
            ctx.log(`  ${key}${lookNote(look)}`);
          }
        }
      } finally {
        // Upright again whatever happened, before the next state or the shutdown.
        if (landscape) await turn(udid, false, ctx);
      }
    }
    spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
    if (booted) shutDown(udid, device.name, ctx.log);
  };
  if (process.env.VISUAL_PARALLEL === '0') for (const lane of lanes) await captureOn(lane);
  else await Promise.all(lanes.map(captureOn));
  return unsettled;
};

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
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { screensFor, shotName, type Account, type Screen, type Variant } from './screens';
import { ROOT, SEED_PASSWORD, run, settle, shotPath, sleep, variantsFor, type Capture, type CaptureContext } from './util';

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
export function runLogged(command: string, args: string[], logFile: string, cwd = ROOT) {
  const out = openSync(logFile, 'a');
  const result = spawnSync(command, args, { cwd, stdio: ['ignore', out, out] });
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (exit ${result.status}): see ${logFile}`);
}

/** The project generated afresh (the app's sources may have gained files since), with both islands it bundles. */
let prepared = false;
export function prepareProject(ctx: CaptureContext) {
  if (prepared) return;
  prepared = true;
  for (const [file, script] of [['native/editor/dist/editor.html', 'native:editor'], ['native/mascots/dist/mascots.html', 'native:mascots']]) {
    if (existsSync(join(ROOT, file))) continue;
    ctx.log(`  ${file} is missing: npm run ${script}`);
    runLogged('npm', ['run', script], join(ctx.runDir, '_logs', 'islands.log'));
  }
  runLogged('xcodegen', ['generate'], join(ctx.runDir, '_logs', 'xcodegen.log'), IOS_DIR);
}

/**
 * The app's launch arguments for one screen: the private stack, the stillness switch, the variant's
 * appearance and language (the app's own UserDefaults keys, which a launch argument outranks), the
 * account (or none) and the page.
 */
export function launchArgs(ctx: CaptureContext, account: Account | null, route: string | null, v: Variant): string[] {
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
  return args;
}

/** The screens in the order they are taken: by account, so each signs in once (its first launch). */
export function byAccount(screens: Screen[]): [Account | null, Screen[]][] {
  const accounts = [...new Set(screens.map((s) => s.as))];
  return accounts.map((a) => [a, screens.filter((s) => s.as === a)]);
}

function simctl(...args: string[]): string {
  return run('xcrun', ['simctl', ...args]);
}

/**
 * This harness's simulator for `device`, made the first time; booted, with its status bar held at
 * 9:41. Answers whether this run booted it (and so shuts it down after: `shutDown`).
 */
export function simulator(device: IosDevice, ctx: CaptureContext): { udid: string; booted: boolean } {
  const listed = JSON.parse(simctl('list', 'devices', '-j')) as { devices: Record<string, { name: string; udid: string; state: string }[]> };
  const found = (listed.devices[RUNTIME] ?? []).find((d) => d.name === device.name);
  let udid = found?.udid;
  if (!udid) {
    ctx.log(`  making the ${device.name} simulator`);
    udid = simctl('create', device.name, device.type, RUNTIME).trim();
  }
  const booted = found?.state !== 'Booted';
  run('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  // An ISO time (simctl takes it only with milliseconds) sets the iPad's date beside it: the seed's day.
  simctl('status_bar', udid, 'override', '--time', '2026-09-01T09:41:00.000+08:00', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
    '--cellularMode', 'active', '--cellularBars', '4', '--operatorName', '', '--batteryState', 'charged', '--batteryLevel', '100');
  return { udid, booted };
}

/** A simulator this run booted goes down once its screens are taken (VISUAL_KEEP_DEVICES=1 keeps it up). */
export function shutDown(udid: string) {
  if (process.env.VISUAL_KEEP_DEVICES === '1') return;
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
}

export function build(ctx: CaptureContext) {
  if (process.env.VISUAL_SKIP_BUILD === '1' && existsSync(APP)) return ctx.log('  reusing the last simulator build');
  ctx.log('  building the Debug app for the simulator (apps/ios/build/visual-sim)…');
  prepareProject(ctx);
  runLogged('xcodebuild', [
    '-project', 'Resonance.xcodeproj', '-scheme', 'Resonance', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED,
    '-skipPackagePluginValidation', '-skipMacroValidation', 'build',
    // This Mac's simulators only: a generic destination builds Intel's slice too, twice the time.
    `ARCHS=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`,
  ], join(ctx.runDir, '_logs', 'ios-build.log'), IOS_DIR);
}

function launch(udid: string, args: string[]) {
  spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
  simctl('launch', udid, BUNDLE_ID, ...args);
}

async function shoot(udid: string, ctx: CaptureContext): Promise<{ png: Buffer; settled: boolean }> {
  const file = join(ctx.runDir, '_logs', `ios-${udid}.png`);
  // A launch draws its cover, restores the account and asks the stack: never judged before this.
  await sleep(4000);
  return settle(() => {
    run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file]);
    return Promise.resolve(readFileSync(file));
  }, { timeoutMs: 40_000, intervalMs: 1000 });
}

export const captureIos: Capture = async (ctx) => {
  const devices = IOS_DEVICES.filter((d) => !ctx.devices.length || ctx.devices.includes(d.id));
  const screens = screensFor('ios', ctx.only);
  const unsettled: string[] = [];
  if (!devices.length || !screens.length) return unsettled;
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  build(ctx);
  // One simulator at a time: booted, captured, shut down before the next.
  for (const device of devices) {
    const { udid, booted } = simulator(device, ctx);
    spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
    simctl('install', udid, APP);
    for (const v of variantsFor(device.phone)) {
      // The system's appearance too: the app follows its own choice, the status bar the system's.
      simctl('ui', udid, 'appearance', v.theme);
      for (const [account, group] of byAccount(screens)) {
        // The account signs in on a launch of its own (switching from whoever was there), so a
        // screen's launch only restores it.
        launch(udid, launchArgs(ctx, account, null, v));
        await sleep(10_000);
        for (const screen of group) {
          launch(udid, launchArgs(ctx, account, screen.route, v));
          const name = shotName(screen, v);
          const { png, settled } = await shoot(udid, ctx);
          writeFileSync(shotPath(ctx.runDir, 'ios', device.id, name), png);
          if (!settled) unsettled.push(`ios/${device.id}/${name}`);
          ctx.log(`  ios/${device.id}/${name}${settled ? '' : '  (never settled)'}`);
        }
      }
    }
    spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
    if (booted) shutDown(udid);
  }
  return unsettled;
};

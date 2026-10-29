/**
 * The Android captures: a debug build on two AVDs of this harness's own —
 * `visual-phone` (Pixel 9, 1080 × 2424) and `visual-tablet` (Pixel Tablet,
 * 2560 × 1600) — on fixed console ports, so they never meet the owner's or
 * another session's emulators. Each screen is a cold start (`am start -S`)
 * with the debug launch extras (apps/README.md, Android): the emulators and
 * the API on this run's ports, the account, the page's site path as `route`.
 *
 * What would move between runs is held still on the device: system
 * animations off (Compose follows `animator_duration_scale`), the status bar
 * in demo mode (09:41, full battery and Wi-Fi, no notification icons), a
 * hardware keyboard so the writer raises no soft one, the theme by the
 * system's night mode (外觀 follows it until someone picks one) and the
 * language by the app's own locale (the app reads it when nothing is saved).
 * Each account starts from `pm clear`, so no earlier session, draft or cache
 * is carried over; the 小紙團 stay off.
 *
 * The capturer boots the AVDs it needs, builds and installs the debug APK
 * (`VISUAL_SKIP_BUILD=1` installs the last one), and shuts down only the
 * emulators it booted. Create the AVDs once, from the Android 16 Play image:
 *
 *   avdmanager create avd -n visual-phone -d pixel_9 -k "system-images;android-36;google_apis_playstore;arm64-v8a"
 *   avdmanager create avd -n visual-tablet -d pixel_tablet -k "system-images;android-36;google_apis_playstore;arm64-v8a"
 *
 * then in each `~/.android/avd/<name>.avd/config.ini`: `hw.keyboard=yes`, `hw.gpu.enabled=yes`,
 * `hw.gpu.mode=host`, `hw.ramSize=3G`.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { screensFor, shotName, type Account, type Screen, type Variant } from './screens';
import { ROOT, SEED_PASSWORD, pixelsApart, settle, shotPath, sleep, variantsFor, type Capture, type CaptureContext } from './util';

const execFileAsync = promisify(execFile);

const PACKAGE = 'com.resonance.stories';
const ACTIVITY = `${PACKAGE}/com.resonance.app.MainActivity`;
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
const ADB = join(SDK, 'platform-tools/adb');
const EMULATOR = join(SDK, 'emulator/emulator');
const ANDROID_DIR = join(ROOT, 'apps/android');
const APK = join(ANDROID_DIR, 'app/build/outputs/apk/debug/app-debug.apk');

export type AndroidDevice = { id: string; phone: boolean; avd: string; port: number };

/** The console port names the device: `emulator-5600`. */
export const ANDROID_DEVICES: AndroidDevice[] = [
  { id: 'phone', phone: true, avd: 'visual-phone', port: 5600 },
  { id: 'tablet', phone: false, avd: 'visual-tablet', port: 5602 },
];

const serialOf = (d: AndroidDevice) => `emulator-${d.port}`;

async function adb(serial: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(ADB, ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 16 << 20 });
  return stdout.trim();
}

const shell = (serial: string, command: string) => adb(serial, 'shell', command);

async function screencap(serial: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 64 << 20 });
  return stdout;
}

async function booted(serial: string): Promise<boolean> {
  try {
    return (await shell(serial, 'getprop sys.boot_completed')) === '1';
  } catch {
    return false;
  }
}

/** Boots the AVD unless it already runs; answers whether this run booted it. */
async function boot(device: AndroidDevice, ctx: CaptureContext): Promise<boolean> {
  const serial = serialOf(device);
  if (await booted(serial)) return false;
  if (!existsSync(join(homedir(), '.android/avd', `${device.avd}.avd`))) {
    throw new Error(`No AVD ${device.avd}: create it first (see the top of scripts/visual/android.ts)`);
  }
  ctx.log(`  booting ${device.avd} as ${serial}…`);
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  const out = openSync(join(ctx.runDir, '_logs', `emulator-${device.id}.log`), 'a');
  // -no-snapshot-save: every run boots the same device; -gpu host: our AVDs would draw in software otherwise.
  const child = spawn(EMULATOR, ['-avd', device.avd, '-port', String(device.port), '-no-window', '-gpu', 'host', '-no-snapshot-save', '-no-boot-anim', '-no-audio'], {
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  const end = Date.now() + 240_000;
  while (Date.now() < end) {
    if (await booted(serial)) return true;
    await sleep(2000);
  }
  if (child.pid) process.kill(child.pid, 'SIGTERM');
  throw new Error(`${device.avd} did not boot within 4 minutes`);
}

/** Holds still what the system would otherwise move between runs. */
async function holdStill(serial: string, ctx: CaptureContext) {
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    await shell(serial, `settings put global ${key} 0`);
  }
  // With the AVD's hardware keyboard, no soft keyboard comes up under the writer.
  await shell(serial, 'settings put secure show_ime_with_hard_keyboard 0');
  await shell(serial, 'settings put global sysui_demo_allowed 1');
  const demo = (command: string, extras = '') => shell(serial, `am broadcast -a com.android.systemui.demo -e command ${command} ${extras}`);
  await demo('enter');
  await demo('clock', '-e hhmm 0941');
  await demo('battery', '-e level 100 -e plugged false -e powersave false');
  await demo('network', '-e wifi show -e level 4 -e fully true');
  await demo('network', '-e mobile hide');
  await demo('notifications', '-e visible false');
  // Pictures stored against the emulators are served by the dev server at localhost:<dev port>.
  await adb(serial, 'reverse', `tcp:${ctx.ports.dev}`, `tcp:${ctx.ports.dev}`);
}

async function wear(serial: string, v: Variant) {
  await shell(serial, `cmd uimode night ${v.theme === 'dark' ? 'yes' : 'no'}`);
}

function build(ctx: CaptureContext) {
  if (process.env.VISUAL_SKIP_BUILD === '1' && existsSync(APK)) return Promise.resolve();
  ctx.log('  building the debug APK (VISUAL_SKIP_BUILD=1 skips it)…');
  return (async () => {
    if (!existsSync(join(ROOT, 'native/editor/dist/editor.html'))) {
      await execFileAsync('npm', ['run', '-s', 'native:editor'], { cwd: ROOT, maxBuffer: 64 << 20 });
    }
    await execFileAsync('./gradlew', [':app:assembleDebug', '-q'], { cwd: ANDROID_DIR, maxBuffer: 64 << 20 });
  })();
}

/** A fresh install of the app's data, in the variant's language (the app follows its own locale while nothing is saved). */
async function reset(serial: string, v: Variant) {
  await shell(serial, `pm clear ${PACKAGE}`);
  await shell(serial, `cmd locale set-app-locales ${PACKAGE} --locales ${v.locale}`);
}

async function launch(serial: string, ctx: CaptureContext, account: Account | null, route: string | null) {
  const args = [
    'am', 'start', '-S', '-n', ACTIVITY,
    '--ez', 'emulator', 'true',
    '--ei', 'emulatorAuthPort', String(ctx.ports.auth),
    '--ei', 'emulatorFirestorePort', String(ctx.ports.firestore),
    '--ei', 'emulatorApiPort', String(ctx.ports.dev),
    '--ez', 'mascots', 'false',
  ];
  if (account) args.push('--es', 'email', `${account}@resonance.test`, '--es', 'password', SEED_PASSWORD);
  if (route) args.push('--es', 'route', route);
  await adb(serial, 'shell', ...args);
}

/**
 * A frame that holds still is not yet the page: with the animations off, the launch's waves,
 * a loader and a page's skeleton all hold still while the account and the page are read, and
 * none can be told from a quiet page by its pixels (a private card in the writer is as bare as
 * the splash). So a settled frame counts only once it is still the same a few seconds later —
 * longer than any of those stands while the dev server is warm ([warmUp]).
 */
async function steady(serial: string): Promise<{ png: Buffer; settled: boolean }> {
  const end = Date.now() + 90_000;
  for (;;) {
    const shot = await settle(() => screencap(serial), { intervalMs: 1000, timeoutMs: 45_000 });
    await sleep(3500);
    const again = await screencap(serial);
    if (again.equals(shot.png) || pixelsApart(again, shot.png) === 0) return { png: again, settled: shot.settled };
    if (Date.now() > end) return { png: again, settled: false };
  }
}

async function shoot(serial: string, ctx: CaptureContext, screen: Screen, first: boolean) {
  await launch(serial, ctx, screen.as, screen.route);
  // A cold start reads the account and the page over the network (an account's first launch also signs in).
  await sleep(first ? 8000 : 4000);
  return steady(serial);
}

/**
 * `next dev` compiles a route on its first request, for seconds; a page the app asks for meanwhile
 * shows its skeleton that long. Every v1 route the screens read is asked for once beforehand
 * (signed out: a 401 compiles it as well as a 200).
 */
async function warmUp(ctx: CaptureContext) {
  ctx.log('  compiling the API routes the screens read…');
  const paths = [
    'me', 'feed', 'feed/recommended', 'cards/x', 'cards?keys=x', 'cards/x/private-shares', 'cards/x/resonances',
    'users/x', 'handles/x', 'me/cardbox', 'me/cards?tab=trash', 'me/notifications', 'me/devices/x',
  ];
  for (const path of paths) {
    await fetch(`${ctx.devUrl}/api/v1/${path}`).catch(() => {});
  }
}

async function captureDevice(device: AndroidDevice, ctx: CaptureContext, screens: Screen[]): Promise<string[]> {
  const serial = serialOf(device);
  const unsettled: string[] = [];
  await holdStill(serial, ctx);
  await adb(serial, 'install', '-r', '-t', APK);
  const accounts = [...new Set(screens.map((s) => s.as))];
  for (const v of variantsFor(device.phone)) {
    await wear(serial, v);
    for (const account of accounts) {
      await reset(serial, v);
      let first = true;
      for (const screen of screens.filter((s) => s.as === account)) {
        const name = shotName(screen, v);
        const { png, settled } = await shoot(serial, ctx, screen, first);
        first = false;
        writeFileSync(shotPath(ctx.runDir, 'android', device.id, name), png);
        if (!settled) unsettled.push(`android/${device.id}/${name}`);
        ctx.log(`  android/${device.id}/${name}${settled ? '' : '  (never settled)'}`);
      }
    }
  }
  await shell(serial, `am force-stop ${PACKAGE}`);
  return unsettled;
}

export const captureAndroid: Capture = async (ctx) => {
  const devices = ANDROID_DEVICES.filter((d) => !ctx.devices.length || ctx.devices.includes(d.id));
  const screens = screensFor('android', ctx.only);
  const started: AndroidDevice[] = [];
  try {
    // The build and the boots overlap; each device then runs its screens beside the other.
    await Promise.all([build(ctx), warmUp(ctx), ...devices.map(async (d) => (await boot(d, ctx)) && started.push(d))]);
    const results = await Promise.all(devices.map((d) => captureDevice(d, ctx, screens)));
    return results.flat();
  } finally {
    // Only the emulators this run booted; one that was already running is left as it was.
    for (const device of started) {
      await adb(serialOf(device), 'emu', 'kill').catch(() => {});
    }
  }
};

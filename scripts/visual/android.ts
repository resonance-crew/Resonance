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
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import en from '../../src/messages/en.json';
import zhTW from '../../src/messages/zh-TW.json';
import { PNG } from 'pngjs';
import { forgetBooted, mayShutDown, noteBooted } from './devices';
import { unspendHints } from './hints';
import { lookNote, secondLook, type Look, type Shot } from './secondLook';
import { shotName, type Account, type Screen, type Variant } from './screens';
import { withRestart } from './retry';
import { logSays, readyNote, readyOn, readyToken, restOfWait, waitReady, type Ready } from './ready';
import { buildIfChanged, stampFile, type BuildInputs } from './buildStamp';
import { CommandTimeout, ROOT, SEED_PASSWORD, execTimed, ignorePath, pixelsApart, settle, shotPath, sleep, type Capture, type CaptureContext, type Rect } from './util';
import { devicesFor, groups, plan, stateOf, type DeviceState } from './variants';

const execFileAsync = promisify(execFile);

export const PACKAGE = 'com.resonance.stories';
const ACTIVITY = `${PACKAGE}/com.resonance.app.MainActivity`;
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
const ADB = join(SDK, 'platform-tools/adb');
const EMULATOR = join(SDK, 'emulator/emulator');
const ANDROID_DIR = join(ROOT, 'apps/android');
export const APK = join(ANDROID_DIR, 'app/build/outputs/apk/debug/app-debug.apk');

export type AndroidDevice = { id: string; phone: boolean; avd: string; port: number };

/** The console port names the device: `emulator-5600`. */
export const ANDROID_DEVICES: AndroidDevice[] = [
  { id: 'phone', phone: true, avd: 'visual-phone', port: 5600 },
  { id: 'tablet', phone: false, avd: 'visual-tablet', port: 5602 },
];

export const serialOf = (d: AndroidDevice) => `emulator-${d.port}`;

/** How long one adb call may take (`VISUAL_ADB_TIMEOUT_S`, default 2 min; an install 5). */
const ADB_TIMEOUT_MS = Number(process.env.VISUAL_ADB_TIMEOUT_S || 120) * 1000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;

/** adb's link to the emulator made again (`adb reconnect`): what a call that hung most often needs. */
async function reconnect(serial: string) {
  await execTimed(ADB, ['-s', serial, 'reconnect'], { timeoutMs: 30_000 }).catch(() => {});
  await sleep(2000);
}

/** One adb call, stopped once it runs past its time and tried once more after a reconnect (retry.ts). */
async function adbTimed(serial: string, args: string[], buffer: boolean): Promise<string | Buffer> {
  const timeoutMs = args[0] === 'install' ? INSTALL_TIMEOUT_MS : ADB_TIMEOUT_MS;
  const call = () => execTimed(ADB, ['-s', serial, ...args], { timeoutMs, buffer, maxBuffer: buffer ? 64 << 20 : 16 << 20 });
  return (await withRestart(`adb ${args.slice(0, 2).join(' ')} on ${serial}`, call, () => reconnect(serial))).stdout;
}

export async function adb(serial: string, ...args: string[]): Promise<string> {
  return String(await adbTimed(serial, args, false)).trim();
}

export const shell = (serial: string, command: string) => adb(serial, 'shell', command);

async function screencap(serial: string): Promise<Buffer> {
  return (await adbTimed(serial, ['exec-out', 'screencap', '-p'], true)) as Buffer;
}

async function booted(serial: string): Promise<boolean> {
  try {
    return (await shell(serial, 'getprop sys.boot_completed')) === '1';
  } catch {
    return false;
  }
}

/**
 * Asks the emulator to quit and waits until adb no longer lists it: it takes up to 20 s to go,
 * and a boot on the same port meanwhile would meet the one still leaving. Only one this run booted,
 * and only the harness's own (devices.ts): anything else is left running and said.
 */
export async function kill(serial: string, log: (line: string) => void = console.log) {
  const may = mayShutDown(serial, null);
  if (!may.ok) return log(`  left running: ${may.why}`);
  forgetBooted(serial);
  await adb(serial, 'emu', 'kill').catch(() => {});
  const end = Date.now() + 40_000;
  while (Date.now() < end) {
    const listed = await execTimed(ADB, ['devices'], { timeoutMs: 30_000 }).catch(() => null);
    if (listed && !String(listed.stdout).split('\n').some((line) => line.startsWith(`${serial}\t`))) return;
    await sleep(1000);
  }
}

/** Boots the AVD unless it already runs; answers whether this run booted it. */
export async function boot(device: AndroidDevice, ctx: CaptureContext): Promise<boolean> {
  const serial = serialOf(device);
  if (await booted(serial)) return false;
  if (!existsSync(join(homedir(), '.android/avd', `${device.avd}.avd`))) {
    throw new Error(`No AVD ${device.avd}: create it first (see the top of scripts/visual/android.ts)`);
  }
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  const out = openSync(join(ctx.runDir, '_logs', `emulator-${device.id}.log`), 'a');
  // One that doesn't come up in BOOT_TIMEOUT_MS is stopped (it is this run's own: it started it) and started once more.
  const start = async () => {
    ctx.log(`  booting ${device.avd} as ${serial}…`);
    // -no-snapshot-save: every run boots the same device; -gpu host: our AVDs would draw in software otherwise.
    const child = spawn(EMULATOR, ['-avd', device.avd, '-port', String(device.port), '-no-window', '-gpu', 'host', '-no-snapshot-save', '-no-boot-anim', '-no-audio'], {
      detached: true,
      stdio: ['ignore', out, out],
    });
    child.unref();
    const end = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < end) {
      if (await booted(serial)) {
        noteBooted(serial);
        return true;
      }
      await sleep(2000);
    }
    await execTimed(ADB, ['-s', serial, 'emu', 'kill'], { timeoutMs: 30_000 }).catch(() => {});
    if (child.pid) {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    await sleep(5000);
    throw new CommandTimeout(`${device.avd}'s boot`, BOOT_TIMEOUT_MS);
  };
  return withRestart(device.avd, start, () => {}, { log: ctx.log });
}

/** How long an AVD may take to boot (`VISUAL_BOOT_TIMEOUT_S`, default 5 min). */
const BOOT_TIMEOUT_MS = Number(process.env.VISUAL_BOOT_TIMEOUT_S || 300) * 1000;

/** Holds still what the system would otherwise move between runs. */
export async function holdStill(serial: string, ctx: CaptureContext) {
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    await shell(serial, `settings put global ${key} 0`);
  }
  // With the AVD's hardware keyboard, no soft keyboard comes up under the writer.
  await shell(serial, 'settings put secure show_ime_with_hard_keyboard 0');
  // Where one does come up, Gboard's keys (keysOn).
  await keysOn((command) => shell(serial, command));
  await shell(serial, 'settings put global sysui_demo_allowed 1');
  await demoBar(serial);
  // Pictures stored against the emulators are served by the dev server at localhost:<dev port>.
  await adb(serial, 'reverse', `tcp:${ctx.ports.dev}`, `tcp:${ctx.ports.dev}`);
}

/**
 * The status bar in demo mode: 09:41, full battery and Wi-Fi, no notification icons. Said again
 * before every capture, not once: SystemUI drops the demo clock now and then (a bar redrawn for
 * night mode, a broadcast that came while it was still starting) and the real time shows.
 */
async function demoBar(serial: string) {
  const demo = (command: string, extras = '') => shell(serial, `am broadcast -a com.android.systemui.demo -e command ${command} ${extras}`);
  await demo('enter');
  await demo('clock', '-e hhmm 0941');
  await demo('battery', '-e level 100 -e plugged false -e powersave false');
  await demo('network', '-e wifi show -e level 4 -e fully true');
  await demo('network', '-e mobile hide');
  await demo('notifications', '-e visible false');
}

/** Gboard's package: the keyboard every capture that raises one shows. */
export const GBOARD_PACKAGE = 'com.google.android.inputmethod.latin';

/**
 * Gboard as the AVD's input method, so a field that raises the soft keyboard shows its keys. The flows put Google's
 * voice input in its place while they type (flows.ts, `keyboardsOff`) and put back the one they found when they end;
 * a flows run cut off before that, or one that found voice input already there, leaves the AVD with voice input as its
 * keyboard — its "Tap to speak" panel where card-note-open's keys were on both AVDs' first variant in run
 * 20261118-235458 (a voice session that hears nothing then hands back to Gboard, so the later variants had keys).
 * Answers the input method set, or null on an AVD without Gboard (left as it is).
 */
export async function keysOn(run: (command: string) => Promise<string>): Promise<string | null> {
  const gboard = (await run('ime list -s -a'))
    .split('\n')
    .map((line) => line.trim())
    .find((ime) => ime.startsWith(`${GBOARD_PACKAGE}/`));
  if (!gboard) return null;
  await run(`ime enable ${gboard}`);
  await run(`ime set ${gboard}`);
  return gboard;
}

async function wear(serial: string, v: Variant) {
  await shell(serial, `cmd uimode night ${v.theme === 'dark' ? 'yes' : 'no'}`);
}

const GRADLE_ARGS = [':app:assembleDebug', '-q'];

/**
 * How the harness runs Gradle, beside what it builds (not in the fingerprint: the APK is the same either way). Without
 * them a build left a Gradle daemon (`-Xmx4g`, gradle.properties) and a Kotlin compile daemon resident for three idle
 * hours — 3–6 GB through the Android phase that came after, the run's peak, on a 24 GB machine already in swap
 * (2026-11-23). `--no-daemon` gives the build a daemon of its own that ends with it, and the Kotlin compiler runs inside
 * that one instead of a daemon of its own. Another session's or Android Studio's daemons are theirs: none is stopped.
 * A rebuild costs some 10–20 s more for the cold JVM; a reused build (buildStamp.ts) nothing.
 */
export const GRADLE_RUN_FLAGS = ['--no-daemon', '-Pkotlin.compiler.execution.strategy=in-process'];

/**
 * What goes into the debug APK (buildStamp.ts): the app, the files its Gradle build takes from the rest of the
 * repository (fonts, the design system's resources under apps/ios, strings, stickers, both islands, the Kotlin
 * geometry under native/), this machine's SDK path and Java.
 */
export function androidInputs(): BuildInputs {
  return {
    roots: ['apps/android', 'apps/shared', 'apps/ios/Packages/DesignSystem/Sources/DesignSystem/Resources', 'native', 'src/messages', 'public/stickers'],
    extras: ['apps/android/local.properties', 'native/editor/dist', 'native/mascots/dist', 'native/fonts'],
    salt: [...GRADLE_ARGS, process.env.JAVA_HOME ?? '', process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '', process.arch],
  };
}

/** The APK, built once per run however many ask (the captures, the flows, the run's head start). */
let built: Promise<void> | null = null;
export function build(ctx: CaptureContext): Promise<void> {
  if (built) return built;
  if (process.env.VISUAL_SKIP_BUILD === '1' && existsSync(APK)) return (built = Promise.resolve());
  return (built = (async () => {
    if (!existsSync(join(ROOT, 'native/editor/dist/editor.html'))) {
      await execFileAsync('npm', ['run', '-s', 'native:editor'], { cwd: ROOT, maxBuffer: 64 << 20 });
    }
    // Skipped when its inputs are as at the last build (buildStamp.ts; --force-build builds anyway).
    await buildIfChanged({
      name: 'the debug APK',
      stamp: stampFile(dirname(APK)),
      product: APK,
      artifact: APK,
      inputs: androidInputs(),
      log: ctx.log,
      build: async () => {
        ctx.log('  building the debug APK (VISUAL_SKIP_BUILD=1 skips it)…');
        await execFileAsync('./gradlew', [...GRADLE_ARGS, ...GRADLE_RUN_FLAGS], { cwd: ANDROID_DIR, maxBuffer: 64 << 20 });
      },
    });
  })());
}

/** A fresh install of the app's data, in the variant's language (the app follows its own locale while nothing is saved). */
async function reset(serial: string, v: Variant) {
  await shell(serial, `pm clear ${PACKAGE}`);
  await shell(serial, `cmd locale set-app-locales ${PACKAGE} --locales ${v.locale}`);
}

async function launch(serial: string, ctx: CaptureContext, account: Account | null, route: string | null, extra: readonly string[] = []) {
  const args = [
    'am', 'start', '-S', '-n', ACTIVITY,
    '--ez', 'emulator', 'true',
    '--ei', 'emulatorAuthPort', String(ctx.ports.auth),
    '--ei', 'emulatorFirestorePort', String(ctx.ports.firestore),
    '--ei', 'emulatorApiPort', String(ctx.ports.dev),
    '--ez', 'mascots', 'false',
    // 自動翻譯 is kept by the app once an extra sets it (screens.ts AUTO_TRANSLATE): off unless this screen asks for it
    // (a later extra of the same name wins)
    '--ez', 'autoTranslate', 'false',
  ];
  if (account) args.push('--es', 'email', `${account}@resonance.test`, '--es', 'password', SEED_PASSWORD);
  if (route) args.push('--es', 'route', route);
  // The screen's own debug extras (`app.android` in screens.ts): a panel open, something riding the composer.
  args.push(...extra);
  await adb(serial, 'shell', ...args);
}

/**
 * What the app's skeletons are named for TalkBack (`L10n.Home.moreLoading`: the card page's story, the
 * conversations, the bell, settings' lists): read from the strings the app itself reads.
 */
const LOADING_WORDS = [zhTW.home.moreLoading, en.home.moreLoading];

/** Whether a window's hierarchy (`uiautomator dump`) still shows a skeleton: a node named or reading a loading word. */
export function stillLoading(xml: string, words: readonly string[] = LOADING_WORDS): boolean {
  const escape = (w: string) => w.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return words.some((w) => xml.includes(`content-desc="${escape(w)}"`) || xml.includes(`text="${escape(w)}"`));
}

/** The window's hierarchy, or null when uiautomator can't give it (a window still changing; then nothing is judged by it). */
async function hierarchy(serial: string): Promise<string | null> {
  try {
    const xml = await adb(serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty');
    return xml.includes('<hierarchy') ? xml : null;
  } catch {
    return null;
  }
}

/**
 * A text field's caret at its largest, in device pixels: Compose draws it 2 dp wide (about 6 px at the phone's density,
 * antialiased a pixel either side) and a line of text tall (at the large-text state's font scale 2, under 220 px).
 */
export const CARET_MAX = { width: 16, height: 220 };

/**
 * The window's text fields in a `uiautomator dump` (Compose's text fields are `android.widget.EditText` to
 * accessibility), in device pixels. Focused or not: only the focused one blinks a caret, and the dump's `focused`
 * is not always the input focus.
 */
export function textFields(xml: string): Rect[] {
  const fields: Rect[] = [];
  for (const [tag] of xml.matchAll(/<node\b[^>]*>/g)) {
    if (!/\bclass="android\.widget\.EditText"/.test(tag)) continue;
    const b = /\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag);
    if (b) fields.push({ x: +b[1], y: +b[2], width: +b[3] - +b[1], height: +b[4] - +b[2] });
  }
  return fields;
}

const inside = (x: number, y: number, r: Rect) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;

/** Where two frames differ (any channel of any pixel), outside `ignore`: one box round all of it, or null where nothing does. */
export function apartBox(a: Buffer, b: Buffer, ignore: Rect[] = []): Rect | null {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return { x: 0, y: 0, width: Math.max(pa.width, pb.width), height: Math.max(pa.height, pb.height) };
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < pa.height; y++) {
    for (let x = 0; x < pa.width; x++) {
      const i = (y * pa.width + x) * 4;
      if (pa.data[i] === pb.data[i] && pa.data[i + 1] === pb.data[i + 1] && pa.data[i + 2] === pb.data[i + 2] && pa.data[i + 3] === pb.data[i + 3]) continue;
      if (ignore.some((r) => inside(x, y, r))) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Whether what two frames differ by (`apartBox`) is a caret blinking: no bigger than a caret (CARET_MAX), inside one of
 * the window's text fields. Answers that box with a few pixels to spare — a region the capture asks the comparison to
 * skip (`<capture>.ignore.json`, as the web's cover titles) — or null.
 */
export function caretBlink(box: Rect | null, fields: Rect[]): Rect | null {
  if (!box || box.width > CARET_MAX.width || box.height > CARET_MAX.height) return null;
  const within = fields.some((f) => box.x >= f.x && box.y >= f.y && box.x + box.width <= f.x + f.width && box.y + box.height <= f.y + f.height);
  if (!within) return null;
  const spare = 4;
  const x = Math.max(0, box.x - spare);
  const y = Math.max(0, box.y - spare);
  return { x, y, width: box.x + box.width + spare - x, height: box.y + box.height + spare - y };
}

/**
 * A frame that holds still is not yet the page: with the animations off, the launch's waves,
 * a loader and a page's skeleton all hold still while the account and the page are read, and
 * none can be told from a quiet page by its pixels (a private card in the writer is as bare as
 * the splash). So a settled frame counts only once it is still the same a few seconds later —
 * longer than any of those stands while the dev server is warm ([warmUp]) — and once the window's
 * hierarchy names no skeleton (`stillLoading`: the 2.5.0 release run kept three cards taken before
 * they loaded, a skeleton that held still for longer than both looks). One still loading at the
 * end is unsettled, which fails the run.
 *
 * A focused field's caret blinks every 500 ms whatever the animation scales (Compose's
 * CursorAnimationState; the web and the Apple apps hide theirs, the Android app has no switch for
 * it): frames apart only by a caret in a text field (`caretBlink`) count as the same, and its box
 * joins `ignore` — the regions this capture's comparisons skip, written beside it. Without that,
 * a keyboard screen held still only when two looks met the caret in the same phase (run
 * 20261118-235458: the tablet's thread-keyboard and dark card-note-open never did).
 */
async function steady(serial: string, ignore: Rect[] = [], ready = false): Promise<Shot> {
  const same = async (a: Buffer, b: Buffer) => {
    if (a.equals(b) || pixelsApart(a, b) === 0) return true;
    const box = apartBox(a, b, ignore);
    if (!box) return true;
    const blink = caretBlink(box, box.width <= CARET_MAX.width && box.height <= CARET_MAX.height ? textFields((await hierarchy(serial)) ?? '') : []);
    if (!blink) return false;
    ignore.push(blink);
    return true;
  };
  const end = Date.now() + 90_000;
  for (;;) {
    // After the app's ready signal (ready.ts) the frames are looked at closer together and held 1 s, not 3.5:
    // the skeleton check below is the same either way.
    const shot = await settle(() => screencap(serial), { intervalMs: ready ? 500 : 1000, timeoutMs: 45_000, same });
    await sleep(ready ? 1000 : 3500);
    const again = await screencap(serial);
    const still = await same(again, shot.png);
    const loading = still && stillLoading((await hierarchy(serial)) ?? '');
    if (still && !loading) return { png: again, settled: shot.settled };
    if (Date.now() > end) return { png: again, settled: false };
  }
}

async function shoot(serial: string, ctx: CaptureContext, screen: Screen, first: boolean, key: string): Promise<Look & { ignore: Rect[]; ready: Ready | null }> {
  // Its hints unspent for its account on the stack (hints.ts), before the app reads the profile.
  await unspendHints(ctx, screen);
  // The launch says when its screen is quiet (ready.ts): a token of its own, logcat emptied of the last launch's.
  const token = readyOn() ? readyToken() : null;
  if (token) await adb(serial, 'logcat', '-c').catch(() => '');
  await launch(serial, ctx, screen.as, screen.route, [...(screen.app?.android ?? []), ...(token ? ['--es', 'visualReadyToken', token] : [])]);
  // A cold start reads the account and the page over the network (an account's first launch also signs in): the
  // signal, or else the fixed wait as before.
  const fixed = first ? 8000 : 4000;
  const ready = token ? await waitReady(async () => logSays(await adb(serial, 'logcat', '-d', '-s', 'VisualReady:I', '-v', 'raw').catch(() => ''), token)) : null;
  if (ready) await restOfWait(ready, fixed);
  else await sleep(fixed);
  await demoBar(serial);
  // A caret's box found by either look is skipped by both, and by the comparison with the baseline.
  const ignore: Rect[] = [];
  const look = await secondLook(await steady(serial, ignore, !!ready?.ready), () => steady(serial, ignore), { key, ignore, glance: () => screencap(serial) });
  return { ...look, ignore, ready };
}

/**
 * `next dev` compiles a route on its first request, for seconds; a page the app asks for meanwhile
 * shows its skeleton that long. Every v1 route the screens read is asked for once beforehand
 * (signed out: a 401 compiles it as well as a 200).
 */
export async function warmUp(ctx: CaptureContext) {
  ctx.log('  compiling the API routes the screens read…');
  const paths = [
    'me', 'feed', 'feed/recommended', 'cards/x', 'cards?keys=x', 'cards/x/private-shares', 'cards/x/resonances',
    'users/x', 'handles/x', 'me/cardbox', 'me/cards?tab=trash', 'me/notifications', 'me/devices/x',
    // What every launch asks first (a slow first answer lets the app past the update page: update-gate), and the
    // thought map's read — 20 s of compiling once showed 沒能載入 in its flow.
    'client-config', 'me/thought-map',
  ];
  for (const path of paths) {
    await fetch(`${ctx.devUrl}/api/v1/${path}`).catch(() => {});
  }
}

/**
 * What a device state (variants.ts) changes on the AVD — the font scale, the display size, the rotation — put on
 * before its screens and taken back after, to what the device had before (an AVD someone else brought up keeps
 * its own settings). Answers the function that takes it back.
 */
export async function wearState(run: (command: string) => Promise<string>, state: DeviceState['android'] = {}, wait = sleep): Promise<() => Promise<void>> {
  const undo: string[] = [];
  if (state.fontScale != null) {
    const was = (await run('settings get system font_scale')).trim();
    undo.push(was && was !== 'null' ? `settings put system font_scale ${was}` : 'settings delete system font_scale');
    await run(`settings put system font_scale ${state.fontScale}`);
  }
  if (state.density != null) {
    // `wm density` says "Physical density: 420" and, when one is set, "Override density: 504".
    const was = /Override density: (\d+)/.exec(await run('wm density'))?.[1];
    undo.push(was ? `wm density ${was}` : 'wm density reset');
    await run(`wm density ${state.density}`);
  }
  if (state.rotation != null) {
    const auto = (await run('settings get system accelerometer_rotation')).trim();
    const user = (await run('settings get system user_rotation')).trim();
    undo.push(`settings put system user_rotation ${/^\d$/.test(user) ? user : 0}`, `settings put system accelerometer_rotation ${auto === '1' ? 1 : 0}`);
    await run('settings put system accelerometer_rotation 0');
    await run(`settings put system user_rotation ${state.rotation}`);
  }
  // A new density or rotation redraws the system; the next screen's cold start waits on it anyway, plus a moment.
  if (undo.length) await wait(2000);
  return async () => {
    for (const command of undo.reverse()) await run(command).catch(() => '');
    // Held until the change is on disk: the settings provider writes a moment after a change, and `adb emu kill`
    // doesn't wait for it. Taken back just before the AVD shut down, the last state came back worn at the next boot
    // (a cold one, from the same userdata) — 2026-11-13: the phone stayed at font 2.0, every later capture of it large.
    if (undo.length) {
      await wait(SETTINGS_ON_DISK_MS);
      await run('sync').catch(() => '');
    }
  };
}

/** How long a changed setting may take to reach the AVD's disk (the settings provider delays its write, 2 s at most). */
export const SETTINGS_ON_DISK_MS = 3000;

/** The soft keyboard beside the AVD's hardware one, for a screen that wants it on screen (`keyboard` in screens.ts). */
const softKeyboard = (serial: string, on: boolean) => shell(serial, `settings put secure show_ime_with_hard_keyboard ${on ? 1 : 0}`);

/** One device (a base device or a state of it, variants.ts) of the AVD on `serial`: its shots, by variant and account. */
async function captureDevice(id: string, serial: string, ctx: CaptureContext): Promise<string[]> {
  const unsettled: string[] = [];
  let worn: Variant | null = null;
  for (const { variant: v, screens } of groups(plan('android', id, ctx.set ?? 'release', ctx.only))) {
    if (worn?.theme !== v.theme) await wear(serial, v);
    worn = v;
    await reset(serial, v);
    // Gboard's keys again before each variant (keysOn): whatever a screen's field raises starts from them.
    await keysOn((command) => shell(serial, command));
    let first = true;
    for (const screen of screens) {
      const name = shotName(screen, v);
      const key = `android/${id}/${name}`;
      if (screen.keyboard) await softKeyboard(serial, true);
      let look: Look & { ignore: Rect[]; ready: Ready | null };
      try {
        look = await shoot(serial, ctx, screen, first, key);
      } finally {
        if (screen.keyboard) await softKeyboard(serial, false);
      }
      first = false;
      const file = shotPath(ctx.runDir, 'android', id, name);
      writeFileSync(file, look.png);
      // The caret's box, which the comparison skips (steady).
      if (look.ignore.length) writeFileSync(ignorePath(file), JSON.stringify(look.ignore));
      if (!look.settled) unsettled.push(key);
      if (look.retaken) ctx.retaken.push(key);
      ctx.log(`  ${key}${lookNote(look)}${readyNote(look.ready)}`);
    }
  }
  return unsettled;
}

/** An AVD's whole share of the run: the app installed once, then its devices one after the other, each state worn and taken back. */
async function captureLane(device: AndroidDevice, ids: string[], ctx: CaptureContext): Promise<string[]> {
  const serial = serialOf(device);
  const unsettled: string[] = [];
  await holdStill(serial, ctx);
  await adb(serial, 'install', '-r', '-t', APK);
  for (const id of ids) {
    const state = stateOf('android', id);
    const takeBack = state ? await wearState((c) => shell(serial, c), state.android) : null;
    if (state) ctx.log(`  ${id}: ${state.why}`);
    try {
      unsettled.push(...(await captureDevice(id, serial, ctx)));
    } finally {
      await takeBack?.();
    }
  }
  await shell(serial, `am force-stop ${PACKAGE}`);
  return unsettled;
}

export const captureAndroid: Capture = async (ctx) => {
  const ids = devicesFor('android', ctx.set ?? 'release', ctx.devices);
  // Each AVD with the devices it takes: itself and its states (a state names the AVD it runs on).
  const lanes = ANDROID_DEVICES.map((d) => ({ device: d, ids: ids.filter((id) => id === d.id || stateOf('android', id)?.on === d.id) })).filter((l) => l.ids.length);
  const devices = lanes.map((l) => l.device);
  const started: AndroidDevice[] = [];
  // Only the emulators this run booted; one that was already running is left as it was.
  const shutDown = async (device: AndroidDevice) => {
    if (!started.includes(device)) return;
    await kill(serialOf(device), ctx.log);
    started.splice(started.indexOf(device), 1);
  };
  try {
    if (process.env.VISUAL_PARALLEL !== '0') {
      // Both AVDs at once (VISUAL_PARALLEL=0: one at a time, for a machine short of memory): the
      // build and the boots overlap, then each device runs its screens beside the other.
      await Promise.all([build(ctx), warmUp(ctx), ...devices.map(async (d) => (await boot(d, ctx)) && started.push(d))]);
      return (await Promise.all(lanes.map((l) => captureLane(l.device, l.ids, ctx)))).flat();
    }
    // One AVD at a time: booted, captured and shut down before the next one boots.
    await Promise.all([build(ctx), warmUp(ctx)]);
    const unsettled: string[] = [];
    for (const lane of lanes) {
      if (await boot(lane.device, ctx)) started.push(lane.device);
      unsettled.push(...(await captureLane(lane.device, lane.ids, ctx)));
      await shutDown(lane.device);
    }
    return unsettled;
  } finally {
    for (const device of [...started]) await shutDown(device);
  }
};

/**
 * The Mac captures: the Debug Mac Catalyst app under its own bundle id
 * (`com.resonance.stories.macdev`, beside any App Store copy, signed with
 * mac-dev.entitlements), built once per run, each screen a fresh launch with
 * the iOS captures' arguments and `-macWindowSize 1440x900`. Launched in the
 * background (`open -g`), so the owner's focus is never taken and the window
 * always wears its inactive title bar; only that window is captured
 * (`screencapture -l`, found through macWindows.swift), cut to 2880 × 1800 —
 * the scene keeps whole iPad points, so it can come out a point wider.
 *
 * Needs Screen Recording for whatever runs this (the terminal), or every
 * capture is the desktop behind the window. `VISUAL_SKIP_BUILD=1` reuses the last build.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { unspendHints } from './hints';
import { BUNDLE_ID, XCODE_RUN_SETTINGS, ensureIslands, inXcodeLine, launchArgs, prepareProject, runLogged, shootAfterLaunch, xcodeInputs, type Looker } from './ios';
import { encodeFrame, settleFrames, type Frame } from './frames';
import { stopwatch, type Stopwatch } from './timings';
import { buildIfChanged, stampFile } from './buildStamp';
import { LOG_STREAM_ARGS, logStream, readyNote, readyOn, readyToken, waitReady, type LogStream, type Ready } from './ready';
import { lookNote, type Look } from './secondLook';
import { shotName } from './screens';
import { ROOT, run, shotPath, sleep, type Capture, type CaptureContext } from './util';
import { devicesFor, groups, plan, stateOf } from './variants';

const MAC_BUNDLE_ID = `${BUNDLE_ID}.macdev`;
const IOS_DIR = join(ROOT, 'apps/ios');
const DERIVED = join(IOS_DIR, 'build/visual-mac');
const APP = join(DERIVED, 'Build/Products/Debug-maccatalyst/Resonance.app');
const WINDOWS_SOURCE = join(ROOT, 'scripts/visual/macWindows.swift');
const WINDOWS_TOOL = join(DERIVED, 'macWindows');
/** The window in the Mac's points (the store's screenshot size), captured at 2×; a device state (variants.ts) may name another. */
const WINDOW = { width: 1440, height: 900 };
type Size = { width: number; height: number };

type MacWindow = { id: number; pid: number; width: number; height: number; layer: number };

/**
 * The Mac app, once per run however many ask (the run's head start, the capture); skipped when its inputs are as at the
 * last build. It joins the Xcode line ahead of the simulator's (run.ts starts the builds in the phases' order): the Mac
 * is captured in the first phase, the simulators in the last — behind the simulator's build it waited minutes with
 * nothing captured (run 20261123-053155: 4 min).
 */
let built: Promise<void> | null = null;
export function build(ctx: CaptureContext): Promise<void> {
  built ??= buildOnce(ctx);
  return built;
}

function buildOnce(ctx: CaptureContext): Promise<void> {
  if (!existsSync(WINDOWS_TOOL) || statSync(WINDOWS_TOOL).mtimeMs < statSync(WINDOWS_SOURCE).mtimeMs) {
    mkdirSync(DERIVED, { recursive: true });
    run('swiftc', ['-O', WINDOWS_SOURCE, '-o', WINDOWS_TOOL]);
  }
  return inXcodeLine(async () => {
    if (process.env.VISUAL_SKIP_BUILD === '1' && existsSync(APP)) return ctx.log('  reusing the last Mac build');
    const args = [
      '-project', 'Resonance.xcodeproj', '-scheme', 'Resonance', '-configuration', 'Debug',
      '-destination', 'platform=macOS,variant=Mac Catalyst', '-derivedDataPath', DERIVED,
      '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration',
      '-skipPackagePluginValidation', '-skipMacroValidation', 'build',
      'RESONANCE_BUNDLE_SUFFIX=.macdev', `RESONANCE_MAC_ENTITLEMENTS=${join(ROOT, 'scripts/visual/mac-dev.entitlements')}`,
    ];
    // Skipped when its inputs are as at the last build (buildStamp.ts; --force-build builds anyway).
    await ensureIslands(ctx);
    await buildIfChanged({
      name: 'the Mac app',
      stamp: stampFile(DERIVED),
      product: join(APP, 'Contents/MacOS/Resonance.debug.dylib'),
      artifact: APP,
      inputs: xcodeInputs(['mac-catalyst', ...args]),
      log: ctx.log,
      build: async () => {
        ctx.log('  building the Debug Mac app (apps/ios/build/visual-mac)…');
        await prepareProject(ctx);
        await runLogged('xcodebuild', [...args, ...XCODE_RUN_SETTINGS], join(ctx.runDir, '_logs', 'mac-build.log'), IOS_DIR);
      },
    });
  });
}

function windows(): MacWindow[] {
  return run(WINDOWS_TOOL, [MAC_BUNDLE_ID]).split('\n').filter(Boolean).map((line) => JSON.parse(line) as MacWindow);
}

/** Opens a new copy of the app and answers its process and main window, once the window is at its size. */
async function launch(args: string[], size: Size = WINDOW): Promise<MacWindow> {
  const before = new Set(windows().map((w) => w.pid));
  // A Mac with a mouse shows every scroll bar the app hides (`.hidden`); the system's setting, for this copy alone.
  // The window state is neither restored nor saved (`ApplePersistenceIgnoreState`): a capture's pinned size kept
  // would open the app at 1440 × 900 the next time anyone opens it.
  run('open', ['-n', '-g', APP, '--args', ...args, '-macWindowSize', `${size.width}x${size.height}`, '-AppleShowScrollBars', 'WhenScrolling',
    '-ApplePersistenceIgnoreState', 'YES']);
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    await sleep(500);
    const found = windows().find((w) => !before.has(w.pid) && w.layer === 0 && w.width >= size.width && w.height >= size.height);
    if (found) return found;
  }
  throw new Error(`The Mac app's window never came at ${size.width}x${size.height}`);
}

/** Stops the copy this capture opened, and only it. */
async function quit(pid: number, { timeoutMs = 10_000, wait = sleep }: { timeoutMs?: number; wait?: (ms: number) => Promise<unknown> } = {}) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // already gone
  }
  // Gone before the next copy opens (its window is told apart by a pid not seen before): no fixed second.
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && alive(pid)) await wait(100);
}

/** Whether a process is still there (signal 0 asks without sending anything). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The window's capture cut to the size asked for (a point wider or taller comes off its far edges). */
/** The window's close / minimise / zoom buttons (capture pixels): grey or coloured as macOS thinks the window active. */
const WINDOW_BUTTONS = { width: 160, height: 64 };

/**
 * The window's capture cut to the size asked for, as pixels: decoded as before (pngjs: the window's PNG carries the
 * display's colour profile, which pngjs leaves as it is), cut and painted over, never encoded until it is the one kept
 * (frames.ts) — every frame looked at was encoded with pngjs before, at 2880 × 1800.
 */
export function cutFrame(png: Buffer, size: Size = WINDOW): Frame {
  const image = PNG.sync.read(png);
  const width = size.width * 2;
  const height = size.height * 2;
  const out = new PNG({ width: Math.min(width, image.width), height: Math.min(height, image.height) });
  PNG.bitblt(image, out, 0, 0, out.width, out.height, 0, 0);
  // Painted over with the bar's own paper beside them: a window launched in the background still
  // comes up active now and then, and the buttons are the system's, not ours to check.
  const paper = (WINDOW_BUTTONS.height / 2 * out.width + WINDOW_BUTTONS.width + 8) * 4;
  for (let y = 0; y < WINDOW_BUTTONS.height; y++) {
    for (let x = 0; x < WINDOW_BUTTONS.width; x++) out.data.copyWithin((y * out.width + x) * 4, paper, paper + 4);
  }
  return { data: out.data, width: out.width, height: out.height };
}

/**
 * A launch's ready token (ready.ts) and how to wait for its word in the Mac's unified log (`stream`); null when the
 * signal is off. (Not a file: the app's sandbox keeps every other process out of its container.)
 */
function readyArgs(stream: LogStream | null): { args: string[]; wait: () => Promise<Ready> } | null {
  if (!stream) return null;
  const token = readyToken();
  return { args: ['-visualReadyToken', token], wait: () => waitReady(() => stream.says(token)) };
}

function shoot(window: MacWindow, ctx: CaptureContext, key: string, size: Size, ready: (() => Promise<Ready>) | null, timing: Stopwatch): Promise<Look & { ready: Ready | null }> {
  const file = join(ctx.runDir, '_logs', 'mac-window.png');
  const frame = () => {
    run('screencapture', ['-o', '-x', '-t', 'png', '-l', String(window.id), file]);
    return Promise.resolve(cutFrame(readFileSync(file), size));
  };
  // Settled on pixels; only the frame kept is encoded.
  const looker: Looker = {
    take: async (fast) => {
      const { frame: kept, settled } = await settleFrames(frame, { timeoutMs: 40_000, intervalMs: fast ? 500 : 1000 });
      return { png: await encodeFrame(kept), settled };
    },
    glance: async () => encodeFrame(await frame()),
  };
  // Its ready signal (ready.ts), or the 4 s it always waited; then the looks, as on iOS.
  return shootAfterLaunch(looker, key, ready, timing);
}

export const captureMac: Capture = async (ctx) => {
  const set = ctx.set ?? 'release';
  const ids = devicesFor('mac', set, ctx.devices).filter((id) => plan('mac', id, set, ctx.only).length);
  const unsettled: string[] = [];
  if (!ids.length) return unsettled;
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  await build(ctx);
  // The unified log, read from before the first launch to the last (ready.ts).
  const stream = readyOn() ? await logStream('log', LOG_STREAM_ARGS) : null;
  try {
  for (const id of ids) {
    // The window's size: the store's 1440 × 900, or a state's own (a narrow window, variants.ts).
    const state = stateOf('mac', id);
    const size = state?.mac ?? WINDOW;
    if (state) ctx.log(`  ${id}: ${state.why}`);
    for (const { variant: v, account, screens } of groups(plan('mac', id, set, ctx.only))) {
      // The account signs in on a launch of its own; a screen's launch only restores it.
      // Its full 10 s, as ever, not cut short by the ready signal (ios.ts says why).
      const signInTime = stopwatch();
      const signIn = await launch(launchArgs(ctx, account, null, v), size);
      signInTime.lap('launch');
      await sleep(10_000);
      await quit(signIn.pid);
      signInTime.lap('wait');
      signInTime.done(ctx.runDir, `mac/${id}/${account ?? 'signed-out'}@${v.theme}-${v.locale}`, 'sign-in');
      for (const screen of screens) {
        const timing = stopwatch();
        // Its hints unspent for its account on the stack (hints.ts), before the app reads the profile.
        await unspendHints(ctx, screen);
        timing.lap('hints');
        const screenReady = readyArgs(stream);
        const window = await launch([...launchArgs(ctx, account, screen.route, v, screen.app?.mac ?? screen.app?.ios), ...(screenReady?.args ?? [])], size);
        timing.lap('launch');
        const name = shotName(screen, v);
        const key = `mac/${id}/${name}`;
        try {
          const look = await shoot(window, ctx, key, size, screenReady?.wait ?? null, timing);
          writeFileSync(shotPath(ctx.runDir, 'mac', id, name), look.png);
          timing.lap('write');
          if (!look.settled) unsettled.push(key);
          if (look.retaken) ctx.retaken.push(key);
          ctx.log(`  ${key}${lookNote(look)}${readyNote(look.ready)}`);
        } finally {
          await quit(window.pid);
          timing.lap('quit');
          timing.done(ctx.runDir, key);
        }
      }
    }
  }
  } finally {
    stream?.stop();
  }
  return unsettled;
};

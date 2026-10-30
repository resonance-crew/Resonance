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
import { BUNDLE_ID, byAccount, launchArgs, prepareProject, runLogged } from './ios';
import { BASE_VARIANT, screensFor, shotName } from './screens';
import { ROOT, run, settle, shotPath, sleep, type Capture, type CaptureContext } from './util';

const MAC_BUNDLE_ID = `${BUNDLE_ID}.macdev`;
const IOS_DIR = join(ROOT, 'apps/ios');
const DERIVED = join(IOS_DIR, 'build/visual-mac');
const APP = join(DERIVED, 'Build/Products/Debug-maccatalyst/Resonance.app');
const WINDOWS_SOURCE = join(ROOT, 'scripts/visual/macWindows.swift');
const WINDOWS_TOOL = join(DERIVED, 'macWindows');
/** The window in the Mac's points (the store's screenshot size), captured at 2×. */
const WINDOW = { width: 1440, height: 900 };

type MacWindow = { id: number; pid: number; width: number; height: number; layer: number };

function build(ctx: CaptureContext) {
  if (!existsSync(WINDOWS_TOOL) || statSync(WINDOWS_TOOL).mtimeMs < statSync(WINDOWS_SOURCE).mtimeMs) {
    mkdirSync(DERIVED, { recursive: true });
    run('swiftc', ['-O', WINDOWS_SOURCE, '-o', WINDOWS_TOOL]);
  }
  if (process.env.VISUAL_SKIP_BUILD === '1' && existsSync(APP)) return ctx.log('  reusing the last Mac build');
  ctx.log('  building the Debug Mac app (apps/ios/build/visual-mac)…');
  prepareProject(ctx);
  runLogged('xcodebuild', [
    '-project', 'Resonance.xcodeproj', '-scheme', 'Resonance', '-configuration', 'Debug',
    '-destination', 'platform=macOS,variant=Mac Catalyst', '-derivedDataPath', DERIVED,
    '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration',
    '-skipPackagePluginValidation', '-skipMacroValidation', 'build',
    'RESONANCE_BUNDLE_SUFFIX=.macdev', `RESONANCE_MAC_ENTITLEMENTS=${join(ROOT, 'scripts/visual/mac-dev.entitlements')}`,
  ], join(ctx.runDir, '_logs', 'mac-build.log'), IOS_DIR);
}

function windows(): MacWindow[] {
  return run(WINDOWS_TOOL, [MAC_BUNDLE_ID]).split('\n').filter(Boolean).map((line) => JSON.parse(line) as MacWindow);
}

/** Opens a new copy of the app and answers its process and main window, once the window is at its size. */
async function launch(args: string[]): Promise<MacWindow> {
  const before = new Set(windows().map((w) => w.pid));
  // A Mac with a mouse shows every scroll bar the app hides (`.hidden`); the system's setting, for this copy alone.
  // The window state is neither restored nor saved (`ApplePersistenceIgnoreState`): a capture's pinned size kept
  // would open the app at 1440 × 900 the next time anyone opens it.
  run('open', ['-n', '-g', APP, '--args', ...args, '-macWindowSize', `${WINDOW.width}x${WINDOW.height}`, '-AppleShowScrollBars', 'WhenScrolling',
    '-ApplePersistenceIgnoreState', 'YES']);
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    await sleep(500);
    const found = windows().find((w) => !before.has(w.pid) && w.layer === 0 && w.width >= WINDOW.width && w.height >= WINDOW.height);
    if (found) return found;
  }
  throw new Error(`The Mac app's window never came at ${WINDOW.width}x${WINDOW.height}`);
}

/** Stops the copy this capture opened, and only it. */
function quit(pid: number) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

/** The window's capture cut to the size asked for (a point wider or taller comes off its far edges). */
function cut(png: Buffer): Buffer {
  const image = PNG.sync.read(png);
  const width = WINDOW.width * 2;
  const height = WINDOW.height * 2;
  if (image.width === width && image.height === height) return png;
  const out = new PNG({ width: Math.min(width, image.width), height: Math.min(height, image.height) });
  PNG.bitblt(image, out, 0, 0, out.width, out.height, 0, 0);
  return PNG.sync.write(out);
}

async function shoot(window: MacWindow, ctx: CaptureContext): Promise<{ png: Buffer; settled: boolean }> {
  const file = join(ctx.runDir, '_logs', 'mac-window.png');
  await sleep(4000);
  return settle(() => {
    run('screencapture', ['-o', '-x', '-t', 'png', '-l', String(window.id), file]);
    return Promise.resolve(cut(readFileSync(file)));
  }, { timeoutMs: 40_000, intervalMs: 1000 });
}

export const captureMac: Capture = async (ctx) => {
  const screens = screensFor('mac', ctx.only);
  const unsettled: string[] = [];
  if (!screens.length || (ctx.devices.length && !ctx.devices.includes('mac'))) return unsettled;
  mkdirSync(join(ctx.runDir, '_logs'), { recursive: true });
  build(ctx);
  const v = BASE_VARIANT;
  for (const [account, group] of byAccount(screens)) {
    // The account signs in on a launch of its own; a screen's launch only restores it.
    const signIn = await launch(launchArgs(ctx, account, null, v));
    await sleep(10_000);
    quit(signIn.pid);
    for (const screen of group) {
      const window = await launch(launchArgs(ctx, account, screen.route, v));
      try {
        const name = shotName(screen, v);
        const { png, settled } = await shoot(window, ctx);
        writeFileSync(shotPath(ctx.runDir, 'mac', 'mac', name), png);
        if (!settled) unsettled.push(`mac/mac/${name}`);
        ctx.log(`  mac/mac/${name}${settled ? '' : '  (never settled)'}`);
      } finally {
        quit(window.pid);
        await sleep(1000);
      }
    }
  }
  return unsettled;
};

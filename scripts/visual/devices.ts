/**
 * The devices a run may put away, and the ones it must leave alone. The harness boots its own
 * AVDs (`visual-phone`, `visual-tablet` on consoles 5600 / 5602) and simulators (`Visual iPhone`,
 * `Visual iPad`) and shuts down only what it booted itself: every shutdown goes through
 * [mayShutDown], which refuses a device this process didn't boot, or one that isn't the harness's
 * own (a guard behind the guard: a mix-up in a capturer can't reach the owner's simulators).
 *
 * The 2026-11-10 release run still saw the owner's simulators and emulator-5554 go down while it
 * ran, though no code here names them: a booted machine short of memory, or CoreSimulator restarting,
 * takes devices down by itself. So a run that uses devices lists the others before it starts and
 * again when it ends, and says which went down meanwhile (`devicesLost` in run.json, a warning in
 * the verdict) — the owner hears of it from the run, not from finding them gone.
 */
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** What this process booted, by simulator udid or emulator serial. */
const bootedHere = new Set<string>();

export function noteBooted(id: string) {
  bootedHere.add(id);
}

export function forgetBooted(id: string) {
  bootedHere.delete(id);
}

/** The harness's own simulators (ios.ts IOS_DEVICES) and emulator consoles (android.ts ANDROID_DEVICES). */
export const HARNESS_SIMULATORS = ['Visual iPhone', 'Visual iPad', 'Visual iPhone 2'];
export const HARNESS_EMULATORS = ['emulator-5600', 'emulator-5602', 'emulator-5604'];

/**
 * Whether a run may shut `id` down: it booted it, and it is the harness's own (`name`: a
 * simulator's name; an emulator is known by its serial). Says why not, for the log.
 */
export function mayShutDown(id: string, name: string | null, booted: ReadonlySet<string> = bootedHere): { ok: true } | { ok: false; why: string } {
  if (!booted.has(id)) return { ok: false, why: `${name ?? id} was not booted by this run` };
  const ours = id.startsWith('emulator-') ? HARNESS_EMULATORS.includes(id) : name != null && HARNESS_SIMULATORS.includes(name);
  if (!ours) return { ok: false, why: `${name ?? id} is not one of the harness's devices` };
  return { ok: true };
}

/** A device seen running: a simulator by udid and name, an emulator by serial. */
export type RunningDevice = { id: string; name: string; kind: 'simulator' | 'emulator' };

function quiet(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 });
  } catch {
    return '';
  }
}

/** Parses `xcrun simctl list devices booted -j`. */
export function parseSimctl(json: string): RunningDevice[] {
  try {
    const listed = JSON.parse(json) as { devices: Record<string, { name: string; udid: string; state: string }[]> };
    return Object.values(listed.devices).flat().filter((d) => d.state === 'Booted').map((d) => ({ id: d.udid, name: d.name, kind: 'simulator' as const }));
  } catch {
    return [];
  }
}

/** Parses `adb devices`: the emulators, by serial. */
export function parseAdb(text: string): RunningDevice[] {
  return text
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial?.startsWith('emulator-') && state === 'device')
    .map(([serial]) => ({ id: serial, name: serial, kind: 'emulator' as const }));
}

const ADB = join(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk'), 'platform-tools/adb');

/** Every simulator and emulator running now, the harness's own included (read-only: lists, never boots). */
export function runningDevices(): RunningDevice[] {
  return [...parseSimctl(quiet('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'])), ...parseAdb(quiet(ADB, ['devices']))];
}

/** The devices that are not the harness's: the owner's, another session's. */
export function foreign(devices: RunningDevice[]): RunningDevice[] {
  return devices.filter((d) => (d.kind === 'simulator' ? !HARNESS_SIMULATORS.includes(d.name) : !HARNESS_EMULATORS.includes(d.id)));
}

/** Of the others' devices running when the run began, the ones no longer running at its end. */
export function lostDevices(before: RunningDevice[], after: RunningDevice[]): RunningDevice[] {
  const still = new Set(after.map((d) => d.id));
  return foreign(before).filter((d) => !still.has(d.id));
}

export const describe = (d: RunningDevice) => (d.kind === 'simulator' ? `simulator ${d.name} (${d.id})` : `emulator ${d.id}`);

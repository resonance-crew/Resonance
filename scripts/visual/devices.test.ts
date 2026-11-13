import { describe, expect, it } from 'vitest';
import { foreign, lostDevices, mayShutDown, parseAdb, parseSimctl, type RunningDevice } from './devices';

describe('mayShutDown', () => {
  const booted = new Set(['SIM-1', 'emulator-5600', 'OWNERS-IPAD', 'emulator-5554']);

  it('lets a run put away only the harness’s own devices it booted itself', () => {
    expect(mayShutDown('SIM-1', 'Visual iPhone', booted)).toEqual({ ok: true });
    expect(mayShutDown('emulator-5600', null, booted)).toEqual({ ok: true });
  });

  it('refuses a harness device another run (or the owner) had up already', () => {
    const r = mayShutDown('SIM-2', 'Visual iPad', booted);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(/not booted by this run/);
    expect(mayShutDown('emulator-5602', null, booted).ok).toBe(false);
  });

  it('refuses the owner’s devices even if a mix-up recorded them as booted here', () => {
    const ipad = mayShutDown('OWNERS-IPAD', 'iPad Pro 13-inch (M5)', booted);
    expect(!ipad.ok && ipad.why).toMatch(/not one of the harness's devices/);
    expect(mayShutDown('emulator-5554', null, booted).ok).toBe(false);
  });
});

describe('what went down while a run ran', () => {
  const sims = JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [
        { name: 'Visual iPhone', udid: 'V1', state: 'Booted' },
        { name: 'iPhone 17 Pro', udid: 'O1', state: 'Booted' },
        { name: 'iPad Air', udid: 'O2', state: 'Shutdown' },
      ],
    },
  });
  const adb = 'List of devices attached\nemulator-5554\tdevice\nemulator-5600\tdevice\nemulator-5602\toffline\nR5CT123\tdevice\n';

  it('reads simctl and adb', () => {
    expect(parseSimctl(sims).map((d) => d.id)).toEqual(['V1', 'O1']);
    expect(parseSimctl('not json')).toEqual([]);
    expect(parseAdb(adb).map((d) => d.id)).toEqual(['emulator-5554', 'emulator-5600']);
  });

  it('names the owner’s devices that were up at the start and gone at the end, never the harness’s own', () => {
    const before: RunningDevice[] = [...parseSimctl(sims), ...parseAdb(adb)];
    expect(foreign(before).map((d) => d.id)).toEqual(['O1', 'emulator-5554']);
    // The harness's iPhone and AVD went (it shut them down); the owner's emulator went too.
    const after = before.filter((d) => d.id === 'O1');
    expect(lostDevices(before, after).map((d) => d.id)).toEqual(['emulator-5554']);
    expect(lostDevices(before, before)).toEqual([]);
  });
});

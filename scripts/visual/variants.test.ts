import { describe, expect, it } from 'vitest';
import { ANDROID_DEVICES, SETTINGS_ON_DISK_MS, wearState } from './android';
import { IOS_DEVICES } from './ios';
import { SCREENS, screensFor, shotName, type Platform } from './screens';
import { BASE_DEVICES, DEVICE_STATES, devicesFor, estimate, groups, inSet, namedScreens, plan, variantSetOf } from './variants';
import { WEB_DEVICES } from './web';

const keys = (platform: Platform, device: string, set: 'release' | 'extended', only: string[] = []) =>
  plan(platform, device, set, only).map((s) => shotName(s.screen, s.variant));

describe('the variant sets', () => {
  it('keeps the release set exactly as it was: every screen per device, the phones in three variants', () => {
    expect(keys('android', 'phone', 'release')).toHaveLength(screensFor('android').length * 3);
    expect(keys('ios', 'ipad', 'release')).toHaveLength(screensFor('ios').length);
    expect(keys('web', 'phone', 'release').filter((k) => k.startsWith('film-'))).toEqual(
      ['film-write', 'film-answer', 'film-meet', 'film-yours'].map((id) => `${id}@light-zh-TW.png`),
    );
    // No state, no extended-only screen in a release run.
    expect(devicesFor('android', 'release')).toEqual(['phone', 'tablet']);
    expect(keys('android', 'phone', 'release').some((k) => k.startsWith('thread-attach') || k.startsWith('thread-keyboard'))).toBe(false);
    // round 25: six web screens (settings-language, card-translated, home-translated, card-framed, publish-cover,
    // cover-frame) × the web's five
    expect(estimate('release').captures).toBe(333);
  });

  it('adds the device states after the device they run on, and only in the extended set', () => {
    expect(devicesFor('android', 'extended')).toEqual(['phone', 'phone-large', 'phone-largest', 'tablet', 'tablet-portrait']);
    expect(devicesFor('ios', 'extended')).toEqual(['iphone', 'ipad', 'ipad-landscape']);
    expect(devicesFor('mac', 'extended')).toEqual(['mac', 'mac-window']);
    // --device names one by itself: it runs, the set or not.
    expect(devicesFor('android', 'release', ['phone-large'])).toEqual(['phone-large']);
    expect(devicesFor('android', 'extended', ['tablet'])).toEqual(['tablet', 'tablet-portrait']);
  });

  it('takes the large-text states on the text-densest screens, the gallery’s ask among them', () => {
    expect(keys('android', 'phone-large', 'extended').sort()).toEqual(
      ['card', 'thread-reply', 'thread-attach', 'settings', 'write-draft', 'notifications'].map((id) => `${id}@light-zh-TW.png`).sort(),
    );
    const large = DEVICE_STATES.find((d) => d.id === 'phone-large')!;
    expect(large.android).toEqual({ fontScale: 1.5, density: 504 });
  });

  it('gives the tablets the dark, and the composer’s extra states, once each', () => {
    const ipad = keys('ios', 'ipad', 'extended');
    expect(ipad.filter((k) => k.includes('@dark-'))).toHaveLength(5);
    expect(new Set(ipad).size).toBe(ipad.length);
    expect(keys('android', 'phone', 'extended')).toEqual(expect.arrayContaining(['thread-attach@light-zh-TW.png', 'thread-keyboard@light-zh-TW.png']));
    // The extended screens are light zh-TW only, even on a phone.
    expect(keys('android', 'phone', 'extended').filter((k) => k.startsWith('thread-keyboard'))).toEqual(['thread-keyboard@light-zh-TW.png']);
    expect(estimate('extended').captures - estimate('release').captures).toBe(50);
  });

  it('names only screens its platform has, and states on devices that exist', () => {
    for (const { platform, ids } of namedScreens()) {
      const have = screensFor(platform, [], true).map((s) => s.id);
      for (const id of ids) expect(have, `${platform}/${id}`).toContain(id);
    }
    for (const s of DEVICE_STATES) expect(BASE_DEVICES[s.platform].map((d) => d.id)).toContain(s.on);
    for (const s of SCREENS.filter((x) => x.keyboard)) expect(s.platforms).toEqual(['android']);
  });

  it('agrees with the capturers’ own device lists', () => {
    expect(BASE_DEVICES.web).toEqual(WEB_DEVICES.map((d) => ({ id: d.id, phone: d.phone })));
    expect(BASE_DEVICES.ios).toEqual(IOS_DEVICES.map((d) => ({ id: d.id, phone: d.phone })));
    expect(BASE_DEVICES.android).toEqual(ANDROID_DEVICES.map((d) => ({ id: d.id, phone: d.phone })));
  });

  it('walks a device by variant, then by account, as the capturers sign in', () => {
    const walk = groups(plan('android', 'phone', 'release'));
    expect(walk[0].variant).toEqual({ theme: 'light', locale: 'zh-TW' });
    // Each account once per variant.
    const seen = walk.map((g) => `${g.variant.theme}-${g.variant.locale}-${g.account}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('tells a release run’s missing captures from an extended run’s baseline', () => {
    expect(inSet('android/phone-large/card@light-zh-TW.png', 'release')).toBe(false);
    expect(inSet('android/phone-large/card@light-zh-TW.png', 'extended')).toBe(true);
    expect(inSet('ios/ipad/home@dark-zh-TW.png', 'release')).toBe(false);
    expect(inSet('ios/ipad/home@dark-zh-TW.png', 'extended')).toBe(true);
    expect(inSet('ios/ipad/home@light-zh-TW.png', 'release')).toBe(true);
    expect(inSet('android/phone/thread-keyboard@light-zh-TW.png', 'release')).toBe(false);
  });

  it('refuses a set it doesn’t know', () => {
    expect(variantSetOf(undefined)).toBe('release');
    expect(variantSetOf('extended')).toBe('extended');
    expect(() => variantSetOf('everything')).toThrow(/release or extended/);
  });
});

describe('a state worn on the AVD', () => {
  it('puts on the font scale, the display size and the rotation, and takes back what the device had', async () => {
    const said: string[] = [];
    const answers: Record<string, string> = {
      'settings get system font_scale': '1.0',
      'wm density': 'Physical density: 420',
      'settings get system accelerometer_rotation': '1',
      'settings get system user_rotation': '0',
    };
    const run = async (c: string) => (said.push(c), answers[c] ?? '');
    const takeBack = await wearState(run, { fontScale: 1.5, density: 504, rotation: 1 }, async () => {});
    expect(said.filter((c) => c.includes(' put ') || /^wm density \d/.test(c))).toEqual([
      'settings put system font_scale 1.5',
      'wm density 504',
      'settings put system accelerometer_rotation 0',
      'settings put system user_rotation 1',
    ]);
    said.length = 0;
    await takeBack();
    expect(said).toEqual([
      'settings put system accelerometer_rotation 1',
      'settings put system user_rotation 0',
      'wm density reset',
      'settings put system font_scale 1.0',
      'sync',
    ]);
  });

  // 2026-11-13: the phone's last state was taken back and the AVD killed at once; the write never reached the disk
  // and the next boot (cold, the same userdata) came up at font 2.0 — every capture of the phone large from then on.
  it('holds the take-back until the settings are on disk, before anything can shut the AVD down', async () => {
    const order: string[] = [];
    const run = async (c: string) => (order.push(c), c === 'settings get system font_scale' ? '1.0' : '');
    const wait = async (ms: number) => void order.push(`wait ${ms}`);
    const takeBack = await wearState(run, { fontScale: 2 }, wait);
    order.length = 0;
    await takeBack();
    expect(order).toEqual(['settings put system font_scale 1.0', `wait ${SETTINGS_ON_DISK_MS}`, 'sync']);
    expect(SETTINGS_ON_DISK_MS).toBeGreaterThan(2000);
  });

  it('waits for nothing when the state changed nothing', async () => {
    const order: string[] = [];
    const takeBack = await wearState(async (c) => (order.push(c), ''), {}, async (ms) => void order.push(`wait ${ms}`));
    await takeBack();
    expect(order).toEqual([]);
  });

  it('keeps an override someone else set', async () => {
    const said: string[] = [];
    const run = async (c: string) => (said.push(c), c === 'wm density' ? 'Physical density: 420\nOverride density: 480' : 'null');
    const takeBack = await wearState(run, { density: 504, fontScale: 2 }, async () => {});
    said.length = 0;
    await takeBack();
    expect(said).toEqual(['wm density 480', 'settings delete system font_scale', 'sync']);
  });
});

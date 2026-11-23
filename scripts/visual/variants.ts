/**
 * Which device takes which screen in which variant — the release set, and the extended set on top of it.
 *
 * The release set (the default, what `capture --flows --review` has always taken): every screen on every device
 * in light zh-TW, and the phones also in dark zh-TW and light en (`PHONE_VARIANTS`).
 *
 * The extended set (`--variants extended`) adds the states the 2026-11-13 audit found the escaped bugs in, each
 * aimed at the few screens where that state bites, so it costs minutes, not another release run:
 *
 *   - Android phone at a large font scale and a large display size, and at the largest font: the text-densest
 *     screens (#3 the writer's status line cut off at a large font; #14 允許存取 gone at display size + font 1.5)
 *   - Android tablet upright (it was landscape only), iPad in landscape (it was upright only), and a narrow Mac
 *     window for an iPad in a window (#11, #13: what the iPad's window does; the iPad itself can't be put in a
 *     window from simctl — see README)
 *   - the tablets in the dark (iPad, Android tablet, the web's tablet: dark mode was the phones' only)
 *   - the note written in place (round 26 SETTLED 9, `card-note-open`) at the Android phone's large fonts, on the
 *     Android phone turned sideways (the field's two-line cap in a short window), and in the dark wherever the
 *     release set has it light only (the tablets, the web's desktop, the Mac). The iPhone app stands upright only
 *     (Info.plist) and the web's capturer has no device states yet, so neither turns a phone sideways
 *   - three composer states as screens of their own (`set: 'extended'` in screens.ts): the note on three lines (`card-note-lines`), the attach panel with its
 *     gallery's ask, and the Android soft keyboard on screen (the AVDs' hardware keyboard never shows one)
 *
 * A state of a device (a font scale, an orientation, a window) is a device of its own in the run: its captures
 * live under `<platform>/<state id>/` beside the device's, compared with their own baseline, so a release run
 * never meets them and an extended run's are reviewed and accepted like any other.
 */
import { BASE_VARIANT, PHONE_VARIANTS, screensFor, shotName, type Platform, type Screen, type Variant } from './screens';

export type VariantSet = 'release' | 'extended';
export const VARIANT_SETS: VariantSet[] = ['release', 'extended'];

/** The run's set from `--variants` (default release); anything else is an error worth stopping on. */
export function variantSetOf(value: string | undefined): VariantSet {
  if (value == null) return 'release';
  if ((VARIANT_SETS as string[]).includes(value)) return value as VariantSet;
  throw new Error(`--variants takes ${VARIANT_SETS.join(' or ')}, not "${value}"`);
}

/** A platform's devices as the release run has them: their ids, and which is a phone (the phones take three variants). */
export const BASE_DEVICES: Record<Platform, { id: string; phone: boolean }[]> = {
  web: [{ id: 'phone', phone: true }, { id: 'tablet', phone: false }, { id: 'desktop', phone: false }],
  ios: [{ id: 'iphone', phone: true }, { id: 'ipad', phone: false }],
  android: [{ id: 'phone', phone: true }, { id: 'tablet', phone: false }],
  mac: [{ id: 'mac', phone: false }],
};

const DARK: Variant = { theme: 'dark', locale: 'zh-TW' };

/** A device in a setting the release run never has: a device of its own (`<platform>/<id>/`), on the base device `on`. */
export type DeviceState = {
  platform: Platform;
  id: string;
  /** The base device it runs on (the same AVD, simulator or window). */
  on: string;
  screens: string[];
  variants: Variant[];
  /** The escaped bug it is for, in a few words (the report and README quote it). */
  why: string;
  /** Android: `settings put system font_scale`, `wm density`, and `user_rotation` (0 the device's natural way, 1 a quarter turn). */
  android?: { fontScale?: number; density?: number; rotation?: 0 | 1 };
  /** iOS: the simulator itself turned (ios.ts `turn`: Maestro's setOrientation, maestro/device/orientation.yaml), upright again after. */
  ios?: { orientation: 'landscape' | 'portrait' };
  /** Mac: the window's size in the Mac's points (`-macWindowSize`). */
  mac?: { width: number; height: number };
};

/**
 * The Android phone's text-densest screens: the reader, the composer with rows riding and its attach panel, settings, the
 * writer, the bell — and the publish step's four card types (2026-11-23: at font 1.5 their one row shrank its words to
 * 70 %; the grid stands 2×2, or one to a row at the largest font, never smaller).
 */
const TEXT_DENSE = ['card', 'thread-reply', 'thread-attach', 'settings', 'write-draft', 'notifications', 'publish-audience'];
/** The note written in place under a story's end (round 26 SETTLED 9): its line grows with the type, never clipped. */
const NOTE_OPEN = 'card-note-open';

export const DEVICE_STATES: DeviceState[] = [
  // The Pixel 9's 420 dpi at 504 (Settings › Display size, one step past the default's next) with the font at 1.5:
  // 343 dp across with text half again as big — the owner's Pixel 10 Pro at display size 500 + font 1.5, and worse.
  { platform: 'android', id: 'phone-large', on: 'phone', screens: [...TEXT_DENSE, NOTE_OPEN], variants: [BASE_VARIANT],
    android: { fontScale: 1.5, density: 504 }, why: 'large display size + font 1.5 (#14 允許存取 gone, #3 status line cut)' },
  // Android 14's largest font, at the default display size.
  { platform: 'android', id: 'phone-largest', on: 'phone', screens: [...TEXT_DENSE, NOTE_OPEN], variants: [BASE_VARIANT],
    android: { fontScale: 2 }, why: 'the largest font, 2.0 (#3 the writer\'s status line cut off)' },
  // The phone on its side: a short window, where the note's field stops at two lines (round 26 SETTLED 2 and 9).
  { platform: 'android', id: 'phone-landscape', on: 'phone', screens: [NOTE_OPEN], variants: [BASE_VARIANT],
    android: { rotation: 1 }, why: 'the phone turned sideways (the note field\'s two lines in a short window)' },
  { platform: 'android', id: 'tablet-portrait', on: 'tablet', screens: ['home', 'home-invite', 'messages', 'thread', 'thread-stickers', 'card', 'notifications'],
    variants: [BASE_VARIANT], android: { rotation: 1 }, why: 'the Android tablet upright (it was landscape only)' },
  { platform: 'ios', id: 'ipad-landscape', on: 'ipad',
    screens: ['home', 'home-invite', 'messages', 'thread', 'thread-stickers', 'thread-reply', 'card', 'notifications', 'write-draft'],
    variants: [BASE_VARIANT], ios: { orientation: 'landscape' }, why: 'the iPad in landscape (#11 the panel beside the capsule; it was upright only)' },
  // The Mac draws the iPad's layouts at 77 %: 600 × 800 points is an iPad window of 780 × 1040 — a windowed iPad's
  // width, the nearest this harness can put an iPad in a window (README, Extended set).
  { platform: 'mac', id: 'mac-window', on: 'mac', screens: ['home', 'home-invite', 'messages', 'thread', 'thread-stickers', 'card'],
    variants: [BASE_VARIANT], mac: { width: 600, height: 800 }, why: 'a narrow window: an iPad in a window (#11, #13)' },
];

/** More variants a release device takes in the extended set: the tablets in the dark, and the note in place in the dark wider than a phone. */
export const EXTRA_VARIANTS: { platform: Platform; device: string; screens: string[]; variants: Variant[]; why: string }[] = [
  { platform: 'ios', device: 'ipad', screens: ['home', 'thread', 'thread-stickers', 'notifications', 'card', NOTE_OPEN], variants: [DARK], why: 'the iPad in the dark' },
  { platform: 'android', device: 'tablet', screens: ['home', 'thread', 'thread-stickers', 'notifications', 'card', NOTE_OPEN], variants: [DARK], why: 'the Android tablet in the dark' },
  { platform: 'web', device: 'tablet', screens: ['home', 'messages', 'thread', 'notifications', 'card', NOTE_OPEN], variants: [DARK], why: 'the web’s tablet in the dark' },
  { platform: 'web', device: 'desktop', screens: [NOTE_OPEN], variants: [DARK], why: 'the note in place on the web’s desktop in the dark' },
  { platform: 'mac', device: 'mac', screens: [NOTE_OPEN], variants: [DARK], why: 'the note in place on the Mac in the dark' },
];

export const stateOf = (platform: Platform, id: string) => DEVICE_STATES.find((d) => d.platform === platform && d.id === id);

/** One capture to take: the screen, in the variant. */
export type Shot = { screen: Screen; variant: Variant };

const sameVariant = (a: Variant, b: Variant) => a.theme === b.theme && a.locale === b.locale;
const isBase = (v: Variant) => sameVariant(v, BASE_VARIANT);

/**
 * The devices a platform's run goes over, in order: the release devices, then — in the extended set, or when
 * `--device` names one — the states, each right after the device it runs on.
 */
export function devicesFor(platform: Platform, set: VariantSet, named: string[] = []): string[] {
  const out: string[] = [];
  for (const d of BASE_DEVICES[platform]) {
    if (!named.length || named.includes(d.id)) out.push(d.id);
    for (const s of DEVICE_STATES.filter((x) => x.platform === platform && x.on === d.id)) {
      if (named.includes(s.id) || (set === 'extended' && (!named.length || named.includes(d.id)))) out.push(s.id);
    }
  }
  return out;
}

/**
 * What one device takes in a set (`only`: these screen ids), in order — by variant, then by account, as the
 * capturers sign each account in once per variant. Film stills (`film`) and the extended set's own screens are
 * light zh-TW only.
 */
export function plan(platform: Platform, device: string, set: VariantSet, only: string[] = []): Shot[] {
  const state = stateOf(platform, device);
  const shots: Shot[] = [];
  const add = (screen: Screen, variant: Variant) => {
    if (!shots.some((s) => s.screen.id === screen.id && sameVariant(s.variant, variant))) shots.push({ screen, variant });
  };
  const known = (ids: string[]) => screensFor(platform, only, true).filter((s) => ids.includes(s.id));
  if (state) {
    for (const variant of state.variants) for (const screen of known(state.screens)) add(screen, variant);
  } else {
    const base = BASE_DEVICES[platform].find((d) => d.id === device);
    if (!base) return [];
    const variants = base.phone ? PHONE_VARIANTS : [BASE_VARIANT];
    for (const variant of variants) {
      for (const screen of screensFor(platform, only, set === 'extended')) {
        if ((screen.film || screen.set === 'extended') && !isBase(variant)) continue;
        add(screen, variant);
      }
    }
    if (set === 'extended') {
      for (const extra of EXTRA_VARIANTS.filter((x) => x.platform === platform && x.device === device)) {
        for (const variant of extra.variants) for (const screen of known(extra.screens)) add(screen, variant);
      }
    }
  }
  // By variant (in the order first met), then by account: what the capturers walk.
  const order: Variant[] = [];
  for (const s of shots) if (!order.some((v) => sameVariant(v, s.variant))) order.push(s.variant);
  return order.flatMap((v) => {
    const here = shots.filter((s) => sameVariant(s.variant, v));
    const accounts = [...new Set(here.map((s) => s.screen.as))];
    return accounts.flatMap((a) => here.filter((s) => s.screen.as === a));
  });
}

/** Whether a set takes a capture (`<platform>/<device>/<screen>@<theme>-<locale>.png`): a baseline outside it isn't missing. */
export function inSet(key: string, set: VariantSet): boolean {
  const [platform, device, name] = key.split('/') as [Platform, string, string];
  if (!BASE_DEVICES[platform]) return false;
  const stateDevice = stateOf(platform, device);
  if (stateDevice && set !== 'extended') return false;
  return plan(platform, device, set).some((s) => shotName(s.screen, s.variant) === name);
}

/**
 * Rough seconds per capture (a cold launch, the settle and its re-check; the second look only on what changed),
 * and per account signed in per variant. Phases run as run.ts does: web
 * beside the Mac, then the AVDs side by side, then the simulators side by side; a device's states one after
 * the other on it.
 */
export const SECONDS: Record<Platform, { shot: number; signIn: number }> = {
  // Set so the release set comes to the README's ~25 min of captures (2026-11-10 release run, builds beside them).
  web: { shot: 3, signIn: 5 },
  android: { shot: 10, signIn: 8 },
  ios: { shot: 6, signIn: 10 },
  mac: { shot: 10, signIn: 12 },
};

export type Estimate = { set: VariantSet; captures: number; byPlatform: Record<Platform, number>; minutes: number };

export function estimate(set: VariantSet): Estimate {
  const byPlatform = { web: 0, android: 0, ios: 0, mac: 0 } as Record<Platform, number>;
  const seconds = { web: 0, android: 0, ios: 0, mac: 0 } as Record<Platform, number>;
  for (const platform of Object.keys(BASE_DEVICES) as Platform[]) {
    // Each base device's time with its states (they share it), the longest of a platform's devices counting.
    const lanes = BASE_DEVICES[platform].map((base) => {
      const ids = devicesFor(platform, set).filter((id) => id === base.id || stateOf(platform, id)?.on === base.id);
      let t = 0;
      for (const id of ids) {
        const shots = plan(platform, id, set);
        byPlatform[platform] += shots.length;
        const signIns = new Set(shots.map((s) => `${s.variant.theme}-${s.variant.locale}-${s.screen.as}`)).size;
        t += shots.length * SECONDS[platform].shot + signIns * SECONDS[platform].signIn;
      }
      return t;
    });
    // The web walks its devices one after the other; the apps' devices go side by side.
    seconds[platform] = platform === 'web' ? lanes.reduce((a, b) => a + b, 0) : Math.max(...lanes);
  }
  const total = Math.max(seconds.web, seconds.mac) + seconds.android + seconds.ios;
  const captures = Object.values(byPlatform).reduce((a, b) => a + b, 0);
  return { set, captures, byPlatform, minutes: Math.round(total / 60) };
}

/** Every screen id a set names (states and extras), for the tests: each must be a screen of its platform. */
export const namedScreens = () => [
  ...DEVICE_STATES.map((d) => ({ platform: d.platform, ids: d.screens })),
  ...EXTRA_VARIANTS.map((x) => ({ platform: x.platform, ids: x.screens })),
];

/** A device's shots as the capturers walk them: one run of screens per variant and account, in plan order. */
export function groups(shots: Shot[]): { variant: Variant; account: Screen['as']; screens: Screen[] }[] {
  const out: { variant: Variant; account: Screen['as']; screens: Screen[] }[] = [];
  for (const shot of shots) {
    const last = out.at(-1);
    if (last && sameVariant(last.variant, shot.variant) && last.account === shot.screen.as) last.screens.push(shot.screen);
    else out.push({ variant: shot.variant, account: shot.screen.as, screens: [shot.screen] });
  }
  return out;
}

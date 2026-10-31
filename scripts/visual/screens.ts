/**
 * What the release screenshots cover: every screen once per device, in light
 * mode and Chinese, and the phones again in dark mode and English (`VARIANTS`).
 * Each platform's capture reads this list; a screen a platform can't open yet
 * names the platforms it is for. Routes are the site's paths without a locale,
 * the same paths the apps open from a push (`route` launch argument).
 *
 * The data is `scripts/seed-emulator.ts`'s test world, signed in as alice
 * unless a screen says otherwise.
 */

export type Platform = 'web' | 'ios' | 'android' | 'mac';
export type Theme = 'light' | 'dark';
export type Locale = 'zh-TW' | 'en';
export type Account = 'alice' | 'bob' | 'carol' | 'dora';

export type Screen = {
  /** File-name safe, stable: renaming one orphans its baseline. */
  id: string;
  /** What a reviewer should see on it, one line (the review pack quotes it). */
  expect: string;
  /** Site path without a locale; null for a screen with no address (the apps' signed-out start). */
  route: string | null;
  /** Signed-in account; null = signed out. */
  as: Account | null;
  /** Only these platforms (default: all four). */
  platforms?: Platform[];
  /** The web's whole page instead of the viewport. */
  fullPage?: boolean;
  /** CSS selectors the web capture paints over (things that change by themselves). */
  mask?: string[];
  /**
   * The web's own way to it, where the site has no such page (the apps' 通知 tab is a bell's panel
   * here): another path, and a CSS selector clicked once that page is ready.
   */
  web?: { route: string; click: string };
  /** Share of pixels that may differ (beyond diff.ts's shift) before an area counts as changed: for a screen that moves a little by itself. */
  maxDiff?: number;
};

export const SCREENS: Screen[] = [
  { id: 'landing', route: '/', as: null, fullPage: true, platforms: ['web'],
    expect: 'The marketing landing page: hero, a feed of story cards, the download block with store badges, footer' },
  { id: 'welcome', route: null, as: null, platforms: ['ios', 'android', 'mac'],
    expect: 'The signed-out start screen with its sign-in choices' },
  { id: 'signin', route: '/signin', as: null, platforms: ['web'],
    expect: 'Sign-in: a cover beside a sheet with the provider buttons' },
  { id: 'home', route: '/home', as: 'alice',
    expect: 'The home feed: story cards in hand-drawn outlines, the header with tabs/bell' },
  { id: 'card', route: '/card/rich-story', as: 'alice',
    expect: "alice's own card 搬家後的第一個安靜夜晚: title, byline, bold/italic, a heading, a quote, lists, an embedded card, a link, a rule, an English line at the end" },
  { id: 'card-other', route: '/card/rain-walk', as: 'alice',
    expect: "bob's card read by alice: byline with bob, response bar (共振 / note / bookmark) under the story" },
  { id: 'card-anonymous', route: '/card/unsigned-letter', as: 'alice',
    expect: 'An anonymous card: 匿名 in the byline, never a pen name' },
  { id: 'card-private', route: '/card/alice-draft', as: 'alice',
    expect: "alice's private card: 🔒 私人卡 at the end of the meta line and an edit pen before the ⋯" },
  { id: 'profile', route: '/u/bob', as: 'alice',
    expect: "bob's profile: avatar, pen name, bio, his public cards" },
  { id: 'me', route: '/me', as: 'alice',
    expect: "alice's card box: her shelves and cards" },
  { id: 'thought-map', route: '/me/thought-map', as: 'alice',
    expect: "alice's thought map: a region holding two of her cards, bob's walk, one labelled arrow" },
  { id: 'card-trashed', route: '/card/old-poem', as: 'alice',
    expect: "alice's card 一首沒寫完的詩 in her trash: the page says it is in the trash (days left before it goes) and offers 還原" },
  { id: 'messages', route: '/messages', as: 'alice',
    expect: "The conversation list: bob (his note's words as the last line) and carol (her letter, waiting for an answer)" },
  { id: 'thread', route: '/messages/bob', as: 'alice',
    expect: "The thread with bob: a bubble with a heart reaction chip in its gutter, a 小紙團 sticker (牽牽 謝謝) with no bubble, alice's reply quoting his first line (a hug reaction), one dashed unsent line, bob's note quoting alice's card 寫給十年前的自己 above its words, the floating composer capsule (＋, field, ☺, send) at the foot" },
  { id: 'thread-letter', route: '/messages/carol', as: 'alice',
    expect: "carol's letter to alice (not connected): her note quoting alice's card 搬家後的第一個安靜夜晚, and the hint that replying connects them" },
  { id: 'notifications', route: '/notifications', as: 'alice',
    web: { route: '/home', click: 'button[aria-label="通知"], button[aria-label="Notifications"]' },
    expect: "alice's notifications (the web: the bell's panel over the feed): carol's letter and bob's note unread with their words, bob's resonance, carol's card link and bob's first message read" },
  { id: 'settings', route: '/settings', as: 'alice',
    expect: 'Settings: profile, appearance (theme swatches, 小紙團 switch), notifications, account' },
  { id: 'write-new', route: '/write', as: 'dora',
    expect: "A newcomer's empty writer: the title and story placeholders (on wide screens beside her empty thought map)" },
  // At the desktop split the thought map sits beside the writer, and its camera
  // lands a fraction of a pixel differently from run to run (the whole map
  // shifts as one): allow that much, still far under any real change.
  { id: 'write-draft', route: '/write/alice-draft', as: 'alice', maxDiff: 0.01,
    expect: "alice's private card 還沒寫完的清晨 open in the writer (on wide screens beside her thought map)" },
  { id: 'privacy', route: '/privacy', as: null, platforms: ['web'],
    expect: 'The privacy policy page' },
  { id: 'not-found', route: '/no-such-page', as: null, platforms: ['web'],
    expect: 'The 404 page' },
];

/**
 * Which theme/locale pairs each device takes. Every device: light + zh-TW.
 * Phones also: dark + zh-TW, light + en (dark mode and English mostly break
 * the same way on every width; the phone is where text is tightest).
 */
export type Variant = { theme: Theme; locale: Locale };
export const BASE_VARIANT: Variant = { theme: 'light', locale: 'zh-TW' };
export const PHONE_VARIANTS: Variant[] = [BASE_VARIANT, { theme: 'dark', locale: 'zh-TW' }, { theme: 'light', locale: 'en' }];

export function screensFor(platform: Platform, only?: string[]): Screen[] {
  return SCREENS.filter((s) => (!s.platforms || s.platforms.includes(platform)) && (!only?.length || only.includes(s.id)));
}

/** `<screen>@<theme>-<locale>`: the file name of one capture inside its device's folder. */
export function shotName(screen: Pick<Screen, 'id'>, v: Variant): string {
  return `${screen.id}@${v.theme}-${v.locale}.png`;
}

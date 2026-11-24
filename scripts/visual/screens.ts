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
   * The web's own way to it: where the site has no such page (the apps' 通知 tab is a bell's panel
   * here) another path; a CSS selector clicked once the page is ready; and what this browser keeps
   * for it, written to the site's localStorage before the page opens and taken away before the next
   * screen (a conversation's draft, `lib/data/chatDrafts`).
   */
  web?: {
    route?: string;
    /** The page's query, without `?` (the landing film's lab flags: `rest=1` holds every act at its moment). */
    query?: string;
    click?: string;
    /** Brought to the top of the window before the capture (`'bottom'`: the page scrolled to its foot). */
    scrollTo?: string;
    /** After the capture, the landing film scrolled through from its top and its frame times read (`film-frames`). */
    frames?: boolean;
    storage?: Record<string, string>;
  };
  /**
   * The apps' own debug launch arguments for it, after the account and the route (apps/README.md):
   * iOS's `-key value` pairs, Android's `am start` extras (`--es key value`). The Mac takes `mac`, else
   * iOS's (the same target).
   */
  app?: { ios?: string[]; android?: string[]; mac?: string[] };
  /** Share of pixels that may differ (beyond diff.ts's shift) before an area counts as changed: for a screen that moves a little by itself. */
  maxDiff?: number;
  /**
   * A still of the landing film, pinned at second `t` (`?rest=1&t=`): taken on every web device in light
   * zh-TW, its cast live, checked (the scene it stands in, the cast, nothing blank) and shown in the
   * report and to the review — never compared with a baseline, since the film's art changes faster than
   * a baseline could follow (scripts/visual/README.md, "The landing film").
   */
  film?: { t: number; scene: 1 | 2 | 3 | 4 };
  /**
   * Only in the extended set (`--variants extended`, variants.ts): a state worth a look after a change near it
   * and before a release, not on every run.
   */
  set?: 'extended';
  /** The system's soft keyboard on screen (Android: shown beside the AVD's hardware keyboard for this screen). */
  keyboard?: boolean;
  /**
   * First-times hints (lib/hints.ts: shown for their first three displays) this screen shows: every capture of it starts
   * with them unspent — its account's synced count (`users/{uid}.hintsSeen`) taken away on the run's stack just before it
   * (hints.ts), and the web's own (`hint:<key>` in localStorage) put at 0. The web and Android mirror each showing to the
   * profile and every platform shares the run's one stack, so earlier captures (any platform's) would spend them.
   */
  hints?: string[];
};

/** The landing film's moment `t`: the lab's exact frame (`rest=1`) at that second (`t`), the page's own address otherwise. */
const filmAt = (t: number) => ({ query: `rest=1&t=${t}` });

/**
 * alice's draft in her conversation with bob (the web's `thread-reply`): answering bob's newest
 * message (his note on her letter) with her newest published card riding — what the apps' `visualRide
 * replyCard` sets up. Kept as of the run (a draft older than 30 days is none).
 */
/**
 * The note's three lines on bob's first coffee, as alice keeps them in this browser (lib/data/noteDrafts): a kept draft
 * opens the field with the page. The apps' `-visualNote lines` / `cardEnd lines` open on the same words and keep
 * nothing. Kept as of the run (a draft older than 30 days is none).
 */
export const NOTE_LINES = '讀到早晨屬於自己的那段，\n想起我第一次一個人搬出來住，\n也是這樣手忙腳亂地沖咖啡。';
export const NOTE_LINES_DRAFT: Record<string, string> = {
  'resonance:note-drafts:alice': JSON.stringify({ 'first-coffee': { text: NOTE_LINES, at: Date.now() } }),
};

export const REPLY_CARD_DRAFT: Record<string, string> = {
  'resonance:draft:alice:alice_bob': JSON.stringify({
    text: '',
    replyTo: { id: 'n-bob-letter', senderId: 'bob', text: '你的信讓我想起我自己的十年前。' },
    cardId: 'alice-reply',
    at: Date.now(),
  }),
};

/**
 * 自動翻譯 on for one launch of the apps (round 25 §F4): iOS reads its own setting's key from the launch arguments, which
 * nothing keeps; Android's extra writes the setting, so android.ts starts every other screen with it off.
 */
const AUTO_TRANSLATE = { ios: ['-autoTranslateStories', 'YES'], android: ['--ez', 'autoTranslate', 'true'] };

export const SCREENS: Screen[] = [
  // The landing page is a film the scroll plays (sections/LandingFilm): a whole-page capture took its first frame and
  // then a screenful of empty track for every few seconds of it. So: its first frame and its end, compared as any
  // screen; its four scenes as pinned stills only looked at (`film`).
  { id: 'landing', route: '/', as: null, platforms: ['web'], web: { ...filmAt(0), frames: true },
    expect: 'The landing film\'s first frame: the header over the blue hour, the hero line 用故事回應故事 and its sentence, layered wave hills, houses with lit windows, 摺摺 and 點點 by them, the player (▶ and the line with its scene ticks) at the foot' },
  { id: 'landing-stories', route: '/', as: null, platforms: ['web'], web: { ...filmAt(0), scrollTo: '#stories' },
    expect: 'After the film, tonight\'s stories: the heading and the public cards as story cards on the page\'s paper' },
  { id: 'landing-footer', route: '/', as: null, platforms: ['web'], web: { ...filmAt(0), scrollTo: 'bottom' },
    expect: 'The landing page\'s foot: the closing band (the download badges, a QR code where a mouse shows it) and the footer' },
  { id: 'film-write', route: '/', as: null, platforms: ['web'], web: filmAt(11.5), film: { t: 11.5, scene: 1 },
    expect: 'The landing film at 11.5 s (scene 1, the blue hour): the card 摺摺 wrote, carried off on the wind with 點點 riding on its top edge, 摺摺 left by the houses, the hero line over the sky' },
  { id: 'film-answer', route: '/', as: null, platforms: ['web'], web: filmAt(27), film: { t: 27, scene: 2 },
    expect: 'The landing film at 27 s (scene 2, daylight by the water): 聆聆 reading the card that came on the wind, 點點 beside it' },
  { id: 'film-meet', route: '/', as: null, platforms: ['web'], web: filmAt(50), film: { t: 50, scene: 3 },
    expect: 'The landing film at 50 s (scene 3, dusk): the two cards side by side over the sky, the puppets meeting on the bridge' },
  { id: 'film-yours', route: '/', as: null, platforms: ['web'], web: filmAt(63), film: { t: 63, scene: 4 },
    expect: 'The landing film at 63 s (scene 4, night): stars over the dark hills and houses, five puppets holding hands, the next story is the visitor\'s. The waiting card differs by frame: on the phone a small cream card just peeks over the ridge, and the narrow scrubber carries no 換你 label; on the desktop cards float in the sky; on the tablet there is no card at all — by design (owner, 2026-11-23: 「3 是設計本來如此」)' },
  { id: 'welcome', route: null, as: null, platforms: ['ios', 'android', 'mac'],
    expect: 'The signed-out start screen with its sign-in choices' },
  // Below the build the server still serves (client-config's minBuild, 任務 #3 Phase 2). A capture's stack retires no
  // build, so the apps take it as a debug launch argument (apps/README.md); the web has no such page.
  { id: 'update-required', route: '/home', as: 'alice', platforms: ['ios', 'android', 'mac'],
    app: { ios: ['-visualUpdate', 'required'], android: ['--es', 'visualUpdate', 'required'] },
    expect: 'The update page alone on the paper: its mark, 請更新共振, the line saying this version no longer works, and the solid 前往更新 — no feed, no tab bar, nothing of the app behind it' },
  { id: 'signin', route: '/signin', as: null, platforms: ['web'],
    expect: 'Sign-in: a cover beside a sheet with the provider buttons' },
  { id: 'home', route: '/home', as: 'alice',
    expect: 'The home feed: story cards in hand-drawn outlines, the header with tabs/bell' },
  // Tonight's card's invite over the feed (notification-asks §3), forced on by the apps' debug flag (the web has none):
  // it takes the feed's look — the owner, 2026-11-23: 「卡片已經變成區段的設計了，所以上面這個提醒也應該做成區段」.
  { id: 'home-invite', route: '/home', as: 'alice', platforms: ['ios', 'android', 'mac'], set: 'extended',
    app: { ios: ['-notifyInvite', 'picks'], android: ['--es', 'notifyInvite', 'picks'] },
    expect: "The home feed with 晚上也想讀一張嗎？ above the first card. Over bands (a phone, an iPad or Android tablet upright, a narrow Mac window): a band of the thread's grey from the bar's pen line (no rule of its own there, its grey running up under the bar's wave) to the first card's own top wave, edge to edge — never a card's outline — its title and line where the cards' words are, 不用了 · 好，通知我 under them at the end on a phone, beside them at the row's end on a tablet. Over the grid of framed cards (a tablet turned, the Mac): one wide borderless grey card spanning the columns, its buttons beside its words" },
  { id: 'card', route: '/card/rich-story', as: 'alice',
    expect: "alice's own card 搬家後的第一個安靜夜晚: title, byline, bold/italic, a heading, a quote, lists, an embedded card, a link, a rule, an English line at the end. Round 29: the two sentences readers picked (the first paragraph's 「…第一次覺得安靜是屬於自己的。」 and the second's) on a faint wash of the tap's colour, one rounded piece per line, nothing moved; gus's and bob's faces overlapping after the first, carol's after the second — in the line right after each sentence's last character on a phone (and any window under 820), in the left margin on the tablet and the desktop, the group's right edge 8 left of the column, beside the line where each sentence's wash begins (round 29 §S10; the contents rail on the right untouched); the quote bare (no one picked it); no blank disc, no number" },
  { id: 'card-other', route: '/card/rain-walk', as: 'alice',
    expect: "bob's card read by alice: byline with bob; where the story's end is in view, the end row — one capsule 共振 · 寄小紙條 · ✓ 已回應 (alice replied with 我也在雨裡走過), all tonal — and right above it (round 30: the faces' line stands over the capsule, never under it), the group centred on the 共振 segment (round 29 §S11), the three newest who tapped — dora's, carol's and eli's faces (Wave 2 #3b: a reader sees everyone who tapped, newest first, no longer only their connections; fay, the fourth, is not drawn) — overlapping, each on no pad of paper (the front face's pen line parts them), nothing else on their line and nothing under the capsule; 收藏 alone at the end of the capsule's row, at the column's end under the byline's ⋯ (a phone: at the end of the tags' row, the capsule spanning the column)" },
  { id: 'card-anonymous', route: '/card/unsigned-letter', as: 'alice',
    expect: "An anonymous card: 匿名 in the byline, never a pen name; where its end is in view, the same end row as a named card (共振 · 寄小紙條 · 用卡片回應; 收藏 at the end of the capsule's row, on a phone at the end of the tags' row)" },
  // Round 26 (§V4, SETTLED 9): the end of a story — the tap, its faces and their list, the note written in place, and
  // what the author sees. The seed: alice resonated with bob's first coffee after dora, eli and fay; dora's three notes
  // to carol wait; strangers and bob (carol with a note) resonated with alice's rich story. The web scrolls the end
  // row to just under the middle of the window (its scroll-margin), the story's last lines above it.
  { id: 'card-tapped', route: '/card/first-coffee', as: 'alice', web: { scrollTo: '[data-end-row]' },
    app: { ios: ['-visualEnd', 'YES'], android: ['--es', 'cardEnd', 'end'] },
    expect: "bob's 第一杯自己沖的咖啡 read by alice, who resonated with it: the capsule 共振 on (the verb's solid face, two waves, its words the same as at rest) · 寄小紙條 · 用卡片回應 (tonal), and right above it — the faces' line over the capsule, 16 under the tags (round 30; the owner, 2026-11-22: 「把共振…使用者头像，把它移到共振按钮的上方」), the group centred on the 共振 segment (round 29 §S11) — alice's face first, then dora's and eli's, overlapping with no pad of paper round any (the front face's own pen line parts them), nothing after them for fay (no blank disc since round 29 §S5, no number, no words) and nothing else on that line, nothing under the capsule; 收藏 at the end of the capsule's own row, at the column's end under the byline's ⋯ — on a phone, where the capsule spans the column, at the end of the tags' row instead (round 28; the owner, 2026-11-21: 「把它移到這個 segmented buttons 的右邊」, and of 收藏 under 用卡片回應 「這收藏按鈕不應該放在這裡」)" },
  // Round 28: a long story read by someone else — the byline is out of view at its end, so the web repeats the card's
  // 分享 · ⋯ there, after 收藏, the three one group. (The apps keep 分享 · ⋯ in the bar: their end is card-tapped's.)
  { id: 'card-end-long', route: '/card/rich-story', as: 'bob', platforms: ['web'], web: { scrollTo: '[data-end-row]' },
    expect: "alice's long 搬家後的第一個安靜夜晚 read by bob, who resonated with it, its end in view: the capsule (共振 on · 寄小紙條 · 用卡片回應) at its own width with 收藏 · 分享 · ⋯ as one group at the end of its row, at the column's end; bob's face on the line right above 共振, nothing else on it and nothing under the capsule; the tags' row above bare — on a phone the capsule spans the column and the three glyphs end the tags' row, the tags wrapping in their own column" },
  { id: 'card-note-open', route: '/card/first-coffee', as: 'alice',
    web: { click: '[data-end-row] button[data-segment="note"]', scrollTo: '[data-end-row]' },
    app: { ios: ['-visualEnd', 'YES', '-visualNote', 'open'], android: ['--es', 'cardEnd', 'note'] },
    expect: "The note written in place, under the end row (no dialog, nothing over the story): 寄小紙條 held in its hover wash, then 12 under the capsule, its own button, the composer's capsule as wide as the story's column (its end on the column's end, where 收藏 and the byline's ⋯ end — never short of it) — no envelope: the field's placeholder 悄悄告訴作者，哪一段打動你 starts 16 in (the same whether alice resonated or not), the send segment tonal (nothing to send) — the faces' line above the capsule, never between it and the field (round 30; the owner, 2026-11-22), and no line under it (no privacy line: the owner, 2026-11-19), the next section 40 below the capsule" },
  { id: 'card-note-wait', route: '/card/carol-note', as: 'dora',
    web: { click: '[data-end-row] button[data-segment="note"]', scrollTo: '[data-end-row]' },
    app: { ios: ['-visualEnd', 'YES', '-visualNote', 'wait'], android: ['--es', 'cardEnd', 'note'] },
    expect: "carol's 陌生人的一句話 read by dora, whose three notes to carol wait for an answer: 寄小紙條 opened the one muted line 你留的紙條對方還沒回覆，先等等對方吧 where the field would be, 12 under the capsule and starting where the field's words would (16 in) — no field, no dialog" },
  // The owner, 2026-11-20: Android's note kept 寄出 the capsule's full height at any number of lines, where the
  // messages' composer makes it the block on the last row. No click: the kept draft opens the field with the page.
  { id: 'card-note-lines', route: '/card/first-coffee', as: 'alice', set: 'extended',
    web: { storage: NOTE_LINES_DRAFT, scrollTo: '[data-end-row]' },
    app: { ios: ['-visualEnd', 'YES', '-visualNote', 'lines'], android: ['--es', 'cardEnd', 'lines'] },
    expect: "The note in place under the end row, its field holding alice's three lines (讀到早晨屬於自己的那段，… 也是這樣手忙腳亂地沖咖啡。): the capsule grown to three lines, the column wide, the words starting 16 in with no envelope before them, 寄出 on the last line — 寄出 the 52 × 48 block at the bottom right in the verb's solid face, its wavy seam turning round its top-left corner, never a strip the capsule's full height; the text keeps the whole width left of 寄出's column" },
  { id: 'card-own-taps', route: '/card/rich-story', as: 'alice', web: { scrollTo: '[data-tap-author]' },
    app: { ios: ['-visualEnd', 'YES'], android: ['--es', 'cardEnd', 'end'] },
    expect: "alice's own rich story at its end: no capsule — one line, the muted wave glyph and the three newest faces of who resonated (gus, hana, bob) and nothing after them for the others (carol) — no blank disc since round 29 §S5, no number, no words; on the desktop the card's share and ⋯ at that line's end" },
  // (no scroll after the click: the page would move under the pointer left on the faces, washing a row)
  { id: 'taps-list', route: '/card/first-coffee', as: 'alice',
    web: { click: 'button[data-tap-faces]' },
    app: { ios: ['-visualEnd', 'YES', '-visualTaps', 'list'], android: ['--es', 'cardEnd', 'taps'] },
    expect: "Who among alice's connections resonated with bob's first coffee: a centred dialog with no title on every device (a phone's 400 or the column less 16 a side, as it always was; tablet, Mac and desktop 480 wide, as the author's list), banded rows (alice, dora, eli, fay — each a face 36 and a pen name), the small 關閉 at the foot's end — never a popover, never a bottom sheet; behind the scrim the faces stand over the capsule (round 30), centred on 共振 (round 29 §S11)" },
  { id: 'taps-author-list', route: '/card/rich-story', as: 'alice',
    web: { click: '[data-tap-author] button' },
    app: { ios: ['-visualEnd', 'YES', '-visualTaps', 'author'], android: ['--es', 'cardEnd', 'taps'] },
    expect: "Who resonated with alice's rich story, in a centred dialog on every device: 與這張卡片共振的人, then gus, hana, bob and carol, each a face 36 — under gus's, bob's and carol's pen names the passage each picked, in 「」 and muted (gus and bob the first, carol the second), and under carol's quote her note's first line 讀到搬家那段，好像看見自己。, muted; hana's row a name alone — the small 關閉 at its foot" },
  // Round 29 §S7: who picked one sentence of alice's own story — the first group of faces pressed.
  { id: 'card-picked-people', route: '/card/rich-story', as: 'alice',
    web: { click: '[data-passage-faces]' },
    app: { ios: ['-visualEnd', 'YES', '-visualTaps', 'picked'], android: ['--es', 'cardEnd', 'picked'] },
    expect: "Who picked the first sentence of alice's rich story, in a centred dialog (a phone's 400 or the column less 16 a side; tablet, Mac and desktop 480): the title 對這一段有共鳴的人, the sentence once in the story's type at 16, muted, in full, in 「」, at the story's compact leading (1.8), then gus and bob, newest first, each a face 36 and a pen name in a banded row — no quote under a name — and the small 關閉 at the foot's end; the paper's air the apps' (32 above and below, 28 a side, round 29 §S12), the bands still reaching its pen line; never a bottom sheet, never a popover" },
  // Round 27 §V2: the passages' dialog after a press that turns 共振 on, as dora (no tap of hers on the rich story). The
  // web holds it with `?visualTap=` (emulator builds only, nothing written: a real press would turn the stored tap off
  // on the next device), the apps with their launch args.
  { id: 'card-passages', route: '/card/rich-story', as: 'dora',
    web: { query: 'visualTap=passages', scrollTo: '[data-end-row]' },
    app: { ios: ['-visualEnd', 'YES', '-visualTap', 'passages'], android: ['--es', 'cardEnd', 'passages'] },
    expect: "alice's rich story read by dora, who just pressed 共振 (on: the verb's solid face, two waves): a small centred dialog over the dimmed page — its title 哪一段讓你有共鳴, then three banded rows of alice's own sentences, each wrapped in full in the story's type (never cut, no 「…」), nothing drawn round a row at rest, and the small 略過 at the foot's end, no ✕ — a phone 400 or the column less 16 a side, tablet and desktop 480; never a bottom sheet, never a popover" },
  // Round 31 (the owner, 2026-11-23: 「如果我讀翻譯的文章……那我這邊顯示的清單三句應該也要都翻成英文才對……它這個句子還要
  // 可以對應回去原本的那個標在畫面上」): the same story read by dora under 自動翻譯 — in English (light-en) the seed's kept
  // translation with its passages placed (scripts/seed/pinned.ts); in 繁體中文 the story is the reader's own language
  // and both look as card-passages and card-picked do.
  { id: 'card-passages-translated', route: '/card/rich-story', as: 'dora',
    web: { storage: { 'resonance-tweaks': JSON.stringify({ autoTranslate: true }) }, query: 'visualTap=passages', scrollTo: '[data-end-row]' },
    app: { ios: [...AUTO_TRANSLATE.ios, '-visualEnd', 'YES', '-visualTap', 'passages'], android: [...AUTO_TRANSLATE.android, '--es', 'cardEnd', 'passages'] },
    expect: "light-en: alice's rich story in English (the line under the byline Translated by AI · Show original) read by dora, who just pressed 共振: the passages' dialog as card-passages draws it, its three rows the translation's own words — Boxes filled the living room. I sat on the floor…, You did not lose a home; you gained a place to go back to., The quiet after moving out felt like mine — finally. — each wrapped in full, never cut; zh-TW: the dialog in Chinese, as card-passages" },
  { id: 'card-picked-translated', route: '/card/rich-story', as: 'dora',
    // (no scroll on the web either: rich-story has no cover, so the page's top holds the first paragraph and the quote
    // — a scroll lays something under the fixed header, and one before the translation lands keeps the original)
    web: { storage: { 'resonance-tweaks': JSON.stringify({ autoTranslate: true }) } },
    // (the first picked sentence is the story's first paragraph: in view at the page's top on every device)
    app: AUTO_TRANSLATE,
    expect: "light-en: alice's rich story in English read by dora: the sentences readers picked marked where the translation says them — Boxes filled the living room. I sat on the floor… (gus's and bob's faces) and You did not lose a home; you gained a place to go back to. (carol's) — each on its faint wash, the faces in the line after it on a phone and in the left margin where there is room, exactly as in the original; zh-TW: the same marks on the Chinese sentences" },
  { id: 'card-passage-picked', route: '/card/rich-story', as: 'dora', set: 'extended',
    web: { query: 'visualTap=picked', scrollTo: '[data-end-row]' },
    app: { ios: ['-visualEnd', 'YES', '-visualTap', 'picked'], android: ['--es', 'cardEnd', 'passage-picked'] },
    expect: "The same dialog with the second row chosen: that row's band in the press ink between its two hand-drawn curves and reaching the paper's pen line at both sides, no check anywhere (round 35), its words as wide as the other rows', the other two rows bare — no toast" },
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
    expect: "The conversation list: bob (his note's words as the last line) and carol (her letter, waiting for an answer), then under 已連結、還沒說過話 the connections alice hasn't written to yet — dora, eli and fay, each 還沒有訊息——說聲嗨吧" },
  { id: 'thread', route: '/messages/bob', as: 'alice',
    expect: "The thread with bob: a bubble with a heart reaction chip in its gutter, a 小紙團 sticker (牽牽 謝謝) with no bubble, alice's reply quoting his first line (a hug reaction), one dashed unsent line, bob's note quoting alice's card 寫給十年前的自己 above its words, the floating composer capsule (＋, field, ☺, send) at the foot" },
  // Round 23: the sticker panel (a popover on the web's desktop and the Mac), captured still.
  { id: 'thread-stickers', route: '/messages/bob', as: 'alice',
    web: { click: 'button[aria-label="貼圖"], button[aria-label="Stickers"]' },
    app: { ios: ['-threadPanel', 'stickers'], android: ['--es', 'threadPanel', 'stickers'] },
    expect: "The thread with bob, the 小紙團 sticker panel open in the keyboard's place (on the web's desktop and the Mac a popover of four columns standing on the capsule's top edge): the pack bar of the five heads, then the grid of bigger cells, four to a row on phones (six on tablets), no preview sheet over the capsule" },
  // The extended set's composer states (escaped bugs #14 and #9/#11 in the 2026-11-13 audit): the ＋'s panel, where a
  // fresh install's gallery asks for access first (the 允許存取 a large display size hid), and the soft keyboard up — the
  // AVDs' hardware keyboard never shows one. Android only: iOS's attach panel is the system's photo picker over the
  // simulator's own library, which the flows add pictures to (maestro/flows/send-picture.yaml).
  // Taken before thread-reply: the app keeps a conversation's draft, rides and all, so after it these two showed its
  // reply and card in the capsule in a whole run and not in a slice of them (run 20261119-184839).
  { id: 'thread-attach', route: '/messages/bob', as: 'alice', platforms: ['android'], set: 'extended',
    app: { android: ['--es', 'threadPanel', 'attach'] },
    expect: "The thread with bob, the ＋'s attach panel open in the keyboard's place: its wavy grip, 圖片｜卡片 floating, and (a fresh install) the gallery's ask for access — its words whole and the 允許存取 button in full view, nothing cut at any text size" },
  { id: 'thread-keyboard', route: '/messages/bob', as: 'alice', platforms: ['android'], set: 'extended', keyboard: true,
    app: { android: ['--es', 'threadPanel', 'keyboard'] },
    expect: "The thread with bob, the composer's field focused and the system's soft keyboard up: the capsule stands right on the keyboard, the foot's paper reaching it with no strip of another paper or gap, bob's newest message still in view above" },
  // Round 23: what rides the next message, inside the capsule.
  { id: 'thread-reply', route: '/messages/bob', as: 'alice',
    web: { storage: REPLY_CARD_DRAFT },
    app: { ios: ['-visualRide', 'replyCard'], android: ['--es', 'visualRide', 'replyCard'] },
    expect: "The thread with bob, alice's composer answering bob's newest message (his note 你的信讓我想起我自己的十年前。) with her card 我也在雨裡走過 riding: both rows inside the capsule's outline over its text line — the reply's wavy rule and the card's tile over the ＋, their words where the text starts, each ✕ over Send — Send the 52 × 48 block at the bottom right, nothing riding above the capsule" },
  { id: 'thread-letter', route: '/messages/carol', as: 'alice',
    expect: "carol's letter to alice (not connected): her note quoting alice's card 搬家後的第一個安靜夜晚, and the hint that replying connects them" },
  // The web's bell is a link: a phone follows it to the 通知 page (round 23 §4), wider it opens its dialog over the feed.
  { id: 'notifications', route: '/notifications', as: 'alice',
    web: { route: '/home', click: 'a[aria-label="通知"], a[aria-label="Notifications"]' },
    expect: "alice's notifications (the web's phone: the 通知 page, its title in the header; wider: the bell's dialog over the feed): carol's letter, bob's note (both with their words) and bob's resonance unread (dot, the bell's badge 3), carol's card link and bob's first message read — the rows touching, no rules or washes between them at rest" },
  { id: 'settings', route: '/settings', as: 'alice',
    expect: 'Settings: profile, appearance (theme swatches, 小紙團 switch), notifications, account' },
  // Round 25 §F: 自動翻譯 — its switch, then a card and a list of cards read under it. The apps open Settings' own page by its
  // path (the web has none: a tab of /settings) and take the switch as a debug launch argument, which the web keeps in
  // this browser's storage.
  { id: 'settings-language', route: '/settings/language', as: 'alice',
    // (by its name, not its place: wider than 760 px it is OrganicTabs' tab, on a phone the menu's row — each a button
    // whose own span holds the words; `:text-is` alone matches that span, never the button)
    web: { route: '/settings', click: 'button:has(> span:text-is("語言")), button:has(> span:text-is("Language"))' },
    expect: 'Settings → 語言: the UI language (the web: then 我主要書寫的語言, which the apps have no row for), then 自動翻譯 with its hint and its switch off' },
  { id: 'card-translated', route: '/card/bridge-rain', as: 'alice',
    web: { storage: { 'resonance-tweaks': JSON.stringify({ autoTranslate: true }) } }, app: AUTO_TRANSLATE,
    expect: "carol's English card read by alice under 自動翻譯: 舊橋上的雨 and its story in Chinese, the line under the byline 已由 AI 翻譯 · 顯示原文" },
  // (a list, not the feed: carol's English card is weeks old and four screens down alice's feed, past what a phone's
  // one screenful takes; her profile lists it second, and every list draws its cards the same way — on iOS and the
  // Mac the first card's band is taller than a screenful, so the page scrolls to it: `-scrollToCard`, apps/README.md
  // (Android the same, `--es scrollToCard`: a phone to the card, a tablet to the cards so their feet are in view);
  // on the web's phone too the first card's bands fill the screenful, and on desktop the second card's foot falls below
  // the fold, so the web scrolls to that card's link — the one CardLinkGrid wraps each card in)
  { id: 'profile-translated', route: '/u/carol', as: 'alice',
    web: { storage: { 'resonance-tweaks': JSON.stringify({ autoTranslate: true }) }, scrollTo: 'a[href$="/card/bridge-rain"]' },
    app: { ios: [...AUTO_TRANSLATE.ios, '-scrollToCard', 'bridge-rain'], android: [...AUTO_TRANSLATE.android, '--es', 'scrollToCard', 'bridge-rain'] },
    expect: "carol's profile read by alice under 自動翻譯: her English card as 舊橋上的雨 with its excerpt in Chinese and the small globe at its foot's end; 陌生人的一句話 as written" },
  // Round 25 §G1: a cover framed off its centre — the lamp at the picture's right edge stays in view on every shape.
  { id: 'card-framed', route: '/card/harbour-lamp', as: 'bob',
    expect: "alice's card 港邊的那盞燈: its cover cut on its frame — the lamp and its glow in view right of centre, not the empty sky" },
  // Round 25 §G2: the publish step of a card with a picture cover — 調整位置 left of 更換封面 — and the dialog it opens.
  // The apps reach both by debug launch arguments (apps/README.md): the writer opened on its publish step, the dialog up.
  { id: 'publish-cover', route: '/write/harbour-lamp', as: 'alice', web: { query: 'step=publish' },
    app: { ios: ['-writeStep', 'publish'], android: ['--es', 'writeStep', 'publish'] },
    expect: "alice's 港邊的那盞燈 on its publish step (更新這張卡片): the cover with two chips at its foot, 調整位置 left of 更換封面, in the card's own paper and pen" },
  // Wave 2 #2: 卡片類型 is four again — 公開 · 連結的人 · 匿名公開 · 私人卡 — and on a phone the glyphs give way to keep the words.
  // 2026-11-23: the four card types as one fused grid (SegmentedGrid) — one row where each glyph and its whole words fit
  // an equal share, 2×2 on a phone, one to a row at the largest text — on the web and both apps (`-writeScrollTo`).
  { id: 'publish-audience', route: '/write/harbour-lamp', as: 'alice', web: { query: 'step=publish', scrollTo: '[data-segment="connections"]' },
    app: { ios: ['-writeStep', 'publish', '-writeScrollTo', 'audience'], android: ['--es', 'writeStep', 'publish', '--es', 'writeScrollTo', 'audience'] },
    expect: "alice's 港邊的那盞燈 on its publish step, scrolled to 卡片類型: one control of four cells — 公開 (chosen, tonal peach) · 連結的人 · 匿名公開 · 私人卡 — each with its glyph (globe · users · mask · lock) and its whole words on one line, never cut or smaller: in one row on a tablet, the Mac and a desktop, 2×2 on a phone (公開 · 連結的人 over 匿名公開 · 私人卡), the seams cut in the paper meeting at the centre" },
  { id: 'cover-frame', route: '/write/harbour-lamp', as: 'alice',
    web: { query: 'step=publish', click: 'button[aria-label="調整位置"], button[aria-label="Adjust"]' },
    app: { ios: ['-writeStep', 'publish', '-coverFrame', 'YES'], android: ['--es', 'writeStep', 'publish', '--ez', 'coverFrame', 'true'] },
    expect: '調整封面 over the publish step: the harbour picture under a frame in the feed card’s shape, dimmed outside it, the lamp right of centre; one row − zoom slider + 重設 (the seeded frame has moved it, so 重設 shows at the row’s end, its word on the content’s edge above 完成), then 取消 · 完成' },
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

/**
 * A platform's screens (`only`: these ids). The extended set's own screens (`set: 'extended'`) only when `extended`;
 * variants.ts says which device takes which screen in which variant.
 */
export function screensFor(platform: Platform, only?: string[], extended = false): Screen[] {
  return SCREENS.filter(
    (s) => (!s.platforms || s.platforms.includes(platform)) && (!only?.length || only.includes(s.id)) && (extended || s.set !== 'extended'),
  );
}

/** `<screen>@<theme>-<locale>`: the file name of one capture inside its device's folder. */
export function shotName(screen: Pick<Screen, 'id'>, v: Variant): string {
  return `${screen.id}@${v.theme}-${v.locale}.png`;
}

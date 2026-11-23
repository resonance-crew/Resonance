import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import zhTW from '../../src/messages/zh-TW.json';
import { STICKER_PACKS } from '../../src/lib/stickers/catalog';
import { STACKS, flowSettings, flowTags, flowsToRun, forPlatform, forStack, maestroArgs, withTags } from './flows';

const FLOWS = join(process.cwd(), 'maestro/flows');
const read = (flow: string) => readFileSync(join(FLOWS, `${flow}.yaml`), 'utf8');
const all = flowsToRun([]);

describe('Maestro’s driver, put on the device once a run', () => {
  it('reinstalls it for the first flow only, every later flow going on with the one there', () => {
    const ports = { auth: 9299, firestore: 8280, dev: 3150 };
    const first = maestroArgs('emulator-5600', 'tap', '/out', ports, true);
    const later = maestroArgs('emulator-5600', 'tap', '/out', ports, false);
    expect(first).not.toContain('--no-reinstall-driver');
    expect(later.filter((a) => a !== '--no-reinstall-driver')).toEqual(first);
    expect(later.slice(0, 4)).toEqual(['--device', 'emulator-5600', 'test', join(FLOWS, 'tap.yaml')]);
    expect(later).toContain('AUTH_PORT=9299');
  });
});

describe('the flows’ tags', () => {
  it('reads a flow’s tags from its header', () => {
    expect(flowTags('appId: x\nname: y\ntags:\n  - chat\n  - smoke\n---\n- tapOn: tags:\n')).toEqual(['chat', 'smoke']);
    expect(flowTags('appId: x\n---\n- launchApp\n')).toEqual([]);
  });

  it('gives every flow its tags, the groups a round runs among them', () => {
    for (const flow of all) expect(flowTags(read(flow)), flow).not.toEqual([]);
    const tags = new Set(all.flatMap((f) => flowTags(read(f))));
    for (const group of ['smoke', 'composer', 'media', 'links', 'tablet']) expect(tags, group).toContain(group);
  });

  it('runs only the tagged group, and on a tablet only what is tagged tablet', () => {
    const tags: Record<string, string[]> = { a: ['chat', 'tablet'], b: ['chat'], c: ['links'] };
    const of = (f: string) => tags[f];
    expect(withTags(['a', 'b', 'c'], [], 'phone', of)).toEqual(['a', 'b', 'c']);
    expect(withTags(['a', 'b', 'c'], ['chat'], 'phone', of)).toEqual(['a', 'b']);
    expect(withTags(['a', 'b', 'c'], ['chat', 'links'], 'phone', of)).toEqual(['a', 'b', 'c']);
    expect(withTags(['a', 'b', 'c'], [], 'tablet', of)).toEqual(['a']);
    // A typo would run nothing and pass: refused instead.
    expect(() => withTags(['a', 'b', 'c'], ['lnks'], 'phone', of)).toThrow(/No flow is tagged lnks/);
  });

  it('turns the animations on and battery saver on for a flow tagged animations, and back after', () => {
    expect(flowSettings(['chat'])).toEqual({ put: [], back: [] });
    const { put, back } = flowSettings(flowTags(read('sticker-breath')));
    expect(put).toEqual(['settings put global animator_duration_scale 1', 'settings put global low_power 1']);
    // Put back as the harness holds the device: still, and on mains power.
    expect(back).toContain('settings put global animator_duration_scale 0');
    expect(back).toContain('settings put global low_power 0');
  });

  it('keeps a flow made for another stack off the usual one, and runs a named stack’s own', () => {
    const tags: Record<string, string[]> = { home: ['smoke'], write: ['writer'], gate: ['update-gate'] };
    const of = (f: string) => tags[f];
    // The usual stack: everything but the flow that would fail on it (the app goes on to home there).
    expect(forStack(['home', 'write', 'gate'], undefined, of)).toEqual(['home', 'write']);
    expect(forStack(['home', 'write', 'gate'], 'update-gate', of)).toEqual(['gate']);
    // The writer's flows run on both: over Firestore on the usual stack, over /api/v1 on this one.
    expect(forStack(['home', 'write', 'gate'], 'writer-api', of)).toEqual(['write']);
    expect(() => forStack(['home'], 'no-such', of)).toThrow(/No such stack: no-such/);
  });

  it('leaves a flow one app alone can run out on the other, as skipped rather than failed', () => {
    const tags: Record<string, string[]> = { home: ['smoke'], offline: ['writer', 'android-only'], sheet: ['ios-only'] };
    const of = (f: string) => tags[f];
    expect(forPlatform(['home', 'offline', 'sheet'], 'ios', of)).toEqual({ run: ['home', 'sheet'], skipped: ['offline'] });
    expect(forPlatform(['home', 'offline', 'sheet'], 'android', of)).toEqual({ run: ['home', 'offline'], skipped: ['sheet'] });
    // The iOS simulator cannot cut its network: the offline draft is Android's alone.
    expect(forPlatform(all, 'ios').skipped).toContain('draft-offline');
    expect(forPlatform(all, 'android').run).toContain('draft-offline');
  });

  it('runs the flows that passed on both tablets there, the update page on its own stack alone', () => {
    const tablet = withTags(all, [], 'tablet');
    expect(tablet).toEqual(expect.arrayContaining(['block-person', 'live-message', 'thought-map', 'update-gate']));
    expect(forStack(tablet, undefined)).not.toContain('update-gate');
    expect(forStack(tablet, 'update-gate')).toEqual(['update-gate']);
    expect(forStack(tablet, 'writer-api')).toEqual(['thought-map']);
  });

  it('names each stack’s settings as client-config reads them, and gives each a flow to run', () => {
    expect(Number(STACKS['update-gate'].env.CLIENT_MIN_BUILD_IOS)).toBeGreaterThan(100_000);
    expect(Number(STACKS['update-gate'].env.CLIENT_MIN_BUILD_ANDROID)).toBeGreaterThan(100_000);
    expect(JSON.parse(STACKS['writer-api'].env.CLIENT_FEATURES)).toEqual({ apiDrafts: true, apiThoughtMap: true });
    for (const name of Object.keys(STACKS)) expect(forStack(all, name), name).not.toEqual([]);
    expect(forStack(all, undefined)).not.toContain('update-gate');
    expect(forStack(all, 'update-gate')).toEqual(['update-gate']);
    expect(forStack(all, 'writer-api')).toContain('publish-card');
    // draft-offline is the writer-api stack's alone: an emulator build's Firestore keeps no queue on disk, so on the
    // usual stack the flow would lose its words every time (and so in the release run's flows too).
    expect(forStack(all, 'writer-api')).toContain('draft-offline');
    expect(forStack(all, undefined)).not.toContain('draft-offline');
    expect(forStack(all, 'update-gate')).not.toContain('draft-offline');
    expect(forStack(all, undefined)).toContain('thought-map');
  });

  it('places every flow in the run’s order', () => {
    expect(all.slice(0, 3)).toEqual(['sign-in', 'send-message', 'send-sticker']);
    expect(all).toEqual(expect.arrayContaining(['composer-toggle', 'sticker-replies', 'send-picture', 'open-link']));
  });
});

/**
 * The new flows' selectors are the apps' own words (both apps read src/messages at runtime): a renamed string
 * fails here, not on a device. Seeded words come from scripts/seed-emulator.ts.
 */
describe('the flows’ words are the apps’ words', () => {
  const m = zhTW.messages;
  const name = (pack: string, id: string) => STICKER_PACKS.find((p) => p.id === pack)!.stickers.find((s) => s.id === id)!.name['zh-TW'];
  const sticker = (pack: string, id: string) => m.stickerLabel.replace('{name}', name(pack, id));
  const seed = readFileSync(join(process.cwd(), 'scripts/seed-emulator.ts'), 'utf8');

  it('composer-toggle: 貼圖, 鍵盤, 送出, 傳送中⋯ and the field', () => {
    const flow = read('composer-toggle');
    for (const word of [m.stickers, m.keyboard, m.send, m.sending]) expect(flow).toContain(word);
    expect(flow).toContain(`${m.threadWith.replace('{handle}', 'bob')}|${m.placeholder}`);
    expect(flow).toContain(name('tuck', 'warm-heart'));
  });

  it('sticker-replies: the stickers by their spoken names, 回覆, 回覆 bob, 回覆自己', () => {
    const flow = read('sticker-replies');
    expect(flow).toContain(sticker('twine', 'thanks'));
    expect(flow).toContain(sticker('tuck', 'warm-heart'));
    expect(seed).toContain("sticker: { pack: 'twine', id: 'thanks' }");
    for (const word of [m.reply, m.replyingTo.replace('{handle}', 'bob'), m.replyingToSelf]) expect(flow).toContain(word);
  });

  it('send-picture: 附上圖片或卡片, 允許存取, 圖片, 移除第 1 張圖片, 查看圖片', () => {
    const flow = read('send-picture');
    for (const word of [m.attach, m.galleryAllow, m.attachImage, m.removeImageAt.replace('{n}', '1'), m.openImage]) expect(flow).toContain(word);
    expect(readdirSync(join(FLOWS, 'assets'))).toContain('paper.png');
  });

  it('open-link: the seeded card, thread and profile it lands on', () => {
    const flow = read('open-link');
    expect(seed).toContain("'rain-walk',\n    'bob',\n    '一場雨後的散步'");
    expect(flow).toContain('一場雨後的散步');
    expect(seed).toContain("bio: `${u.handle} 的測試帳號`");
    expect(flow).toContain('bob 的測試帳號');
  });

  it('translate-story: the line’s words and the seeded card in both languages', () => {
    const flow = read('translate-story');
    const t = zhTW.card.translate;
    for (const word of [t.action, t.showOriginal, t.showTranslation]) expect(flow).toContain(word);
    expect(flow).toContain(t.done);
    expect(seed).toContain("'bridge-rain',\n    'carol',\n    'Rain on the old bridge'");
    expect(seed).toContain("'舊橋上的雨'");
    for (const words of ['Rain on the old bridge', '舊橋上的雨']) expect(flow).toContain(words);
  });

  it('update-gate: the update page’s title and its way to the store, and the feed’s first card that must not show', () => {
    const flow = read('update-gate');
    for (const word of [zhTW.app.update.title, zhTW.app.update.action]) expect(flow).toContain(word);
    expect(seed).toContain('我也在雨裡走過');
    expect(flow).toContain('assertNotVisible: 我也在雨裡走過');
  });

  it('block-person: the ⋯ menu, the block question and notice, the way to the block list and its empty state', () => {
    const flow = read('block-person');
    const s = zhTW.safety;
    for (const word of [s.menuLabel, s.block, s.blockTitle.replace('{handle}', 'bob'), s.blockedNotice.replace('{handle}', 'bob'), s.blockedNoticeBody, s.blockedList.title, s.unblock, s.blockedList.empty]) {
      expect(flow).toContain(word);
    }
    for (const word of [zhTW.app.nav.me, zhTW.me.editProfile, zhTW.settings.sections.privacy, zhTW.settings.privacy.manageBlocks, zhTW.profile.connected, zhTW.messages.messageLink]) {
      expect(flow).toContain(word);
    }
    for (const n of [2, 0]) expect(flow).toContain(zhTW.profile.cardCount.replace(/\{count, plural, other \{# (.+)\}\}/, `${n} $1`));
    expect(seed).toContain("'rain-walk',\n    'bob',\n    '一場雨後的散步'");
    expect(flow).toContain('assertNotVisible: 一場雨後的散步');
    // iOS's way back from the profile, and the bell the card box's tab sits right of.
    expect(flow).toContain(`tapOn: ${zhTW.app.nav.back}`);
    expect(flow).toContain(zhTW.app.nav.notifications);
  });

  it('live-message: the seeded thread it opens on, the list it goes back to, and bob’s send over /api/v1', () => {
    const flow = read('live-message');
    expect(seed).toContain('你的信讓我想起我自己的十年前。');
    expect(flow).toContain('你的信讓我想起我自己的十年前。');
    expect(flow).toContain(zhTW.app.nav.messages);
    // iOS's way back from the thread to the list.
    expect(flow).toContain(`tapOn: ${zhTW.messages.back}`);
    const script = readFileSync(join(FLOWS, 'common/send-as.js'), 'utf8');
    expect(script).toContain('/api/v1/messages');
    expect(script).toContain('accounts:signInWithPassword');
  });

  it('thought-map: the map’s controls and tray, the seeded region, arrow and cards, the card box’s way back to it', () => {
    const flow = read('thought-map');
    const kept = readFileSync(join(FLOWS, 'common/thought-map-kept.yaml'), 'utf8');
    const t = zhTW.me.thoughtMap;
    for (const word of [t.addCardShort, t.addGroupShort, t.leave]) expect(flow).toContain(`tapOn: ${word}`);
    expect(flow).toContain(`visible: ${t.trayTitle}`);
    for (const word of [zhTW.app.nav.me, zhTW.me.tabs.linked, zhTW.me.tabs.thoughtMap]) expect(flow).toContain(word);
    // The seeded map (scripts/seed-emulator.ts): the region 回憶, the arrow 後來, the cards by their ids.
    expect(seed).toContain("title: '回憶'");
    expect(seed).toContain("label: '後來'");
    for (const id of ['letter', 'rich-story', 'rain-walk']) expect(seed).toContain(`await node('${id}'`);
    expect(seed).toContain("db.doc('cards/alice-draft')");
    expect(seed).toContain("thoughtCore: '還沒寫完的清晨'");
    for (const id of ['rain-walk', 'letter', 'rich-story', 'alice-draft']) expect(flow + kept).toContain(`id: map-node-${id}`);
    expect(flow).toContain('id: map-node-remove');
    for (const words of ['回憶', '後來', '還沒寫完的清晨']) expect(flow).toContain(words);
    // What the server is asked afterwards names the same cards and words.
    const script = readFileSync(join(FLOWS, 'common/map-on-server.js'), 'utf8');
    expect(script).toContain('/api/v1/me/thought-map');
    for (const words of ['雨天的回憶 Maestro', '晴天 Maestro', '那年以後']) {
      expect(flow).toContain(words);
      expect(kept).toContain(words);
      expect(script).toContain(words);
    }
  });

  it('draft-offline: the writer’s title, its save states, the card box’s 私人卡 shelf, and the server asked for the words', () => {
    const flow = read('draft-offline');
    const s = zhTW.write.status;
    for (const word of [zhTW.write.titlePlaceholder, s.saved, s.saving, zhTW.me.tabs.draft]) expect(flow).toContain(word);
    expect(flowTags(flow)).toEqual(expect.arrayContaining(['writer', 'offline', 'android-only']));
    // Nothing clears the app before it opens again: the relaunch keeps what the last launch left on the device.
    const relaunch = readFileSync(join(FLOWS, 'common/relaunch.yaml'), 'utf8');
    expect(relaunch).not.toContain('clearState: true');
    expect(relaunch).not.toContain('clearKeychain');
    expect(flow).toContain('file: common/relaunch.yaml');
    expect(readFileSync(join(FLOWS, 'common/draft-on-server.js'), 'utf8')).toContain('/api/v1/me/cards?tab=draft');
  });

  it('draft-offline: types twice with no network, a pause past the autosave after each, and asks for the later words', () => {
    const flow = read('draft-offline');
    const steps = flow.split(/^---\s*$/m)[1];
    const at = (text: string, from = 0) => {
      const i = steps.indexOf(text, from);
      expect(i, text).toBeGreaterThanOrEqual(0);
      return i;
    };
    const offline = at('setAirplaneMode: enabled');
    const first = at('- inputText: 燈一盞一盞熄了 Maestro', offline);
    // The first offline save is on its way (儲存中⋯ shows only past the autosave's pause) before she writes again…
    const saving = at(`visible: ${zhTW.write.status.saving}`, first);
    const second = at('- inputText: 只剩一扇窗亮著 Maestro', saving);
    // …and the second typing gets its own pause before the app goes: longer than the writer's AUTOSAVE_DELAY_MS.
    const pause = at('file: common/pause.js', second);
    const ms = Number(/MS: '(\d+)'/.exec(steps.slice(pause))?.[1]);
    const writer = readFileSync(join(process.cwd(), 'apps/android/app/src/main/kotlin/com/resonance/app/ui/WriteModel.kt'), 'utf8');
    const autosave = Number(/const val AUTOSAVE_DELAY_MS = (\d+)L/.exec(writer)?.[1]);
    expect(autosave).toBeGreaterThan(0);
    expect(ms).toBeGreaterThanOrEqual(autosave * 2);
    const stopped = at('- stopApp', pause);
    expect(steps.indexOf('setAirplaneMode: disabled', stopped)).toBeGreaterThan(stopped);
    // After the relaunch both the page and the server are asked for the words typed second.
    const relaunch = at('file: common/relaunch.yaml', stopped);
    const later = '燈一盞一盞熄了 Maestro只剩一扇窗亮著 Maestro';
    at(`visible: .*${later}.*`, relaunch);
    at(`WORDS: ${later}`, relaunch);
    expect(readFileSync(join(FLOWS, 'common/pause.js'), 'utf8')).toContain('Number(MS)');
  });

  it('sticker-breath: 貼圖 and the panel’s first sticker, the playing cell by its flow name', () => {
    const flow = read('sticker-breath');
    expect(flow).toContain(m.stickers);
    expect(flow).toContain(name('tuck', 'warm-heart'));
    expect(flow).toContain('sticker-moving');
  });
});

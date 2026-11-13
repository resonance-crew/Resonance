import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import zhTW from '../../src/messages/zh-TW.json';
import { STICKER_PACKS } from '../../src/lib/stickers/catalog';
import { flowTags, flowsToRun, withTags } from './flows';

const FLOWS = join(process.cwd(), 'maestro/flows');
const read = (flow: string) => readFileSync(join(FLOWS, `${flow}.yaml`), 'utf8');
const all = flowsToRun([]);

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
});

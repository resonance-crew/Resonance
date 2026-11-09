import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPLY_CARD_DRAFT, SCREENS, screensFor, shotName, BASE_VARIANT } from './screens';
import en from '../../src/messages/en.json';
import zhTW from '../../src/messages/zh-TW.json';

const seed = readFileSync(join(process.cwd(), 'scripts/seed-emulator.ts'), 'utf8');

describe('the release screenshots’ screens', () => {
  it('names each screen once, in a file-name-safe id', () => {
    const ids = SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(shotName({ id: 'thread-reply' }, BASE_VARIANT)).toBe('thread-reply@light-zh-TW.png');
  });

  // Round 23: the composer's riding rows and the sticker panel each have a screen on every platform.
  it('shows the composer with a reply and a card riding, and the sticker panel open, on every platform', () => {
    for (const platform of ['web', 'ios', 'android', 'mac'] as const) {
      const ids = screensFor(platform).map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining(['thread', 'thread-reply', 'thread-stickers']));
    }
    const reply = SCREENS.find((s) => s.id === 'thread-reply')!;
    const stickers = SCREENS.find((s) => s.id === 'thread-stickers')!;
    const thread = SCREENS.find((s) => s.id === 'thread')!;
    // The 'thread' screen's conversation and account.
    for (const s of [reply, stickers]) expect([s.route, s.as]).toEqual([thread.route, thread.as]);
    expect(reply.app).toEqual({ ios: ['-visualRide', 'replyCard'], android: ['--es', 'visualRide', 'replyCard'] });
    expect(stickers.app).toEqual({ ios: ['-threadPanel', 'stickers'], android: ['--es', 'threadPanel', 'stickers'] });
    expect(reply.web?.storage).toBe(REPLY_CARD_DRAFT);
    expect(stickers.web?.click).toMatch(/aria-label="貼圖"/);
  });

  it('seeds a draft the web keeps: alice’s, with bob, answering a message of his and carrying a card of hers', () => {
    const [[key, raw]] = Object.entries(REPLY_CARD_DRAFT);
    expect(key).toBe('resonance:draft:alice:alice_bob');
    const draft = JSON.parse(raw) as { text: string; replyTo: { id: string; senderId: string; text: string }; cardId: string; at: number };
    expect(draft.text).toBe('');
    expect(Date.now() - draft.at).toBeLessThan(86_400_000);
    // The message and the card are the seed's own: bob's note in their thread, alice's published card.
    expect(seed).toContain(`thread('${draft.replyTo.id}', { senderId: '${draft.replyTo.senderId}', text: '${draft.replyTo.text}'`);
    expect(seed).toMatch(new RegExp(`cards/${draft.cardId}'\\)\\.set\\(\\{\\s*authorId: 'alice'[\\s\\S]*?visibility: 'public', publishedAt`));
  });

  // Round 23 §4: the web's bell is a link — a phone follows it to the 通知 page, wider it opens the dialog.
  it('opens the web’s notifications by the bell’s link, named as the header names it', () => {
    const bell = SCREENS.find((s) => s.id === 'notifications')!;
    expect(bell.web).toEqual({
      route: '/home',
      click: `a[aria-label="${zhTW.app.nav.notifications}"], a[aria-label="${en.app.nav.notifications}"]`,
    });
  });

  it('gives the apps their arguments as launch arguments can carry them', () => {
    for (const s of SCREENS) {
      const ios = [...(s.app?.ios ?? []), ...(s.app?.mac ?? [])];
      expect(ios.length % 2).toBe(0);
      ios.forEach((a, i) => i % 2 === 0 && expect(a).toMatch(/^-[a-zA-Z]/));
      const android = s.app?.android ?? [];
      expect(android.length % 3).toBe(0);
      android.forEach((a, i) => i % 3 === 0 && expect(a).toMatch(/^--e[szib]$/));
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPLY_CARD_DRAFT, SCREENS, screensFor, shotName, BASE_VARIANT } from './screens';
import { FILM_END, sceneAtS } from '../../src/components/sections/LandingFilm/script/timeline';
import { TAP_FACES_MAX } from '../../src/lib/api/v1/schemas';
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

  // Round 25 §F: Settings → 語言 is a tab only wider than 760 px; a phone's Settings is a menu of row buttons with no
  // tablist, so a click by the tab's place timed out there and ended the web run (round 25's review).
  it('opens Settings → 語言 by its name, as a tab or as the phone menu’s row', () => {
    const lang = SCREENS.find((s) => s.id === 'settings-language')!;
    const click = lang.web!.click!;
    expect(click).not.toMatch(/tablist|nth-child/);
    for (const name of [zhTW.settings.sections.language, en.settings.sections.language]) {
      expect(click).toContain(`button:has(> span:text-is("${name}"))`);
    }
  });

  // The landing film: its first frame and its end compared; one still per scene only looked at, each at a moment
  // that stands in the scene it names — a change to the film's timeline that moves a scene fails here first.
  it('takes the landing film as its first frame, its end, and a pinned still of each scene', () => {
    const ids = screensFor('web').map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['landing', 'landing-stories', 'landing-footer', 'film-write', 'film-answer', 'film-meet', 'film-yours']));
    const stills = SCREENS.filter((s) => s.film);
    expect(stills.map((s) => s.film!.scene)).toEqual([1, 2, 3, 4]);
    for (const s of stills) {
      expect(s.platforms).toEqual(['web']);
      expect(s.film!.t).toBeLessThan(FILM_END);
      expect(sceneAtS(s.film!.t).n, `${s.id} at ${s.film!.t} s`).toBe(s.film!.scene);
      expect(s.web?.query).toBe(`rest=1&t=${s.film!.t}`);
    }
    for (const id of ['landing', 'landing-stories', 'landing-footer']) {
      const s = SCREENS.find((x) => x.id === id)!;
      expect(s.fullPage, `${id} is one window, never the whole film`).toBeFalsy();
      expect(s.web?.query).toBe('rest=1&t=0');
    }
  });

  // Round 26's end of a story: the apps open the card page at its top, so a screen of the end row must ask each app
  // for it — Android's `--es cardEnd …`, iOS's `-visualEnd YES` (the Mac takes iOS's arguments). Without them the
  // review judged the card's title and byline against a line describing the capsule, the faces or a list.
  it('brings the story’s end into view on iOS and the Mac wherever it does on Android', () => {
    const ends = SCREENS.filter((s) => s.app?.android?.includes('cardEnd'));
    expect(ends.map((s) => s.id)).toEqual(
      expect.arrayContaining(['card-tapped', 'card-note-open', 'card-note-wait', 'card-own-taps', 'taps-list', 'taps-author-list']),
    );
    for (const s of ends) {
      const ios = s.app?.ios ?? [];
      expect(ios, s.id).toEqual(expect.arrayContaining(['-visualEnd', 'YES']));
      expect(ios[ios.indexOf('-visualEnd') + 1], s.id).toBe('YES');
      expect(s.app?.mac, `${s.id}: the Mac falls back to iOS's`).toBeUndefined();
    }
    const arg = (id: string, name: string) => {
      const ios = SCREENS.find((s) => s.id === id)!.app!.ios!;
      return ios.includes(name) ? ios[ios.indexOf(name) + 1] : undefined;
    };
    expect(arg('card-note-open', '-visualNote')).toBe('open');
    expect(arg('card-note-wait', '-visualNote')).toBe('wait');
    expect(arg('taps-list', '-visualTaps')).toBe('list');
    expect(arg('taps-author-list', '-visualTaps')).toBe('author');
  });

  // The author's faces and list come newest first (lib/api/v1/taps: `orderBy('at', 'desc')`, TAP_FACES_MAX faces):
  // the lines the review is told a capture should show name them in the order the seed's taps give.
  it('names the author’s faces and list in the order the seed’s taps on the rich story give them', () => {
    const line = seed.match(/for \(const \[uid, m\] of (\[.*?\]) as const\) await tapped\('rich-story', uid, m\)/)?.[1];
    expect(line).toBeDefined();
    const newest = [...line!.matchAll(/\['(\w+)', (\d+)\]/g)].sort((a, b) => Number(a[2]) - Number(b[2])).map((m) => m[1]);
    expect(newest.length).toBeGreaterThan(TAP_FACES_MAX);
    const own = SCREENS.find((s) => s.id === 'card-own-taps')!.expect;
    expect(own).toContain(`(${newest.slice(0, TAP_FACES_MAX).join(', ')})`);
    expect(own).toContain(`(${newest.slice(TAP_FACES_MAX).join(', ')})`);
    const list = SCREENS.find((s) => s.id === 'taps-author-list')!.expect;
    const from = list.indexOf('then ');
    const places = newest.map((uid) => list.indexOf(uid, from));
    expect(places.every((p) => p > from), list).toBe(true);
    expect(places, list).toEqual([...places].sort((a, b) => a - b));
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

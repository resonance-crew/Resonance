import { describe, expect, it } from 'vitest';
import type { Screen, Variant } from './screens';
import { runGroups, schedule, webParallel, type WebGroup } from './webSchedule';

const LIGHT: Variant = { theme: 'light', locale: 'zh-TW' } as Variant;
const DARK: Variant = { theme: 'dark', locale: 'zh-TW' } as Variant;
const EN: Variant = { theme: 'light', locale: 'en' } as Variant;
const screen = (id: string, hints?: string[]) => ({ id, hints }) as unknown as Screen;
const group = (device: string, variant: Variant, account: WebGroup['account'], ids: (string | Screen)[]): WebGroup => ({
  device,
  variant,
  account,
  screens: ids.map((s) => (typeof s === 'string' ? screen(s) : s)),
});
const names = (gs: WebGroup[]) => gs.map((g) => `${g.device}/${g.variant.theme}-${g.variant.locale}/${g.account ?? '-'}: ${g.screens.map((s) => s.id).join(',')}`);

describe('schedule', () => {
  it('keeps every first visit of a screen by an account in the old order, and sends only the repeats side by side', () => {
    const hinted = screen('card-note-open', ['privacy']);
    const old = [
      group('phone', LIGHT, 'alice', ['home', 'card', hinted]),
      group('phone', LIGHT, null, ['landing']),
      group('phone', DARK, 'alice', ['home', 'card', hinted]),
      group('phone', EN, 'alice', ['home']),
      group('tablet', LIGHT, 'alice', ['home', 'thought-map']),
      group('desktop', LIGHT, 'bob', ['home']),
    ];
    const { first, rest } = schedule(old);
    expect(names(first)).toEqual([
      'phone/light-zh-TW/alice: home,card,card-note-open',
      'phone/light-zh-TW/-: landing',
      // A screen with hints unspends them on every visit (a write): never side by side.
      'phone/dark-zh-TW/alice: card-note-open',
      // A screen only the tablet has: its first visit, in its place.
      'tablet/light-zh-TW/alice: thought-map',
      // Another account's visit is a first one too.
      'desktop/light-zh-TW/bob: home',
    ]);
    expect(names(rest)).toEqual(['phone/dark-zh-TW/alice: home,card', 'phone/light-en/alice: home', 'tablet/light-zh-TW/alice: home']);
    // Nothing lost, nothing taken twice.
    const all = (gs: WebGroup[]) => gs.flatMap((g) => g.screens.map((s) => `${g.device}/${g.variant.theme}-${g.variant.locale}/${g.account}/${s.id}`));
    expect([...all(first), ...all(rest)].sort()).toEqual(all(old).sort());
  });
});

describe('runGroups', () => {
  const keysOf = (g: WebGroup) => g.screens.map((s) => `web/${g.device}/${s.id}@${g.variant.theme}-${g.variant.locale}.png`);
  const groups = Array.from({ length: 7 }, (_, i) => group(i % 2 ? 'tablet' : 'phone', LIGHT, 'alice', [`s${i}`]));

  it('never runs more contexts than its limit at once, and answers every unsettled key', async () => {
    let open = 0;
    let most = 0;
    const unsettled = await runGroups(groups, {
      limit: 3,
      keysOf,
      log: () => {},
      run: async (g) => {
        most = Math.max(most, ++open);
        await new Promise((r) => setTimeout(r, 5));
        open--;
        return g.screens[0].id === 's4' ? ['web/phone/s4@light-zh-TW.png'] : [];
      },
    });
    expect(most).toBe(3);
    expect(unsettled).toEqual(['web/phone/s4@light-zh-TW.png']);
  });

  it('tries a group that threw once more in a fresh context; one that fails twice is said and unsettled, and the others go on', async () => {
    const said: string[] = [];
    const runs: Record<string, number> = {};
    const unsettled = await runGroups(groups, {
      limit: 2,
      keysOf,
      log: (l) => said.push(l),
      run: async (g) => {
        const id = g.screens[0].id;
        runs[id] = (runs[id] ?? 0) + 1;
        if (id === 's1' && runs[id] === 1) throw new Error('net::ERR_CONNECTION_RESET');
        if (id === 's2') throw new Error('page.goto: Timeout 120000ms exceeded');
        return [];
      },
    });
    expect(runs).toEqual({ s0: 1, s1: 2, s2: 2, s3: 1, s4: 1, s5: 1, s6: 1 });
    expect(unsettled).toEqual(['web/phone/s2@light-zh-TW.png']);
    expect(said).toEqual([
      expect.stringMatching(/web\/tablet light-zh-TW as alice failed \(net::ERR_CONNECTION_RESET\): once more in a fresh context/),
      expect.stringMatching(/web\/phone light-zh-TW as alice failed \(page\.goto: Timeout 120000ms exceeded\): once more/),
      expect.stringMatching(/failed twice .*1 capture\(s\) not taken — web\/phone\/s2@light-zh-TW\.png/),
    ]);
  });

  it('takes its width from VISUAL_WEB_PARALLEL, 3 when unset, 1 the old one-by-one', () => {
    const was = process.env.VISUAL_WEB_PARALLEL;
    try {
      delete process.env.VISUAL_WEB_PARALLEL;
      expect(webParallel()).toBe(3);
      process.env.VISUAL_WEB_PARALLEL = '1';
      expect(webParallel()).toBe(1);
      process.env.VISUAL_WEB_PARALLEL = 'lots';
      expect(webParallel()).toBe(3);
    } finally {
      if (was == null) delete process.env.VISUAL_WEB_PARALLEL;
      else process.env.VISUAL_WEB_PARALLEL = was;
    }
  });
});

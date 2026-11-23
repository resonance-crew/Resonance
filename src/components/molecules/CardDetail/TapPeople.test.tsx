// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { AuthorBody, TapPersonBody } from '@/lib/api/v1/schemas';
import { TapPeople } from './TapPeople';

/**
 * Round 27 §U2/§U3: a row of who resonated gains the passage its person picked — on every row of the author's list
 * (the quote, then the note's excerpt under it), and in a reader's list on their own row alone: their quote, or
 * 選一段 when the card has passages and they picked none, the row then reopening the passages' dialog.
 */

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, onClick, className }: { href: string; children: ReactNode; onClick?: () => void; className?: string }) => (
    <a href={href} className={className} onClick={(e) => (e.preventDefault(), onClick?.())}>
      {children}
    </a>
  ),
}));

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const FIRST = '雨停的時候，巷口的燈先亮了。';
const SECOND = '我把舊家的鑰匙交回去，還是把每一扇窗都擦了一遍。';
const zh = { locale: 'zh-TW' as const, messages: zhMessages };
const lines = (row: HTMLElement) => [...row.querySelectorAll('span > span > span')].map((s) => s.textContent);

describe('TapPeople: the passage on a row (§U2, §U3)', () => {
  it('the author’s list: each person’s pick quoted under the name, then their note under it; a row with neither as today', () => {
    const people: TapPersonBody[] = [
      { author: face('gus'), note: null, passage: { text: FIRST } },
      { author: face('carol'), note: { excerpt: '讀到搬家那段，好像看見自己。' }, passage: { text: SECOND } },
      { author: face('hana'), note: null },
    ];
    renderWithIntl(<TapPeople people={people} />, zh);
    const [gus, carol, hana] = screen.getAllByRole('link');
    expect(lines(gus)).toEqual(['gus', `「${FIRST}」`]);
    expect(lines(carol)).toEqual(['carol', `「${SECOND}」`, '讀到搬家那段，好像看見自己。']);
    expect(lines(hana)).toEqual(['hana']);
    // Where a row leads is unchanged: a note's conversation, else the page.
    expect([gus, carol, hana].map((r) => r.getAttribute('href'))).toEqual(['/u/gus', '/messages/carol?u=carol', '/u/hana']);
  });

  it('cuts the quote and the note at two lines each (the author’s own sentence may be cut here)', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/TapPeople.module.css'), 'utf8');
    for (const rule of ['.quote', '.note']) {
      const body = css.slice(css.indexOf(`${rule} {`), css.indexOf('}', css.indexOf(`${rule} {`)));
      expect(body).toMatch(/line-clamp: 2/);
      expect(body).toMatch(/font-size: 13px/);
      expect(body).toMatch(/--color-text-muted/);
    }
  });

  it('a reader’s list quotes every row’s pick, their own as theirs (Wave 2 #3b: everyone sees who picked what)', () => {
    const people: TapPersonBody[] = [
      { author: face('dora'), note: null, passage: { text: FIRST } },
      { author: face('gus'), note: null, passage: { text: SECOND } },
    ];
    renderWithIntl(<TapPeople people={people} own={{ id: 'dora', offer: false }} />, zh);
    const [dora, gus] = screen.getAllByRole('link');
    expect(lines(dora)).toEqual(['dora', `「${FIRST}」`]);
    expect(lines(gus)).toEqual(['gus', `「${SECOND}」`]);
  });

  it('the reader’s own row on a card with passages: 選一段 with no pick; a press closes the list and opens the dialog', async () => {
    const onPick = vi.fn();
    const onPress = vi.fn();
    const people: TapPersonBody[] = [{ author: face('dora'), note: null }, { author: face('gus'), note: null }];
    renderWithIntl(<TapPeople people={people} own={{ id: 'dora', quote: null, offer: true, onPress }} onPick={onPick} />, zh);
    const own = screen.getByRole('button');
    expect(lines(own)).toEqual(['dora', '選一段']);
    expect(own.querySelector('[data-tap-pick]')).not.toBeNull();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(own);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    // Everyone else's row leads where it did.
    expect(within(screen.getByRole('list')).getByRole('link').getAttribute('href')).toBe('/u/gus');
    // 選一段 in the tonal button's ink.
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/TapPeople.module.css'), 'utf8');
    expect(css.slice(css.indexOf('.pick {'))).toMatch(/color: var\(--button-on-tonal\)/);
  });

  it('the card page’s pick wins over the list’s on the reader’s own row (a fresh pick shows at once)', () => {
    const people: TapPersonBody[] = [{ author: face('dora'), note: null, passage: { text: FIRST } }];
    const page = renderWithIntl(<TapPeople people={people} own={{ id: 'dora', quote: SECOND, offer: true, onPress: () => {} }} />, zh);
    expect(lines(screen.getByRole('button'))).toEqual(['dora', `「${SECOND}」`]);
    page.unmount();
    // Cleared on the card page: 選一段, not the list's older quote.
    renderWithIntl(<TapPeople people={people} own={{ id: 'dora', quote: null, offer: true, onPress: () => {} }} />, zh);
    expect(lines(screen.getByRole('button'))).toEqual(['dora', '選一段']);
  });

  it('one sentence’s people (round 29 §S4.2): the same rows, the note under the name, no quote — the author’s list keeps its quotes', () => {
    const people: TapPersonBody[] = [
      { author: face('gus'), note: null, passage: { text: FIRST } },
      { author: face('carol'), note: { excerpt: '讀到搬家那段，好像看見自己。' }, passage: { text: FIRST } },
    ];
    const { unmount } = renderWithIntl(<TapPeople people={people} quotes={false} />, zh);
    const [gus, carol] = screen.getAllByRole('link');
    expect(lines(gus)).toEqual(['gus']);
    expect(lines(carol)).toEqual(['carol', '讀到搬家那段，好像看見自己。']);
    expect(carol).toHaveAttribute('href', '/messages/carol?u=carol');
    unmount();
    // The author's list itself is unchanged (「保留原本查看的这个这个框」).
    renderWithIntl(<TapPeople people={people} />, zh);
    expect(lines(screen.getAllByRole('link')[0])).toEqual(['gus', `「${FIRST}」`]);
  });
});

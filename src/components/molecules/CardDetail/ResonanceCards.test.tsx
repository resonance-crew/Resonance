// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import en from '@/messages/en.json';
import type { Card } from '@/lib/db/types';
import { ResonanceCards } from './ResonanceCards';

vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

function card(id: string): Card {
  return {
    id,
    authorId: 'a',
    thoughtCore: `Answer ${id}`,
    story: `The words of answer ${id}.`,
    tags: ['rain'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    anonymous: true,
  };
}

/** The answers drawn, by their links. */
const drawn = () => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));

// Round 9 C1: 與此文共振 draws the same full cards as 延伸的卡片 — their excerpt and tags, not a mini card —
// the first three, then 查看全部 {count} 篇, which shows the rest in place.
describe('ResonanceCards', () => {
  it('draws the full card, with its excerpt and its tags', () => {
    renderWithIntl(<ResonanceCards cards={[card('a')]} authors={{}} />);
    expect(screen.getByRole('heading', { level: 2, name: en.card.resonanceSection.title })).toBeInTheDocument();
    expect(screen.getAllByText('The words of answer a.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('rain').length).toBeGreaterThan(0);
    // Three or fewer: nothing more to show.
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('shows three, then the rest in place on 查看全部', async () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map(card);
    renderWithIntl(<ResonanceCards cards={cards} authors={{}} />);
    expect(new Set(drawn())).toEqual(new Set(['/card/a', '/card/b', '/card/c']));
    await userEvent.click(screen.getByRole('button', { name: 'Show all 5' }));
    expect(new Set(drawn())).toEqual(new Set(cards.map((c) => `/card/${c.id}`)));
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});

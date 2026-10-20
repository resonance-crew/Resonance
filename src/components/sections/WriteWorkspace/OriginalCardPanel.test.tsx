// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithIntl, screen } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// The card a resonance answers, beside the writer: its read is the module boundary.
const mockUseCard = vi.fn();
vi.mock('@/lib/data/hooks', () => ({ useCard: (id: string) => mockUseCard(id) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { OriginalCardPanel } from './OriginalCardPanel';

const author = { id: 'a1', handle: '念誠', initials: '念', accentColor: 'x', avatarSeed: '3', verified: false, region: 'TW' } as User;
function card(extra: Partial<Card>): Card {
  return {
    id: 'orig',
    authorId: 'a1',
    thoughtCore: '外婆的醃梅子',
    story: '# 五月\n\n每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。',
    tags: [],
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-05-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...extra,
  };
}

describe('OriginalCardPanel', () => {
  it('sets the original as its page does, at the compact numbers: its own script and language, on its title and story only', () => {
    mockUseCard.mockReturnValue({ data: { card: card({}), author }, isLoading: false });
    const { container } = renderWithIntl(<OriginalCardPanel cardId="orig" />);

    const title = screen.getByRole('heading', { name: '外婆的醃梅子' });
    expect(title).toHaveClass('story-title');
    expect(title).toHaveAttribute('data-density', 'compact');
    expect(title).toHaveAttribute('data-script', 'cjk');
    const prose = container.querySelector('.story-prose')!;
    expect(prose).toHaveAttribute('data-density', 'compact');
    expect(prose).toHaveAttribute('data-script', 'cjk');
    expect(Array.from(container.querySelectorAll('[lang]'), (el) => el.getAttribute('lang'))).toEqual(['zh-TW', 'zh-TW']);
    // The story's # is a heading of the story, under the panel's title.
    expect(screen.getByRole('heading', { level: 2, name: '五月' })).toBeInTheDocument();
  });

  it('sets an English original as a Latin-script story', () => {
    mockUseCard.mockReturnValue({
      data: { card: card({ thoughtCore: 'Pickled plums', story: 'Every May my grandmother dried the green plums one by one.' }), author },
      isLoading: false,
    });
    const { container } = renderWithIntl(<OriginalCardPanel cardId="orig" />);
    expect(screen.getByRole('heading', { name: 'Pickled plums' })).toHaveAttribute('data-script', 'latin');
    expect(container.querySelector('.story-prose')).toHaveAttribute('lang', 'en');
  });
});

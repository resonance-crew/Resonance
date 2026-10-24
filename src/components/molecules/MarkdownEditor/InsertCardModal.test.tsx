// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({ getCardsByAuthor: vi.fn() }));

import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import type { Card } from '@/lib/db/types';
import { InsertCardModal } from './InsertCardModal';

const card = (id: string, title: string): Card =>
  ({ id, thoughtCore: title, visibility: 'public', publishedAt: new Date('2026-10-20T00:00:00Z') }) as unknown as Card;

afterEach(() => vi.clearAllMocks());

describe('InsertCardModal', () => {
  // (The pick list itself needs real layout for its scrollbar; the picker's
  // chrome — the one button it adds — is what this pins.)
  it('leaves through a tonal cancel', async () => {
    vi.mocked(getCardsByAuthor).mockResolvedValue([]);
    const onClose = vi.fn();
    renderWithIntl(<InsertCardModal open onClose={onClose} onPick={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('You have no public cards yet')).toBeInTheDocument());

    // The modal is the frame, so the only button it adds draws no outline.
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('data-variant', 'tonal');
    await userEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Round 9 C2: while the cards are read, their rows' footprint — never "…"; a read that fails says so and
  // reads again on 再試一次, never "no cards".
  it('stands four rows in while the cards are read, then the cards', async () => {
    let answer!: (cards: Card[]) => void;
    vi.mocked(getCardsByAuthor).mockReturnValue(new Promise((r) => (answer = r)));
    const { container } = renderWithIntl(<InsertCardModal open onClose={vi.fn()} onPick={vi.fn()} />);

    const skeleton = container.ownerDocument.querySelector('[data-skeleton]');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton!.querySelectorAll('li')).toHaveLength(4);
    expect(screen.queryByText('…')).toBeNull();
    expect(screen.queryByText('You have no public cards yet')).toBeNull();

    answer([card('a', 'After the rain')]);
    expect(await screen.findByRole('button', { name: 'After the rain' })).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('[data-skeleton]')).toBeNull();
  });

  it('says a read failed, and reads again on Try again', async () => {
    vi.mocked(getCardsByAuthor).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([card('a', 'After the rain')]);
    renderWithIntl(<InsertCardModal open onClose={vi.fn()} onPick={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your cards");
    // A failure is not an empty shelf.
    expect(screen.queryByText('You have no public cards yet')).toBeNull();
    expect(getCardsByAuthor).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'After the rain' })).toBeInTheDocument();
    expect(getCardsByAuthor).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

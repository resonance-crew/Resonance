// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card } from '@/lib/db/types';
import en from '@/messages/en.json';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
vi.mock('@/lib/db/firestore/client/cardEdits', () => ({ getPendingCardEdit: vi.fn(async () => null) }));
vi.mock('./LazyOriginalCardPanel', () => ({ OriginalCardPanel: () => <p>reading</p> }));
// The editor (its own suite): what the pane hands it, and its save state and step, which it reports.
const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/molecules/CardEditor/CardEditor', () => ({
  CardEditor: (props: {
    onSaveStatusChange?: (s: { label: string } | null) => void;
    onStepChange?: (s: 'write' | 'publish') => void;
  }) => {
    seen.props = props;
    React.useEffect(() => props.onSaveStatusChange?.({ label: 'Saved' }), []); // eslint-disable-line react-hooks/exhaustive-deps
    return <button onClick={() => props.onStepChange?.('publish')}>to the step</button>;
  },
}));

import { OpenedCardPane } from './OpenedCardPane';

afterEach(() => vi.clearAllMocks());

describe('OpenedCardPane', () => {
  // The save state is the host's to show, in its bar (round 8 §2.1): the pane hands it up and draws none.
  it('hands the editor’s save state and step to its host, drawing no save line of its own', async () => {
    const onStepChange = vi.fn();
    const onSaveStatusChange = vi.fn();
    const card = { id: 'c1', authorId: 'me', thoughtCore: 'Mine', visibility: 'private', anonymous: false } as Card;
    renderWithIntl(<OpenedCardPane card={card} titled={false} editorProps={{ onStepChange, onSaveStatusChange }} />);
    await screen.findByRole('button', { name: 'to the step' });
    expect(onSaveStatusChange).toHaveBeenCalledWith({ label: 'Saved' });
    expect(screen.queryByText('Saved')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'to the step' }));
    expect(onStepChange).toHaveBeenCalledWith('publish');
  });

  // A published card kept private is a 草稿 to its author, and its title says so.
  it('names a published private card a 私人卡, and a card readers have an edit of it', async () => {
    const draftLike = { id: 'c2', authorId: 'me', thoughtCore: 'Kept', visibility: 'private', anonymous: false, publishedAt: new Date('2026-09-01') } as Card;
    const view = renderWithIntl(<OpenedCardPane card={draftLike} />);
    expect(await screen.findByText(en.write.editTitle)).toBeInTheDocument();
    view.unmount();
    renderWithIntl(<OpenedCardPane card={{ ...draftLike, id: 'c3', visibility: 'public' }} />);
    expect(await screen.findByText('Edit card')).toBeInTheDocument();
  });

  // Whether saving makes a resonance reach its original turns on the live card, not on its pending copy.
  it('tells the editor how readers have the live card now', async () => {
    const { getPendingCardEdit } = await import('@/lib/db/firestore/client/cardEdits');
    vi.mocked(getPendingCardEdit).mockResolvedValue({ thoughtCore: 'Mine', story: '', tags: [], visibility: 'public', anonymous: false } as never);
    const card = {
      id: 'c1',
      authorId: 'me',
      thoughtCore: 'Mine',
      visibility: 'private',
      anonymous: false,
      publishedAt: new Date('2026-09-01'),
    } as Card;
    renderWithIntl(<OpenedCardPane card={card} titled={false} />);
    await screen.findByRole('button', { name: 'to the step' });
    expect(seen.props?.initial).toMatchObject({ visibility: 'public', live: { visibility: 'private', anonymous: false } });
  });
});

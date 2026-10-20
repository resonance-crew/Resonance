// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card } from '@/lib/db/types';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
vi.mock('@/lib/db/firestore/client/cardEdits', () => ({ getPendingCardEdit: vi.fn(async () => null) }));
vi.mock('./LazyOriginalCardPanel', () => ({ OriginalCardPanel: () => <p>reading</p> }));
// The editor (its own suite): what the pane hands it, and its save line and step, which it reports.
const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/molecules/CardEditor/CardEditor', () => ({
  CardEditor: (props: {
    onSaveStatusChange?: (s: string | null) => void;
    onStepChange?: (s: 'write' | 'publish') => void;
  }) => {
    seen.props = props;
    React.useEffect(() => props.onSaveStatusChange?.('Draft saved · 10:00'), []); // eslint-disable-line react-hooks/exhaustive-deps
    return <button onClick={() => props.onStepChange?.('publish')}>to the step</button>;
  },
}));

import { OpenedCardPane } from './OpenedCardPane';

afterEach(() => vi.clearAllMocks());

describe('OpenedCardPane', () => {
  // The thought map's pane shows the editor's save line over the writing, as the writer's page does.
  it('shows the editor’s save line while writing, and none in the publish step', async () => {
    const onStepChange = vi.fn();
    const card = { id: 'c1', authorId: 'me', thoughtCore: 'Mine', visibility: 'private', anonymous: false } as Card;
    renderWithIntl(<OpenedCardPane card={card} titled={false} editorProps={{ onStepChange }} />);
    expect(await screen.findByText('Draft saved · 10:00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'to the step' }));
    expect(screen.queryByText('Draft saved · 10:00')).toBeNull();
    expect(onStepChange).toHaveBeenCalledWith('publish');
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

// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import en from '@/messages/en.json';
import { mockElementSize } from '@/../test/organic';
import type { Card } from '@/lib/db/types';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
const mine = { id: 'mine', authorId: 'me', thoughtCore: 'My card' } as Card;
const theirs = { id: 'theirs', slug: 'bobs-walk', authorId: 'bob', thoughtCore: 'Bob’s walk' } as Card;
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: ({ onOpenCard }: { onOpenCard?: (card: Card) => void }) => (
    <div>
      <button onClick={() => onOpenCard?.(mine)}>open mine</button>
      <button onClick={() => onOpenCard?.(theirs)}>open theirs</button>
    </div>
  ),
}));
const saveNow = vi.fn(async () => {});
// The pane's editor, as the page sees it: its handle, its 下一步, and its step (kept to itself).
vi.mock('@/components/sections/WriteWorkspace/OpenedCardPane', () => ({
  OpenedCardPane: ({
    card,
    editorRef,
    editorProps,
  }: {
    card: Card;
    editorRef?: React.Ref<unknown>;
    editorProps?: {
      onStepChange?: (s: 'write' | 'publish') => void;
      onPrimaryActionChange?: (a: unknown) => void;
    };
  }) => {
    const [step, setStep] = React.useState<'write' | 'publish'>('write');
    const go = (next: 'write' | 'publish') => {
      setStep(next);
      editorProps?.onStepChange?.(next);
    };
    React.useImperativeHandle(editorRef, () => ({
      saveNow,
      hasWork: () => false,
      cardId: () => card.id,
      stepBack: () => (step === 'publish' ? (go('write'), true) : false),
    }));
    React.useEffect(() => {
      editorProps?.onPrimaryActionChange?.(
        step === 'write' ? { label: 'Next', disabled: false, loading: false, onPress: () => go('publish') } : null,
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);
    return (
      <p>
        opened: {card.thoughtCore} ({step})
      </p>
    );
  },
}));

import { ThoughtMapPage } from './ThoughtMapPage';

mockElementSize(120, 40);

const realMatchMedia = window.matchMedia;
function screenAtSplit(wide: boolean) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: wide && /min-width/.test(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
});

describe('the thought-map page', () => {
  // At the split, one page with the writer's: my card opens in the pane beside the map, someone else's on its
  // own page, and folding the pane away saves what it shows at once.
  it('opens my card in the pane and someone else’s on its page at the split', async () => {
    screenAtSplit(true);
    renderWithIntl(<ThoughtMapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'open theirs' }));
    expect(push).toHaveBeenCalledWith('/card/bobs-walk');
    expect(screen.queryByText(/opened:/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    expect(await screen.findByText('opened: My card (write)')).toBeInTheDocument();
    const divider = screen.getByRole('separator');
    divider.focus();
    await userEvent.keyboard('{Enter}');
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('opened: My card (write)')).toBeInTheDocument();
  });

  // Below it the pane covers the map, and someone else's card opens there as its reading panel, as before.
  it('opens someone else’s card in the covering pane below the split', async () => {
    screenAtSplit(false);
    renderWithIntl(<ThoughtMapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'open theirs' }));
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText('opened: Bob’s walk (write)')).toBeInTheDocument();
  });

  // The pane's editor writes in two steps, as the writer's page does, with no address of its own.
  it('ends the pane’s header with 下一步, and names the publish step there with its way back', async () => {
    screenAtSplit(false);
    const pushState = vi.spyOn(window.history, 'pushState');
    renderWithIntl(<ThoughtMapPage />, {});
    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    await screen.findByText('opened: My card (write)');
    const header = () => screen.getByRole('heading', { level: 2 }).closest('header')!;
    expect(screen.getByRole('heading', { level: 2, name: en.write.editTitle })).toBeInTheDocument();
    await userEvent.click(within(header()).getByRole('button', { name: en.write.next }));

    expect(screen.getByText('opened: My card (publish)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: en.write.publishPanel.title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.write.next })).toBeNull();
    // Its back: to writing, the pane staying open.
    await userEvent.click(screen.getByRole('button', { name: en.write.leaveStay }));
    expect(screen.getByText('opened: My card (write)')).toBeInTheDocument();
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('floats 下一步 over the pane at the split', async () => {
    screenAtSplit(true);
    renderWithIntl(<ThoughtMapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    await screen.findByText('opened: My card (write)');
    await userEvent.click(screen.getByRole('button', { name: en.write.next }));
    expect(screen.getByText('opened: My card (publish)')).toBeInTheDocument();
  });
});

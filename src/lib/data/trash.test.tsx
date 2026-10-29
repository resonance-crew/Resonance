// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Card } from '@/lib/db/types';
import type { CardBoxShelfData } from './hooks';
import { useTrashActions } from './trash';

vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
const server = vi.hoisted(() => ({ trash: vi.fn(), deleteForever: vi.fn(), empty: vi.fn() }));
vi.mock('@/lib/db/firestore/client/cards', () => ({
  trashCard: (id: string) => server.trash(id),
  deleteCardForever: (id: string) => server.deleteForever(id),
  restoreCard: vi.fn(),
  emptyTrash: () => server.empty(),
}));

const card = (id: string) => ({ id }) as Card;
const shelfOf = (...ids: string[]): CardBoxShelfData => ({ cards: ids.map(card), authors: {} });

/** A promise the test settles by hand: the server's answer, held while the shelf is looked at. */
function held() {
  let settle!: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
  const promise = new Promise((resolve, reject) => (settle = { resolve, reject }));
  return { promise, ...settle };
}

// The card box's shelves as the browser holds them, beside the trash's moves: what each shelf shows,
// read again only when the moves ask (the reads answer what the server would say by then).
function useBox(reads: Record<string, () => Promise<CardBoxShelfData>>) {
  const published = useSWR('cardbox:u1:published', reads.published).data;
  const trash = useSWR('cardbox:u1:trash', reads.trash).data;
  return { published: published?.cards.map((c) => c.id), trash: trash?.cards.map((c) => c.id), actions: useTrashActions() };
}

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

describe('useTrashActions — the card leaves its shelf at once', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes a card off the card box before the server answers, and the shelf read again keeps it off', async () => {
    const answer = held();
    server.trash.mockReturnValue(answer.promise);
    let after = false;
    const { result } = renderHook(
      () => useBox({ published: async () => (after ? shelfOf('a', 'c') : shelfOf('a', 'b', 'c')), trash: async () => shelfOf() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.published).toEqual(['a', 'b', 'c']));

    let move!: Promise<unknown>;
    act(() => {
      move = result.current.actions.trash({ id: 'b' });
    });
    // Gone while the server is still on its way — the rest close up, no read, no skeleton.
    await waitFor(() => expect(result.current.published).toEqual(['a', 'c']));
    expect(server.trash).toHaveBeenCalledWith('b');

    after = true;
    await act(async () => {
      answer.resolve({ card: { id: 'b' }, changed: true });
      await move;
    });
    await waitFor(() => expect(result.current.published).toEqual(['a', 'c']));
  });

  it('puts the card back where it was when the server refuses', async () => {
    const answer = held();
    server.trash.mockReturnValue(answer.promise);
    // The server's shelf is slow to answer again: the card is back before it does.
    const reread = held();
    let calls = 0;
    const { result } = renderHook(
      () =>
        useBox({
          published: () => (calls++ === 0 ? Promise.resolve(shelfOf('a', 'b', 'c')) : (reread.promise as Promise<CardBoxShelfData>)),
          trash: async () => shelfOf(),
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.published).toEqual(['a', 'b', 'c']));

    let move!: Promise<unknown>;
    act(() => {
      move = result.current.actions.trash({ id: 'b' }).catch((e) => e);
    });
    await waitFor(() => expect(result.current.published).toEqual(['a', 'c']));

    await act(async () => {
      answer.reject(new Error('offline'));
      expect(await move).toBeInstanceOf(Error);
    });
    expect(result.current.published).toEqual(['a', 'b', 'c']);
  });

  it('takes a card off the trash at once as it is deleted for good, and back on a refusal', async () => {
    const answer = held();
    server.deleteForever.mockReturnValue(answer.promise);
    const { result } = renderHook(() => useBox({ published: async () => shelfOf('a'), trash: async () => shelfOf('x', 'y') }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.trash).toEqual(['x', 'y']));

    let move!: Promise<unknown>;
    act(() => {
      move = result.current.actions.deleteForever({ id: 'x' }).catch((e) => e);
    });
    await waitFor(() => expect(result.current.trash).toEqual(['y']));
    expect(result.current.published).toEqual(['a']);

    await act(async () => {
      answer.reject(new Error('offline'));
      await move;
    });
    await waitFor(() => expect(result.current.trash).toEqual(['x', 'y']));
  });

  // Round 21: 清空 closes its question at once — the shelf empties before the server answers.
  it('empties the trash shelf at once, leaves the other shelves be, and puts its cards back on a refusal', async () => {
    const answer = held();
    server.empty.mockReturnValue(answer.promise);
    const reread = held();
    let calls = 0;
    const { result } = renderHook(
      () =>
        useBox({
          published: async () => shelfOf('a'),
          trash: () => (calls++ === 0 ? Promise.resolve(shelfOf('x', 'y')) : (reread.promise as Promise<CardBoxShelfData>)),
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.trash).toEqual(['x', 'y']));

    let move!: Promise<unknown>;
    act(() => {
      move = result.current.actions.emptyTrash().catch((e) => e);
    });
    await waitFor(() => expect(result.current.trash).toEqual([]));
    expect(result.current.published).toEqual(['a']);

    await act(async () => {
      answer.reject(new Error('offline'));
      expect(await move).toBeInstanceOf(Error);
    });
    expect(result.current.trash).toEqual(['x', 'y']);
  });
});

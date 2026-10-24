// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { RestoredAloneNotice } from '@/components/molecules/TrashActionsMenu/RestoredAloneNotice';
import { closeRestoredAlone } from '@/lib/data/trash';
import { CardActionsMenu } from './CardActionsMenu';

// The owner's「⋯」on a card, on the real client card writes: the v1 API call
// (callApi), the signed-in user and navigation are the module boundary.
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: 'u1', getIdToken: async () => 'token' } }),
}));

const mockCallApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/firestore/client/api')>()),
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

/** What else this browser holds of the viewer's cards: the card box shelves they opened and their profile's lists. */
const boxReads = vi.fn(async () => ['c1']);
const privateShelfReads = vi.fn(async () => []);
const profileReads = vi.fn(async () => ['c1']);
/** …and what shows which card answers which (see lib/data/resonate). */
const resonanceReads = {
  originalButton: vi.fn(async () => ({ id: 'c5' })),
  originalPage: vi.fn(async () => ({})),
  ownPage: vi.fn(async () => ({})),
  resonatedShelf: vi.fn(async () => []),
};
/** …and what turns on whom the viewer is connected with: a thread's composer, their people (see lib/data/resonate). */
const connectionReads = {
  connected: vi.fn(async () => true),
  conversation: vi.fn(async () => null),
  people: vi.fn(async () => ['orig-author']),
};
function OwnLists() {
  useSWR('cardbox:u1:published', boxReads);
  useSWR('cardbox:u1:private', privateShelfReads);
  useSWR('profilePage:me:u1', profileReads);
  useSWR('myResonance:orig:u1', resonanceReads.originalButton);
  useSWR('cardPage:orig:u1', resonanceReads.originalPage);
  useSWR('cardPage:c5:u1', resonanceReads.ownPage);
  useSWR('cardbox:u1:resonated', resonanceReads.resonatedShelf);
  useSWR('connected:orig-author_u1', connectionReads.connected);
  useSWR('conversation:orig-author_u1', connectionReads.conversation);
  useSWR('conversations:u1', connectionReads.people);
  useSWR('cardbox:u1:trash', trashShelfReads);
  useSWR('thoughtmap:u1', thoughtMapReads);
  return null;
}
const trashShelfReads = vi.fn(async () => []);
const thoughtMapReads = vi.fn(async () => ({}));

function renderMenu(menu: ReactNode) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        <OwnLists />
        {menu}
        <RestoredAloneNotice />
      </ToastProvider>
    </SWRConfig>,
  );
}

/** A v1 card summary of the card a resonance answers (GET /cards?keys=). */
const originalSummary = (anonymous: boolean) => ({
  id: 'orig', slug: 'orig', title: 'Rain on the way home', excerpt: '', tags: [], publishedAt: null,
  author: anonymous ? null : { id: 'orig-author', handle: 'o', initials: 'O', accentColor: 'c', avatarUrl: null, avatarSeed: null, verified: false, region: null },
  anonymous, visibility: 'public', imageUrl: null, imageLabel: null, accentHue: null, readMinutes: 1, referenceCardId: null, reason: null,
});
/** A published, public resonance under the viewer's name: the trash takes back what it reached. */
const reaching = { id: 'c5', visibility: 'public' as const, referenceCardId: 'orig', published: true, anonymous: false, title: 'My answer' };
const trashCalls = () => mockCallApi.mock.calls.filter(([path]) => String(path).endsWith('/trash'));

describe('CardActionsMenu', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => {
    vi.clearAllMocks();
    closeRestoredAlone();
    mockCallApi.mockResolvedValue({});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    return () => fetchSpy.mockRestore();
  });

  it('opens the menu and navigates to the editor on Edit', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} />);

    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);

    await userEvent.click(screen.getByText('Edit'));
    expect(mockPush).toHaveBeenCalledWith('/write/c1');
  });

  it('makes a public card private through the server, then reads the card box and profile lists again', async () => {
    const onChanged = vi.fn();
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} onChanged={onChanged} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make private'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c1', { method: 'PATCH', body: { visibility: 'private' } }),
    );
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    // The card moves shelves: both read again.
    await waitFor(() => expect(privateShelfReads).toHaveBeenCalledTimes(2));
    expect(profileReads).toHaveBeenCalledTimes(2);
    // The server drops the cached pages itself: the browser asks for nothing more.
    expect(fetchSpy).not.toHaveBeenCalled();
    // The menu closes after the change lands.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Make public on a private card', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c2', visibility: 'private' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make public'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c2', { method: 'PATCH', body: { visibility: 'public' } }),
    );
  });

  // Made public again, an anonymous card stays anonymous (only its visibility changes): the verb says so.
  it('offers Make public anonymously on a private anonymous card', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c2', visibility: 'private', anonymous: true }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    expect(screen.queryByText('Make public')).toBeNull();
    await userEvent.click(screen.getByText('Make public anonymously'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c2', { method: 'PATCH', body: { visibility: 'public' } }),
    );
  });

  it("moves a card to the trash at once — no question — reads its lists again, and the toast's Undo brings it back", async () => {
    const onTrashed = vi.fn();
    const onRestored = vi.fn();
    mockCallApi.mockImplementation(async (path: string) =>
      path.endsWith('/restore') ? { card: { id: 'c3' }, changed: true, droppedResonance: false } : { card: { id: 'c3' }, changed: true },
    );
    renderMenu(<CardActionsMenu card={{ id: 'c3', visibility: 'public', published: true, title: 'A walk' }} onTrashed={onTrashed} onRestored={onRestored} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c3/trash', { method: 'POST' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onTrashed).toHaveBeenCalledWith('c3');
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(trashShelfReads).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(thoughtMapReads).toHaveBeenCalledTimes(2));
    expect(profileReads).toHaveBeenCalledTimes(2);
    // The live region says which card; the pill is one button, named with its own words first.
    expect(screen.getByRole('status')).toHaveTextContent('"A walk" moved to the trash');
    const undo = screen.getByRole('button', { name: 'Moved to the trash · Undo "A walk"' });
    expect(undo).toHaveTextContent('Moved to the trash · Undo');

    await userEvent.click(undo);
    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c3/restore', { method: 'POST' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restored'));
    expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ id: 'c3' }));
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(3));
  });

  it.each([
    ['a draft resonance', { ...reaching, published: false }],
    ['a private one', { ...reaching, visibility: 'private' as const }],
    ['one for connections only', { ...reaching, visibility: 'connections' as const }],
    ['an anonymous one', { ...reaching, anonymous: true }],
    ['a card that answers nothing', { ...reaching, referenceCardId: undefined }],
  ])('asks nothing before trashing %s: it reached no one the trash could disconnect', async (_what, card) => {
    renderMenu(<CardActionsMenu card={card} referenceTitle="A walk" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(trashCalls()).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("asks nothing before trashing a resonance to an anonymous card, looking it up when the page can't say", async () => {
    mockCallApi.mockImplementation(async (path: string) => (path.startsWith('/api/v1/cards?keys=') ? { cards: [originalSummary(true)] } : {}));
    renderMenu(<CardActionsMenu card={reaching} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(trashCalls()).toHaveLength(1));
    expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards?keys=orig');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['the page says its original is named', { referenceAnonymous: false }, { cards: [] }],
    ['the original, looked up, is named', {}, { cards: [originalSummary(false)] }],
    ["the original can't be read (a connection can outlive it going private)", {}, { cards: [] }],
  ])('asks first, in the plain colour, before trashing a resonance that reached its original — when %s', async (_when, props, keys) => {
    mockCallApi.mockImplementation(async (path: string) => (path.startsWith('/api/v1/cards?keys=') ? keys : { card: { id: 'c5' }, changed: true }));
    renderMenu(<CardActionsMenu card={reaching} {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));

    expect(await screen.findByText('Delete this resonance?')).toBeInTheDocument();
    expect(trashCalls()).toHaveLength(0);
    expect(
      screen.getByText(
        "The card moves to the trash, where you can restore it for 30 days. If this resonance is what connected you two and they haven't written to you, you won't be connected any more, even after you restore it.",
      ),
    ).toBeInTheDocument();
    const verb = screen.getByRole('button', { name: 'Move to trash' });
    expect(verb).toHaveAttribute('data-variant', 'solid');
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveAttribute('data-variant', 'tonal');

    await userEvent.click(verb);
    await waitFor(() => expect(trashCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says so in a notice of its own when the trash refuses, leaving the card in its lists', async () => {
    const onTrashed = vi.fn();
    mockCallApi.mockRejectedValue(new Error('offline'));
    renderMenu(<CardActionsMenu card={{ id: 'c3', visibility: 'public' }} onTrashed={onTrashed} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));

    const notice = await screen.findByRole('dialog', { name: 'Delete' });
    expect(notice).toHaveTextContent("That didn't work — try again");
    expect(onTrashed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it("says when the Undo didn't go through, pointing at the trash", async () => {
    mockCallApi.mockImplementation(async (path: string) => {
      if (path.endsWith('/restore')) throw new Error('offline');
      return { card: { id: 'c3' }, changed: true };
    });
    renderMenu(<CardActionsMenu card={{ id: 'c3', visibility: 'public', title: 'A walk' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(await screen.findByRole('button', { name: 'Moved to the trash · Undo "A walk"' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't restore it — try again from the trash"));
  });

  it('says a resonance came back on its own, in a notice with one way out', async () => {
    mockCallApi.mockImplementation(async (path: string) =>
      path.endsWith('/restore') ? { card: { id: 'c5' }, changed: true, droppedResonance: true } : { card: { id: 'c5' }, changed: true },
    );
    renderMenu(<CardActionsMenu card={{ ...reaching, published: false }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(await screen.findByRole('button', { name: 'Moved to the trash · Undo "My answer"' }));
    const notice = await screen.findByRole('dialog', { name: 'Restored' });
    expect(notice).toHaveTextContent('This card is back, but it no longer resonates with the card it answered.');
  });

  it('shows no toast on the card\'s own page, which shows its banner instead', async () => {
    const onTrashed = vi.fn();
    mockCallApi.mockResolvedValue({ card: { id: 'c3' }, changed: true });
    renderMenu(<CardActionsMenu card={{ id: 'c3', visibility: 'public', title: 'A walk' }} trashFeedback="page" onTrashed={onTrashed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(onTrashed).toHaveBeenCalledWith('c3'));
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('offers 取消共振 only on a card that resonates with another', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }} referenceTitle="A walk" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Edit',
      'Make private',
      'Stop resonating',
      'Delete',
    ]);
  });

  it('asks before taking a resonance back, then lets go of it through the server and reads again what showed it', async () => {
    const onChanged = vi.fn();
    renderMenu(
      <CardActionsMenu
        card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }}
        referenceTitle="A walk"
        onChanged={onChanged}
      />,
    );
    await waitFor(() => expect(resonanceReads.originalButton).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Stop resonating'));

    // Nothing sent yet: the question names the card it resonates with.
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(screen.getByText('Stop resonating with "A walk"?')).toBeInTheDocument();
    // The card stays — and the connection it made may not.
    expect(
      screen.getByText(
        "Your card stays. If this resonance is what connected you two and they haven't written to you, you won't be connected any more.",
      ),
    ).toBeInTheDocument();
    // The card stays, so the verb is the dialog's plain solid fill, not the red of a delete.
    const confirm = screen.getByRole('button', { name: 'Stop resonating' });
    expect(confirm).toHaveAttribute('data-variant', 'solid');

    await userEvent.click(confirm);
    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/orig/resonances/c5', { method: 'DELETE' }),
    );
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(resonanceReads.originalButton).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resonanceReads.originalPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resonanceReads.ownPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resonanceReads.resonatedShelf).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
  });

  it('asks the server for the title of the card it resonates with when the page has none', async () => {
    mockCallApi.mockImplementation(async (path: string) =>
      path.startsWith('/api/v1/cards?keys=')
        ? {
            cards: [
              {
                id: 'orig', slug: 'orig', title: 'Rain on the way home', excerpt: '', tags: [], publishedAt: null,
                author: null, anonymous: true, visibility: 'public', imageUrl: null, imageLabel: null,
                accentHue: null, readMinutes: 1, referenceCardId: null, reason: null,
              },
            ],
          }
        : {},
    );
    renderMenu(<CardActionsMenu card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Stop resonating'));

    expect(await screen.findByText('Stop resonating with "Rain on the way home"?')).toBeInTheDocument();
    expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards?keys=orig');
  });

  it('keeps the question open and says so when taking the resonance back fails', async () => {
    mockCallApi.mockRejectedValue(new Error('offline'));
    renderMenu(<CardActionsMenu card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }} referenceTitle="A walk" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Stop resonating'));
    await userEvent.click(screen.getByRole('button', { name: 'Stop resonating' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work — try again");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // A take-back by another way: hiding or deleting a resonance can end the connection with the original's author.
  it.each([
    ['making it private', 'Make private', null],
    ['moving it to the trash', 'Delete', 'Move to trash'],
  ])('reads again what turns on the viewer’s connections after %s', async (_how, item, confirm) => {
    renderMenu(<CardActionsMenu card={reaching} referenceTitle="A walk" referenceAnonymous={false} />);
    await waitFor(() => expect(connectionReads.people).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(connectionReads.connected).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText(item));
    if (confirm) await userEvent.click(screen.getByRole('button', { name: confirm }));

    await waitFor(() => expect(connectionReads.connected).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(connectionReads.conversation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(connectionReads.people).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    expect(profileReads).toHaveBeenCalledTimes(2);
  });

  it('leaves the viewer’s connections alone when the card resonates with nothing', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} />);
    await waitFor(() => expect(connectionReads.people).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make private'));
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    expect(connectionReads.people).toHaveBeenCalledTimes(1);
  });

  it('keeps the question open and says so when the trash refuses a resonance it asked about', async () => {
    mockCallApi.mockRejectedValue(new Error('offline'));
    renderMenu(<CardActionsMenu card={reaching} referenceAnonymous={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work — try again");
    expect(screen.getByRole('dialog', { name: 'Delete this resonance?' })).toBeInTheDocument();
  });

  it('says so when the server refuses a visibility change, and leaves the card as it was', async () => {
    const onChanged = vi.fn();
    mockCallApi.mockRejectedValue(new Error('Missing or insufficient permissions.'));
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} onChanged={onChanged} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make private'));

    const notice = await screen.findByRole('dialog', { name: 'Make private' });
    expect(notice).toHaveTextContent("That didn't work — try again");
    expect(onChanged).not.toHaveBeenCalled();
    expect(boxReads).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the card when the question is answered Keep it', async () => {
    renderMenu(<CardActionsMenu card={reaching} referenceAnonymous={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(await screen.findByText('Keep it'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});

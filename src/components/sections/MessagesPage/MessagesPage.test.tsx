// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { act, cleanup, renderWithIntl, screen, fireEvent, waitFor, userEvent, within } from '@/../test/render';
import type { Conversation, Message, User } from '@/lib/db/types';
import { forgetOutboxes } from '@/lib/data/thread';
import { forgetAllChatDrafts, keepChatDraft } from '@/lib/data/chatDrafts';
import { MessagesPage } from './MessagesPage';

/** ThreadView fetches through raw useSWR — isolate the cache per test. */
function renderPage(ui: React.ReactElement) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
}

// --- boundary mocks ----------------------------------------------------------
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
  useSessionReady: () => mockUseAuth().sessionReady ?? false,
}));
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

const mockUseConversations = vi.fn();
const mockUseMyProfile = vi.fn();
const mockUseCardSummaries = vi.fn((_keys: string[]): unknown => null);
vi.mock('@/lib/data/hooks', () => ({
  useConversations: () => mockUseConversations(),
  useMyProfile: () => mockUseMyProfile(),
  useMyBlockedIds: () => ({ data: new Set<string>() }),
  useCardSummaries: (keys: string[]) => mockUseCardSummaries(keys),
  hideConversation: (pair: string) => mockHideConversation(pair),
}));
const conversationShown = { putBack: vi.fn(), gone: vi.fn() };
const mockHideConversation = vi.fn((_pair: string) => conversationShown);

const mockBlockUser = vi.fn();
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  blockUser: (uid: string) => mockBlockUser(uid),
  unblockUser: vi.fn(),
}));
const mockSubmitReport = vi.fn();
vi.mock('@/lib/db/firestore/client/reports', () => ({
  REPORT_REASONS: ['spam', 'harassment', 'other'],
  REPORT_DETAIL_MAX: 1000,
  submitReport: (input: unknown) => mockSubmitReport(input),
}));

const mockGetUserByHandle = vi.fn();
const mockIsConnected = vi.fn();
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: (h: string) => mockGetUserByHandle(h),
  isConnected: () => mockIsConnected(),
}));

const mockSendMessage = vi.fn();
const mockUploadChatImage = vi.fn();
const mockGetConversation = vi.fn();
const mockMarkRead = vi.fn();
const mockDeleteConversation = vi.fn();
// The open conversation as the server holds it: its listener hears `messages`
// at once, and again on `deliver`.
const server = vi.hoisted(() => ({
  messages: [] as Message[],
  listening: [] as string[],
  emit: null as ((window: unknown) => void) | null,
  windowOf: (messages: Message[]) => ({
    entries: [...messages].reverse().map((message) => ({ message, cursor: { seconds: 0, nanoseconds: 0, id: message.id } })),
    fromCache: false,
  }),
}));
vi.mock('@/lib/db/firestore/client/messages', () => ({
  MESSAGE_MAX_LENGTH: 2000,
  conversationId: (a: string, b: string) => [a, b].sort().join('_'),
  deleteConversation: (pairId: string) => mockDeleteConversation(pairId),
  getConversation: () => mockGetConversation(),
  markConversationRead: (pairId: string) => mockMarkRead(pairId),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  uploadChatImage: (...args: unknown[]) => mockUploadChatImage(...args),
  chatImageUrl: (id: string, size: 'thumb' | 'full') => `/api/v1/chat-images/${id}${size === 'thumb' ? '?size=thumb' : ''}`,
  listenThread: (pairId: string, onWindow: (window: unknown) => void) => {
    server.listening.push(pairId);
    server.emit = onWindow;
    onWindow(server.windowOf(server.messages));
    return () => {};
  },
  getOlderMessages: async () => [],
}));
const deliver = (messages: Message[]) => act(() => server.emit!(server.windowOf(messages)));
// A picture is made ready on the device (scaled, re-encoded): here it is taken as it is, 1200 × 900.
vi.mock('@/lib/chat/preparePicture', () => ({
  UnsupportedImage: class UnsupportedImage extends Error {},
  preparePicture: async (file: File) => {
    if (file.type === 'image/heic') throw new (class UnsupportedImage extends Error {})();
    return { file, width: 1200, height: 900 };
  },
}));

// The card picker + the shared-card embed touch further read paths; stub them
// down to their contract so the thread tests stay about attach/send/render.
vi.mock('@/components/molecules/MarkdownEditor/InsertCardModal', () => ({
  InsertCardModal: ({
    open,
    onPick,
  }: {
    open: boolean;
    onPick: (card: { id: string; thoughtCore: string }) => void;
  }) =>
    open ? (
      <button onClick={() => onPick({ id: 'card-42', thoughtCore: 'A shared thought' })}>
        pick-card
      </button>
    ) : null,
}));
// A shared card is looked up by the thread (a card the viewer can't see resolves to an error).
vi.mock('@/components/molecules/EmbedStoryCard/useCardEmbed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/molecules/EmbedStoryCard/useCardEmbed')>()),
  useCardEmbed: (href: string) =>
    href === '/card/card-77'
      ? {
          status: 'ready',
          card: {
            id: 'card-77',
            authorId: 'alice',
            slug: 'a-walk-at-dawn',
            thoughtCore: 'A walk at dawn',
            story: 'The street was still asleep.',
            tags: [],
            originalLocale: 'en',
            translations: {},
            visibility: 'public',
            publishedAt: new Date('2026-02-01'),
            readCount: 0,
            resonanceCount: 0,
            inviteCount: 0,
            anonymous: false,
            summary: { readMinutes: 3 },
          },
          author: person('alice', 'alice'),
        }
      : { status: 'error' },
}));

function person(id: string, handle: string): User {
  return {
    id,
    handle,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '7',
    initials: handle.slice(0, 2).toUpperCase(),
    accentColor: 'var(--color-sage)',
    joinedAt: new Date(),
    handleChangedAt: new Date(),
  };
}

const viewer = { id: 'me', handle: 'me-handle' };
const alice = person('alice', 'alice');
const bob = person('bob', 'bob');

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'alice_me',
    participants: ['alice', 'me'],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessage: { text: 'see you soon', senderId: 'alice', sentAt: new Date() },
    unread: { me: 2, alice: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  // jsdom draws no blobs: a picture on the device is drawn from a stand-in address.
  URL.createObjectURL = vi.fn(() => 'blob:local/picture');
  URL.revokeObjectURL = vi.fn();
  mockUseMyProfile.mockReturnValue({ data: viewer });
  mockUseAuth.mockReturnValue({ user: viewer, loading: false });
  mockUseConversations.mockReturnValue({
    data: {
      conversations: [conversation()],
      people: { alice, bob },
      connectedWithoutConversation: [bob],
      unreadTotal: 2,
    },
  });
  server.messages = [];
  server.listening = [];
  forgetAllChatDrafts();
  window.localStorage.clear();
  mockGetUserByHandle.mockResolvedValue(alice);
  mockIsConnected.mockResolvedValue(true);
  mockGetConversation.mockResolvedValue(conversation());
  mockSendMessage.mockResolvedValue({ conversationId: 'alice_me', id: 'm-new' });
  mockMarkRead.mockResolvedValue(undefined);
  mockDeleteConversation.mockResolvedValue(undefined);
  mockBlockUser.mockResolvedValue(undefined);
  mockSubmitReport.mockResolvedValue(undefined);
});
afterEach(() => {
  // Unmount first: emptying the outboxes under a thread still drawn would redraw it outside act().
  cleanup();
  vi.clearAllMocks();
  mockUseCardSummaries.mockImplementation(() => null);
  forgetOutboxes();
});

describe('MessagesPage list', () => {
  it('shows conversations with preview + unread badge, and connected people without one', () => {
    renderPage(<MessagesPage />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('see you soon')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // bob has no conversation yet — listed under the starter section
    expect(screen.getByText('Connected — no conversation yet')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  // Review N7: the list's time and a message's menu say it alike — the hour without a leading zero.
  it('says today’s time as the thread does, the hour without a leading zero', () => {
    const morning = new Date();
    morning.setHours(9, 5, 0, 0);
    mockUseConversations.mockReturnValueOnce({
      data: {
        conversations: [conversation({ lastMessage: { text: 'early', senderId: 'alice', sentAt: morning } })],
        people: { alice, bob },
        connectedWithoutConversation: [],
        unreadTotal: 0,
      },
    });
    renderPage(<MessagesPage />);
    expect(screen.getByText(/^9:05\sAM$/)).toBeInTheDocument();
  });

  it('previews a picture sent without words as one', () => {
    mockUseConversations.mockReturnValueOnce({
      data: {
        conversations: [conversation({ lastMessage: { text: '', senderId: 'me', sentAt: new Date(), image: true } })],
        people: { alice, bob },
        connectedWithoutConversation: [],
        unreadTotal: 0,
      },
    });
    renderPage(<MessagesPage />);
    expect(screen.getByText('You: Sent a photo')).toBeInTheDocument();
  });

  // Round 22: a sticker or an album says so — never a sticker's fallback words, which are for older builds.
  it('previews a sticker and an album as what they are', () => {
    const page = (lastMessage: Conversation['lastMessage']) => ({
      data: { conversations: [conversation({ lastMessage })], people: { alice, bob }, connectedWithoutConversation: [], unreadTotal: 0 },
    });
    mockUseConversations.mockReturnValueOnce(page({ text: '〔貼圖：謝謝〕', senderId: 'alice', sentAt: new Date(), sticker: true }));
    const { unmount } = renderPage(<MessagesPage />);
    expect(screen.getByText('Sent a sticker')).toBeInTheDocument();
    expect(screen.queryByText(/貼圖/)).toBeNull();
    unmount();
    mockUseConversations.mockReturnValueOnce(page({ text: '', senderId: 'me', sentAt: new Date(), image: true, album: { count: 3 } }));
    renderPage(<MessagesPage />);
    expect(screen.getByText('You: Sent 3 photos')).toBeInTheDocument();
  });

  // Round 22 §4.4: a conversation with something left unsent shows it after a pen, in place of its last message —
  // never the word 草稿 — and not beside the thread that is open, whose composer shows it.
  it('shows a draft left unsent after a pen, until it goes', async () => {
    keepChatDraft('me', 'alice_me', { text: 'half a\nthought' });
    keepChatDraft('me', 'bob_me', { text: 'to bob' });
    const { unmount } = renderPage(<MessagesPage />);
    const draft = screen.getByLabelText('Unsent message: half a thought');
    expect(draft).toHaveAttribute('data-draft');
    expect(draft.querySelector('[data-icon], svg')).toBeTruthy();
    expect(screen.queryByText('see you soon')).toBeNull();
    // A person with no conversation yet: the pair it would have.
    expect(screen.getByLabelText('Unsent message: to bob')).toBeInTheDocument();
    unmount();
    forgetAllChatDrafts();
  });

  // Round 16: an unsent last message reads as its line in the thread does — never what it said.
  it('previews an unsent last message as who unsent it', () => {
    const page = (senderId: string) => ({
      data: {
        conversations: [conversation({ lastMessage: { text: '', senderId, sentAt: new Date(), unsent: true } })],
        people: { alice, bob },
        connectedWithoutConversation: [],
        unreadTotal: 0,
      },
    });
    mockUseConversations.mockReturnValueOnce(page('alice'));
    const { unmount } = renderPage(<MessagesPage />);
    expect(screen.getByText('alice unsent a message')).toBeInTheDocument();
    unmount();
    mockUseConversations.mockReturnValueOnce(page('me'));
    renderPage(<MessagesPage />);
    expect(screen.getByText('You unsent a message')).toBeInTheDocument();
  });

  it('says "no conversations yet" with the shared empty state, and asks to pick one once there are some', () => {
    mockUseConversations.mockReturnValueOnce({ data: { conversations: [], people: {}, connectedWithoutConversation: [] } });
    const { unmount } = renderPage(<MessagesPage />);
    // The list (phones) and the detail pane (two panes) each say it; CSS shows one.
    expect(screen.getAllByText('No conversations yet').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pick a conversation from the left')).not.toBeInTheDocument();
    unmount();
    renderPage(<MessagesPage />);
    expect(screen.getByText('Pick a conversation from the left')).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
  });

  it('redirects signed-out visitors to /signin', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderPage(<MessagesPage />);
    expect(mockPush).toHaveBeenCalledWith('/signin');
  });
});

describe('MessagesPage thread', () => {
  it('renders incoming and own messages and sends a reply', async () => {
    const messages: Message[] = [
      { id: 'm1', senderId: 'alice', text: 'hello from alice', sentAt: new Date() },
      { id: 'm2', senderId: 'me', text: 'hi back', sentAt: new Date() },
    ];
    server.messages = messages;

    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByText('hello from alice')).toBeInTheDocument());
    expect(screen.getByText('hi back')).toBeInTheDocument();

    // Nothing to send yet: Send says so by its semantics (never a fade).
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'a reply' },
    });
    // The send button wakes once there is something to send.
    expect(screen.getByRole('button', { name: 'Send' })).not.toHaveAttribute('aria-disabled');
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    // One server call, addressed to the person (the server opens the
    // conversation and decides whether the bell rings).
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('alice', 'a reply', expect.anything()),
    );
    // The composer is free again at once, and the message shows while it is on its way.
    expect(screen.getByPlaceholderText('Write a message…')).toHaveValue('');
    expect(screen.getByText('a reply')).toBeInTheDocument();
  });

  it('sends the first message of a conversation that does not exist yet', async () => {
    mockGetConversation.mockResolvedValue(null);
    // The server opens the conversation with the first message.
    mockSendMessage.mockImplementation(async () => {
      mockGetConversation.mockResolvedValue(conversation());
      return { conversationId: 'alice_me', id: 'm-new' };
    });

    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument());
    // Nothing to listen to before the first message makes the conversation.
    expect(server.listening).not.toContain('alice_me');

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'first hello' },
    });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('alice', 'first hello', expect.anything()),
    );
    // Once the server took it, the conversation is there to listen to.
    await waitFor(() => expect(server.listening).toContain('alice_me'));
  });

  it('blocks the composer for strangers and offers the profile instead', async () => {
    mockIsConnected.mockResolvedValue(false);
    mockGetConversation.mockResolvedValue(null);
    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() =>
      expect(
        screen.getByText("You can only message people you're connected with"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument();
  });

  /** The thread's card lookup, answering for the card a note was left on. */
  const noteCard = (anonymous: boolean) =>
    mockUseCardSummaries.mockImplementation((keys: string[]) =>
      keys.includes('card-1')
        ? {
            status: 'ready',
            cards: { cards: [{ id: 'card-1', authorId: 'me', thoughtCore: 'My card', anonymous }], authors: {} },
            asked: new Set(keys),
            failed: new Set(),
          }
        : null,
    );

  // An older note (left before notes came into threads) isn't in the conversation: its quote rides the reply.
  it('carries an older note’s reply as a quoted reference on the sent message', async () => {
    noteCard(false);
    renderPage(
      <MessagesPage
        activeHandle="alice"
        replyNote={{ noteId: 'note-1', cardId: 'card-1' }}
      />,
    );
    // The quote chip appears above the composer, ready to ride the next send.
    await waitFor(() => expect(screen.getByText('In reply to your note')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'thanks for the note' },
    });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        'alice',
        'thanks for the note',
        expect.objectContaining({ noteRef: { noteId: 'note-1', cardId: 'card-1' } }),
      ),
    );
  });

  // Answering a note on an anonymous card with its quote would tell the writer whose card it was.
  it('answers an older note on an anonymous card without its quote', async () => {
    noteCard(true);
    renderPage(<MessagesPage activeHandle="alice" replyNote={{ noteId: 'note-1', cardId: 'card-1' }} />);
    await waitFor(() => expect(mockUseCardSummaries).toHaveBeenCalledWith(expect.arrayContaining(['card-1'])));
    fireEvent.change(await screen.findByPlaceholderText('Write a message…'), { target: { value: 'thank you' } });
    expect(screen.queryByText('In reply to your note')).not.toBeInTheDocument();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('alice', 'thank you', expect.objectContaining({ noteRef: undefined })));
  });

  it('attaches a picked card and sends it as a cardRef', async () => {
    renderPage(<MessagesPage activeHandle="alice" />);
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attach a photo or a card' })).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: 'Attach a photo or a card' }));
    await u.click(screen.getByRole('menuitem', { name: 'Card' }));
    await u.click(await screen.findByRole('button', { name: 'pick-card' }));
    // The attached card shows as a chip before sending.
    expect(screen.getByText('A shared thought')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        'alice',
        '',
        expect.objectContaining({ cardRef: 'card-42' }),
      ),
    );
  });

  // A picture goes the way a card does: from the 「＋」, shown above the field, sent with the words —
  // uploaded first under the message's own client id, then the message names it.
  it('attaches a picture from the 「＋」, shows it above the field, and sends it uploaded first', async () => {
    mockUploadChatImage.mockImplementation(async (_file: Blob, _to: string, opts: { clientId: string }) => ({ id: opts.clientId, width: 1200, height: 900 }));
    const { container } = renderPage(<MessagesPage activeHandle="alice" />);
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attach a photo or a card' })).toBeInTheDocument());
    await u.click(screen.getByRole('button', { name: 'Attach a photo or a card' }));
    expect(screen.getByRole('menuitem', { name: 'Photo' })).toBeInTheDocument();
    await u.click(screen.getByRole('menuitem', { name: 'Photo' }));

    const file = new File(['jpeg'], 'sky.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    // Its row over the capsule: the thumbnail, Photo, its ✕.
    const row = (await screen.findByRole('button', { name: 'Remove photo' })).closest('[class*="carryRow"]')!;
    expect(row.querySelector('img')).toHaveAttribute('src', 'blob:local/picture');
    expect(row).toHaveTextContent('Photo');
    await u.type(screen.getByRole('textbox', { name: 'Conversation with alice' }), 'the sky tonight');
    await u.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled());
    const [uploaded, to, opts] = mockUploadChatImage.mock.calls[0];
    expect([uploaded, to, opts.as]).toEqual([file, 'alice', 'me']);
    expect(mockSendMessage).toHaveBeenCalledWith('alice', 'the sky tonight', expect.objectContaining({ image: opts.clientId, clientId: opts.clientId }));
    // Drawn in the thread at once, from the device; its row is gone.
    expect(screen.getByRole('button', { name: 'View photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });

  it('holds one of the two — a card picked takes the picture\'s place once the viewer says so — and says when a file is not a picture it can send', async () => {
    const { container } = renderPage(<MessagesPage activeHandle="alice" />);
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attach a photo or a card' })).toBeInTheDocument());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['jpeg'], 'sky.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByRole('button', { name: 'Remove photo' })).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Attach a photo or a card' }));
    await u.click(screen.getByRole('menuitem', { name: 'Card' }));
    await u.click(await screen.findByRole('button', { name: 'pick-card' }));
    // Round 22 §4.2: a card and pictures never ride together — the card takes their place once the viewer says so.
    const ask = await screen.findByRole('dialog', { name: 'Use this card instead?' });
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
    await u.click(within(ask).getByRole('button', { name: 'Use card' }));
    expect(await screen.findByText('A shared thought')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });

  // Round 22 §4.2: pictures dropped on the thread ride the next message, as picked ones do.
  it('takes pictures dropped on the thread', async () => {
    const { container } = renderPage(<MessagesPage activeHandle="alice" />);
    await screen.findByRole('textbox', { name: 'Conversation with alice' });
    const body = container.querySelector('[class*="scroller"]')!.parentElement!;
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })];
    fireEvent.dragOver(body, { dataTransfer: { types: ['Files'], files } });
    fireEvent.drop(body, { dataTransfer: { types: ['Files'], files } });
    expect(await screen.findByText('2 photos')).toBeInTheDocument();
  });

  it('draws a picture message in its bubble, opens it whole, and quotes it as a photo', async () => {
    mockUseAuth.mockReturnValue({ user: viewer, loading: false, sessionReady: true });
    server.messages = [
      { id: 'p1', senderId: 'alice', text: 'look up', sentAt: new Date(), image: { id: 'pic-1', width: 800, height: 1200 } },
      { id: 'p2', senderId: 'me', text: 'wow', sentAt: new Date(), replyTo: { id: 'p1', senderId: 'alice', text: '', image: true } },
    ];
    renderPage(<MessagesPage activeHandle="alice" />);
    const picture = await screen.findByRole('button', { name: 'View photo' });
    expect(picture.querySelector('img')).toHaveAttribute('src', '/api/v1/chat-images/pic-1?size=thumb');
    expect(screen.getByText('look up')).toBeInTheDocument();
    expect(screen.getByText('A photo')).toBeInTheDocument();

    await userEvent.click(picture);
    const viewer_ = screen.getByRole('dialog', { name: 'View photo' });
    expect(viewer_.querySelector('img')).toHaveAttribute('src', '/api/v1/chat-images/pic-1');
    // Round 12 §1: its ✕ is the cream glyph on a disc of the viewer's own dark, always shown — it reads on a light
    // picture, and hovering it never turns it the dark it stands on.
    expect(within(viewer_).getByRole('button', { name: 'Close' })).toHaveAttribute('data-tone', 'onDark');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'View photo' })).toBeNull();
  });

  // Round 22 §4.5: a sticker stands on the page with no bubble; a reply to one quotes it by name; an album's
  // pictures are one grid in one bubble, each still opening whole.
  it('draws stickers without a bubble, quotes one by name, and an album as one grid', async () => {
    mockUseAuth.mockReturnValue({ user: viewer, loading: false, sessionReady: true });
    const at = (s: number) => new Date(Date.UTC(2026, 9, 31, 8, 0, s));
    const pic = (id: string, index: number, extra: Partial<Message> = {}): Message => ({
      id,
      senderId: 'me',
      text: '',
      sentAt: at(10 + index),
      image: { id: `img-${id}`, width: 800, height: 600 },
      album: { id: 'alb', index, count: 4 },
      ...extra,
    });
    server.messages = [
      { id: 's1', senderId: 'alice', text: '〔貼圖：謝謝〕', sentAt: at(1), sticker: { pack: 'twine', id: 'thanks' } },
      {
        id: 's2',
        senderId: 'me',
        text: '〔貼圖：抱抱〕',
        sentAt: at(2),
        sticker: { pack: 'nod', id: 'hug' },
        replyTo: { id: 's1', senderId: 'alice', text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } },
      },
      pic('a1', 0, { text: 'by the river' }),
      pic('a2', 1),
      pic('a3', 2),
      pic('a4', 3),
    ];
    const { container } = renderPage(<MessagesPage activeHandle="alice" />);
    await screen.findByRole('button', { name: 'Sticker: Hug' });
    const [thanks, quote] = screen.getAllByRole('button', { name: 'Sticker: Thanks' });
    expect(thanks.closest('[class*="bubble"]')).toBeNull();
    expect(thanks.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/stickers/twine/thanks.thumb.webp'));
    expect(screen.queryByText('〔貼圖：謝謝〕')).toBeNull();
    // The reply's quote: the sticker's key frame and its name.
    expect(quote.className).toMatch(/quoteBubble/);
    expect(quote).toHaveTextContent('Thanks');
    expect(quote.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/stickers/twine/thanks.thumb.webp'));

    // One grid: the album's first picture stands for it, the four in one bubble, its words under them.
    const grid = container.querySelector('[class*="album"]')!;
    expect(grid.querySelectorAll('[data-album-member]')).toHaveLength(4);
    expect(Array.from(grid.querySelectorAll('[class*="albumRow"]')).map((r) => r.children.length)).toEqual([2, 2]);
    expect(container.querySelectorAll('[data-message-id="a2"]')).toHaveLength(0);
    expect(screen.getByText('by the river')).toBeInTheDocument();
    await userEvent.click(within(grid as HTMLElement).getAllByRole('button', { name: 'View photo' })[2]);
    expect(screen.getByRole('dialog', { name: 'View photo' }).querySelector('img')).toHaveAttribute('src', '/api/v1/chat-images/img-a3');
  });

  it('renders a shared card and a note-reply quote in the thread', async () => {
    const messages: Message[] = [
      { id: 'm1', senderId: 'alice', text: '', sentAt: new Date(), cardRef: 'card-77' },
      {
        id: 'm2',
        senderId: 'me',
        text: 'replying',
        sentAt: new Date(),
        noteRef: { cardId: 'card-9', noteId: 'note-9' },
      },
    ];
    server.messages = messages;
    renderPage(<MessagesPage activeHandle="alice" />);
    // The card sits inside its bubble as a shared post: who wrote it, its title, the 共振 source line.
    const card = await screen.findByRole('link', { name: /A walk at dawn/ });
    expect(card).toHaveAttribute('href', '/card/a-walk-at-dawn');
    expect(card).toHaveTextContent('alice');
    expect(card).toHaveTextContent('Resonance · 3 min');
    expect(card).toHaveTextContent('The street was still asleep.');
    expect(screen.getByText('In reply to your note')).toBeInTheDocument();
  });
});

// App Store 1.2: every conversation needs a way to report and block.
describe('MessagesPage thread safety menu', () => {
  it('blocks the other person after confirming', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(<MessagesPage activeHandle="alice" />);
    await u.click(await screen.findByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Block' }));

    expect(await screen.findByText('Block alice?')).toBeInTheDocument();
    expect(mockBlockUser).not.toHaveBeenCalled();
    // Blocking can be undone, so the verb is solid — not the red of a deletion.
    const block = screen.getByRole('button', { name: 'Block' });
    expect(block).toHaveAttribute('data-variant', 'solid');
    await u.click(block);
    await waitFor(() => expect(mockBlockUser).toHaveBeenCalledWith('alice'));
  });

  it('deletes the conversation only from a red verb, and keeps it on a tonal cancel', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(<MessagesPage activeHandle="alice" />);
    await u.click(await screen.findByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Delete conversation' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this conversation?' });
    const keep = within(dialog).getByRole('button', { name: 'Keep it' });
    const del = within(dialog).getByRole('button', { name: 'Delete' });
    expect(keep).toHaveAttribute('data-variant', 'tonal');
    expect(del).toHaveAttribute('data-variant', 'danger');
    // The one confirm row: the way out, then the verb, rightmost.
    expect(Array.from(del.parentElement!.children)).toEqual([keep, del]);

    await u.click(keep);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete this conversation?' })).toBeNull());
    expect(mockDeleteConversation).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Delete conversation' }));
    await u.click(
      within(await screen.findByRole('dialog', { name: 'Delete this conversation?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(mockDeleteConversation).toHaveBeenCalledWith('alice_me'));
    // Round 21: off the list at once, the question gone, and back on the list.
    expect(mockHideConversation).toHaveBeenCalledWith('alice_me');
    expect(screen.queryByRole('dialog', { name: 'Delete this conversation?' })).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/messages');
  });

  it('files a report about the conversation, with the chosen reason and details', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(<MessagesPage activeHandle="alice" />);
    await u.click(await screen.findByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Report this conversation' }));

    fireEvent.change(await screen.findByLabelText('Details (optional)'), {
      target: { value: 'Keeps sending links' },
    });
    const submit = screen.getByRole('button', { name: 'Send report' });
    // Inside the modal the verb is solid and cancel the tonal pill before it.
    expect(submit).toHaveAttribute('data-variant', 'solid');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('data-variant', 'tonal');
    expect(Array.from(submit.parentElement!.children)).toEqual([cancel, submit]);
    await u.click(submit);

    await waitFor(() =>
      // The server finds who is responsible: the other participant.
      expect(mockSubmitReport).toHaveBeenCalledWith({
        targetType: 'message',
        targetId: 'alice_me',
        reason: 'spam',
        detail: 'Keeps sending links',
        contextId: 'alice_me',
      }),
    );
    expect(await screen.findByText('Thanks for telling us')).toBeInTheDocument();
    // The thank-you's Close (the modal's hidden close shares its name) is its
    // one way out, not a verb: the one-exit notice's close, alone in its row.
    const close = screen.getAllByRole('button', { name: 'Close' }).find((b) => b.hasAttribute('data-variant'));
    expect(close).toHaveAttribute('data-variant', 'tonal');
    expect(close!.parentElement!.children).toHaveLength(1);
    // Not blocked unless the "also block" switch was turned on.
    expect(mockBlockUser).not.toHaveBeenCalled();
  });
});

// The open thread listens to its newest 50 messages. Past 50, a new message
// pushes the oldest out, so the count stays 50 — the thread must still notice
// it: clear the unread badge and scroll to it.
describe('MessagesPage thread past 50 messages', () => {
  const at = (i: number) => new Date(2026, 0, 1, 0, i);
  const window50 = (from: number, senderOfLast = 'me'): Message[] =>
    Array.from({ length: 50 }, (_, k) => {
      const i = from + k;
      return { id: `m${i}`, senderId: k === 49 ? senderOfLast : 'me', text: `message ${i}`, sentAt: at(i) };
    });

  it('marks a new incoming message read and scrolls to it, though the count stays 50', async () => {
    mockGetConversation.mockResolvedValue(conversation({ unread: { me: 0, alice: 0 } }));
    server.messages = window50(0);
    const scrolls = vi.fn();
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: scrolls,
    });
    try {
      renderPage(<MessagesPage activeHandle="alice" />);
      await waitFor(() => expect(screen.getByText('message 49')).toBeInTheDocument());
      expect(server.listening).toEqual(['alice_me']);
      expect(mockMarkRead).not.toHaveBeenCalled(); // nothing unread yet
      const scrollsBefore = scrolls.mock.calls.length;

      // alice writes: the oldest message drops out of the window, the newest is hers.
      deliver(window50(1, 'alice'));

      await waitFor(() => expect(screen.getByText('message 50')).toBeInTheDocument());
      // The thread keeps the one that slid out of the window.
      expect(screen.getByText('message 0')).toBeInTheDocument();
      await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('alice_me'));
      expect(scrolls.mock.calls.length).toBeGreaterThan(scrollsBefore);
    } finally {
      Object.defineProperty(Element.prototype, 'scrollTop', scrollTop);
    }
  });
});

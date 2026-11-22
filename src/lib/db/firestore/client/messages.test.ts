import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// The messages module is exercised against a fake /api/v1 (fetch): the pair id
// conventions, the send, the thread's reads and the list — every one a call
// to the server since the decouple's Phase 2. Firestore is not read: its
// handle throws if anything asks for it.
vi.mock('./init', () => ({
  getClientDb: vi.fn(() => {
    throw new Error('Firestore is not read for messages');
  }),
}));

type MockUser = { uid: string; getIdToken: () => Promise<string> };
const mockAuth = { currentUser: { uid: 'bbb', getIdToken: async () => 'id-token' } as MockUser | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
  ensureAppCheck: vi.fn(),
}));

const batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn() };
// Query pieces come back as plain descriptions, so a test can read the query a read was made with.
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ collection: path.join('/') })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ id: 'new-doc', path: path.join('/') })),
  documentId: vi.fn(() => '__name__'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((n: number) => ({ __increment: n })),
  limit: vi.fn((n: number) => ({ limit: n })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: string) => ({ orderBy: [field, dir] })),
  query: vi.fn((ref: unknown, ...parts: unknown[]) => ({ ref, parts })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(),
  startAfter: vi.fn((...values: unknown[]) => ({ startAfter: values })),
  Timestamp: class {
    constructor(
      readonly seconds: number,
      readonly nanoseconds: number,
    ) {}
  },
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => batch),
}));

// The signal channel: who watches what, fired by hand; and what this browser poked.
const signals = vi.hoisted(() => {
  const watchers = new Map<string, () => void>();
  const poked: string[] = [];
  return { watchers, poked, fire: (key: string) => watchers.get(key)?.() };
});
vi.mock('./signals', () => ({
  watchSignal: (uid: string, topic: string, fn: () => void) => {
    signals.watchers.set(`${uid}|${topic}`, fn);
    return () => signals.watchers.delete(`${uid}|${topic}`);
  },
  pokeSignal: (topic: string) => signals.poked.push(topic),
  pokeOwn: (topics: string[]) => signals.poked.push(...topics),
}));

import { getDoc, getDocs, writeBatch } from 'firebase/firestore/lite';
import {
  conversationId,
  deleteConversation,
  followThread,
  getConversation,
  getMessagesBefore,
  isGone,
  listConversations,
  otherParticipant,
  readConversation,
  reactToMessage,
  sendMessage,
  unsendMessage,
  uploadChatImage,
  THREAD_FULL_READ_MS,
  type ThreadWindow,
} from './messages';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
  new Response(JSON.stringify({ conversationId: 'aaa_bbb', id: 'm1' }), { status: 201 }),
);
vi.stubGlobal('fetch', fetchMock);
const sent = () => JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = { uid: 'bbb', getIdToken: async () => 'id-token' };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ conversationId: 'aaa_bbb', id: 'm1' }), { status: 201 }));
  signals.poked.length = 0;
});

describe('pair id conventions', () => {
  it('sorts the two uids into the connection pair id', () => {
    expect(conversationId('bbb', 'aaa')).toBe('aaa_bbb');
    expect(conversationId('aaa', 'bbb')).toBe('aaa_bbb');
  });

  it('resolves the other participant from either side', () => {
    expect(otherParticipant('aaa_bbb', 'bbb')).toBe('aaa');
    expect(otherParticipant('aaa_bbb', 'aaa')).toBe('bbb');
  });
});

describe('sendMessage', () => {
  it('sends through the API to the person, trimmed, with the ID token', async () => {
    await expect(sendMessage('aaa', '  hello there  ')).resolves.toEqual({ conversationId: 'aaa_bbb', id: 'm1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messages');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    expect(sent()).toEqual({
      to: 'aaa',
      text: 'hello there',
      cardRef: null,
      noteRef: null,
      replyTo: null,
      clientId: null,
      image: null,
      sticker: null,
      album: null,
    });
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it('rejects empty and over-length messages without sending', async () => {
    await expect(sendMessage('aaa', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa', 'x'.repeat(2001))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches a shared card and a note reply', async () => {
    await sendMessage('aaa', '', { cardRef: 'card-1', noteRef: { cardId: 'card-9', noteId: 'note-9' } });
    expect(sent()).toEqual({
      to: 'aaa',
      text: '',
      cardRef: 'card-1',
      noteRef: { cardId: 'card-9', noteId: 'note-9' },
      replyTo: null,
      clientId: null,
      image: null,
      sticker: null,
      album: null,
    });
  });

  // Round 22: a sticker goes on its own (no words, card, picture or note beside it), a picture of an album with
  // its place in it — and only beside a picture.
  it('sends a sticker on its own, and a picture with its place in an album', async () => {
    await sendMessage('aaa', '', { sticker: { pack: 'twine', id: 'thanks' }, replyTo: 'm7', clientId: 'Abcdefghij0123456789' });
    expect(sent()).toMatchObject({ text: '', sticker: { pack: 'twine', id: 'thanks' }, replyTo: 'm7', image: null, album: null });

    await expect(sendMessage('aaa', 'hi', { sticker: { pack: 'twine', id: 'thanks' } })).rejects.toThrow('A sticker is sent on its own');
    await expect(sendMessage('aaa', '', { sticker: { pack: 'twine', id: 'thanks' }, image: 'Abcdefghij0123456789' })).rejects.toThrow();
    await expect(sendMessage('aaa', 'caption', { album: { id: 'Album0123456789abcdef', index: 0, count: 3 } })).rejects.toThrow(
      'An album holds pictures',
    );

    fetchMock.mockClear();
    await sendMessage('aaa', 'caption', { image: 'Abcdefghij0123456789', album: { id: 'Album0123456789abcdef', index: 0, count: 3 } });
    expect(sent()).toMatchObject({ text: 'caption', image: 'Abcdefghij0123456789', album: { id: 'Album0123456789abcdef', index: 0, count: 3 } });
  });

  it('sends a picture uploaded for the conversation, with or without words', async () => {
    await sendMessage('aaa', '', { image: 'Abcdefghij0123456789', clientId: 'Abcdefghij0123456789' });
    expect(sent()).toMatchObject({ text: '', image: 'Abcdefghij0123456789', clientId: 'Abcdefghij0123456789' });
  });

  it('uploads a picture as a form under the message\'s client id, with the ID token', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'Abcdefghij0123456789', width: 1200, height: 900 }) } as unknown as Response);
    const file = new Blob(['jpeg'], { type: 'image/jpeg' });
    await expect(uploadChatImage(file, 'aaa', { clientId: 'Abcdefghij0123456789' })).resolves.toEqual({
      id: 'Abcdefghij0123456789',
      width: 1200,
      height: 900,
    });
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('/api/v1/chat-images');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    const form = init?.body as FormData;
    expect([form.get('to'), form.get('clientId'), form.get('file') instanceof Blob]).toEqual(['aaa', 'Abcdefghij0123456789', true]);
    // The browser sets the multipart boundary itself.
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('names the message it answers and the id it was written under', async () => {
    await sendMessage('aaa', 'yes', { replyTo: 'm7', clientId: 'Abcdefghij0123456789' });
    expect(sent()).toMatchObject({ text: 'yes', replyTo: 'm7', clientId: 'Abcdefghij0123456789' });
  });

  it('allows an empty body only when a card is attached', async () => {
    await expect(sendMessage('aaa', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa', '   ', { cardRef: 'card-1' })).resolves.toBeTruthy();
  });

  it('sends only as the account that wrote it', async () => {
    await expect(sendMessage('aaa', 'hi', { as: 'someone-else' })).rejects.toThrow('Signed in as someone else');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(sendMessage('aaa', 'hi', { as: 'bbb' })).resolves.toBeTruthy();
  });

  it("surfaces the server's refusal (not connected, blocked)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'You can message people you are connected with.' } }), { status: 403 }),
    );
    await expect(sendMessage('aaa', 'hi')).rejects.toThrow('You can message people you are connected with.');
  });
});

describe('the thread and the list, through /api/v1', () => {
  /** What GET …/messages answers next, by the query it was asked (`limit=50`, `before=c1.x&limit=100`, …). */
  let pages: Record<string, unknown> = {};
  const api = (url: string) => {
    const u = new URL(url, 'https://x');
    if (u.pathname.endsWith('/messages')) {
      const key = [...u.searchParams].map(([k, v]) => `${k}=${v}`).join('&');
      const page = pages[key] ?? { messages: [], olderCursor: null, newerCursor: null, hasNewer: false };
      if (page instanceof Error) throw page;
      return page;
    }
    return pages[u.pathname];
  };
  const page = (messages: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
    messages: messages.map((m) => ({ cursor: `c1.${m.id}`, senderId: 'aaa', text: '', sentAt: '2026-09-01T08:00:00.000000Z', ...m })),
    olderCursor: null,
    newerCursor: messages.length ? `c1.${messages[0].id}` : null,
    hasNewer: false,
    ...extra,
  });
  /** The messages of the window followThread reported (newest first). */
  const heardMessages = (heard: ReturnType<typeof vi.fn>, call = 0) =>
    (heard.mock.calls[call][0] as ThreadWindow).entries.map((e) => e.message);
  /** Follow the thread until its first window is heard. */
  async function follow(max?: number) {
    const heard = vi.fn();
    const stop = followThread('aaa_bbb', heard, undefined, max);
    await vi.waitFor(() => expect(heard).toHaveBeenCalled());
    return { heard, stop };
  }

  beforeEach(() => {
    pages = {};
    signals.watchers.clear();
    fetchMock.mockImplementation(async (url: string) => {
      try {
        const body = api(url);
        return new Response(body === undefined ? null : JSON.stringify(body), { status: body === undefined ? 404 : 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: { code: 'unavailable', message: (e as Error).message } }), { status: 503 });
      }
    });
  });

  it("reads a thread's newest messages at the times they were sent, each with its opaque cursor, never through Firestore", async () => {
    pages['limit=50&changes=1'] = page([
      { id: 'm2', senderId: 'aaa', text: 'and you?', sentAt: '2026-09-01T08:05:00.123456Z' },
      { id: 'm1', senderId: 'bbb', text: 'hello', sentAt: '2026-09-01T08:00:00.000000Z', cardRef: 'walk' },
    ]);
    const { heard } = await follow();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/conversations/aaa_bbb/messages?limit=50&changes=1');
    const window = heard.mock.calls[0][0] as ThreadWindow;
    expect(window).not.toHaveProperty('fromCache');
    const messages = heardMessages(heard);
    expect(messages.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(messages[1]).toMatchObject({ senderId: 'bbb', text: 'hello', cardRef: 'walk' });
    expect(messages[1].sentAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(messages[0].sentAt.toISOString()).toBe('2026-09-01T08:05:00.123Z');
    expect(window.entries[0].cursor).toBe('c1.m2');
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("reads the newest window again when the conversation's signal moves, and catches up with after= past a full window", async () => {
    pages['limit=2&changes=1'] = page([{ id: 'm2' }, { id: 'm1' }]);
    const { heard, stop } = await follow(2);
    expect([...signals.watchers.keys()]).toEqual(['bbb|thread:aaa_bbb']);

    // Five came meanwhile: the newest two no longer meet what was held, so the ones between are read after m2.
    pages['limit=2&changes=1'] = page([{ id: 'm7' }, { id: 'm6' }]);
    pages['after=c1.m2&limit=100'] = page([{ id: 'm5' }, { id: 'm4' }, { id: 'm3' }]);
    signals.fire('bbb|thread:aaa_bbb');
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(2));
    expect(heardMessages(heard, 1).map((m) => m.id)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3']);

    // One more: the window meets what was held, no catch-up.
    pages['limit=2&changes=1'] = page([{ id: 'm8' }, { id: 'm7' }]);
    fetchMock.mockClear();
    signals.fire('bbb|thread:aaa_bbb');
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/conversations/aaa_bbb/messages?limit=2&changes=1']);

    stop();
    expect(signals.watchers.size).toBe(0);
  });

  it('after the first window, pulls only what came and what changed (after= and updatedAfter=), the window as a whole read would give it', async () => {
    pages['limit=50&changes=1'] = page([{ id: 'm2', text: 'two', sentAt: '2026-09-01T08:02:00.000000Z' }, { id: 'm1', text: 'one', sentAt: '2026-09-01T08:01:00.000000Z' }], {
      updatedCursor: 'u.1',
    });
    const { heard } = await follow();

    // A reaction to m1 and a new message m3: one request, nothing of the window read again.
    pages['after=c1.m2&updatedAfter=u.1&limit=100'] = page([{ id: 'm3', text: 'three', sentAt: '2026-09-01T08:03:00.000000Z' }], {
      updated: [{ id: 'm1', cursor: 'c1.m1', senderId: 'aaa', text: 'one', sentAt: '2026-09-01T08:01:00.000000Z', reactions: { bbb: 'heart' } }],
      updatedCursor: 'u.2',
    });
    fetchMock.mockClear();
    signals.fire('bbb|thread:aaa_bbb');
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/conversations/aaa_bbb/messages?after=c1.m2&updatedAfter=u.1&limit=100']);
    const second = heardMessages(heard, 1);
    expect(second.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(second[2].reactions).toEqual({ bbb: 'heart' });

    // An unsend of m2: the next pull starts where the last answer ended, from the newest held.
    pages['after=c1.m3&updatedAfter=u.2&limit=100'] = page([], {
      newerCursor: 'c1.m3',
      updated: [{ id: 'm2', cursor: 'c1.m2', senderId: 'aaa', text: '', sentAt: '2026-09-01T08:02:00.000000Z', unsentAt: '2026-09-01T08:04:00.000000Z' }],
      updatedCursor: 'u.3',
    });
    fetchMock.mockClear();
    signals.fire('bbb|thread:aaa_bbb');
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls).toHaveLength(1);
    const third = heardMessages(heard, 2);
    expect(third.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(third[1].unsentAt).toBeInstanceOf(Date);
    expect(third[2].reactions).toEqual({ bbb: 'heart' });

    // An answer that can't vouch for itself (no updatedCursor: an older server) reads the whole window again.
    pages['after=c1.m3&updatedAfter=u.3&limit=100'] = page([], { newerCursor: 'c1.m3' });
    pages['limit=50&changes=1'] = page([{ id: 'm3' }, { id: 'm2' }, { id: 'm1' }], { updatedCursor: 'u.4' });
    fetchMock.mockClear();
    signals.fire('bbb|thread:aaa_bbb');
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/conversations/aaa_bbb/messages?after=c1.m3&updatedAfter=u.3&limit=100',
      '/api/v1/conversations/aaa_bbb/messages?limit=50&changes=1',
    ]);
  });

  it('reads the whole window again after THREAD_FULL_READ_MS, whatever the incremental answers say', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    pages['limit=50&changes=1'] = page([{ id: 'm1' }], { updatedCursor: 'u.1' });
    const { heard } = await follow();
    now.mockReturnValue(1_000_000 + THREAD_FULL_READ_MS);
    fetchMock.mockClear();
    signals.fire('bbb|thread:aaa_bbb');
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/conversations/aaa_bbb/messages?limit=50&changes=1']);
    now.mockRestore();
  });

  it('says a refusal (404: no such conversation for this viewer) as gone, and stops reading once stopped', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'No such conversation.' } }), { status: 404 }));
    const failed = vi.fn();
    followThread('aaa_bbb', vi.fn(), failed);
    await vi.waitFor(() => expect(failed).toHaveBeenCalled());
    expect(isGone(failed.mock.calls[0][0])).toBe(true);
    expect(isGone(new Error('offline'))).toBe(false);
  });

  it('carries a reply quote and a link preview, and drops a preview that is not safe to show', async () => {
    pages['limit=50&changes=1'] = page([
      { id: 'm3', text: 'bad', preview: { url: 'javascript:alert(1)', title: 'x' } },
      { id: 'm2', text: 'see https://example.com', preview: { url: 'https://example.com/', title: 'Example', image: 'https://evil.test/p.png' } },
      {
        id: 'm1',
        senderId: 'bbb',
        text: 'yes',
        replyTo: { id: 'm0', senderId: 'aaa', text: 'hello', cardRef: 'walk' },
        preview: { url: 'https://example.com/', title: 'Example', siteName: 'Ex', image: '/api/link-image?u=a&s=b' },
      },
    ]);
    const { heard } = await follow();
    const messages = heardMessages(heard).reverse();
    expect(messages[0].replyTo).toEqual({ id: 'm0', senderId: 'aaa', text: 'hello', cardRef: 'walk' });
    expect(messages[0].preview).toMatchObject({ title: 'Example', siteName: 'Ex', image: '/api/link-image?u=a&s=b' });
    expect(messages[1].preview).toEqual({ url: 'https://example.com/', title: 'Example' });
    expect(messages[2].preview).toBeUndefined();
  });

  it("reads a note as a note, and a kind it doesn't know as a plain message", async () => {
    pages['limit=50&changes=1'] = page([
      { id: 'later', text: 'hm', kind: 'sticker' },
      { id: 'note-1', text: 'Your walk stayed with me.', cardRef: 'walk', kind: 'note' },
    ]);
    const { heard } = await follow();
    const [later, note] = heardMessages(heard);
    expect(note).toMatchObject({ id: 'note-1', kind: 'note', cardRef: 'walk', text: 'Your walk stayed with me.' });
    expect(note.noteRef).toBeUndefined();
    expect('kind' in later).toBe(false);
  });

  it('reads a picture with its size, a sticker, an album picture, and anything written oddly as none', async () => {
    pages['limit=50&changes=1'] = page([
      { id: 'odd', text: '?', sticker: { pack: 'Twine!', id: 7 }, album: { id: 'a', index: 0, count: 2 } },
      { id: 'a2', image: { id: 'p2', width: 0, height: 0 }, album: { id: 'alb', index: 5, count: 2 } },
      { id: 'a1', text: 'two', image: { id: 'p1', width: 800, height: 1200 }, album: { id: 'alb', index: 0, count: 2 } },
      { id: 'r1', senderId: 'bbb', text: 'ha', replyTo: { id: 's1', senderId: 'aaa', text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } } },
      { id: 's1', text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } },
    ]);
    const { heard } = await follow();
    const [odd, a2, a1, reply, sticker] = heardMessages(heard);
    expect(sticker).toMatchObject({ text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } });
    expect(reply.replyTo).toEqual({ id: 's1', senderId: 'aaa', text: '〔貼圖：謝謝〕', cardRef: undefined, sticker: { pack: 'twine', id: 'thanks' } });
    expect(a1.image).toEqual({ id: 'p1', width: 800, height: 1200 });
    expect(a1.album).toEqual({ id: 'alb', index: 0, count: 2 });
    expect(a2.album).toBeUndefined();
    expect(odd.sticker).toBeUndefined();
    expect(odd.album).toBeUndefined();
  });

  it('reads reactions it knows, and an unsent message as nothing but its sender and time', async () => {
    pages['limit=50&changes=1'] = page([
      { id: 'r1', senderId: 'bbb', text: 'what?', replyTo: { id: 'u1', senderId: 'aaa', unsent: true, text: '' } },
      { id: 'u1', text: '', unsentAt: '2026-09-01T08:05:00.000000Z' },
      { id: 'm1', text: 'hi', reactions: { bbb: 'heart', aaa: 'angry', ddd: 'thumbs' } },
      { id: 'm0', text: 'plain', reactions: { bbb: 'nope' } },
    ]);
    const { heard } = await follow();
    const [reply, unsent, reacted, plain] = heardMessages(heard);
    expect(reacted.reactions).toEqual({ bbb: 'heart', ddd: 'thumbs' });
    expect(plain.reactions).toBeUndefined();
    expect(unsent).toEqual({ id: 'u1', senderId: 'aaa', text: '', sentAt: unsent.sentAt, unsentAt: unsent.unsentAt });
    expect(unsent.unsentAt!.toISOString()).toBe('2026-09-01T08:05:00.000Z');
    expect(reply.replyTo).toEqual({ id: 'u1', senderId: 'aaa', text: '', unsent: true });
  });

  it('reads the page before a message by its cursor, newest first; a failed read throws', async () => {
    pages['before=c1.m10&limit=100'] = page([
      { id: 'm9', text: 'older' },
      { id: 'm8', senderId: 'bbb', text: 'oldest' },
    ]);
    const older = await getMessagesBefore('aaa_bbb', 'c1.m10', 100);
    expect(older.map((e) => [e.message.id, e.message.text, e.cursor])).toEqual([
      ['m9', 'older', 'c1.m9'],
      ['m8', 'oldest', 'c1.m8'],
    ]);
    pages['before=c1.m1&limit=50'] = new Error('offline');
    await expect(getMessagesBefore('aaa_bbb', 'c1.m1', 50)).rejects.toMatchObject({ status: 503 });
  });

  it("lists the viewer's newest conversations with their own unread count, previews of a picture, a sticker, an album, an unsent one", async () => {
    const convo = (id: string, lastMessage: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
      id,
      participants: id.split('_'),
      otherId: 'aaa',
      other: null,
      unread: 2,
      lastMessage: { text: '', senderId: 'aaa', sentAt: '2026-09-01T08:05:00.000000Z', image: false, sticker: false, albumCount: null, unsent: false, ...lastMessage },
      request: null,
      createdAt: null,
      updatedAt: '2026-09-01T08:05:00.000000Z',
      originCardId: null,
      ...extra,
    });
    pages['/api/v1/conversations'] = {
      conversations: [
        convo('aaa_bbb', { text: 'and you?' }, { originCardId: 'walk' }),
        convo('bbb_ccc', { image: true, albumCount: 3 }),
        convo('bbb_ddd', { text: '〔貼圖〕', sticker: true }),
        convo('bbb_eee', { unsent: true }),
      ],
      nextPageToken: null,
    };
    const list = await listConversations();
    expect(list[0]).toMatchObject({ id: 'aaa_bbb', participants: ['aaa', 'bbb'], unread: { bbb: 2 }, lastMessage: { text: 'and you?' }, originCardId: 'walk' });
    expect(list[0].updatedAt.toISOString()).toBe('2026-09-01T08:05:00.000Z');
    expect(list[0].request).toBeUndefined();
    expect(list[1].lastMessage).toEqual({ text: '', senderId: 'aaa', sentAt: list[1].lastMessage!.sentAt, image: true, album: { count: 3 } });
    expect(list[2].lastMessage).toMatchObject({ sticker: true });
    expect(list[3].lastMessage).toMatchObject({ text: '', unsent: true });
  });

  it('carries the letter waiting in a conversation, and a conversation that is not there (404) as none', async () => {
    pages['/api/v1/conversations/aaa_bbb'] = {
      id: 'aaa_bbb',
      participants: ['aaa', 'bbb'],
      otherId: 'aaa',
      other: null,
      unread: 0,
      lastMessage: null,
      request: { from: 'aaa', cardId: 'walk', count: 2 },
      createdAt: null,
      updatedAt: null,
      originCardId: null,
    };
    expect((await getConversation('aaa_bbb'))?.request).toEqual({ from: 'aaa', cardId: 'walk', count: 2 });
    await expect(getConversation('bbb_zzz')).resolves.toBeNull();
  });

  it('marks a conversation read through the server and pulls the list again at once', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await readConversation('aaa_bbb');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/conversations/aaa_bbb/read');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(signals.poked).toContain('inbox');
  });
});

// Deleting from the browser went message by message through the rules — which
// is what let either person delete single messages. The server deletes it whole.
describe('deleteConversation', () => {
  it('reacts, takes a reaction back and unsends through the server, writing nothing itself', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await reactToMessage('aaa_bbb', 'm1', 'hug');
    await reactToMessage('aaa_bbb', 'm1', null);
    await unsendMessage('aaa_bbb', 'm1');
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body ?? null]);
    expect(calls).toEqual([
      ['/api/v1/conversations/aaa_bbb/messages/m1/reaction', 'PUT', JSON.stringify({ reaction: 'hug' })],
      ['/api/v1/conversations/aaa_bbb/messages/m1/reaction', 'DELETE', null],
      ['/api/v1/conversations/aaa_bbb/messages/m1/unsend', 'POST', null],
    ]);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer id-token');
    expect(writeBatch).not.toHaveBeenCalled();

    // A refusal (past 24 hours) comes back as the server's code.
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'conflict', message: 'This message can no longer be unsent.' } }), { status: 409 }));
    await expect(unsendMessage('aaa_bbb', 'm1')).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });

  it('asks the server to delete the whole conversation, and writes nothing itself', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteConversation('aaa_bbb');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/conversations/aaa_bbb');
    expect(init?.method).toBe('DELETE');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    expect(getDocs).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it("lets the server's refusal fail", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'not_found', message: 'No such conversation.' } }), { status: 404 }));
    await expect(deleteConversation('aaa_bbb')).rejects.toMatchObject({ status: 404 });
  });
});

import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import type { ChatImageStore } from '@/lib/storage/chatImages';
import { readChatImage } from './chatImages';

// Reading a sent picture (GET /api/v1/chat-images/{id}): its file is fetched
// beside the checks of who may see it, and handed out only once they pass
// (apiV1ChatImages.emulator.test.ts covers who may).

const at = (ms: number) => Timestamp.fromMillis(ms);
const docs = () => ({
  'chatImages/p1': { senderId: 'alice', to: 'bob', pair: 'alice_bob', key: 'chat/2026-10/p1.webp', thumbKey: 'chat/2026-10/p1-thumb.webp', messageId: 'm1' },
  'conversations/alice_bob': { participants: ['alice', 'bob'], createdAt: at(1) },
  'conversations/alice_bob/messages/m1': { senderId: 'alice', text: '', image: { id: 'p1', width: 10, height: 10 }, sentAt: at(2) },
});
const store = () => ({ get: vi.fn(async (key: string) => new TextEncoder().encode(key)) }) as unknown as ChatImageStore & { get: ReturnType<typeof vi.fn> };

describe('readChatImage', () => {
  it('fetches the file while the conversation and the message are still being read', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { db } = fakeAdminDb(docs(), { hold: (r) => (r === 'conversations/alice_bob' ? gate : undefined) });
    const files = store();
    const reading = readChatImage(db, files, 'bob', 'p1', 'thumb');
    await vi.waitFor(() => expect(files.get).toHaveBeenCalledWith('chat/2026-10/p1-thumb.webp'));
    release();
    expect(new TextDecoder().decode((await reading)!)).toBe('chat/2026-10/p1-thumb.webp');
  });

  it('hands out nothing it fetched for someone outside the conversation, or for a message gone', async () => {
    const files = store();
    expect(await readChatImage(fakeAdminDb(docs()).db, files, 'carol', 'p1', 'full')).toBeNull();
    const gone = docs() as Record<string, unknown>;
    delete gone['conversations/alice_bob/messages/m1'];
    expect(await readChatImage(fakeAdminDb(gone as ReturnType<typeof docs>).db, files, 'bob', 'p1', 'full')).toBeNull();
  });

  it('asks the store nothing for a picture never sent', async () => {
    const unsent = docs();
    delete (unsent['chatImages/p1'] as Partial<(typeof unsent)['chatImages/p1']>).messageId;
    const files = store();
    expect(await readChatImage(fakeAdminDb(unsent).db, files, 'bob', 'p1', 'full')).toBeNull();
    expect(files.get).not.toHaveBeenCalled();
  });
});

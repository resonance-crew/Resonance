import type { ConversationsData, ConversationsTxRepo } from '@/server/ports/repos/conversations';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `conversations` inside a memory transaction: filled by the lane that owns ports/repos/conversations.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function conversationsTx(_tx: MemoryTx): ConversationsTxRepo {
  return {};
}

/** `conversations` outside a transaction. */
export function conversationsData(_state: MemoryState): ConversationsData {
  return {};
}

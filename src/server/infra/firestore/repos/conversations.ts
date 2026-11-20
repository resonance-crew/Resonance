import type { Transaction } from 'firebase-admin/firestore';
import type { ConversationsData, ConversationsTxRepo } from '@/server/ports/repos/conversations';
import type { AdminDb } from '../db';

/** `conversations` inside a Firestore transaction: filled by the lane that owns ports/repos/conversations.ts. */
export function conversationsTx(_db: AdminDb, _tx: Transaction): ConversationsTxRepo {
  return {};
}

/** `conversations` outside a transaction. */
export function conversationsData(_db: AdminDb): ConversationsData {
  return {};
}

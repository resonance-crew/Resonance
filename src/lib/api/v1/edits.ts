import { applyCardEditIn, type ApplyEditResult } from '@/server/app/edits';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

export type { ApplyEditResult } from '@/server/app/edits';

/**
 * Apply your pending edit to a published card, when an editor (web or app)
 * saves changes: the working copy in `cards/{id}/edits/current` (which the
 * editor autosaves, see client/cardEdits.ts) becomes the live fields and the
 * buffer is deleted, in one transaction, so a reader never sees half of a
 * revision. `publishedAt` is left alone (an edit never re-dates a card) and
 * so is the slug (a card keeps its URL).
 *
 * The buffer is written by the owner from the client, and one written before
 * the rules held it to a card's limits could hold anything: only the
 * editable fields are copied, each checked for its type, and an edit past
 * those limits (lib/db/firestore/cardContent) is refused. A cover missing
 * from the buffer was removed: it is deleted from the card too.
 * Applying twice is harmless — with no buffer left, nothing changes.
 *
 * The buffer carries the card's visibility and byline too: a resonance it
 * makes public under its writer's name reaches the original's author as a
 * PATCH doing so would (`reaches`, see updateCard), and one it leaves
 * private, connections-only or anonymous is taken back in this transaction,
 * as a PATCH hiding it is (hiddenResonance). An edit that would leave
 * the card anonymous and for connections only is refused, as a PATCH is
 * (anonymousForConnections) — unless the card is that way already and the
 * edit keeps both as they are, so an older card stays editable. A card in
 * the trash takes no edit until it is restored (409, ./inTrash).
 *
 * The service is src/server/app/edits.ts applyCardEditIn; this is its legacy
 * facade on a given Firestore.
 */
export function applyCardEdit(db: AdminDb, uid: string, id: string): Promise<ApplyEditResult> {
  return applyCardEditIn(ctxFor(db), uid, id);
}

import { exportAccountJsonIn } from '@/server/app/accountExport';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * A downloadable copy of everything the user wrote — offered before account
 * deletion ("download a backup first") and useful on its own. Only the user's
 * own words: other people's messages and notes are not included. Beside them,
 * what the service records of them on its own (round 26): the cards they
 * resonated with, and how they read cards (the privacy policy says both).
 *
 * It is made as a stream of JSON text (exportAccountJson): the collections
 * are read a page at a time and written out as they come, so a prolific
 * writer's backup neither sits whole in the function's memory nor runs into
 * the platform's limit on a buffered response body (about 4.5 MB on Vercel).
 *
 * Legacy facades (任務 #3 Phase 1): the service is
 * `src/server/app/accountExport.ts`, its sections the registry's
 * (`EXPORT_SECTIONS` in `src/server/domain/schema/registry.ts`).
 */

/** A row as plain JSON (what firebase-admin's DocumentData was here: any field, any value). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = { [field: string]: any };

export interface AccountExport {
  exportedAt: string;
  profile: Plain | null;
  cards: Plain[];
  bookmarks: Plain[];
  thoughtMap: { nodes: Plain[]; edges: Plain[]; groups: Plain[] };
  notesSent: Plain[];
  messagesSent: Plain[];
  /** The cards they resonated with (共振, the tap) and haven't taken back: a title and a link each. */
  cardsResonated: Plain[];
  /** How they read cards (lib/api/v1/reading), each record as kept — 180 days past its last read. */
  reading: Plain[];
}

/**
 * The export, as JSON text in pieces (an AccountExport once joined). The
 * first piece comes after the profile is read, so a caller that waits for it
 * before answering turns a failure to start into an error status rather
 * than a broken file.
 */
export function exportAccountJson(db: AdminDb, uid: string, now = new Date()): AsyncGenerator<string> {
  return exportAccountJsonIn(ctxFor(db), uid, now);
}

/** The whole export as one object (what the streamed file parses to). */
export async function exportAccountData(db: AdminDb, uid: string, now = new Date()): Promise<AccountExport> {
  let text = '';
  for await (const piece of exportAccountJson(db, uid, now)) text += piece;
  return JSON.parse(text) as AccountExport;
}

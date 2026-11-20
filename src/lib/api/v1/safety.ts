import { createReportIn, reportCardIn } from '@/server/app/safety';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import type { CreateReportInput, ReportCardInput } from './schemas';

/**
 * Reports (檢舉), filed through the server. Each is the same `reports/{id}`
 * document the clients once wrote themselves (so `npm run moderation` reads
 * old and new alike), plus — written in the same batch — what it was about
 * as it stood at that moment, in server-only `reportEvidence/{id}`: the card,
 * the profile, or the reported message with the ones before it. Deleting or
 * editing the content afterwards (a card, a whole conversation) erases no
 * evidence. Evidence is purged with either person's account
 * (lib/account/deletion).
 */

// Legacy facades: the services are src/server/app/safety.ts, their
// Firestore code src/server/infra/firestore/repos/conversations.ts.

export { EVIDENCE, MESSAGE_CONTEXT } from '@/server/domain/conversations';

/**
 * A report on a card. The app never learns an anonymous card's author, so
 * the server fills targetUserId in. Only cards the reporter can see — a
 * hidden or unknown card is not_found, like reading it.
 */
export async function reportCard(db: AdminDb, reporterId: string, key: string, input: ReportCardInput): Promise<string> {
  return reportCardIn(ctxFor(db), reporterId, key, input);
}

/**
 * A report on a person (their profile) or on a message sent to the
 * reporter. A message must be in a conversation the reporter is part of, and
 * someone else's; its evidence is the message and up to
 * {@link MESSAGE_CONTEXT} before it, as they read then. Reporting the
 * conversation itself (`targetId` = its id) reports the other person, with
 * its latest messages. Either way the evidence also keeps what the
 * conversation's unsent messages said, while their copies are kept
 * (`unsent`, see ./messageActions unsentCopiesFor).
 */
export async function createReport(db: AdminDb, reporterId: string, input: CreateReportInput): Promise<string> {
  return createReportIn(ctxFor(db), reporterId, input);
}

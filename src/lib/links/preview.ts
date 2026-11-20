import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { unfurlMessageIn } from '@/server/app/links';
import type { LinkPreview } from '@/lib/db/types';
import type { PreviewFetch, PreviewMemo } from './pagePreview';

// What a link says about itself (./pagePreview: the fetch, the memory of what
// links said), and the message's unfurl — now src/server/app/links.ts
// `unfurlMessageIn`, this its legacy facade for the callers and suites that
// hand it a Firestore.
export {
  createPreviewMemo,
  fetchLinkPreview,
  REMEMBER_NO_PREVIEW_MS,
  REMEMBER_PREVIEW_MS,
  rememberedPreview,
  UNFURL_DEADLINE_MS,
  type LinkPreview,
  type PreviewFetch,
  type PreviewMemo,
} from './pagePreview';

/**
 * Give a message its link preview: re-read it, take the first link it holds
 * and write what the page says. Does nothing — and writes nothing — for a
 * message that is gone, already has a preview, or has no link the rules take,
 * and for a page that can't be fetched or has no title. Runs after the
 * response (`afterMessageSent`), never longer than UNFURL_DEADLINE_MS.
 */
export function unfurlMessage(
  db: AdminDb,
  conversationId: string,
  messageId: string,
  deps: { fetch?: PreviewFetch; signal?: AbortSignal; memo?: PreviewMemo } = {},
): Promise<LinkPreview | null> {
  return unfurlMessageIn(ctxFor(db), conversationId, messageId, deps);
}

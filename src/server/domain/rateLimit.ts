// Pure policy: the API's per-user budgets and how a fixed window is spent.
// No I/O — the RateLimiter adapters (src/server/infra/{firestore,memory}/rateLimit.ts)
// keep the windows, this decides what they become.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Per-user budgets for the endpoints that cost money (an LLM or image call)
 * or reach other people (a push, a note, a message). Generous for a person
 * writing, tight for a script: they exist to bound what one account can
 * spend or send, not to shape normal use.
 */
export const LIMITS = {
  /** /api/generate-image: an image generation and an AVIF encode each. */
  illustration: { max: 10, windowMs: DAY },
  /** /api/cards/insight and /api/cards/tags: one LLM call each. */
  insight: { max: 60, windowMs: HOUR },
  tags: { max: 60, windowMs: HOUR },
  /**
   * A story translated for its reader (POST /api/v1/cards/{id}/translation):
   * up to eight model calls for a long one. Only a new translation spends it —
   * one already kept for the card's words as they are is answered for free.
   */
  translate: { max: 40, windowMs: DAY },
  /** Publishing: a slug LLM call, the index, maybe a bell. */
  publish: { max: 30, windowMs: DAY },
  /**
   * Saving changes to a published card re-indexes it after the response (an
   * LLM call and embeddings). Over it the save goes through and the re-index
   * is skipped (the card keeps its last index, its visibility moved anyway).
   */
  reindex: { max: 50, windowMs: DAY },
  /**
   * Resonating with a card with one already written: rings the original
   * author once per card, and may connect the two — which taking it back
   * undoes, so a tight budget keeps that from becoming a way to reach anyone.
   */
  resonate: { max: 20, windowMs: DAY },
  /**
   * Links in stories the server fetches for their previews (lib/links/cardLinks),
   * charged per link not already stored, after publishing or saving an edit.
   * Over it, the previews are skipped, never the publish.
   */
  unfurl: { max: 100, windowMs: DAY },
  /** A note rings its recipient's phone. */
  note: { max: 20, windowMs: HOUR },
  /** Messages (only the first of a conversation rings). */
  message: { max: 300, windowMs: HOUR },
  /** Reacting to a message (PUT …/reaction): quiet — no bell, no push — but a write on the other person's thread. */
  react: { max: 300, windowMs: DAY },
  /** Unsending a message: rewrites it and its quotes, keeps a copy for moderation, and tells the recipient's phone. */
  unsend: { max: 100, windowMs: DAY },
  /** 停止分享 (DELETE …/shared-cards/{cardId}): rewrites the author's messages sharing a 私人卡 in one conversation. */
  stopShare: { max: 100, windowMs: DAY },
  report: { max: 20, windowMs: DAY },
  /**
   * A card's read counted (POST /api/v1/cards/{id}/read, lib/api/v1/cardReads): a write on someone else's card.
   * Once per reader, card and day already; this bounds a script walking every card. Over it reads go uncounted.
   */
  read: { max: 500, windowMs: DAY },
  /**
   * Resonating with a card (共振, the tap: PUT and DELETE …/tap, lib/api/v1/taps): it rings the card's author once
   * per reader and card ever, so taking it back and tapping again reaches no one twice — this bounds a script
   * tapping its way through every card.
   */
  tap: { max: 200, windowMs: DAY },
  /**
   * Reading reports (POST …/reading, lib/api/v1/reading): what a reader's page view read, kept for their own picks.
   * At most 20 a card a day are kept anyway; past this, reports go unkept, still 204.
   */
  readReport: { max: 2000, windowMs: DAY },
  /** /api/upload: files, and their bytes (see `weight`). */
  upload: { max: 50, windowMs: DAY },
  uploadBytes: { max: 200 * 1024 * 1024, windowMs: DAY },
  /**
   * Pictures sent in chat (POST /api/v1/chat-images): two re-encodes each, kept until the account goes;
   * their bytes apart from the covers' and stories' (a day of pictures never stops a cover).
   */
  chatImage: { max: 100, windowMs: DAY },
  chatImageBytes: { max: 300 * 1024 * 1024, windowMs: DAY },
  /** Accepting a legacy invite rings its sender. */
  invite: { max: 60, windowMs: HOUR },
  /** /api/account/export: reads everything the account ever wrote. */
  export: { max: 20, windowMs: DAY },
  /**
   * Moving a card to the trash (each POST …/trash) and each call emptying it
   * (DELETE /me/trash): a take-back, notes deleted, pages revalidated.
   */
  trash: { max: 200, windowMs: DAY },
  /**
   * Restoring a card from the trash — a budget of its own, so someone
   * clearing many cards never spends what their undo needs. A restore rings
   * at most once ever per reader and card, so it is no way to reach anyone.
   */
  restore: { max: 200, windowMs: DAY },
  /**
   * Phase 2 inbox (2a-inbox): marking a conversation read (POST …/read) and bell rows read (POST
   * /notifications/read) — the viewer's own counters, written each time a thread or the bell is opened.
   */
  markRead: { max: 3000, windowMs: DAY },
  /** Bookmarking a card and taking it back (PUT / DELETE /me/bookmarks/{cardId}): private, but a write each. */
  bookmark: { max: 1000, windowMs: DAY },
  /** Blocking and unblocking (PUT / DELETE /me/blocks/{uid}): blocking ends a connection and closes invites, in one transaction. */
  block: { max: 100, windowMs: DAY },
  /** Profiles by id (GET /users?ids=, 30 at a time): bounds a script walking the directory, never a reader's lists. */
  lookup: { max: 3000, windowMs: HOUR },
  /**
   * Thought map batches (POST /api/v1/me/thought-map/ops): one per drop, label or group change — a person
   * arranging their map for an hour stays far under it; a group dragged with its cards is one batch.
   */
  mapOps: { max: 3000, windowMs: HOUR },
  /** New drafts (POST /api/v1/cards): a writer starts a few a day. */
  draftCreate: { max: 300, windowMs: DAY },
  /**
   * Autosaves (PATCH …/draft and PUT …/edits/current, once a second or two while someone types): an hour of
   * steady writing is under 2000; the patch log keeps each applied one for 7 days.
   */
  draftSave: { max: 5000, windowMs: HOUR },
  /**
   * Phase 3 sessions (ADR 0004): trading a Firebase sign-in for Resonance's tokens (POST /api/v1/auth/exchange) —
   * an app does it once per sign-in, a few devices a few times an hour at most.
   */
  authExchange: { max: 60, windowMs: HOUR },
  /** Refreshing them (POST /api/v1/auth/refresh): every 15 minutes per signed-in device while it is in use. */
  authRefresh: { max: 400, windowMs: HOUR },
} as const satisfies Record<string, { max: number; windowMs: number }>;

export type Bucket = keyof typeof LIMITS;

/** A bucket and what to spend of it (1 when left out). */
export type Spend = readonly [bucket: Bucket, weight?: number];

/** A window as stored (`rateLimits/{uid}_{bucket}`). */
export interface RateWindow {
  userId: string;
  bucket: Bucket;
  /** When the window started (ms). */
  windowStart: number;
  /** What was spent in it. */
  used: number;
}

/** The stored row of `uid`'s `bucket` (one document per user and bucket). */
export function rateWindowId(uid: string, bucket: Bucket): string {
  return `${uid}_${bucket}`;
}

/**
 * Spend `spends` against the windows as read (`stored[i]` for `spends[i]`,
 * whatever was there: a field that isn't a number counts as no window), in
 * order: each spent while it has room, the first without room stopping the
 * rest. `writes` are the windows to store — those spent before the refusal
 * stay spent, as spending them one after another would.
 */
export function chargeWindows(
  uid: string,
  spends: readonly Spend[],
  stored: readonly ({ windowStart?: unknown; used?: unknown } | null | undefined)[],
  now: number,
): { allowed: boolean; writes: { index: number; window: RateWindow }[] } {
  const writes: { index: number; window: RateWindow }[] = [];
  for (const [i, [bucket, weight = 1]] of spends.entries()) {
    const { max, windowMs } = LIMITS[bucket];
    const start = stored[i]?.windowStart;
    const used = stored[i]?.used;
    const fresh = typeof start !== 'number' || typeof used !== 'number' || now - start >= windowMs;
    const next = (fresh ? 0 : (used as number)) + weight;
    if (next > max) return { allowed: false, writes };
    writes.push({ index: i, window: { userId: uid, bucket, windowStart: fresh ? now : (start as number), used: next } });
  }
  return { allowed: true, writes };
}

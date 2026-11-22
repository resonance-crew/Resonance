import { defineEntity, f, passthrough, type EntitySchema, type Upgrade } from './fields';

/**
 * The canonical storage schema of every registered entity (plan §4.1),
 * derived from what the Firestore code writes today: the repos under
 * src/server/infra/firestore, the client writers (src/lib/db/firestore/client),
 * firebase/firestore.rules and scripts/backfills. `registry.ts` gives each
 * entity its schema and version; `registry.test.ts` fails when one has none.
 *
 * `complete: false` marks a passthrough: its fields are only partly known
 * (legacy data nothing writes now, or free-form documents), and every field
 * it doesn't name is kept in the generic encoding. A complete entity's extra
 * fields are kept too, and listed (names only) in an export's manifest.
 *
 * Bump an entity's `version` when its canonical shape changes, with an
 * upgrade that reads the older shape as the new one.
 */

/** Upgrades on read: what a backfill or a reader's default did, done where the row is read. */
const missing = (field: string, value: unknown, source: string): Upgrade => ({
  what: `a missing \`${field}\` is ${JSON.stringify(value)}`,
  source,
  apply(row) {
    if (row[field] === undefined) row[field] = value;
  },
});

const linkPreview = f.obj({
  url: f.str(),
  title: f.str(),
  description: f.str(),
  siteName: f.str(),
  image: f.str(),
});
const media = f.obj({
  type: f.str(),
  url: f.str(),
  thumbUrl: f.str(),
  label: f.str(),
  key: f.str(),
  frame: f.obj({ cx: f.num(), cy: f.num(), zoom: f.num(), ar: f.num() }),
});
const sticker = f.obj({ pack: f.str(), id: f.str() });
const image = f.obj({ id: f.str(), width: f.num(), height: f.num() });
const album = f.obj({ id: f.str(), index: f.int(), count: f.int() });
const noteRef = f.obj({ cardId: f.str(), noteId: f.str() });

export const SCHEMAS = {
  // --- users ---
  users: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: {
      handle: f.str(),
      handleLower: f.str(),
      bio: f.str(),
      region: f.str(),
      primaryLocale: f.str(),
      autoTranslateTo: f.strs(),
      verified: f.bool(),
      phoneHash: f.str(),
      avatarSeed: f.str(),
      initials: f.str(),
      accentColor: f.str(),
      avatarUrl: f.str(),
      avatarKey: f.str(),
      joinedAt: f.time(),
      handleChangedAt: f.time(),
      // `hintsSeen.${key}` is written one key at a time.
      hintsSeen: f.map(f.int(), { child: 'user_hints' }),
    },
  }),
  bookmarks: defineEntity({
    version: 1,
    id: '<uid>/<card id>',
    complete: true,
    fields: { cardId: f.str(), createdAt: f.instant() },
  }),
  blocks: defineEntity({
    version: 1,
    id: '<uid>/<blocked uid>',
    complete: true,
    fields: { blockedUid: f.str(), createdAt: f.instant() },
  }),
  handles: defineEntity({
    version: 1,
    id: 'the pen name, trimmed and lower-cased',
    complete: true,
    fields: { uid: f.str(), handle: f.str(), reservedAt: f.time() },
  }),
  signals: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: {
      v: f.int(),
      at: f.time(),
      inbox: f.int(),
      bell: f.int(),
      graph: f.int(),
      map: f.int(),
      drafts: f.int(),
      // Incremented one pair at a time.
      threads: f.map(f.int(), { child: 'signal_threads' }),
    },
  }),
  handleHolds: defineEntity({
    version: 1,
    id: 'the pen name, lower-cased',
    complete: true,
    fields: { heldFor: f.str(), releasedAt: f.time() },
  }),

  // --- cards ---
  cards: defineEntity({
    version: 1,
    id: 'a 20-character id the client made',
    complete: true,
    fields: {
      authorId: f.str(),
      thoughtCore: f.str(),
      story: f.str(),
      tags: f.strs(),
      visibility: f.str(),
      anonymous: f.bool(),
      media,
      accentHue: f.num(),
      originalLocale: f.str(),
      referenceCardId: f.str(),
      // Always {} now; older cards hold a map of locales.
      translations: f.json(),
      publishedAt: f.instant(),
      readCount: f.int(),
      resonanceCount: f.int(),
      inviteCount: f.int(),
      createdAt: f.time(),
      updatedAt: f.instant(),
      draftRev: f.int(),
      slug: f.str(),
      excerpt: f.str(),
      readMinutes: f.int(),
      excerptAt: f.time(),
      thin: f.bool(),
      trashedAt: f.instant(),
      trashedFrom: f.obj({ visibility: f.str(), referenceCardId: f.str() }),
      trashedFor: f.str(),
      linkPreviews: f.list(linkPreview),
      linkPreviewsFor: f.strs(),
      summaryTranslations: f.json(),
      // Round 27: the passages a reader may pick after 共振 ({ of, items: [{ id, text }], model, at, failed? }), server-written.
      tapPassages: f.json(),
      signature: f.obj({
        coreInsight: f.str(),
        placeholder: f.bool(),
        contentHash: f.str(),
      }),
      indexedAt: f.time(),
      indexPendingAt: f.instant(),
    },
    upgrades: [
      missing('anonymous', false, 'scripts/backfills/anonymous.ts (the rules read it as data.get("anonymous", false))'),
      missing('publishedAt', null, 'src/server/infra/firestore/mapper.ts (a draft: publishedAt null)'),
    ],
  }),
  edits: defineEntity({
    version: 1,
    id: '<card id>/current',
    complete: true,
    fields: {
      thoughtCore: f.str(),
      story: f.str(),
      tags: f.strs(),
      visibility: f.str(),
      anonymous: f.bool(),
      media,
      accentHue: f.num(),
      rev: f.int(),
      authorId: f.str(),
      updatedAt: f.time(),
    },
  }),
  translations: defineEntity({
    version: 1,
    id: '<card id>/<target locale>',
    complete: true,
    fields: {
      title: f.str(),
      story: f.str(),
      hash: f.str(),
      model: f.str(),
      createdAt: f.time(),
    },
  }),
  draftLog: defineEntity({
    version: 1,
    id: '<card id>/<rev>',
    complete: true,
    fields: {
      authorId: f.str(),
      rev: f.int(),
      patch: f.obj({ set: f.json(), clear: f.strs() }),
      at: f.time(),
      expireAt: f.time(),
    },
  }),
  cardTombstones: defineEntity({
    version: 1,
    id: 'the card id',
    complete: true,
    fields: { deletedAt: f.time() },
  }),
  retiredSlugs: defineEntity({
    version: 1,
    id: 'the slug',
    complete: true,
    fields: { retiredAt: f.time() },
  }),
  // Legacy: nothing writes them now.
  cardLinks: passthrough(1, '<source card id>_<target card id>', {
    sourceCardId: f.str(),
    sourceAuthorId: f.str(),
    targetCardId: f.str(),
    targetAuthorId: f.str(),
    createdAt: f.instant(),
  }),

  // --- graph ---
  connections: passthrough(1, '<uid a>_<uid b>, sorted', {
    userIds: f.rel('users'),
    establishedAt: f.time(),
    inviteId: f.str(),
    muted: f.json(),
  }),
  connectionOrigins: defineEntity({
    version: 1,
    id: '<uid a>_<uid b>, sorted',
    complete: true,
    fields: {
      userIds: f.rel('users'),
      // Added and removed one key at a time.
      reasons: f.map(
        f.obj({
          kind: f.str(),
          by: f.str(),
          cardId: f.str(),
          originalId: f.str(),
          to: f.str(),
          inviteId: f.str(),
          at: f.time(),
        }),
        { child: 'connection_reasons' },
      ),
      resonanceCards: f.rel('cards'),
    },
  }),
  invites: passthrough(1, 'an automatic id (legacy)', {
    fromUserId: f.str(),
    toUserId: f.str(),
    message: f.str(),
    referenceCardId: f.str(),
    status: f.str(),
    createdAt: f.instant(),
    expiresAt: f.time(),
  }),
  letters: defineEntity({
    version: 1,
    id: '<from uid>_<to uid>',
    complete: true,
    fields: {
      from: f.str(),
      to: f.str(),
      count: f.int(),
      cardId: f.str(),
      at: f.time(),
    },
  }),
  resonances: passthrough(1, 'an automatic id (legacy)', {
    cardId: f.str(),
    userId: f.str(),
    note: f.str(),
    createdAt: f.time(),
  }),
  notes: defineEntity({
    version: 1,
    id: 'an automatic id',
    complete: true,
    fields: {
      cardId: f.str(),
      fromUserId: f.str(),
      toUserId: f.str(),
      withheldFor: f.str(),
      text: f.str(),
      readAt: f.time(),
      createdAt: f.instant(),
    },
  }),

  // --- conversations ---
  conversations: defineEntity({
    version: 1,
    id: '<uid a>_<uid b>, sorted',
    complete: true,
    fields: {
      participants: f.rel('users'),
      createdAt: f.instant(),
      updatedAt: f.instant(),
      lastMessage: f.obj({
        text: f.str(),
        senderId: f.str(),
        sentAt: f.instant(),
        image: f.bool(),
        sticker: f.bool(),
        album: f.obj({ count: f.int() }),
        unsent: f.bool(),
      }),
      // `unread.${uid}`: one key at a time.
      unread: f.map(f.int(), { child: 'conversation_unread' }),
      request: f.obj({
        from: f.str(),
        cardId: f.str(),
        count: f.int(),
        at: f.time(),
      }),
      originCardId: f.str(),
    },
  }),
  messages: defineEntity({
    version: 1,
    id: '<pair>/<message id>',
    complete: true,
    fields: {
      senderId: f.str(),
      text: f.str(),
      sentAt: f.instant(),
      cardRef: f.str(),
      kind: f.str(),
      privateShare: f.bool(),
      noteRef,
      replyTo: f.obj({
        id: f.str(),
        senderId: f.str(),
        text: f.str(),
        cardRef: f.str(),
        image: f.bool(),
        sticker,
        unsent: f.bool(),
      }),
      image,
      album,
      sticker,
      preview: linkPreview,
      // `reactions.${uid}`: one key at a time.
      reactions: f.map(f.str(), { child: 'message_reactions' }),
      unsentAt: f.time(),
    },
  }),
  unsentMessages: defineEntity({
    version: 1,
    id: '<pair>_<message id>',
    complete: true,
    fields: {
      pair: f.str(),
      messageId: f.str(),
      senderId: f.str(),
      to: f.str(),
      text: f.str(),
      cardRef: f.str(),
      noteRef,
      image,
      sticker,
      album,
      sentAt: f.time(),
      unsentAt: f.instant(),
    },
  }),
  privateShares: defineEntity({
    version: 1,
    id: 'the card id',
    complete: true,
    fields: { authorId: f.str(), at: f.time() },
  }),
  chatImages: defineEntity({
    version: 1,
    id: 'the picture id',
    complete: true,
    fields: {
      senderId: f.str(),
      to: f.str(),
      pair: f.str(),
      key: f.str(),
      thumbKey: f.str(),
      width: f.num(),
      height: f.num(),
      bytes: f.num(),
      animated: f.bool(),
      messageId: f.str(),
      unsentAt: f.instant(),
      createdAt: f.time(),
    },
  }),

  // --- taps, reading ---
  cardReads: defineEntity({
    version: 1,
    id: '<uid>_<card id>',
    complete: true,
    fields: {
      userId: f.str(),
      cardId: f.str(),
      day: f.str(),
      expireAt: f.time(),
    },
  }),
  resonanceTaps: defineEntity({
    version: 1,
    id: '<card id>_<uid>',
    complete: true,
    fields: {
      cardId: f.str(),
      userId: f.str(),
      on: f.bool(),
      at: f.instant(),
      rangAt: f.time(),
      // Round 27: which of the card's passages stayed with the reader ({ id, text }), null for none; gone with the tap.
      passage: f.json(),
    },
  }),
  readerSignals: defineEntity({
    version: 1,
    id: '<uid>_<card id>',
    complete: true,
    fields: {
      userId: f.str(),
      cardId: f.str(),
      firstAt: f.time(),
      lastAt: f.time(),
      days: f.strs(),
      sessions: f.list(
        f.obj({
          id: f.str(),
          active: f.num(),
          progress: f.num(),
          startedAt: f.time(),
          at: f.time(),
          endSeen: f.bool(),
          end: f.bool(),
          rereadable: f.bool(),
          reread: f.bool(),
        }),
      ),
      activeSeconds: f.num(),
      maxProgress: f.num(),
      reachedEndAt: f.instant(),
      rereads: f.int(),
      rereadAt: f.time(),
      shared: f.bool(),
      reportDay: f.str(),
      reportsToday: f.int(),
      expireAt: f.time(),
      expectedSeconds: f.num(),
    },
  }),

  // --- bell ---
  notifications: defineEntity({
    version: 1,
    id: 'an automatic id, or resonance_{from}_{card}, rtap_{card}_{day}, rsum_{card}_{day}',
    complete: true,
    fields: {
      userId: f.str(),
      type: f.str(),
      // By type; what a legacy type held passes in the generic encoding.
      payload: f.obj({
        noteId: f.str(),
        cardId: f.str(),
        inviteId: f.str(),
        fromUserId: f.str(),
        fromUserIds: f.rel('users'),
        fromHandle: f.str(),
        preview: f.str(),
        anonymous: f.bool(),
        readers: f.int(),
        reread: f.int(),
      }),
      readAt: f.time(),
      createdAt: f.instant(),
      pushedAt: f.time(),
    },
    upgrades: [missing('readAt', null, 'src/server/infra/firestore/mapper.ts (unread: readAt null)')],
  }),

  // --- thought map ---
  thoughtMaps: defineEntity({
    version: 1,
    id: 'the uid (the document holds no fields)',
    complete: true,
    fields: {},
  }),
  nodes: defineEntity({
    version: 1,
    id: '<uid>/<card id>',
    complete: true,
    fields: {
      cardId: f.str(),
      x: f.num(),
      y: f.num(),
      groupId: f.str(),
      createdAt: f.time(),
      updatedAt: f.time(),
    },
  }),
  edges: defineEntity({
    version: 1,
    id: '<uid>/<source card id>_<target card id>',
    complete: true,
    fields: {
      sourceCardId: f.str(),
      targetCardId: f.str(),
      label: f.str(),
      createdAt: f.time(),
    },
  }),
  groups: defineEntity({
    version: 1,
    id: '<uid>/<group id>',
    complete: true,
    fields: {
      title: f.str(),
      hue: f.num(),
      x: f.num(),
      y: f.num(),
      w: f.num(),
      h: f.num(),
      createdAt: f.time(),
    },
  }),

  // --- safety ---
  reports: defineEntity({
    version: 1,
    id: 'an automatic id',
    complete: true,
    fields: {
      reporterId: f.str(),
      targetType: f.str(),
      targetId: f.str(),
      targetUserId: f.str(),
      reason: f.str(),
      detail: f.str(),
      contextId: f.str(),
      createdAt: f.instant(),
      status: f.str(),
      resolvedAt: f.time(),
      resolutionNote: f.str(),
    },
  }),
  // A frozen copy of what was reported (its times are ISO strings already): never rewritten.
  reportEvidence: defineEntity({
    version: 1,
    id: 'the report id',
    complete: true,
    fields: {
      reportId: f.str(),
      reporterId: f.str(),
      targetUserId: f.str(),
      targetType: f.str(),
      targetId: f.str(),
      capturedAt: f.time(),
      card: f.json(),
      profile: f.json(),
      message: f.json(),
      context: f.json(),
      unsent: f.json(),
      senderHandle: f.str(),
    },
  }),
  accountDeletions: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: {
      uid: f.str(),
      requestedAt: f.time(),
      purgeAfter: f.time(),
      triedAt: f.time(),
    },
  }),

  // --- infra ---
  // `windowStart` is epoch milliseconds, not a time.
  rateLimits: defineEntity({
    version: 1,
    id: '<uid>_<bucket>',
    complete: true,
    fields: {
      userId: f.str(),
      bucket: f.str(),
      windowStart: f.num(),
      used: f.num(),
    },
  }),
  // The outbox (Phase 3, OUTBOX_ENABLED): which row a transaction wrote, never its content; `version` is µs since
  // the epoch (the order the replicator applies), `at` when it was recorded.
  changeLog: defineEntity({
    version: 1,
    id: '<ulid>',
    complete: true,
    fields: {
      entity: f.str(),
      id: f.str(),
      op: f.str(),
      version: f.num(),
      at: f.time(),
      done: f.bool(),
      expireAt: f.time(),
      userIds: f.rel('users'),
    },
  }),
  // Phase 3 sessions (ADR 0004): which identity provider's subject is which account — today `firebase_<uid>` → the
  // same uid, never renumbered.
  identities: defineEntity({
    version: 1,
    id: '<provider>_<subject>',
    complete: true,
    fields: { userId: f.str(), provider: f.str(), subject: f.str(), createdAt: f.time() },
  }),
  // A refresh token, kept only as its SHA-256 (the id): single use, its family revoked on reuse; `expiresAt` is its TTL.
  refreshTokens: defineEntity({
    version: 1,
    id: '<sha256 hex>',
    complete: true,
    fields: { uid: f.str(), family: f.str(), authTime: f.num(), createdAt: f.time(), expiresAt: f.time(), usedAt: f.time() },
  }),
  quotas: passthrough(1, '<uid>_<yyyy-mm-dd> (legacy)', {
    userId: f.str(),
    inviteCount: f.int(),
  }),
  uploads: defineEntity({
    version: 1,
    id: "the key's file name without its extension",
    complete: true,
    fields: {
      ownerId: f.str(),
      key: f.str(),
      kind: f.str(),
      createdAt: f.time(),
      rekeyedFrom: f.str(),
      oldDeletedAt: f.time(),
    },
  }),
  // storage, recommendPool, landingFilm: three documents of three shapes.
  config: passthrough(1, 'storage | recommendPool | landingFilm', {
    at: f.time(),
    until: f.time(),
    embedModel: f.str(),
  }),

  // --- push ---
  devices: defineEntity({
    version: 1,
    id: 'the installation id',
    complete: true,
    fields: {
      userId: f.str(),
      token: f.str(),
      platform: f.str(),
      transport: f.str(),
      locale: f.str(),
      appVersion: f.str(),
      capabilities: f.strs(),
      timeZone: f.str(),
      updatedAt: f.time(),
    },
  }),
  notificationSettings: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: {
      picks: f.bool(),
      connectionCards: f.bool(),
      messages: f.bool(),
      resonanceTaps: f.bool(),
      picksConsentAt: f.time(),
      connectionCardsConsentAt: f.time(),
      updatedAt: f.time(),
    },
  }),
  pickPushes: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: {
      recent: f.list(f.obj({ cardId: f.str(), at: f.time() })),
      sentAt: f.list(f.time()),
      updatedAt: f.time(),
    },
  }),
  connectionCardPushes: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: { day: f.str(), cards: f.rel('cards'), updatedAt: f.time() },
  }),

  // --- recommend ---
  cardVectors: defineEntity({
    version: 1,
    id: '<card id>__<channel>__<part>',
    complete: true,
    fields: {
      cardId: f.str(),
      authorId: f.str(),
      visibility: f.str(),
      channel: f.str(),
      part: f.int(),
      vector: f.vector(),
      embedModel: f.str(),
      insightScore: f.num(),
      coreInsight: f.str(),
      situation: f.str(),
      lifeDomain: f.str(),
      span: f.str(),
      updatedAt: f.time(),
    },
  }),
  cardSignatures: defineEntity({
    version: 1,
    id: 'the card id',
    complete: true,
    fields: {
      insights: f.json(),
      throughLine: f.str(),
      moodOnly: f.bool(),
      insightScore: f.num(),
      lifeDomain: f.str(),
      emotionalRegister: f.str(),
      placeholder: f.bool(),
      authorId: f.str(),
      version: f.int(),
      model: f.str(),
      embedModel: f.str(),
      listedForStrangers: f.bool(),
      templated: f.bool(),
      rewritten: f.bool(),
      error: f.str(),
      usage: f.obj({
        input: f.num(),
        output: f.num(),
        reasoning: f.num(),
        embed: f.num(),
      }),
      updatedAt: f.time(),
      failedAt: f.time(),
    },
  }),
  // Older documents hold `centroids` and `summaries`.
  userProfiles: passthrough(1, 'the uid', {
    taste: f.list(f.obj({ cardId: f.str(), w: f.num() })),
    against: f.list(f.obj({ cardId: f.str(), w: f.num() })),
    updatedAt: f.time(),
  }),
  recommendations: defineEntity({
    version: 1,
    id: 'the uid',
    complete: true,
    fields: {
      date: f.str(),
      items: f.list(
        f.obj({
          cardId: f.str(),
          channel: f.str(),
          reason: f.str(),
          score: f.num(),
        }),
      ),
      partial: f.bool(),
      coldStart: f.bool(),
      warm: f.bool(),
      askedOn: f.str(),
      generatedAt: f.time(),
      leaseUntil: f.time(),
      failedAt: f.time(),
      // Written whole, not a key at a time.
      shown: f.map(f.obj({ n: f.int(), lastDay: f.str() })),
    },
  }),
} as const satisfies Record<string, EntitySchema>;

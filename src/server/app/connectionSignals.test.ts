import { describe, expect, it } from 'vitest';
import { memoryCtx, type MemoryCtx } from '@/server/infra/memory/ctx';
import { purgeAccountDataIn } from './account';
import { deleteCardIn, updateCardIn } from './cards';
import { sendMessageIn, sendNoteIn } from './conversations';
import { applyCardEditIn } from './edits';
import { acceptInviteIn } from './invites';
import { resonateWithIn, tryReachResonanceIn, unresonateIn } from './resonate';
import { blockIn } from './social';
import { restoreCardIn, trashCardIn } from './trash';

// Every write that makes or ends a connection touches `graph` for both people (signals/{uid}): what lets
// GET /me/connections answer an early 304 while the viewer's `graph` counter stands (lib/api/v1/signalTag), and
// the web skip a safety pull when it hasn't moved. A property, on the memory context: each write below changes
// the `connections` table, and every pair that appeared or went has both its people touched with `graph` — the
// purged account's own signal never (nothing of theirs may be written back after their roots go). A connection
// deleted by an older client's own rule (firestore.rules connections delete) can't be told: the early 304's ten
// minutes (EARLY_MAX_AGE_S) and the web's whole read as often (LIST_FULL_READ_MS) bound how late it shows.

const DAY = 24 * 3600_000;
const profile = (handle: string) => ({ handle, handleLower: handle, initials: handle.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 200)' });

function world(): MemoryCtx {
  const ctx = memoryCtx();
  const now = ctx.clock.now();
  const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
    authorId,
    thoughtCore: 'A walk after the rain',
    story: 'words '.repeat(50),
    tags: [],
    visibility: 'public',
    anonymous: false,
    publishedAt: new Date(now - DAY),
    trashedAt: null,
    ...extra,
  });
  ctx.state.seed('users', { alice: profile('alice'), bob: profile('bob'), carol: profile('carol') });
  ctx.state.seed('cards', { walk: card('alice'), reply: card('bob'), carols: card('carol') });
  return ctx;
}

const pairsOf = (ctx: MemoryCtx) => new Map(ctx.state.rows('connections').map(({ id, row }) => [id, (row.userIds as string[]) ?? []]));

/** Bob's card `reply` answers Alice's `walk`: the two connected. */
const resonated = async (ctx: MemoryCtx) => {
  await resonateWithIn(ctx, 'bob', 'walk', 'reply');
};

/** Carol's letter to Bob waits for its answer (not connected). */
const letterWaiting = (ctx: MemoryCtx) => {
  ctx.state.put('letters', 'carol_bob', { from: 'carol', to: 'bob', count: 1 });
  ctx.state.put('conversations', 'bob_carol', {
    participants: ['bob', 'carol'],
    request: { from: 'carol', cardId: 'reply', count: 1 },
    createdAt: new Date(),
    updatedAt: new Date(),
    unread: { bob: 1, carol: 0 },
  });
};

interface Case {
  name: string;
  before?: (ctx: MemoryCtx) => unknown;
  write: (ctx: MemoryCtx) => Promise<unknown>;
  /** Whose own signal this write may never touch. */
  purged?: string;
}

const cases: Case[] = [
  { name: 'a resonance with a named card', write: resonated },
  { name: 'the resonance taken back', before: resonated, write: (ctx) => unresonateIn(ctx, 'bob', 'walk', 'reply') },
  { name: 'the resonance moved to the trash', before: resonated, write: (ctx) => trashCardIn(ctx, 'bob', 'reply') },
  {
    name: 'a resonance restored from the trash, reaching its original again',
    before: (ctx) =>
      ctx.state.put('cards', 'reply', {
        ...ctx.state.get('cards', 'reply'),
        visibility: 'private',
        trashedAt: new Date(ctx.clock.now() - 60_000),
        trashedFrom: { visibility: 'public', referenceCardId: 'walk' },
      }),
    write: (ctx) => restoreCardIn(ctx, 'bob', 'reply'),
  },
  { name: 'the resonance deleted for good', before: resonated, write: (ctx) => deleteCardIn(ctx, 'bob', 'reply') },
  { name: 'the resonance made private', before: resonated, write: (ctx) => updateCardIn(ctx, 'bob', 'reply', { visibility: 'private' }) },
  {
    name: 'an edit applied that makes the resonance private',
    before: async (ctx) => {
      await resonated(ctx);
      const card = ctx.state.get('cards', 'reply')!;
      ctx.state.put('cards/reply/edits', 'current', { authorId: 'bob', thoughtCore: card.thoughtCore, story: card.story, tags: [], visibility: 'private', anonymous: false });
    },
    write: (ctx) => applyCardEditIn(ctx, 'bob', 'reply'),
  },
  {
    name: 'a published resonance reaching its original (publish, an audience change)',
    before: (ctx) => ctx.state.put('cards', 'reply', { ...ctx.state.get('cards', 'reply'), referenceCardId: 'walk' }),
    write: (ctx) => tryReachResonanceIn(ctx, 'bob', 'reply'),
  },
  { name: 'a letter answered by a note', before: letterWaiting, write: (ctx) => sendNoteIn(ctx, 'bob', { cardId: 'carols', text: 'Thank you for this' }) },
  { name: 'a letter answered by a message', before: letterWaiting, write: (ctx) => sendMessageIn(ctx, 'bob', { to: 'carol', text: 'Thank you' }) },
  {
    name: 'an invite accepted',
    before: (ctx) => ctx.state.put('invites', 'inv', { fromUserId: 'carol', toUserId: 'bob', status: 'pending', expiresAt: new Date(ctx.clock.now() + DAY) }),
    write: (ctx) => acceptInviteIn(ctx, 'bob', 'inv'),
  },
  { name: 'a block ending a connection', before: resonated, write: (ctx) => blockIn(ctx, 'alice', 'bob') },
  { name: 'an account purged', before: resonated, write: (ctx) => purgeAccountDataIn(ctx, 'alice'), purged: 'alice' },
];

describe('every write that makes or ends a connection touches both people’s graph', () => {
  for (const c of cases) {
    it(c.name, async () => {
      const ctx = world();
      await c.before?.(ctx);
      const was = pairsOf(ctx);
      ctx.realtime.touches.length = 0;
      await c.write(ctx);
      const now = pairsOf(ctx);
      const changed = [...[...now].filter(([id]) => !was.has(id)), ...[...was].filter(([id]) => !now.has(id))];
      // The case changes the table (else it proves nothing).
      expect(changed.length).toBeGreaterThan(0);
      const graphed = new Set(ctx.realtime.touches.filter((t) => t.topics.includes('graph')).map((t) => t.uid));
      for (const [, people] of changed) {
        for (const uid of people) {
          if (uid === c.purged) expect(graphed.has(uid)).toBe(false);
          else expect(graphed.has(uid), `${uid} touched with graph`).toBe(true);
        }
      }
      if (c.purged) expect(ctx.realtime.touches.some((t) => t.uid === c.purged)).toBe(false);
    });
  }
});

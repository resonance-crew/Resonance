import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { AuthUser } from '@/lib/auth/types';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { deleteCardIn, refreshPages, updateCardIn } from './cards';
import { applyCardEditIn } from './edits';
import { createProfileIn, updateProfileIn } from './profile';
import { publishCardIn } from './publish';
import { emptyTrashIn, purgeExpiredTrashIn, restoreCardIn, trashCardIn } from './trash';

// The cards write side's services on the memory context — no Firestore at all: a draft published (once,
// then again without re-dating it), its pending edit applied, made anonymous (its pages dropped after the
// response), moved to the trash (an anonymous card's notes, taps and reading records gone with it), restored
// as it was, and deleted for good (a tombstone, its slug retired, its notes and vectors gone); the trash
// emptied and purged by its own clock; a pen name taken, renamed and held.

const DAY = 86_400_000;
const story = 'The rain stopped and the street went on talking to itself for a while, softly.';
const draft = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: 'A quiet night',
  story,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: null,
  ...extra,
});
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiFailure) return e.code;
    throw e;
  }
  return 'resolved';
};

describe('a card from draft to deleted, on memory', () => {
  it('publishes, applies an edit, turns anonymous, goes to the trash and back, and leaves a tombstone', async () => {
    const ctx = memoryCtx();
    ctx.state.seed('users', { alice: { handle: 'alice', handleLower: 'alice', initials: 'AL' } });
    ctx.state.seed('cards', { c1: draft('alice') });
    const slugBase = async (title: string) => title.toLowerCase().replace(/\s+/g, '-');

    // Someone else's card is as absent as a missing one.
    expect(await failure(publishCardIn(ctx, 'bob', 'c1', slugBase))).toBe('not_found');

    const published = await publishCardIn(ctx, 'alice', 'c1', slugBase);
    expect(published).toMatchObject({ id: 'c1', slug: 'a-quiet-night', firstPublish: true, notificationId: null, pendingSlug: null });
    const first = ctx.state.get('cards', 'c1')!;
    expect(first.publishedAt).toBeInstanceOf(Date);
    expect(first).toMatchObject({ slug: 'a-quiet-night', anonymous: false, readMinutes: 1 });
    // Publishing again never re-dates it.
    expect((await publishCardIn(ctx, 'alice', 'c1', slugBase)).firstPublish).toBe(false);
    expect((ctx.state.get('cards', 'c1')!.publishedAt as Date).getTime()).toBe((first.publishedAt as Date).getTime());

    // The editor's working copy becomes the card, the buffer goes; applying twice changes nothing.
    ctx.state.put('cards/c1/edits', 'current', { authorId: 'alice', thoughtCore: 'A quieter night', story: `${story} Then it rained again.`, tags: ['rain', 7], visibility: 'public', anonymous: false });
    const applied = await applyCardEditIn(ctx, 'alice', 'c1');
    expect(applied).toEqual({ id: 'c1', slug: 'a-quiet-night', applied: true, stale: ['/card/c1', '/card/a-quiet-night', '/'], reaches: false, movedTo: null });
    expect(ctx.state.get('cards', 'c1')).toMatchObject({ thoughtCore: 'A quieter night', tags: ['rain'], slug: 'a-quiet-night' });
    expect(ctx.state.get('cards/c1/edits', 'current')).toBeNull();
    expect((await applyCardEditIn(ctx, 'alice', 'c1')).applied).toBe(false);

    // Made anonymous: its pages are dropped after the response, never its author's profile.
    ctx.state.put('cards/c1/edits', 'current', { authorId: 'alice', thoughtCore: 'Later', visibility: 'public' });
    const anonymous = await updateCardIn(ctx, 'alice', 'c1', { anonymous: true });
    expect(anonymous.stale).toEqual(['/card/c1', '/card/a-quiet-night', '/']);
    expect(anonymous.card).toMatchObject({ id: 'c1', anonymous: true });
    expect(ctx.state.get('cards/c1/edits', 'current')).toMatchObject({ anonymous: true });
    refreshPages(ctx, anonymous.stale);
    expect(ctx.pages.dropped).toEqual([]);
    await ctx.later.flush();
    expect(ctx.pages.dropped).toEqual(['/card/c1', '/card/a-quiet-night', '/']);
    expect(ctx.pages.dropped.some((p) => p.startsWith('/u/'))).toBe(false);
    // Anonymous and for connections only is refused.
    expect(await failure(updateCardIn(ctx, 'alice', 'c1', { visibility: 'connections' }))).toBe('invalid_request');

    // Into the trash: private, its notes and taps gone with it (it is anonymous), the first move's time kept.
    ctx.state.seed('notes', { n1: { cardId: 'c1', text: 'hi' } });
    ctx.state.seed('resonanceTaps', { c1_bob: { cardId: 'c1', userId: 'bob', on: true } });
    const trashed = await trashCardIn(ctx, 'alice', 'c1');
    expect(trashed.changed).toBe(true);
    expect(ctx.state.get('cards', 'c1')).toMatchObject({ visibility: 'private', trashedFrom: { visibility: 'public', referenceCardId: null } });
    expect((ctx.state.get('cards', 'c1')!.trashedAt as Date).getTime()).toBe(ctx.clock.now());
    expect(ctx.state.rows('notes')).toEqual([]);
    expect(ctx.state.rows('resonanceTaps')).toEqual([]);
    ctx.clock.advance(DAY);
    expect((await trashCardIn(ctx, 'alice', 'c1')).changed).toBe(false);
    expect((ctx.state.get('cards', 'c1')!.trashedAt as Date).getTime()).toBe(ctx.clock.now() - DAY);
    // In the trash, it takes no change until it is restored.
    expect(await failure(publishCardIn(ctx, 'alice', 'c1', slugBase))).toBe('conflict');
    expect(await failure(updateCardIn(ctx, 'alice', 'c1', { anonymous: false }))).toBe('conflict');

    // Restored as it was.
    const restored = await restoreCardIn(ctx, 'alice', 'c1');
    expect(restored).toMatchObject({ changed: true, droppedResonance: false, notificationId: null });
    const back = ctx.state.get('cards', 'c1')!;
    expect(back).toMatchObject({ visibility: 'public', anonymous: true, slug: 'a-quiet-night' });
    expect(back).not.toHaveProperty('trashedAt');
    expect((await restoreCardIn(ctx, 'alice', 'c1')).changed).toBe(false);

    // Deleted for good: a tombstone (when, never who), its slug retired, its edit and vectors gone.
    ctx.state.seed('notes', { n2: { cardId: 'c1', text: 'again' } });
    expect(await failure(deleteCardIn(ctx, 'alice', 'c1', { onlyIfTrashed: true }))).toBe('conflict');
    const deleted = await deleteCardIn(ctx, 'alice', 'c1');
    expect(deleted).toEqual({ deleted: true, stale: ['/card/c1', '/card/a-quiet-night', '/'] });
    expect(ctx.state.get('cards', 'c1')).toBeNull();
    expect(ctx.state.get('cards/c1/edits', 'current')).toBeNull();
    expect(Object.keys(ctx.state.get('cardTombstones', 'c1') ?? {})).toEqual(['deletedAt']);
    expect(ctx.state.get('retiredSlugs', 'a-quiet-night')).not.toBeNull();
    expect(ctx.state.rows('notes')).toEqual([]);
    expect(await failure(deleteCardIn(ctx, 'alice', 'c1'))).toBe('not_found');
  });

  it('empties the trash up to its cut-off and purges what has been there thirty days, each by its own time', async () => {
    const ctx = memoryCtx();
    const now = ctx.clock.now();
    ctx.state.seed('cards', {
      old: draft('alice', { publishedAt: new Date(now - 60 * DAY), trashedAt: new Date(now - 31 * DAY), slug: 'old-one' }),
      recent: draft('alice', { trashedAt: new Date(now - DAY) }),
      bobs: draft('bob', { trashedAt: new Date(now - 40 * DAY) }),
      live: draft('alice'),
    });
    const purged = await purgeExpiredTrashIn(ctx, { budgetMs: 60_000 });
    expect(purged).toMatchObject({ purged: 2, skipped: 0, failed: 0, deferred: 0 });
    expect(ctx.state.get('cardTombstones', 'old')).not.toBeNull();
    expect(ctx.state.get('cardTombstones', 'bobs')).not.toBeNull();
    expect(ctx.state.get('cards', 'recent')).not.toBeNull();

    const emptied = await emptyTrashIn(ctx, 'alice');
    expect(emptied).toMatchObject({ deleted: 1, remaining: 0, before: new Date(now).toISOString() });
    expect(ctx.state.get('cards', 'recent')).toBeNull();
    expect(ctx.state.get('cards', 'live')).not.toBeNull();
  });
});

describe('a pen name, on memory', () => {
  const nina: AuthUser = { id: 'nina', email: 'nina@example.test' } as AuthUser;

  it('is taken once, renamed into a hold its owner may take back, and refused to anyone else', async () => {
    const ctx = memoryCtx();
    const made = await createProfileIn(ctx, nina, { handle: 'Nina', region: 'TW', primaryLocale: 'en' });
    expect(made).toMatchObject({ created: true, named: true, me: { handle: 'Nina', initials: 'NI' } });
    expect(ctx.state.get('handles', 'nina')).toMatchObject({ uid: 'nina' });
    // No empty phone hash on a new profile (audit L10).
    expect(ctx.state.get('users', 'nina')).not.toHaveProperty('phoneHash');
    // Idempotent.
    expect(await createProfileIn(ctx, nina, { handle: 'Other', region: 'JP', primaryLocale: 'en' })).toMatchObject({ created: false, named: false });
    // Someone else can't take it, in any case.
    expect(await failure(createProfileIn(ctx, { ...nina, id: 'omar' }, { handle: 'NINA', region: 'TW', primaryLocale: 'en' }))).toBe('conflict');

    const renamed = await updateProfileIn(ctx, 'nina', { handle: 'Dawn', bio: 'hello' });
    expect(renamed).toMatchObject({ previousHandle: 'Nina', me: { handle: 'Dawn' } });
    expect(ctx.state.get('handles', 'nina')).toBeNull();
    expect(ctx.state.get('handleHolds', 'nina')).toMatchObject({ heldFor: 'nina' });
    expect(await failure(createProfileIn(ctx, { ...nina, id: 'omar' }, { handle: 'nina', region: 'TW', primaryLocale: 'en' }))).toBe('conflict');
    expect((await updateProfileIn(ctx, 'nina', { handle: 'Nina' })).previousHandle).toBe('Dawn');
    expect(ctx.state.get('handleHolds', 'nina')).toBeNull();
  });
});

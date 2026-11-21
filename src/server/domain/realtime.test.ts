import { describe, expect, it } from 'vitest';
import { touchesFor } from './realtime';

// Who a committed write's signal reaches (signals/{uid}): the table Phase 2's
// clients rely on to refetch — and, for safety, whom it must never reach.

describe('touchesFor', () => {
  it('a conversation event touches both participants: inbox and their thread', () => {
    expect(touchesFor([{ kind: 'conversation', a: 'bob', b: 'alice' }])).toEqual([
      { uid: 'bob', topics: ['inbox', { thread: 'alice_bob' }] },
      { uid: 'alice', topics: ['inbox', { thread: 'alice_bob' }] },
    ]);
  });

  it('a named note touches both: the writer their inbox and thread, the author inbox, bell and thread', () => {
    expect(touchesFor([{ kind: 'note', from: 'bob', to: 'alice', anonymousCard: false }])).toEqual([
      { uid: 'bob', topics: ['inbox', { thread: 'alice_bob' }] },
      { uid: 'alice', topics: ['inbox', 'bell', { thread: 'alice_bob' }] },
    ]);
  });

  it('a note on an anonymous card touches only its author, and nothing names the pair', () => {
    const touches = touchesFor([{ kind: 'note', from: 'bob', to: 'alice', anonymousCard: true }]);
    expect(touches).toEqual([{ uid: 'alice', topics: ['inbox', 'bell'] }]);
    // The writer is told nothing, and no thread key ties the two together.
    expect(JSON.stringify(touches)).not.toContain('bob');
  });

  it('bell, graph, map and drafts touch only whom they name', () => {
    expect(touchesFor([{ kind: 'bell', to: 'alice' }])).toEqual([{ uid: 'alice', topics: ['bell'] }]);
    expect(touchesFor([{ kind: 'graph', uids: ['alice', 'bob'] }])).toEqual([
      { uid: 'alice', topics: ['graph'] },
      { uid: 'bob', topics: ['graph'] },
    ]);
    expect(touchesFor([{ kind: 'map', uid: 'alice' }, { kind: 'drafts', uid: 'alice' }])).toEqual([{ uid: 'alice', topics: ['map', 'drafts'] }]);
  });

  it('merges events: each person once, each topic once', () => {
    expect(
      touchesFor([
        { kind: 'graph', uids: ['alice', 'bob'] },
        { kind: 'graph', uids: ['bob'] },
        { kind: 'bell', to: 'bob' },
      ]),
    ).toEqual([
      { uid: 'alice', topics: ['graph'] },
      { uid: 'bob', topics: ['graph', 'bell'] },
    ]);
  });

  it('drops ids that cannot name an account, and a conversation or note with oneself', () => {
    expect(touchesFor([{ kind: 'graph', uids: ['', 'a/b', 'ok'] }])).toEqual([{ uid: 'ok', topics: ['graph'] }]);
    expect(touchesFor([{ kind: 'conversation', a: 'alice', b: 'alice' }])).toEqual([]);
    expect(touchesFor([{ kind: 'note', from: 'alice', to: 'alice', anonymousCard: false }])).toEqual([]);
  });
});

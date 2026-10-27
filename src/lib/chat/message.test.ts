import { describe, expect, it } from 'vitest';
import {
  UNSEND_WINDOW_MS,
  canReact,
  canReply,
  canUnsend,
  changeShown,
  quoteOf,
  reactionCounts,
  withLocalChange,
  type ChatMessage,
} from './message';

// Round 16: what a message offers (reactions, unsend) and how the thread draws
// the viewer's own changes until the server's copy says the same.

const sentAt = new Date('2026-10-27T08:00:00Z');
const msg = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  key: 'm1',
  senderId: 'me',
  text: 'hello',
  sentAt,
  delivery: 'delivered',
  ...extra,
});

describe('reactionCounts', () => {
  it("lists each distinct reaction once, in the tray's order, with how many gave it and whether the viewer did", () => {
    expect(reactionCounts({ them: 'thumbs', me: 'heart' }, 'me')).toEqual([
      { id: 'heart', count: 1, mine: true },
      { id: 'thumbs', count: 1, mine: false },
    ]);
    expect(reactionCounts({ them: 'laugh', me: 'laugh' }, 'me')).toEqual([{ id: 'laugh', count: 2, mine: true }]);
    expect(reactionCounts(undefined, 'me')).toEqual([]);
  });
});

describe('what a message offers', () => {
  const now = sentAt.getTime() + 60_000;

  it('lets the viewer unsend their own plain message, delivered, within 24 hours — nothing else', () => {
    expect(canUnsend(msg(), 'me', now)).toBe(true);
    expect(canUnsend(msg(), 'me', sentAt.getTime() + UNSEND_WINDOW_MS)).toBe(true);
    expect(canUnsend(msg(), 'me', sentAt.getTime() + UNSEND_WINDOW_MS + 1)).toBe(false);
    expect(canUnsend(msg({ senderId: 'them' }), 'me', now)).toBe(false);
    expect(canUnsend(msg({ kind: 'note' }), 'me', now)).toBe(false);
    expect(canUnsend(msg({ delivery: 'sending' }), 'me', now)).toBe(false);
    expect(canUnsend(msg({ delivery: 'failed' }), 'me', now)).toBe(false);
    expect(canUnsend(msg({ unsentAt: new Date() }), 'me', now)).toBe(false);
  });

  it('takes reactions and replies on a delivered message only, never on one unsent', () => {
    expect([canReact(msg()), canReply(msg())]).toEqual([true, true]);
    expect([canReact(msg({ delivery: 'sending' })), canReply(msg({ delivery: 'sending' }))]).toEqual([false, false]);
    expect([canReact(msg({ unsentAt: new Date() })), canReply(msg({ unsentAt: new Date() }))]).toEqual([false, false]);
  });

  it('quotes an unsent message as the server does: who sent it, and that it was unsent', () => {
    expect(quoteOf(msg({ text: '', unsentAt: new Date() }))).toEqual({ id: 'm1', senderId: 'me', text: '', unsent: true });
  });
});

describe('the viewer’s own changes, until the server shows them', () => {
  it('puts the viewer’s reaction in place of the stored one, or takes it away', () => {
    const m = msg({ reactions: { them: 'hug', me: 'heart' } });
    expect(withLocalChange(m, 'me', { reaction: 'laugh' }).reactions).toEqual({ them: 'hug', me: 'laugh' });
    expect(withLocalChange(m, 'me', { reaction: null }).reactions).toEqual({ them: 'hug' });
    expect(withLocalChange(msg(), 'me', { reaction: null }).reactions).toBeUndefined();
    // No change: the very same message (the row isn't drawn again).
    expect(withLocalChange(m, 'me', undefined)).toBe(m);
  });

  it('draws an unsent message as nothing but who sent it and when', () => {
    const m = msg({ cardRef: 'c1', reactions: { them: 'hug' }, replyTo: { id: 'm0', senderId: 'them', text: 'hi' } });
    const unsent = withLocalChange(m, 'me', { unsent: true });
    expect(unsent).toMatchObject({ id: 'm1', key: 'm1', senderId: 'me', text: '', sentAt });
    expect(unsent.unsentAt).toBeInstanceOf(Date);
    expect(unsent.cardRef).toBeUndefined();
    expect(unsent.reactions).toBeUndefined();
    expect(unsent.replyTo).toBeUndefined();
  });

  it('knows when the server’s copy says the same, so the change can go', () => {
    expect(changeShown(msg({ reactions: { me: 'heart' } }), 'me', { reaction: 'heart' })).toBe(true);
    expect(changeShown(msg(), 'me', { reaction: 'heart' })).toBe(false);
    expect(changeShown(msg(), 'me', { reaction: null })).toBe(true);
    expect(changeShown(msg({ unsentAt: new Date() }), 'me', { reaction: 'heart' })).toBe(true);
    expect(changeShown(msg(), 'me', { unsent: true })).toBe(false);
    expect(changeShown(msg({ unsentAt: new Date() }), 'me', { unsent: true })).toBe(true);
  });
});

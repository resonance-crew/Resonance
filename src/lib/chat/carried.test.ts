import { describe, it, expect } from 'vitest';
import type { Card, Message, User } from '@/lib/db/types';
import { messageCard } from './cardLink';
import { carriedOf, carriedWords, type CardLookup } from './carried';

/** What a bubble carries besides its words — the twin of the apps' Carried. */
const card = { id: 'c1', slug: 'rain-walk', thoughtCore: 'A walk' } as Card;
const author = { id: 'bob', handle: 'bob' } as User;
const ready: CardLookup = { status: 'ready', card, author };
const msg = (extra: Partial<Message>): Message => ({ id: 'm1', senderId: 'bob', text: '', sentAt: new Date(0), ...extra });
const preview = { url: 'https://resonance.channel/zh-TW/card/rain-walk', title: '一場雨後的散步' };

describe('carriedOf', () => {
  it('draws someone else’s 私人卡 only while their message shares it (停止分享 takes the marker away)', () => {
    const kept = { ...card, authorId: 'bob', publishedAt: null, visibility: 'private' } as Card;
    const lookup: CardLookup = { status: 'ready', card: kept, author };
    const sharing = msg({ cardRef: 'c1', privateShare: true });
    expect(carriedOf(sharing, messageCard(sharing, []), lookup, 'alice')).toMatchObject({ kind: 'card' });
    // Stopped: the card the thread holds reads as one Alice can't see — and a message that was only it, as nothing.
    const stopped = msg({ cardRef: 'c1' });
    expect(carriedOf(stopped, messageCard(stopped, []), lookup, 'alice')).toEqual({ kind: 'nothing' });
    expect(carriedOf({ ...stopped, text: '你看' }, messageCard(stopped, []), lookup, 'alice')).toEqual({ kind: 'words' });
    // Its author still has their own card; a published public card needs no pass.
    expect(carriedOf(stopped, messageCard(stopped, []), lookup, 'bob')).toMatchObject({ kind: 'card' });
    const open: CardLookup = { status: 'ready', card: { ...kept, publishedAt: new Date(0), visibility: 'public' } as Card, author };
    expect(carriedOf(stopped, messageCard(stopped, []), open, 'alice')).toMatchObject({ kind: 'card' });
  });

  it('carries the card once it is read, its stand-in while it is', () => {
    const m = msg({ cardRef: 'c1' });
    const shared = messageCard(m, []);
    expect(carriedOf(m, shared, ready)).toMatchObject({ kind: 'card', card, author });
    expect(carriedOf(m, shared, { status: 'loading' })).toEqual({ kind: 'cardLoading', shared });
  });

  it('falls back when the viewer can’t see the card: a link is a link again, a shared card shows nothing of itself', () => {
    const link = msg({ text: 'https://resonance.channel/zh-TW/card/rain-walk', preview });
    expect(carriedOf(link, messageCard(link, []), { status: 'error' })).toEqual({ kind: 'preview', preview });
    const linkWithoutPreview = msg({ text: '看這篇 https://resonance.channel/card/rain-walk' });
    expect(carriedOf(linkWithoutPreview, messageCard(linkWithoutPreview, []), { status: 'error' })).toEqual({ kind: 'words' });
    // Shared alone and not the viewer's to see: nothing at all.
    const alone = msg({ cardRef: 'gone' });
    expect(carriedOf(alone, messageCard(alone, []), { status: 'error' })).toEqual({ kind: 'nothing' });
    // Shared with words: the words.
    const withWords = msg({ cardRef: 'gone', text: '你看' });
    expect(carriedOf(withWords, messageCard(withWords, []), { status: 'error' })).toEqual({ kind: 'words' });
  });

  it('carries a link’s preview, or the words alone', () => {
    const p = { url: 'https://example.com/post', title: 'A post' };
    expect(carriedOf(msg({ text: 'https://example.com/post', preview: p }), null, null)).toEqual({ kind: 'preview', preview: p });
    expect(carriedOf(msg({ text: 'hi' }), null, null)).toEqual({ kind: 'words' });
    // A reply to a note with no words still has its quote line to show.
    expect(carriedOf(msg({ noteRef: { cardId: 'c', noteId: 'n' } }), null, null)).toEqual({ kind: 'words' });
  });
});

describe('carriedWords', () => {
  it('leaves out a card link that is all the message says (the card stands for it)', () => {
    const only = msg({ text: '  https://resonance.channel/zh-TW/card/rain-walk \n' });
    expect(carriedWords(only, carriedOf(only, messageCard(only, []), ready))).toBe('');
    const said = msg({ text: '這篇是你寫的嗎 https://resonance.channel/zh-TW/card/rain-walk' });
    expect(carriedWords(said, carriedOf(said, messageCard(said, []), ready))).toBe(said.text);
    // Back to a plain link, the link is words again.
    expect(carriedWords(only, carriedOf(only, messageCard(only, []), { status: 'error' }))).toBe(only.text);
    const shared = msg({ cardRef: 'c1', text: '我昨天寫的' });
    expect(carriedWords(shared, carriedOf(shared, messageCard(shared, []), ready))).toBe('我昨天寫的');
  });
});

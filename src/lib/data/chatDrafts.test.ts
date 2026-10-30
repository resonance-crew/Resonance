// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DRAFT_DAYS,
  MAX_DRAFTS,
  chatDraftsOf,
  forgetAllChatDrafts,
  forgetChatDraft,
  keepChatDraft,
  readChatDraft,
  useChatDrafts,
} from './chatDrafts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 31, 8);

afterEach(() => window.localStorage.clear());

// Round 22 §4.4: what is being written to someone is kept in this browser per account and conversation — its
// words, the message it answers, the note it quotes and the card riding with it — until it is sent or emptied.
describe('chat drafts', () => {
  it('keeps a conversation’s draft under its account and pair, and brings it back whole', () => {
    keepChatDraft('me', 'alice_me', {
      text: '那天其實我也走過那條河堤',
      replyTo: { id: 'm7', senderId: 'alice', text: 'rain' },
      noteRef: { cardId: 'c1', noteId: 'n1' },
      cardId: 'walk',
    }, NOW);
    expect(window.localStorage.getItem('resonance:draft:me:alice_me')).toBeTruthy();
    expect(readChatDraft('me', 'alice_me', NOW)).toEqual({
      text: '那天其實我也走過那條河堤',
      replyTo: { id: 'm7', senderId: 'alice', text: 'rain' },
      noteRef: { cardId: 'c1', noteId: 'n1' },
      cardId: 'walk',
      at: NOW,
    });
    // Another account, another conversation: none.
    expect(readChatDraft('carol', 'alice_me', NOW)).toBeNull();
    expect(readChatDraft('me', 'bob_me', NOW)).toBeNull();
  });

  it('forgets a draft emptied, sent or deleted, and every one on signing out', () => {
    keepChatDraft('me', 'alice_me', { text: 'hi' }, NOW);
    keepChatDraft('me', 'alice_me', { text: '   ' }, NOW);
    expect(readChatDraft('me', 'alice_me', NOW)).toBeNull();

    keepChatDraft('me', 'alice_me', { text: 'hi' }, NOW);
    forgetChatDraft('me', 'alice_me');
    expect(readChatDraft('me', 'alice_me', NOW)).toBeNull();

    keepChatDraft('me', 'alice_me', { text: 'a' }, NOW);
    keepChatDraft('carol', 'bob_carol', { text: 'b' }, NOW);
    window.localStorage.setItem('other:key', 'stays');
    forgetAllChatDrafts();
    expect(chatDraftsOf('me', NOW)).toEqual({});
    expect(chatDraftsOf('carol', NOW)).toEqual({});
    expect(window.localStorage.getItem('other:key')).toBe('stays');
  });

  it('keeps a reply alone as a draft, and drops one past its days or written oddly', () => {
    keepChatDraft('me', 'alice_me', { text: '', replyTo: { id: 'm7', senderId: 'alice', text: 'rain' } }, NOW);
    expect(readChatDraft('me', 'alice_me', NOW)?.replyTo?.id).toBe('m7');
    expect(readChatDraft('me', 'alice_me', NOW + DRAFT_DAYS * DAY)).toBeNull();
    window.localStorage.setItem('resonance:draft:me:bob_me', '{not json');
    expect(readChatDraft('me', 'bob_me', NOW)).toBeNull();
  });

  it('keeps at most fifty per account, the oldest going first', () => {
    for (let i = 0; i < MAX_DRAFTS + 3; i++) keepChatDraft('me', `p${i}_me`, { text: `draft ${i}` }, NOW + i);
    const kept = chatDraftsOf('me', NOW + 100);
    expect(Object.keys(kept)).toHaveLength(MAX_DRAFTS);
    expect(kept.p0_me).toBeUndefined();
    expect(kept[`p${MAX_DRAFTS + 2}_me`]?.text).toBe(`draft ${MAX_DRAFTS + 2}`);
  });

  it('tells the conversation list as drafts change', () => {
    const { result } = renderHook(() => useChatDrafts('me'));
    expect(result.current).toEqual({});
    act(() => keepChatDraft('me', 'alice_me', { text: 'hello' }));
    expect(result.current.alice_me?.text).toBe('hello');
    act(() => forgetChatDraft('me', 'alice_me'));
    expect(result.current).toEqual({});
  });
});

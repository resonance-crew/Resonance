import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/chat/message';
import { messageMenuItems, type MenuLabels } from './threadActions';

// A held message's actions (round 16 §3; review S8): the link's two rows wear glyphs of their own — never 複製's
// twin two rows apart — and lead the list when the finger was on the link.
const labels: MenuLabels = {
  reply: 'Reply',
  copy: 'Copy',
  openLink: 'Open link',
  copyLink: 'Copy link',
  unsend: 'Unsend',
  stopSharing: 'Stop sharing',
  report: 'Report',
  retry: 'Retry',
  discard: 'Delete',
};
const theirs: ChatMessage = { id: 'm1', key: 'm1', senderId: 'alice', text: 'read https://example.com/a', sentAt: new Date(), delivery: 'delivered' };
const link = { url: 'https://example.com/a', host: 'example.com', suspicious: false };
const rows = (onLink: boolean) => messageMenuItems(theirs, link, labels, { withReply: true, viewerId: 'me', onLink }).map((it) => [it.key, it.icon]);

describe('messageMenuItems', () => {
  it('opens a link with the arrow and copies it with the link glyph, Copy keeping its own', () => {
    expect(rows(false)).toEqual([
      ['reply', 'reply'],
      ['copy', 'copy'],
      ['open', 'arrow-right'],
      ['copyLink', 'link'],
      ['report', 'flag'],
    ]);
  });

  // Round 22: a sticker is replied to, reacted to, unsent and reported as any message — but its words are the
  // fallback older builds show, nothing to copy.
  it('offers no Copy on a sticker', () => {
    const sticker: ChatMessage = { ...theirs, text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } };
    expect(messageMenuItems(sticker, null, labels, { withReply: true, viewerId: 'me' }).map((it) => it.key)).toEqual(['reply', 'report']);
  });

  it('leads with the link’s rows when the press was on the link', () => {
    expect(rows(true).map(([key]) => key)).toEqual(['open', 'copyLink', 'reply', 'copy', 'report']);
  });

  it('offers 停止分享 on the viewer’s own message sharing their 私人卡, at any age, and on nothing else', () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-10-28T00:00:00Z').getTime();
    const keys = (m: Partial<ChatMessage>) =>
      messageMenuItems({ ...theirs, text: '', senderId: 'me', sentAt: old, ...m }, null, labels, { withReply: true, viewerId: 'me', now }).map(
        (it) => it.key,
      );
    expect(keys({ cardRef: 'c1', privateShare: true })).toEqual(['reply', 'stopSharing']);
    // Stopped already, a card no longer shared, someone else's, not yet delivered, unsent: no row.
    expect(keys({ cardRef: 'c1' })).toEqual(['reply']);
    expect(keys({ cardRef: 'c1', privateShare: true, senderId: 'alice' })).not.toContain('stopSharing');
    expect(keys({ cardRef: 'c1', privateShare: true, delivery: 'sending' })).not.toContain('stopSharing');
    expect(keys({ cardRef: 'c1', privateShare: true, unsentAt: old })).toEqual([]);
  });
});

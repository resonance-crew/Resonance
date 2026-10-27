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

  it('leads with the link’s rows when the press was on the link', () => {
    expect(rows(true).map(([key]) => key)).toEqual(['open', 'copyLink', 'reply', 'copy', 'report']);
  });
});

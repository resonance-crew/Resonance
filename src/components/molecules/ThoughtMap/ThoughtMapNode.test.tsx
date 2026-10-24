// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@/../test/render';
import { Icon, type IconName } from '@/components/atoms/Icon';
import type { Card } from '@/lib/db/types';
import { ThoughtMapNode } from './ThoughtMapNode';

const base: Card = {
  id: 'n1',
  authorId: 'me',
  thoughtCore: 'A card on the map',
  story: 'Its story.',
  tags: ['walk'],
  originalLocale: 'en',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-01-01'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
};

const noop = () => {};

/** The glyph a node's meta row starts with, as markup. */
function metaGlyph(card: Card): string {
  const { container, unmount } = render(
    <ThoughtMapNode
      card={card}
      x={0}
      y={0}
      selected={false}
      linkTarget={false}
      onPointerDown={noop}
      onStartLink={noop}
      onOpen={noop}
      onRemove={noop}
      linkHandleLabel="Link"
      openLabel="Open"
      removeLabel="Remove"
    />,
  );
  const tags = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === '#walk')!;
  const glyph = tags.previousElementSibling!.innerHTML;
  unmount();
  return glyph;
}

function glyph(name: IconName): string {
  const { container, unmount } = render(<Icon name={name} size={14} />);
  const html = container.firstElementChild!.innerHTML;
  unmount();
  return html;
}

// Round 9 §1 / C4: every 私人卡 — never published, or published and kept private — wears the lock on the
// map; no pen for a draft any more.
describe('ThoughtMapNode', () => {
  it('wears the lock on a 私人卡, published or not', () => {
    expect(metaGlyph({ ...base, publishedAt: null })).toBe(glyph('lock'));
    expect(metaGlyph({ ...base, publishedAt: null, visibility: 'public' })).not.toBe(glyph('pen'));
    expect(metaGlyph({ ...base, visibility: 'private' })).toBe(glyph('lock'));
  });

  it('wears its audience on a card readers have', () => {
    expect(metaGlyph(base)).toBe(glyph('globe'));
    expect(metaGlyph({ ...base, visibility: 'connections' })).toBe(glyph('users'));
  });
});

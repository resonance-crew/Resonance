// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@/../test/render';
import { Icon, type IconName } from '@/components/atoms/Icon';
import type { Card } from '@/lib/db/types';
import { NODE_H, NODE_W } from './mapMath';
import { nearestSide, ThoughtMapNode } from './ThoughtMapNode';

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

describe('a card on the map, picked', () => {
  function pickedNode(props: Partial<Parameters<typeof ThoughtMapNode>[0]> = {}) {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    const onStartLink = vi.fn();
    const view = render(
      <ThoughtMapNode
        card={base}
        x={0}
        y={0}
        selected
        linkTarget={false}
        onPointerDown={noop}
        onStartLink={onStartLink}
        onOpen={onOpen}
        onRemove={onRemove}
        linkHandleLabel="Link"
        openLabel="Open"
        removeLabel="Remove"
        {...props}
      />,
    );
    return { ...view, onOpen, onRemove, onStartLink, node: view.container.querySelector<HTMLElement>('[data-card-id]')! };
  }

  // The owner, 2026-10-29: 開啟 and 移除 side by side on the tab, one was tapped for the other.
  it('keeps 開啟 on its tab and 移除 in the opposite corner, apart', () => {
    const { onOpen, onRemove } = pickedNode();
    const open = screen.getByRole('button', { name: 'Open' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(open.parentElement!.contains(remove)).toBe(false);
    fireEvent.click(open);
    fireEvent.click(remove);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows neither while it is being dragged', () => {
    pickedNode({ dragging: true });
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('can start an arrow from each of its four sides', () => {
    const { container, onStartLink } = pickedNode();
    const handles = Array.from(container.querySelectorAll<HTMLElement>('button[data-side]'));
    expect(handles.map((h) => h.dataset.side).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    handles.forEach((h) => fireEvent.pointerDown(h));
    expect(onStartLink).toHaveBeenCalledTimes(4);
  });

  it('notes the side the mouse is nearest, in the card’s own units at any zoom', () => {
    const { node } = pickedNode();
    expect(node.dataset.near).toBe('right');
    // Drawn at half size by the camera.
    node.getBoundingClientRect = () => ({ left: 100, top: 50, width: NODE_W / 2, height: NODE_H / 2 }) as DOMRect;
    fireEvent.pointerMove(node, { pointerType: 'mouse', clientX: 104, clientY: 50 + NODE_H / 4 });
    expect(node.dataset.near).toBe('left');
    fireEvent.pointerMove(node, { pointerType: 'mouse', clientX: 100 + NODE_W / 4, clientY: 52 });
    expect(node.dataset.near).toBe('top');
    // A finger leaves it be: on a touch screen every handle shows.
    fireEvent.pointerMove(node, { pointerType: 'touch', clientX: 100 + NODE_W / 4, clientY: 50 + NODE_H / 2 - 1 });
    expect(node.dataset.near).toBe('top');
  });
});

describe('nearestSide', () => {
  it('picks the closest edge, and keeps it past the edge (on its handle)', () => {
    expect(nearestSide(5, NODE_H / 2)).toBe('left');
    expect(nearestSide(NODE_W - 5, NODE_H / 2)).toBe('right');
    expect(nearestSide(NODE_W / 2, 5)).toBe('top');
    expect(nearestSide(NODE_W / 2, NODE_H - 5)).toBe('bottom');
    expect(nearestSide(NODE_W + 10, 20)).toBe('right');
    expect(nearestSide(NODE_W / 2, -12)).toBe('top');
  });
});

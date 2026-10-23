// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderWithIntl, fireEvent, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import type { Card } from '@/lib/db/types';
import type { MyThoughtMap } from '@/lib/data/hooks';

vi.mock('@/lib/db/firestore/client/thoughtMap', () => ({
  addMapNode: vi.fn().mockResolvedValue(undefined),
  createMapEdge: vi.fn(),
  createMapGroup: vi.fn(),
  edgeId: (a: string, b: string) => `${a}_${b}`,
  moveMapNode: vi.fn().mockResolvedValue(undefined),
  moveMapNodes: vi.fn(),
  removeMapEdge: vi.fn(),
  removeMapGroup: vi.fn(),
  removeMapNode: vi.fn().mockResolvedValue(undefined),
  setNodeGroups: vi.fn(),
  updateMapEdgeLabel: vi.fn(),
  updateMapGroup: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { removeMapNode } from '@/lib/db/firestore/client/thoughtMap';
import { ThoughtMapCanvas } from './ThoughtMapCanvas';

// Delete/Backspace takes the selected card off the map — a key meant for the
// map only. In the workspace the card's story sits beside the map, open in the
// pane (contenteditable): Backspace typed there once took that card off the
// map for good, the keystroke never reaching the story.

mockElementSize(900, 600);

function card(id: string): Card {
  return {
    id,
    authorId: 'me',
    thoughtCore: `Core of ${id}`,
    story: 'story',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
  };
}

const at = new Date('2026-01-01');
function mapData(): MyThoughtMap {
  return {
    nodes: [
      { id: 'a', cardId: 'a', x: 0, y: 0, createdAt: at, updatedAt: at },
      { id: 'b', cardId: 'b', x: 600, y: 0, createdAt: at, updatedAt: at },
    ],
    edges: [],
    groups: [],
    cards: { a: card('a'), b: card('b') },
    resonatedIds: [],
  };
}

/** The map beside a pane holding the open card's story (contenteditable) and a button. */
function workspace() {
  const pane = document.createElement('section');
  pane.dataset.pane = '';
  pane.innerHTML = '<div contenteditable="true" tabindex="0"><p>The story, open beside the map</p></div><button type="button">Next</button>';
  document.body.appendChild(pane);
  renderWithIntl(<ThoughtMapCanvas data={mapData()} style={{ height: 600 }} />);
  const node = (id: string) => (screen.queryByText(`Core of ${id}`)?.closest('[role="button"]') ?? null) as HTMLElement | null;
  const viewport = node('a')!.closest('div[style*="translate("]')!.parentElement as HTMLElement;
  /** A press on the card that moves nothing: it is selected. */
  const select = (id: string) => {
    fireEvent.pointerDown(node(id)!, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
  };
  const story = pane.querySelector('[contenteditable]') as HTMLElement;
  const next = pane.querySelector('button') as HTMLButtonElement;
  return { node, select, story, next };
}

/** Backspace pressed on `target` (the page itself when none): whether the page let it through. */
const backspace = (target: Element = document.body) => fireEvent.keyDown(target, { key: 'Backspace' });

afterEach(() => {
  vi.clearAllMocks();
  document.querySelectorAll('section[data-pane]').forEach((pane) => pane.remove());
});

describe('ThoughtMapCanvas — a key for the map', () => {
  it('takes the selected card off the map on Backspace, the focus on the map or nowhere', () => {
    const { node, select } = workspace();
    act(() => select('a'));
    expect(backspace()).toBe(false);
    expect(removeMapNode).toHaveBeenCalledWith('a');
    expect(node('a')).toBeNull();
    expect(node('b')).not.toBeNull();
  });

  it('never takes a card off the map for Backspace typed into the story beside it — the editor gets the key', () => {
    const { node, select, story } = workspace();
    act(() => select('a'));
    story.focus();
    expect(backspace(story)).toBe(true);
    expect(fireEvent.keyDown(story, { key: 'Delete' })).toBe(true);
    expect(removeMapNode).not.toHaveBeenCalled();
    expect(node('a')).not.toBeNull();
  });

  it('never acts on a key pressed on a control off the map', () => {
    const { node, select, next } = workspace();
    act(() => select('a'));
    next.focus();
    expect(backspace(next)).toBe(true);
    expect(removeMapNode).not.toHaveBeenCalled();
    expect(node('a')).not.toBeNull();
  });

  it('lets go of the selection at a press off the map, so a later key removes nothing', () => {
    const { node, select, story } = workspace();
    act(() => select('a'));
    fireEvent.pointerDown(story, { button: 0, pointerId: 2 });
    expect(backspace()).toBe(true);
    expect(removeMapNode).not.toHaveBeenCalled();
    expect(node('a')).not.toBeNull();
  });
});

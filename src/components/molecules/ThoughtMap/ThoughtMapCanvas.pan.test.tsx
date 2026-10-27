// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Profiler } from 'react';
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
  removeMapNode: vi.fn(),
  setNodeGroups: vi.fn(),
  updateMapEdgeLabel: vi.fn(),
  updateMapGroup: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// The drawing itself is pure; count how often the board redraws it.
vi.mock('@/lib/design/wobRect', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/design/wobRect')>();
  return { ...mod, wobRect: vi.fn(mod.wobRect) };
});
vi.mock('@/lib/design/edgePath', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/design/edgePath')>();
  return { ...mod, organicEdgePath: vi.fn(mod.organicEdgePath) };
});

import { wobRect } from '@/lib/design/wobRect';
import { organicEdgePath } from '@/lib/design/edgePath';
import { mapDots } from './mapDots';
import { ThoughtMapCanvas } from './ThoughtMapCanvas';

// The board and its controls draw only once measured.
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
  const ids = ['a', 'b', 'c', 'd'];
  return {
    nodes: ids.map((id, i) => ({ id, cardId: id, x: i * 260, y: (i % 2) * 210, createdAt: at, updatedAt: at })),
    edges: [
      { id: 'a_b', sourceCardId: 'a', targetCardId: 'b', label: 'then', createdAt: at },
      { id: 'b_c', sourceCardId: 'b', targetCardId: 'c', label: '', createdAt: at },
      { id: 'c_d', sourceCardId: 'c', targetCardId: 'd', label: '', createdAt: at },
    ],
    groups: [{ id: 'g', title: 'Mornings', hue: 88, x: -20, y: -50, w: 560, h: 300, createdAt: at }],
    cards: Object.fromEntries(ids.map((id) => [id, card(id)])),
    resonatedIds: [],
  };
}

function board(cardId = 'a') {
  renderWithIntl(<ThoughtMapCanvas data={mapData()} style={{ height: 600 }} />);
  const node = screen.getByText(`Core of ${cardId}`).closest('[role="button"]') as HTMLElement;
  const world = node.closest('[data-moving], div[style*="translate("]') as HTMLElement;
  const viewport = world.parentElement as HTMLElement;
  return { node, world, viewport };
}

afterEach(() => vi.clearAllMocks());

describe('ThoughtMapCanvas panning', () => {
  // A pan is a new camera on every pointer move. The cards, arrows and regions
  // are all in world coordinates, so a pan must move the world, not redraw a
  // hundred hand-drawn cards (each a wobbly outline) and their arrows per frame.
  it('moves the world without redrawing a card, an arrow or a region', () => {
    const { world, viewport } = board();
    vi.mocked(wobRect).mockClear();
    vi.mocked(organicEdgePath).mockClear();
    const before = world.style.transform;

    fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    for (let i = 1; i <= 8; i++) {
      fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 400 + i * 12, clientY: 300 + i * 7 });
    }
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 496, clientY: 356 });

    expect(world.style.transform).not.toBe(before);
    expect(organicEdgePath).not.toHaveBeenCalled();
    expect(wobRect).not.toHaveBeenCalled();
  });

  // The dot grid used to be the viewport's background, re-positioned on every
  // frame (a repaint of the whole viewport). It is its own layer now, shifted
  // within one period of its coarsest lattice (mapDots.ts): the same dots, at
  // the same places, for any camera — the sparse ones never hop between tiles.
  it('keeps the dotted paper on the camera, moved within one period', () => {
    const { world, viewport } = board();
    const dots = viewport.firstElementChild as HTMLElement;
    expect(dots).not.toBe(world);

    const check = () => {
      const [, cx, cy, s] = world.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/)!.map(Number);
      const [, dx, dy] = dots.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!.map(Number);
      const { tile, levels } = mapDots(s);
      const period = tile * 4;
      // One tile: the finest lattice shown, or twice its spacing while it fades (its coarse dot and the three between).
      const k = levels.findIndex((v) => v > 0);
      const size = tile * 2 ** k * (levels[k] < 1 ? 2 : 1);
      expect(dots.style.backgroundSize).toBe(`${size}px ${size}px`);
      expect(period % size).toBeCloseTo(0, 6);
      for (const [d, c] of [[dx, cx], [dy, cy]]) {
        expect(d).toBeGreaterThanOrEqual(-period);
        expect(d).toBeLessThan(0);
        // A dot of the sparsest lattice lands where the camera puts one: d ≡ c (mod period).
        const k = (c - d) / period;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
      }
      expect(dots.style.right).toBe(`${-period}px`);
    };
    check();
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 437, clientY: 289 });
    check();
    expect(dots).toHaveAttribute('data-moving');
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 437, clientY: 289 });
    expect(dots).not.toHaveAttribute('data-moving');
    fireEvent.wheel(viewport, { deltaY: -120, ctrlKey: true, clientX: 400, clientY: 300 });
    check();
    expect(viewport.style.backgroundPosition).toBe('');
  });

  it('puts the world on its own layer only while a pan moves it', () => {
    const { world, viewport } = board();
    expect(world).not.toHaveAttribute('data-moving');

    // A press alone is a click (it deselects); nothing is promoted for it.
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    expect(world).not.toHaveAttribute('data-moving');

    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 440, clientY: 320 });
    expect(world).toHaveAttribute('data-moving');

    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 440, clientY: 320 });
    expect(world).not.toHaveAttribute('data-moving');
  });

  it('treats a wheel scroll as a pan until the wheel rests, and a zoom as no pan', () => {
    vi.useFakeTimers();
    try {
      const { world, viewport } = board();

      fireEvent.wheel(viewport, { deltaX: 0, deltaY: 40, clientX: 400, clientY: 300 });
      expect(world).toHaveAttribute('data-moving');
      fireEvent.wheel(viewport, { deltaX: 10, deltaY: 40, clientX: 400, clientY: 300 });
      act(() => vi.advanceTimersByTime(100));
      expect(world).toHaveAttribute('data-moving');
      act(() => vi.advanceTimersByTime(200));
      expect(world).not.toHaveAttribute('data-moving');

      // Zooming on a promoted layer would stretch what was drawn at the old
      // scale; a pinch or ctrl-wheel redraws instead.
      fireEvent.wheel(viewport, { deltaX: 0, deltaY: 40, clientX: 400, clientY: 300 });
      fireEvent.wheel(viewport, { deltaY: -40, ctrlKey: true, clientX: 400, clientY: 300 });
      expect(world).not.toHaveAttribute('data-moving');
    } finally {
      vi.useRealTimers();
    }
  });

  // A pan or a pinch moves the camera on every pointer event (more than one a
  // frame on a fast screen). The board — over a thousand lines of React — is
  // not rendered for each: the move is painted onto the world, the paper and
  // the zoom's percent once a frame, and committed when the gesture ends.
  it('paints a pan once a frame without rendering the board for each move, and commits it at the end', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      let commits = 0;
      renderWithIntl(
        <Profiler id="map" onRender={() => commits++}>
          <ThoughtMapCanvas data={mapData()} style={{ height: 600 }} />
        </Profiler>,
      );
      const node = screen.getByText('Core of a').closest('[role="button"]') as HTMLElement;
      const world = node.closest('div[style*="translate("]') as HTMLElement;
      const viewport = world.parentElement as HTMLElement;
      const dots = viewport.firstElementChild as HTMLElement;
      const [, x0, y0, s] = world.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/)!.map(Number);

      fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
      fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 412, clientY: 307 });
      const started = commits;
      for (let i = 2; i <= 8; i++) {
        fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 400 + i * 12, clientY: 300 + i * 7 });
      }
      // Seven moves: none renders the board (React may take one pass of its own to see the pan's layer is set).
      expect(commits - started).toBeLessThanOrEqual(1);
      const moved = commits;

      // The next frame shows where the pan is, the paper with it.
      act(() => void vi.advanceTimersToNextFrame());
      expect(world.style.transform).toBe(`translate(${x0 + 96}px, ${y0 + 56}px) scale(${s})`);
      const tile = 26 * s;
      const [, dx] = dots.style.transform.match(/translate\(([-\d.]+)px/)!.map(Number);
      expect(Math.abs((x0 + 96 - dx) / tile - Math.round((x0 + 96 - dx) / tile))).toBeLessThan(1e-6);
      expect(commits).toBe(moved);

      // The gesture's end renders: the camera committed, the pan's layer let go.
      fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 496, clientY: 356 });
      expect(commits).toBeGreaterThan(moved);
      expect(commits - moved).toBeLessThanOrEqual(2);
      expect(world.style.transform).toBe(`translate(${x0 + 96}px, ${y0 + 56}px) scale(${s})`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a pinch’s zoom in the percent as it goes, and the zoom buttons carry on from it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      const { world, viewport } = board();
      const percent = () => screen.getByText(/^\d+%$/).textContent;
      const at = percent();
      const touch = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', id: number, x: number, y: number) =>
        fireEvent[type](viewport, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y });
      touch('pointerDown', 1, 300, 300);
      touch('pointerDown', 2, 500, 300);
      touch('pointerMove', 2, 700, 300);
      act(() => void vi.advanceTimersToNextFrame());
      const pinched = percent();
      expect(pinched).not.toBe(at);
      const [, , , s] = world.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/)!.map(Number);
      expect(pinched).toBe(`${Math.round(s * 100)}%`);
      touch('pointerUp', 2, 700, 300);
      touch('pointerUp', 1, 300, 300);
      expect(percent()).toBe(pinched);

      act(() => void screen.getByRole('button', { name: 'Zoom in' }).click());
      expect(percent()).toBe(`${Math.round(s * 1.25 * 100)}%`);
    } finally {
      vi.useRealTimers();
    }
  });

  // Dragging one card moves that card: the others keep their drawing. (The
  // card is clear of the region, so the drag doesn't file it into one.)
  it('redraws no card while one is dragged', () => {
    const { node, viewport } = board('d');
    const left = node.style.left;
    vi.mocked(wobRect).mockClear();

    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 140, clientY: 130 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 180, clientY: 150 });

    // A hand-drawn card outline is keyed on its size and seed, which a move
    // leaves alone: nothing is redrawn at all.
    expect(wobRect).not.toHaveBeenCalled();
    expect(node.style.left).not.toBe(left);
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 180, clientY: 150 });
  });
});

describe('ThoughtMapCanvas chalk', () => {
  // A hundred cards share six chalk seeds: the filters are defined once for
  // the board, not once inside every card.
  it('defines each card chalk once for the whole board', () => {
    const { node } = board();
    const fill = node.querySelector('path[filter]');
    const ref = fill?.getAttribute('filter')?.match(/^url\(#(.+)\)$/)?.[1];
    expect(ref).toBeTruthy();
    expect(node.querySelector('filter')).toBeNull();
    expect(document.querySelectorAll(`filter#${ref}`)).toHaveLength(1);
    expect(document.querySelectorAll('filter[id^="chalk-hdb-"]')).toHaveLength(6);
  });
});

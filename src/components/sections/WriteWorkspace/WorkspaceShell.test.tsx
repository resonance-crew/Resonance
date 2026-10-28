// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, within } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import type { Card } from '@/lib/db/types';

const mockBack = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: mockBack, push: vi.fn(), replace: vi.fn() }),
}));
// The shell is about the chrome around the map; the map itself is swapped out
// for a card (its tab's 開啟卡片 shown while `map.tabShown`) and an arrow's label field.
const map = { tabShown: true, renders: 0 };
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: ({
    onOpenCard,
    paneOpen,
    focusCardId,
    settleKey,
    resizing,
  }: {
    onOpenCard?: (card: Card) => void;
    paneOpen?: boolean;
    focusCardId?: string | null;
    settleKey?: number;
    resizing?: boolean;
  }) => (
    map.renders++,
    <div data-testid="map" data-focus={focusCardId ?? ''} data-settle={settleKey} data-resizing={resizing || undefined}>
      <div role="button" tabIndex={-1} data-card-id="c1" onDoubleClick={() => onOpenCard?.({ id: 'c1' } as Card)}>
        A card
      </div>
      {(map.tabShown || !paneOpen) && (
        <button type="button" onClick={() => onOpenCard?.({ id: 'c1' } as Card)}>
          Open card
        </button>
      )}
      <input aria-label="Arrow label" />
    </div>
  ),
}));

import { WorkspaceShell } from './WorkspaceShell';

// The button draws its shapes only once measured; give it a box.
mockElementSize(120, 40);

/** A screen as wide as `width`, for the shell's media queries. */
const realMatchMedia = window.matchMedia;
function screenWidth(width: number) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: /min-width: (\d+)px/.test(query) ? width >= Number(/min-width: (\d+)px/.exec(query)![1]) : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

describe('the map behind the editor', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // Below the split the open editor covers the map: a phone writing a card
  // read the whole map and its cards for nothing.
  it('is not mounted on a phone while the editor covers it, and stays once shown', () => {
    screenWidth(390);
    const shell = (open: boolean) => (
      <WorkspaceShell open={open} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell(true));
    expect(screen.queryByTestId('map')).toBeNull();

    rerender(shell(false));
    expect(screen.getByTestId('map')).toBeInTheDocument();
    // A card opened from the map covers it again; hiding the pane hands it back as it was.
    rerender(shell(true));
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('is mounted beside the editor on a desktop', () => {
    screenWidth(1440);
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });
});

describe('WorkspaceShell', () => {
  // The Leave control floats over the map: a tonal pill, opaque to stay
  // legible over the board, and no pen line of its own.
  it('leaves through a tonal button without a pen outline', async () => {
    renderWithIntl(
      <WorkspaceShell open={false} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );

    const leave = screen.getByRole('button', { name: 'Leave' });
    expect(leave).toHaveAttribute('data-variant', 'tonal');
    expect(penLines(leave)).toHaveLength(0);

    await userEvent.click(leave);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('the chrome around the panes', () => {
  beforeEach(() => mockBack.mockClear());
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // The thought-map page: the pane a card opened into has a header row of its
  // own, the writer's bar's — a borderless back arrow, then what it shows (it
  // hides the pane, never discards: no ✕ — the edits are saved as they are made).
  it('names what the pane shows in its header and hides the pane through its back arrow', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} paneTitle="Edit published card">
        <p>editor</p>
      </WorkspaceShell>,
    );
    const title = screen.getByRole('heading', { level: 2, name: 'Edit published card' });
    const header = title.closest('header')!;
    const hide = within(header).getByRole('button', { name: 'Back' });
    // The arrow first, then the title: the writer's bar's order.
    expect(hide.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A glyph on the pane's paper: no pill, no pen line round it.
    expect(hide).not.toHaveAttribute('data-variant');
    expect(penLines(hide)).toHaveLength(0);
    // The header stands over what the pane shows, outside what scrolls (the
    // editor's sticky toolbar keeps to the top of its own scroller, under the header).
    const body = screen.getByText('editor').parentElement!;
    expect(header.nextElementSibling).toBe(body);
    expect(body).not.toContainElement(header);
    await userEvent.click(hide);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // At the split Escape folds the pane away (the divider's hide: kept as it was), never closes it.
  it('folds the pane on Escape — not while a dialog over it, or a field on the map, takes the key', async () => {
    // A desktop: the map stands beside the pane.
    screenWidth(1440);
    const onClose = vi.fn();
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} onHide={onHide} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    // A dialog over the page is the one Escape closes.
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    await userEvent.keyboard('{Escape}');
    expect(onHide).not.toHaveBeenCalled();
    dialog.remove();

    // A field on the map keeps its own Escape (an arrow's label being named: it cancels).
    screen.getByRole('textbox', { name: 'Arrow label' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(onHide).not.toHaveBeenCalled();

    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('separator', { name: 'Show the editor' })).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  // Opening a card leaves the focus on its 開啟卡片 (or on the card, double-
  // clicked): the next Escape is the pane's, not swallowed by the map.
  it('folds the pane on Escape with the focus still on the map’s 開啟卡片 or on the card', async () => {
    screenWidth(1440);
    const onHide = vi.fn();
    renderWithIntl(<MapPage onHide={onHide} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(screen.getByRole('button', { name: 'Open card' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);

    await userEvent.dblClick(screen.getByRole('button', { name: 'A card' }));
    expect(screen.getByRole('separator', { name: 'Drag to resize panes' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'A card' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(2);
  });

  // Below the split the pane covers the map, and Escape closes it as its →| does.
  it('closes the covering pane on Escape below the split', async () => {
    screenWidth(1024);
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Typing in the card, Escape never folds it away at once: the first press
  // steps out of the field to the →| (an IME's Escape is the IME's), the next hides.
  it('steps out of a field on the first Escape and hides on the next — even from an editor that keeps Escape', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} paneTitle="Edit draft">
        <input aria-label="Title" />
        {/* The story editor (ProseMirror) prevents the default of every Escape it hears. */}
        <div
          role="textbox"
          aria-label="Story"
          contentEditable
          suppressContentEditableWarning
          onKeyDown={(e) => e.key === 'Escape' && e.preventDefault()}
        />
      </WorkspaceShell>,
    );
    const hide = screen.getByRole('button', { name: 'Back' });

    const title = screen.getByRole('textbox', { name: 'Title' });
    title.focus();
    fireEvent.keyDown(title, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(title, { key: 'Escape', keyCode: 229 });
    expect(title).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(hide).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    const story = screen.getByRole('textbox', { name: 'Story' });
    // jsdom has no isContentEditable: the browser's answer.
    Object.defineProperty(story, 'isContentEditable', { value: true });
    story.focus();
    await userEvent.keyboard('{Escape}');
    expect(hide).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Its pen line inks in whole while anything under it has scrolled — the
  // editor's column, or the reading panel's own scroller (another author's card).
  it('inks its pen line while what the pane shows has scrolled under it', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Original">
        <div data-testid="panel" />
      </WorkspaceShell>,
    );
    const header = screen.getByRole('heading', { level: 2, name: 'Original' }).closest('header')!;
    expect(header).not.toHaveAttribute('data-scrolled');
    const panel = screen.getByTestId('panel');
    panel.scrollTop = 120;
    fireEvent.scroll(panel);
    expect(header).toHaveAttribute('data-scrolled');
    panel.scrollTop = 0;
    fireEvent.scroll(panel);
    expect(header).not.toHaveAttribute('data-scrolled');
  });

  it('has no header row, and Escape does nothing, while the pane is closed', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open={false} onClose={onClose} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  // The writer below the split: its bar over the pane that covers the map, as on the apps' writer page — its
  // back arrow and title, in place of the Leave over the map and the →|.
  it('stands the writer’s bar over the pane instead of the floating controls below the split', async () => {
    const onBack = vi.fn();
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    // One back arrow, the bar's: the pane under it has no header of its own.
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
    // Its back arrow is the way out: Escape leaves the writer to it.
    await userEvent.keyboard('{Escape}');
    expect(onBack).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  // Round 11 §5: two sizes on one line looked odd — the save state is the title's second line, its line kept
  // while it says nothing (the title never moves at the first save), never beside the title or the ✓.
  it('says the save state on a line of its own under the bar’s title, kept while empty', () => {
    const view = renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }} paneStatus={<span>Saved</span>} paneAction={<button type="button">Done</button>}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'New card' });
    const state = screen.getByText('Saved');
    const line = state.parentElement!;
    expect(line.previousElementSibling).toBe(title);
    expect(line.className).toMatch(/subtitle/);
    expect(screen.getByRole('button', { name: 'Done' }).closest('[class*="trailing"]')).not.toContainElement(state);

    view.rerender(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }} paneStatus={<span />}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'New card' }).nextElementSibling?.className).toMatch(/subtitle/);
  });
});

/** The thought-map page in small: a card opened from the map shows in the pane until it is hidden. */
function MapPage({ onHide }: { onHide?: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  return (
    <WorkspaceShell
      open={card != null}
      onClose={() => setCard(null)}
      onHide={onHide}
      paneTitle="Edit draft"
      paneKey={card?.id}
      onOpenCard={setCard}
    >
      <input aria-label="Title" />
    </WorkspaceShell>
  );
}

describe('the map while the pane is open', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    map.tabShown = true;
  });

  // Below the split the pane covers the map: Tab must not walk controls no one
  // sees, nor the focus stay on one.
  it('is inert while the pane covers it, and only then', async () => {
    screenWidth(390);
    const shell = (open: boolean) => (
      <WorkspaceShell open={open} onClose={vi.fn()} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell(false));
    const mapPane = screen.getByTestId('map').parentElement!;
    expect(mapPane).not.toHaveAttribute('inert');
    rerender(shell(true));
    expect(mapPane).toHaveAttribute('inert');
    rerender(shell(false));
    expect(mapPane).not.toHaveAttribute('inert');

    // Beside the pane on a desktop, it stays in reach.
    window.matchMedia = realMatchMedia;
    screenWidth(1440);
    rerender(shell(true));
    expect(screen.getByTestId('map').parentElement).not.toHaveAttribute('inert');
  });

  // Hiding the pane unmounts what had the focus (its →|, the field being
  // written in): the focus goes back to what opened the card, not to the page.
  it('hands the focus back to the 開啟卡片 that opened the card when the pane closes', async () => {
    screenWidth(1024);
    renderWithIntl(<MapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open card' })).toHaveFocus();

    // And by Escape, from the field being written in (out of it, then hidden).
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    await userEvent.click(screen.getByRole('textbox', { name: 'Title' }));
    await userEvent.keyboard('{Escape}{Escape}');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open card' })).toHaveFocus();
  });

  it('hands the focus to the card itself when what opened it is gone', async () => {
    screenWidth(1024);
    map.tabShown = false;
    renderWithIntl(<MapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    // The tab went away with the pane open; hiding the pane brings a new one.
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'A card' })).toHaveFocus();
  });

  // Another card opened while the pane is open starts at its top, the
  // header's line at rest — not where the last card was left.
  it('starts another card at its top, its header line at rest', () => {
    screenWidth(1024);
    const shell = (key: string) => (
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Original" paneKey={key}>
        <div data-testid={`panel-${key}`} />
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell('a'));
    const header = screen.getByRole('heading', { level: 2, name: 'Original' }).closest('header')!;
    const body = header.nextElementSibling as HTMLElement;
    body.scrollTop = 300;
    fireEvent.scroll(body);
    expect(header).toHaveAttribute('data-scrolled');

    rerender(shell('b'));
    expect(header).not.toHaveAttribute('data-scrolled');
    expect(body.scrollTop).toBe(0);
  });
});

/** The shell's box: 1000 wide from the left edge, so a pointer at x leaves the editor (1000 − x) / 10 % of it. */
function shellBox() {
  const box = { left: 0, right: 1000, width: 1000, top: 0, bottom: 800, height: 800, x: 0, y: 0, toJSON: () => ({}) };
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box as DOMRect);
  return () => spy.mockRestore();
}

describe('the workspace at the split', () => {
  let restoreBox: () => void;
  beforeEach(() => {
    screenWidth(1440);
    mockBack.mockClear();
    restoreBox = shellBox();
    // The clock the pointer's events are stamped with stands still unless a test moves it: a drag here is no
    // throw (round 17 §5.1) unless a test says how fast it went.
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    restoreBox();
    vi.useRealTimers();
  });

  const divider = () => screen.getByRole('separator');
  const pane = () => document.getElementById(divider().getAttribute('aria-controls')!)!;
  const drag = (...xs: number[]) => {
    const [from, ...rest] = xs;
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: from });
    for (const x of rest) fireEvent.pointerMove(divider(), { pointerId: 1, clientX: x });
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: rest.at(-1) ?? from });
  };

  // One page whichever way it was come into: no bar and no header row in the pane, the Leave over the map
  // its way back (the writer's own way out, asking as it does).
  it('has no bar and no header row: the Leave over the map is the way back', async () => {
    const onBack = vi.fn();
    const onLeave = vi.fn();
    const { unmount } = renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack }} onLeave={onLeave}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    // Still the page's heading, for a screen reader.
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    unmount();

    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole('heading', { level: 2, name: 'Edit draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('resizes the editor between 32 % and 50 % of the width', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    drag(500, 600);
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
    drag(600, 200);
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    drag(500, 680);
    expect(divider()).toHaveAttribute('aria-valuenow', '32');
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
  });

  // The map brings the card the pane shows to its centre once its width settles: not on every frame of a
  // drag, once the divider is released (or stepped by a key) — a release that folds the pane is its own.
  it('tells the map its width has settled when the divider is released, not while it is dragged', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} focusCardId="c1">
        <p>editor</p>
      </WorkspaceShell>,
    );
    const map = screen.getByTestId('map');
    expect(map).toHaveAttribute('data-focus', 'c1');
    const settled = () => Number(map.getAttribute('data-settle'));
    const before = settled();
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 560 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 600 });
    expect(settled()).toBe(before);
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 600 });
    expect(settled()).toBe(before + 1);
    fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    expect(settled()).toBe(before + 2);
  });

  // A full map drew again on every move once (the drag stuttered): the pane follows the pointer on the page, the
  // map is told it is being resized and renders again only when the drag crosses a line, or ends.
  it('follows the pointer without drawing the map again on each move', () => {
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    expect(screen.getByTestId('map')).toHaveAttribute('data-resizing');
    const drawn = map.renders;
    for (const x of [520, 540, 560, 580, 600, 620, 640]) fireEvent.pointerMove(divider(), { pointerId: 1, clientX: x });
    expect(map.renders).toBe(drawn);
    expect(pane().style.getPropertyValue('--editor-frac')).toBe('0.36');
    expect(divider()).toHaveAttribute('aria-valuenow', '36');
    // Past 1:1 the map's tools fade: one render for the line crossed, none for the moves past it.
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 420 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 400 });
    expect(map.renders).toBe(drawn + 1);
    expect(pane().style.getPropertyValue('--editor-frac')).toBe('0.6');
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 620 });
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 620 });
    expect(screen.getByTestId('map')).not.toHaveAttribute('data-resizing');
    expect(pane().style.getPropertyValue('--editor-frac')).toBe('0.38');
    expect(divider()).toHaveAttribute('aria-valuenow', '38');
  });

  // Dragged on toward the edge the pane follows; narrower than 18 % it dims and the pill says what releasing
  // does — and releasing there folds it away, kept as it was, saved at once.
  it('hides the pane when released past the hide line, keeping what it shows', () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <input aria-label="Title" defaultValue="kept" />
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 760 });
    // Following the pointer past the narrowest (24 %), not yet in the hide zone.
    expect(divider()).toHaveAttribute('aria-valuenow', '24');
    expect(pane()).not.toHaveAttribute('data-dim');
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 900 });
    expect(pane()).toHaveAttribute('data-dim');
    expect(screen.getByText('Release to hide the editor')).toBeInTheDocument();
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 900 });

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(pane()).toHaveAttribute('data-folded');
    expect(pane()).toHaveAttribute('inert');
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
    // Docked at the edge, to show it again; what the pane shows is still there, as it was.
    expect(divider()).toHaveAccessibleName('Show the editor');
    expect(divider()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('textbox', { name: 'Title', hidden: true })).toHaveValue('kept');
  });

  it('cancels the hide when dragged back above the hide line, and springs back to the narrowest', () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 900 });
    expect(screen.getByText('Release to hide the editor')).toBeInTheDocument();
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 760 });
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
    expect(pane()).not.toHaveAttribute('data-dim');
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 760 });
    expect(onHide).not.toHaveBeenCalled();
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '32');
  });

  // Folded, the docked grip shows the pane again at the width it had — tapped, or drawn toward the map.
  it('shows the pane again from the docked grip, at its last width', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    drag(500, 600);
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
    drag(600, 950);
    expect(pane()).toHaveAttribute('data-folded');

    // A tap.
    drag(995);
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '40');

    // A drag toward the map.
    drag(600, 950);
    expect(pane()).toHaveAttribute('data-folded');
    drag(995, 960);
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '40');

    // Drawn the other way (off the window's edge), it stays docked.
    drag(600, 950);
    drag(990, 1000, 1030);
    expect(pane()).toHaveAttribute('data-folded');
  });

  // Round 16 §7 (the apps' rule): the writer's pane dragged on past 1:1 follows the pointer, takes the whole
  // width released past 3/4 — the grip docked at the leading edge, no bar coming in (the Leave and the ✓ stay
  // where they floated) — and gives the map back at 1:1 from that grip, the keyboard, or Escape.
  it('takes the whole width when the writer’s pane is released past 3/4, and gives the map back at 1:1', () => {
    const onLeave = vi.fn();
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }} onLeave={onLeave}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const mapPane = () => screen.getByTestId('map').closest('[class*="mapPane"]')!;
    expect(mapPane()).not.toHaveAttribute('data-beyond');
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 300 });
    expect(divider()).toHaveAttribute('aria-valuenow', '70');
    expect(screen.queryByText('Release to write full width')).toBeNull();
    // The map's tools give way while the pane is past 1:1, before the Leave can meet them (round 17 review W12).
    expect(mapPane()).toHaveAttribute('data-beyond');
    const css = readFileSync(join(process.cwd(), 'src/components/sections/WriteWorkspace/WriteWorkspace.module.css'), 'utf8');
    expect(css).toMatch(/\.mapPane\[data-beyond\] \{\s*--map-tools-away: 1;\s*--map-tools-events: none;/);
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 200 });
    expect(screen.getByText('Release to write full width')).toBeInTheDocument();
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 200 });
    expect(divider()).toHaveAttribute('aria-valuenow', '100');
    expect(divider()).toHaveAttribute('data-docked', 'start');
    expect(mapPane()).not.toHaveAttribute('data-beyond');
    expect(divider()).toHaveAccessibleName('Show the thought map');
    expect(divider()).toHaveAttribute('aria-valuetext', 'Write full width');
    // No bar comes in; the Leave is still the way out, where it was, and the map behind it is out of reach.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('map').closest('[data-full]')).not.toBeNull();

    // A tap on the docked grip.
    drag(5);
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    expect(divider()).not.toHaveAttribute('data-docked');

    // A drag from it toward the middle.
    drag(500, 150);
    drag(5, 40);
    expect(divider()).toHaveAttribute('aria-valuenow', '50');

    // Escape, from anywhere but a field.
    drag(500, 150);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    expect(pane()).not.toHaveAttribute('data-folded');

    // The keyboard: one step past 1:1 is the whole width, one back is 1:1.
    divider().focus();
    fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    expect(divider()).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    // Home is the separator's end toward the map (the whole width), End its other (folded away); shown again
    // from there, the pane comes back at 1:1.
    fireEvent.keyDown(divider(), { key: 'Home' });
    expect(divider()).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(divider(), { key: 'End' });
    expect(pane()).toHaveAttribute('data-folded');
    fireEvent.keyDown(divider(), { key: 'Enter' });
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
  });

  it('springs back to 1:1 released short of 3/4, and a pane without the writer’s bar never passes 1:1', () => {
    const { unmount } = renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    drag(500, 320);
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    expect(divider()).not.toHaveAttribute('data-docked');
    unmount();

    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 150 });
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    expect(screen.queryByText('Release to write full width')).toBeNull();
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 150 });
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
  });

  // The owner's report (2026-10-28): one of their cards opened from the thought-map page wouldn't drag out to the
  // whole width, as the same card in the writer did. A pane that holds a writer is fillable, bar or not, and its
  // host hears when it takes the whole width (beside the map its publish step keeps a back of its own).
  it('lets the thought-map page’s pane take the whole width while it holds a writer, telling its host', () => {
    const onFullChange = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} fillable onFullChange={onFullChange}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(onFullChange).toHaveBeenLastCalledWith(false);
    drag(500, 150);
    expect(divider()).toHaveAttribute('aria-valuenow', '100');
    expect(divider()).toHaveAttribute('data-docked', 'start');
    expect(onFullChange).toHaveBeenLastCalledWith(true);
    drag(5);
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    expect(onFullChange).toHaveBeenLastCalledWith(false);
  });

  // The owner saw the divider move under a passing mouse: a drag whose release the rail never heard (let go
  // outside the window, its capture lost) was still running, and a mouse's pointerId is always the same.
  it('never moves the divider under a hover once its release went unheard', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500, pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 600, pointerType: 'mouse', buttons: 1 });
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 550, pointerType: 'mouse', buttons: 0 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 520, pointerType: 'mouse', buttons: 1 });
    expect(divider()).toHaveAttribute('aria-valuenow', '40');

    // A capture taken away mid-drag ends it too.
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.lostPointerCapture(divider(), { pointerId: 1 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 650 });
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
  });

  // Round 17 §5.1: a quick drag sometimes did nothing, or sprang back to the middle — its release came before
  // the last move's render, and the release judged the drag by that render's state.
  it('judges a release that comes before the last move is drawn by where the pointer was', () => {
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    act(() => {
      fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 200 });
      fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 200 });
    });
    expect(divider()).toHaveAttribute('aria-valuenow', '100');
    expect(divider()).toHaveAttribute('data-docked', 'start');

    act(() => void fireEvent.keyDown(divider(), { key: 'ArrowRight' }));
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    act(() => {
      fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 900 });
      fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 900 });
    });
    expect(pane()).toHaveAttribute('data-folded');
  });

  // A fast trackpad drag can report no button on a move: while the rail holds the pointer's capture its release is
  // still to come, so the move is the drag's.
  it('keeps a drag whose move reports no button while the rail still holds the pointer', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const rail = divider() as HTMLElement & { hasPointerCapture: (id: number) => boolean };
    rail.hasPointerCapture = () => true;
    fireEvent.pointerDown(rail, { button: 0, pointerId: 1, clientX: 500, pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerMove(rail, { pointerId: 1, clientX: 560, pointerType: 'mouse', buttons: 0 });
    fireEvent.pointerMove(rail, { pointerId: 1, clientX: 600, pointerType: 'mouse', buttons: 0 });
    fireEvent.pointerUp(rail, { pointerId: 1, clientX: 600, pointerType: 'mouse' });
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
  });

  // Round 17 §5.1: released moving fast (≥ 0.5 px/ms over the last 80 ms, after ≥ 24 px), the divider goes on to
  // the next stop in its direction — toward the map the whole width from any split, back folded away.
  describe('a throw', () => {
    /** A drag through `xs`, `ms` apart, released at the last one `ms` later. */
    const throwThrough = (ms: number, ...xs: number[]) => {
      const [from, ...rest] = xs;
      fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: from });
      for (const x of rest) {
        vi.advanceTimersByTime(ms);
        fireEvent.pointerMove(divider(), { pointerId: 1, clientX: x });
      }
      vi.advanceTimersByTime(ms);
      fireEvent.pointerUp(divider(), { pointerId: 1, clientX: rest.at(-1) ?? from });
    };
    const writer = () =>
      renderWithIntl(
        <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }}>
          <p>editor</p>
        </WorkspaceShell>,
      );

    it('takes the whole width thrown toward the map, from 1:1 or the narrowest, short of 3/4', () => {
      writer();
      // 80 px in 48 ms: 1.7 px/ms, released at 58 % — a drag would have eased back to 1:1.
      throwThrough(16, 500, 460, 440, 420);
      expect(divider()).toHaveAttribute('aria-valuenow', '100');
      expect(divider()).toHaveAttribute('data-docked', 'start');

      fireEvent.keyDown(divider(), { key: 'ArrowRight' });
      drag(500, 680);
      expect(divider()).toHaveAttribute('aria-valuenow', '32');
      throwThrough(16, 680, 650, 620);
      expect(divider()).toHaveAttribute('aria-valuenow', '100');
    });

    it('folds the pane thrown back toward its side, to come back at the width it had', () => {
      const onHide = vi.fn();
      renderWithIntl(
        <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
          <p>editor</p>
        </WorkspaceShell>,
      );
      drag(500, 600);
      throwThrough(16, 600, 630, 660);
      expect(pane()).toHaveAttribute('data-folded');
      expect(onHide).toHaveBeenCalledTimes(1);
      drag(995);
      expect(divider()).toHaveAttribute('aria-valuenow', '40');
    });

    it('stops a pane without the writer’s bar at 1:1 when thrown toward the map', () => {
      renderWithIntl(
        <WorkspaceShell open onClose={vi.fn()}>
          <p>editor</p>
        </WorkspaceShell>,
      );
      drag(500, 680);
      throwThrough(16, 680, 640, 600);
      expect(divider()).toHaveAttribute('aria-valuenow', '50');
      expect(divider()).not.toHaveAttribute('data-docked');
    });

    // Round 17 review W1: the speed is the moves' alone. A mouse or a trackpad lets go a frame after its last move, at
    // the same x — counted, that frame added time with no distance and a drag that felt fast sprang back to 1:1
    // ("快速拖的話沒有用"). At 30 fps the old reckoning read 0.7 px/ms as 0.35; at 60 fps it read 0.6 as 0.48.
    /** Moves `ms` apart at `speed` px/ms toward the map from 500, `n` of them, released one frame later at the last. */
    const flick = (ms: number, speed: number, n: number, releaseAfter = ms) => {
      fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
      let x = 500;
      for (let i = 0; i < n; i++) {
        vi.advanceTimersByTime(ms);
        x -= speed * ms;
        fireEvent.pointerMove(divider(), { pointerId: 1, clientX: x });
      }
      vi.advanceTimersByTime(releaseAfter);
      fireEvent.pointerUp(divider(), { pointerId: 1, clientX: x });
    };

    it('takes a 30 fps drag at 0.7 px/ms, released a frame after its last move, to the whole width', () => {
      writer();
      // 3 moves of 23.1 px: 69 px, released at 57 % — short of 3/4, so only a throw goes on.
      flick(33, 0.7, 3);
      expect(divider()).toHaveAttribute('aria-valuenow', '100');
      expect(divider()).toHaveAttribute('data-docked', 'start');
    });

    it('takes a 60 fps drag, released a frame after its last move, to the whole width', () => {
      writer();
      // The reviewer's: moves every 16 ms at 0.7 px/ms.
      flick(16, 0.7, 6);
      expect(divider()).toHaveAttribute('aria-valuenow', '100');
    });

    it('takes a 60 fps drag at 0.6 px/ms (once read as 0.48) to the whole width', () => {
      writer();
      flick(16, 0.6, 6);
      expect(divider()).toHaveAttribute('aria-valuenow', '100');
    });

    it('is no throw when the release comes more than 50 ms after the last move: the hand had stopped', () => {
      writer();
      flick(16, 1.2, 4, 60);
      expect(divider()).toHaveAttribute('aria-valuenow', '50');
      expect(divider()).not.toHaveAttribute('data-docked');
    });

    it('is no throw slow, or short, or once it came to rest before the release', () => {
      writer();
      // 60 px over 400 ms: 0.15 px/ms.
      throwThrough(100, 500, 485, 470, 455, 440);
      expect(divider()).toHaveAttribute('aria-valuenow', '50');
      // 20 px, however fast.
      throwThrough(8, 500, 490, 480);
      expect(divider()).toHaveAttribute('aria-valuenow', '50');
      // Fast, then held still 120 ms before letting go.
      fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
      vi.advanceTimersByTime(16);
      fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 440 });
      vi.advanceTimersByTime(120);
      fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 440 });
      expect(divider()).toHaveAttribute('aria-valuenow', '50');
      expect(divider()).not.toHaveAttribute('data-docked');
    });
  });

  // Round 17 §5.2, §5.3: at the whole width the Leave is its glyph alone, named as the pill was; its words — and
  // its glyph's name — follow the step (the host's way back: 繼續寫 in the publish step).
  it('turns the Leave into its glyph at the whole width, its words and name following the host', () => {
    const onLeave = vi.fn();
    const { rerender } = renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }} onLeave={onLeave}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const back = () => document.querySelector('[class*="back"][data-split-only]')!;
    expect(back()).not.toHaveAttribute('data-glyph');
    expect(screen.getByRole('button', { name: 'Leave' })).toHaveTextContent('Leave');
    drag(500, 200);
    expect(back()).toHaveAttribute('data-glyph');
    // One Leave: the glyph (no words), the pill hidden and out of reach.
    const glyph = screen.getByRole('button', { name: 'Leave' });
    expect(glyph).not.toHaveTextContent('Leave');
    fireEvent.click(glyph);
    expect(onLeave).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceShell open bar={{ title: 'Publish', onBack: vi.fn() }} onLeave={onLeave} leaveLabel="Keep writing" leaveDisabled>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByRole('button', { name: 'Keep writing' })).toBeDisabled();
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    expect(back()).not.toHaveAttribute('data-glyph');
    expect(screen.getByRole('button', { name: 'Keep writing' })).toHaveTextContent('Keep writing');
  });

  // Round 17 §5.4: one hand-drawn mark for the grip, between the panes and docked at either edge.
  it('draws the grip as one wavy pen stroke wherever it is', () => {
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const mark = () => divider().querySelector('svg path[stroke="currentColor"]')!;
    const between = mark().getAttribute('d');
    expect(between).toMatch(/^M [\d.]+,[\d.]+( C [\d., ]+){6}$/);
    expect(mark()).toHaveAttribute('stroke-width', '2.2');
    drag(500, 200);
    expect(divider()).toHaveAttribute('data-docked', 'start');
    expect(mark().getAttribute('d')).toBe(between);
    fireEvent.keyDown(divider(), { key: 'End' });
    expect(divider()).toHaveAttribute('data-docked', 'end');
    expect(mark().getAttribute('d')).toBe(between);
  });

  it('shows the folded pane again when a card is opened from the map', async () => {
    renderWithIntl(<MapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    drag(500, 950);
    expect(pane()).toHaveAttribute('data-folded');
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(pane()).not.toHaveAttribute('data-folded');
  });

  // A separator the keyboard moves: arrows resize within 32–50 %, Enter and Space fold and show; folded, the
  // arrow toward the map shows it again.
  it('answers the keyboard as a separator', async () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(divider()).toHaveAccessibleName('Drag to resize panes');
    expect(divider()).toHaveAttribute('aria-orientation', 'vertical');
    divider().focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(divider()).toHaveAttribute('aria-valuenow', '46');
    for (let i = 0; i < 10; i++) await userEvent.keyboard('{ArrowRight}');
    expect(divider()).toHaveAttribute('aria-valuenow', '32');

    await userEvent.keyboard('{Enter}');
    expect(pane()).toHaveAttribute('data-folded');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(divider()).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '32');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}');
    expect(pane()).toHaveAttribute('data-folded');
    await userEvent.keyboard('{ArrowLeft}');
    expect(pane()).not.toHaveAttribute('data-folded');
  });

  // Typing in the card, the first Escape steps out of the field to the divider (which says what Enter does
  // there), the next folds the pane — the focus staying on the divider, where it shows again.
  it('steps out of a field to the divider on Escape, and folds on the next', async () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <input aria-label="Title" />
      </WorkspaceShell>,
    );
    await userEvent.click(screen.getByRole('textbox', { name: 'Title' }));
    await userEvent.keyboard('{Escape}');
    expect(divider()).toHaveFocus();
    expect(onHide).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(divider()).toHaveFocus();
    // Folded, Escape has nothing left to fold.
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  // Folding by a button inside the pane (none today but the editor's own) hands the focus to the divider.
  it('hands the focus to the docked grip when the pane folds with the focus in it', async () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <button type="button">In the pane</button>
      </WorkspaceShell>,
    );
    screen.getByRole('button', { name: 'In the pane' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(pane()).toHaveAttribute('data-folded');
    expect(divider()).toHaveFocus();
  });

  // The editor's 下一步 at the split, where the pane has no bar: floating at its top-right, outside what scrolls.
  it('floats the pane’s next action over the pane, outside what scrolls, and folds it with the pane', () => {
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }} paneAction={<button type="button">Next</button>}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const next = screen.getByRole('button', { name: 'Next' });
    expect(pane()).toContainElement(next);
    expect(screen.getByText('editor').parentElement).not.toContainElement(next);
    expect(screen.queryByRole('banner')).toBeNull();
  });

  // The story's selection bubble gives the words back on Escape: the pane stays.
  it('leaves Escape to a toolbar in the pane, and to a publish on its way', async () => {
    const { unmount } = renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <div role="toolbar" aria-label="Formatting">
          <button type="button">Bold</button>
        </div>
      </WorkspaceShell>,
    );
    screen.getByRole('button', { name: 'Bold' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(pane()).not.toHaveAttribute('data-folded');
    unmount();

    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <section data-step-pending="">
          <button type="button">Publish</button>
        </section>
      </WorkspaceShell>,
    );
    screen.getByRole('button', { name: 'Publish' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(pane()).not.toHaveAttribute('data-folded');
  });
});

describe('the pane’s next action below the split', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it('ends the writer’s bar, or the pane’s header row, with it', () => {
    screenWidth(900);
    const { unmount } = renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack: vi.fn() }} paneAction={<button type="button">Next</button>}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Next' })).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Edit draft" paneAction={<button type="button">Next</button>}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    const header = screen.getByRole('heading', { level: 2, name: 'Edit draft' }).closest('header')!;
    expect(within(header).getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});

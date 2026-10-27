// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { renderWithIntl as render, screen, userEvent, fireEvent } from '@/../test/render';
import { Modal } from './Modal';

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

/** The backdrop is the dialog's parent: what a click beside the dialog lands on. */
const backdrop = () => screen.getByRole('dialog').parentElement!;

describe('Modal', () => {
  // The paper is drawn once measured and fades in; until then the box itself is a plain rounded paper of the same
  // colour and pen (globals.css res-shape-stand-in), so the content never sits over the page's words.
  it('stands in as a plain paper until its hand-drawn one is measured', () => {
    render(
      <Modal open ariaLabel="Notifications">
        <p>Body</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('res-shape-stand-in');
    expect(dialog).toHaveAttribute('data-shape-pending');
    expect(dialog.style.getPropertyValue('--shape-fill')).toBe('var(--color-card-bg)');
    expect(dialog.style.getPropertyValue('--shape-ink')).toBe('var(--modal-border)');
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false}>
        <p>Hidden body</p>
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden body')).not.toBeInTheDocument();
  });

  it('portals an accessible dialog with its content when open', () => {
    render(
      <Modal open ariaLabel="Invite dialog">
        <p>Visible body</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Invite dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Visible body')).toBeInTheDocument();
  });

  it('closes on a backdrop click but not when the content is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="Dialog">
        <p>Body</p>
      </Modal>
    );

    await userEvent.click(screen.getByText('Body'));
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Selecting text by dragging out past the dialog's edge ends on the
  // backdrop: that is not a click on it.
  it('stays open when a press starts inside it and ends on the backdrop', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    fireEvent.pointerDown(screen.getByText('Body'));
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // No ✕: the one close is a word for a screen reader (shown only when the
  // keyboard reaches it), not a glyph in the corner.
  it('draws no ✕, and keeps a named close for screen readers', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.querySelector('svg')).toBeNull();
    expect(close).not.toHaveAttribute('data-variant');
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names its close as the host asks', () => {
    render(
      <Modal open onClose={vi.fn()} closeLabel="Keep writing">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Keep writing' })).toBeInTheDocument();
  });

  // A list or a picker has nothing else at its foot: its close is drawn there.
  it('shows the close as a small tonal pill, alone at its foot, with closeButton', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} closeButton>
        <p>Body</p>
      </Modal>
    );
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    expect(closes[0]).toHaveAttribute('data-variant', 'tonal');
    expect(closes[0].parentElement!.children).toHaveLength(1);
    await userEvent.click(closes[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // While something is in flight the host leaves onClose out: nothing closes it.
  it('offers no close at all without onClose', () => {
    render(
      <Modal open closeButton>
        <p>Body</p>
      </Modal>
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('takes focus when it opens and hands it back when it closes', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Panel">
            <p>Body</p>
          </Modal>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Panel' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  // The page under the backdrop can't be clicked, nor reached by Tab: focus walks round the dialog.
  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    render(
      <>
        <button>Behind</button>
        <Modal open onClose={vi.fn()} ariaLabel="Confirm">
          <button>Cancel</button>
          <button>Delete</button>
        </Modal>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await userEvent.tab();
    // The close kept for screen readers is the last stop, then round to the first again.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Behind' })).not.toHaveFocus();
  });

  // What Escape closes is this dialog alone: a listener under it (a search over a thread) is told so.
  it('claims the Escape that closes it', async () => {
    const heard = vi.fn((e: KeyboardEvent) => e.defaultPrevented);
    render(
      <Modal open onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    document.addEventListener('keydown', heard);
    await userEvent.keyboard('{Escape}');
    document.removeEventListener('keydown', heard);
    expect(heard).toHaveReturnedWith(true);
  });

  // A dialog opened over another (a confirm over a picker) is the one Escape and Tab are for.
  it('leaves the keys to a dialog opened over it', async () => {
    function Stacked() {
      const [under, setUnder] = useState(true);
      const [over, setOver] = useState(true);
      return (
        <>
          <Modal open={under} onClose={() => setUnder(false)} ariaLabel="Picker">
            <button>Pick</button>
          </Modal>
          <Modal open={over} onClose={() => setOver(false)} ariaLabel="Confirm">
            <button>Yes</button>
          </Modal>
        </>
      );
    }
    render(<Stacked />);
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    // Round the top dialog, never into the one under it.
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Picker' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Picker' })).not.toBeInTheDocument();
  });

  // The browser paints its own bars in the theme colour: they dim with the
  // page while a modal is open, and come back after.
  it('dims the theme colour while open', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#faf2e9';
    document.head.appendChild(meta);

    const { rerender } = render(
      <Modal open>
        <p>Body</p>
      </Modal>
    );
    expect(meta.content).not.toBe('#faf2e9');

    rerender(
      <Modal open={false}>
        <p>Body</p>
      </Modal>
    );
    expect(meta.content).toBe('#faf2e9');
  });

  // Round 17 §6.2: a dialog holding a field (the link editor) stays centred in the room a phone's keyboard leaves.
  it('keeps a keyboard-aware dialog in the room the on-screen keyboard leaves', async () => {
    const listeners: Record<string, () => void> = {};
    const vv = { height: 812, offsetTop: 0, addEventListener: (k: string, f: () => void) => (listeners[k] = f), removeEventListener: vi.fn() };
    const real = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    try {
      render(
        <Modal open keyboardAware ariaLabel="Link">
          <input aria-label="Address" />
        </Modal>
      );
      expect(backdrop().style.bottom).toBe('');
      // The keyboard comes up over the window's foot.
      vv.height = 476;
      listeners.resize();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await vi.waitFor(() => expect(backdrop().style.bottom).toBe('336px'));
      expect(backdrop().style.top).toBe('0px');
    } finally {
      if (real) Object.defineProperty(window, 'visualViewport', real);
      else delete (window as { visualViewport?: unknown }).visualViewport;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
    }
  });

  it('takes a width that is a CSS length (the link editor: 400, or the window less 32)', () => {
    render(
      <Modal open ariaLabel="Link" maxWidth="min(400px, calc(100vw - 32px))">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole('dialog').style.maxWidth).toBe('min(400px, calc(100vw - 32px))');
  });
});

// Round 17 review W10: a dialog that belongs to part of the page (the link editor in the writer's pane at the desktop
// split) centres over it, not across the map beside it — moved in as far as it must to stay in the window; over a
// part as wide as the window (the whole width, or below the split) it centres over the window as ever.
describe('Modal centred over part of the page', () => {
  const innerWidth = window.innerWidth;
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
  });

  const host = (left: number, width: number) => {
    const el = document.createElement('section');
    el.getBoundingClientRect = () => ({ left, right: left + width, width, top: 0, bottom: 900, height: 900, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    return el;
  };

  it('centres over the pane at the split, and over the window where the pane is the window', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const pane = host(720, 720);
    const { rerender } = render(
      <Modal open ariaLabel="Insert link" centerOver={() => pane}>
        <p>Body</p>
      </Modal>,
    );
    // A content box the dialog's width (+2), its middle the pane's (1080).
    expect(backdrop().style.paddingLeft).toBe(`${1080 - 201}px`);
    expect(backdrop().style.paddingRight).toBe(`${1440 - 1080 - 201}px`);

    // A pane narrower than the dialog by the window's end: moved in to keep 16 from the edge.
    const narrow = host(1100, 340);
    rerender(
      <Modal open ariaLabel="Insert link" centerOver={() => narrow}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent(window, new Event('resize'));
    expect(backdrop().style.paddingRight).toBe('16px');

    // The pane as wide as the window: no side padding of its own.
    const whole = host(0, 1440);
    rerender(
      <Modal open ariaLabel="Insert link" centerOver={() => whole}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent(window, new Event('resize'));
    expect(backdrop().style.paddingLeft).toBe('');
    expect(backdrop().style.paddingRight).toBe('');
  });
});

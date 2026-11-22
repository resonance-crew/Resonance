// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { CardTapBody } from '@/lib/api/v1/schemas';
import { ApiError } from '@/lib/db/firestore/client/api';
import { keepNoteDraft, readNoteDraft } from '@/lib/data/noteDrafts';
import { NOTE_MOVE_MS } from './NoteInPlace';
import { ReadAfterArea } from './ReadAfterArea';

/**
 * Round 26, SETTLED「The note, in place」(replacing §U4): 寄小紙條 opens the note under the end row — never a dialog
 * over the story; tapping 共振 opens nothing. The field is the composer's input capsule; its words are the card's
 * note draft as they are typed; one line under it says one thing at a time.
 */

const auth = vi.hoisted(() => ({ value: { user: { id: 'viewer' } as { id: string } | null, loading: false } }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth.value }));
const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
const toast = vi.hoisted(() => ({ show: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/components/providers/ToastProvider', () => ({ useToast: () => toast }));
vi.mock('@/lib/data/hooks', async (original) => ({
  ...(await original<typeof import('@/lib/data/hooks')>()),
  useMyProfile: () => ({ data: { id: 'viewer', handle: 'viewer-handle', initials: 'VI', accentColor: 'x', avatarSeed: '4' } }),
  useMyResonance: () => ({ data: null }),
}));
vi.mock('@/lib/db/firestore/client/taps', () => ({ setTap: vi.fn(() => Promise.resolve({ on: true, changed: true })), listTaps: vi.fn() }));
const sendNote = vi.fn((..._a: unknown[]) => Promise.resolve('note-1'));
vi.mock('@/lib/db/firestore/client/notes', () => ({ sendNote: (...a: unknown[]) => sendNote(...a), NOTE_MAX_LENGTH: 2000 }));
vi.mock('@/lib/db/firestore/client/bookmarks', () => ({ isBookmarked: vi.fn(() => Promise.resolve(false)), toggleBookmark: vi.fn() }));
// Every first-times hint unspent: were the field's old privacy line still there, it would show.
vi.mock('@/lib/hints', () => ({ useHint: () => ({ visible: true, dismiss: vi.fn() }) }));

const author = { id: 'author-1', handle: 'bob', initials: 'BO', accentColor: 'x' };
const TAP: CardTapBody = { mine: false, faces: [], more: false, mayNote: true };

function renderPage(tap: CardTapBody = TAP) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={tap} />
    </SWRConfig>,
  );
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const noteSegment = () => within(screen.getAllByRole('group')[0]).getByRole('button', { name: 'Note' });
const field = () => screen.queryByRole('textbox', { name: 'Send the author a little note' });
const WAIT = "You've left notes they haven't answered yet — wait for their reply";

const matchMedia = window.matchMedia;
/** The reader asked for reduced motion (or not). */
function reduceMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: on && query.includes('prefers-reduced-motion: reduce') })) as typeof window.matchMedia;
}

beforeEach(() => {
  auth.value = { user: { id: 'viewer' }, loading: false };
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.clearAllMocks();
  window.matchMedia = matchMedia;
});

describe('the note, in place', () => {
  it('opens under the end row when 寄小紙條 is tapped, focused — never in a dialog', async () => {
    renderPage();
    expect(field()).toBeNull();
    await user().click(noteSegment());
    const box = field()!;
    expect(box).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(noteSegment()).toHaveAttribute('aria-expanded', 'true');
    const block = document.getElementById(noteSegment().getAttribute('aria-controls')!)!;
    expect(block).toContainElement(box);
    // In the page, after the capsule's lines: not over the story.
    expect(block.compareDocumentPosition(screen.getAllByRole('group')[0]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // The placeholder says where the words go and what to write; no privacy line under it (the owner, 2026-11-19):
    // with nothing to say, the line under the field is empty.
    expect(box).toHaveAttribute('placeholder', 'Tell the author what moved you');
    expect(screen.queryByText('Only the author can see this')).toBeNull();
    const line = document.getElementById(box.getAttribute('aria-describedby')!)!;
    expect(line).toHaveAttribute('data-empty');
    expect(line).toHaveTextContent('');
    // …and takes no room: the capsule stands the container's 40 above the next section.
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/NoteInPlace.module.css'), 'utf8');
    expect(css).toMatch(/\.line\[data-empty\]\s*\{\s*min-height: 0;\s*margin-top: 0;\s*\}/);
  });

  it('is the column wide with no envelope: the words start 16 in, and so do the lines under them (round 30)', async () => {
    renderPage();
    await user().click(noteSegment());
    const input = field() as HTMLElement;
    const block = input.closest('[data-mode="field"]') as HTMLElement;
    // Nothing stands before the words in the capsule's line: no mark, no column of its own.
    const line = input.closest('[class*="field"]')?.parentElement as HTMLElement;
    expect(line.firstElementChild).toContainElement(input);
    // The only drawn glyph in the place is the send's.
    expect(block.querySelectorAll('button')).toHaveLength(1);
    expect(block.querySelector('button')?.previousElementSibling ?? block.querySelector('button')).not.toBeNull();
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/NoteInPlace.module.css'), 'utf8');
    // No cap: the block is the story's column at every width (a 680 cap left it short on a wider column).
    expect(css).not.toMatch(/max-width:\s*680px/);
    expect(css.match(/\.block\s*\{[^}]*\}/)?.[0]).not.toMatch(/max-width/);
    expect(css).not.toMatch(/\.glyph\b/);
    // One start for the words, the line under them and the waiting line.
    expect(css).toMatch(/\.field\s*\{[^}]*padding: 0 10px 0 16px;/);
    expect(css).toMatch(/\.line\s*\{[^}]*padding-inline: 16px 4px;/);
    expect(css).toMatch(/\.wait\s*\{[^}]*padding-inline: 16px 4px;/);
  });

  it('tapping 共振 opens no field, and the field’s placeholder is one, the tap on, off or never', async () => {
    renderPage();
    const resonate = () => within(screen.getAllByRole('group')[0]).getByRole('button', { name: /Resonate/ });
    await user().click(resonate());
    expect(field()).toBeNull();
    await user().click(noteSegment());
    expect(field()).toHaveAttribute('placeholder', 'Tell the author what moved you');
    // Taken back: nothing changes.
    await user().click(resonate());
    expect(field()).toHaveAttribute('placeholder', 'Tell the author what moved you');
    const second = renderPage({ ...TAP, mine: true });
    await user().click(within(second.container.querySelector('[role="group"]') as HTMLElement).getByRole('button', { name: 'Note' }));
    expect(within(second.container).getByRole('textbox')).toHaveAttribute('placeholder', 'Tell the author what moved you');
  });

  it('closes an empty field on the segment or Escape, and only takes the focus back to one with words', async () => {
    renderPage();
    await user().click(noteSegment());
    await user().click(noteSegment());
    expect(field()).toBeNull();
    expect(noteSegment()).toHaveAttribute('aria-expanded', 'false');

    await user().click(noteSegment());
    await user().keyboard('{Escape}');
    expect(field()).toBeNull();
    expect(noteSegment()).toHaveFocus();

    await user().click(noteSegment());
    await user().type(field()!, 'the bridge part');
    field()!.blur();
    await user().click(noteSegment());
    expect(field()).toHaveFocus();
    await user().keyboard('{Escape}');
    expect(field()).not.toBeNull();
    expect(field()).not.toHaveFocus();
  });

  it('never throws words away: typed is kept, and a draft opens the field with the page', async () => {
    const first = renderPage();
    await user().click(noteSegment());
    await user().type(field()!, 'kept for later');
    expect(readNoteDraft('viewer', 'c1')).toBe('kept for later');
    first.unmount();

    renderPage();
    await waitFor(() => expect(field()).toHaveValue('kept for later'));
  });

  it('sends at once: the field clears and closes, the toast says so, the draft goes once the server has it', async () => {
    renderPage();
    await user().click(noteSegment());
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true');
    await user().type(field()!, 'the puddles');
    expect(screen.getByRole('button', { name: 'Send' })).not.toHaveAttribute('aria-disabled');
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(sendNote).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'c1', text: 'the puddles', clientId: expect.any(String) }));
    expect(field()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith({ message: 'Your note is on its way' });
    await waitFor(() => expect(readNoteDraft('viewer', 'c1')).toBeNull());
  });

  it('puts the words back and says why when the server refuses while the page is here', async () => {
    sendNote.mockRejectedValueOnce(new ApiError(409, 'conflict', 'full'));
    renderPage();
    await user().click(noteSegment());
    await user().type(field()!, 'one more');
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You've left notes they haven't answered yet — wait for their reply");
    expect(field()).toHaveValue('one more');
  });

  it('asks for a pen name first when the server says there is none, the words kept', async () => {
    sendNote.mockRejectedValueOnce(new ApiError(403, 'forbidden', 'Choose a pen name first.'));
    renderPage();
    await user().click(noteSegment());
    await user().type(field()!, 'first words');
    await user().click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/signup'));
    expect(readNoteDraft('viewer', 'c1')).toBe('first words');
  });

  it('offers 再寄一次 in a toast when the page is gone, opening the card with the field', async () => {
    let fail!: (e: unknown) => void;
    sendNote.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    const page = renderPage();
    await user().click(noteSegment());
    await user().type(field()!, 'gone too soon');
    await user().click(screen.getByRole('button', { name: 'Send' }));
    page.unmount();
    await act(async () => fail(new ApiError(500, 'internal', 'boom')));
    const shown = toast.show.mock.calls.at(-1)![0] as { message: string; action: { label: string; onAction: () => void } };
    expect(shown.message).toBe("Your note didn't go out");
    expect(shown.action.label).toBe('Try again');
    shown.action.onAction();
    expect(push).toHaveBeenCalledWith('/card/c1?note=1');
    // The words wait on the device for that.
    expect(readNoteDraft('viewer', 'c1')).toBe('gone too soon');
  });

  it('past 200 offers to make it a card: the words go to the writer out of the address, the field closes', async () => {
    renderPage();
    await user().click(noteSegment());
    const long = 'b'.repeat(220);
    fireEvent.change(field()!, { target: { value: long } });
    await user().click(screen.getByRole('button', { name: 'Want to turn this into a card of your own?' }));
    expect(push).toHaveBeenCalledWith('/write?referenceCardId=c1');
    expect(sessionStorage.getItem('resonance:write-seed:c1')).toBe(long);
    expect(readNoteDraft('viewer', 'c1')).toBeNull();
    expect(field()).toBeNull();
  });

  it('shows the count only from 1,800 characters', async () => {
    renderPage();
    await user().click(noteSegment());
    fireEvent.change(field()!, { target: { value: 'a'.repeat(1799) } });
    expect(screen.queryByText(/\/ 2000/)).toBeNull();
    fireEvent.change(field()!, { target: { value: 'a'.repeat(1800) } });
    expect(screen.getByText('1800 / 2000')).toBeInTheDocument();
  });

  it('while three notes wait for the author, opens the one line saying so — and keeps the draft', async () => {
    const first = renderPage({ ...TAP, mayNote: false });
    await user().click(noteSegment());
    expect(field()).toBeNull();
    expect(screen.getByText(WAIT)).toBeInTheDocument();
    first.unmount();

    // A draft kept for this card opens nothing with the page, and the segment opens the line, never the field
    // (iOS draws only the line, Android opens nothing): nothing to send that the server would refuse after a toast.
    keepNoteDraft('viewer', 'c2', 'still here');
    renderWithIntl(<ReadAfterArea cardId="c2" cardTitle="T" author={author} tap={{ ...TAP, mayNote: false }} />);
    await act(async () => {});
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(WAIT)).toBeNull();
    await user().click(noteSegment());
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(WAIT)).toBeInTheDocument();
    await user().click(noteSegment());
    expect(noteSegment()).toHaveAttribute('aria-expanded', 'false');
    expect(sendNote).not.toHaveBeenCalled();
    expect(readNoteDraft('viewer', 'c2')).toBe('still here');
  });

  it('opens a kept draft only once the tap is read: never a field shown and then taken back', async () => {
    keepNoteDraft('viewer', 'c1', 'half a thought');
    const tree = (tap: CardTapBody | undefined) => (
      <SWRConfig value={{ provider: () => new Map() }}>
        <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={tap} />
      </SWRConfig>
    );
    const page = renderWithIntl(tree(undefined));
    await act(async () => {});
    expect(field()).toBeNull();
    // The notes wait: nothing opens, the draft kept.
    page.rerender(tree({ ...TAP, mayNote: false }));
    await act(async () => {});
    expect(field()).toBeNull();
    expect(screen.queryByText(WAIT)).toBeNull();
    page.unmount();
    // A note may go: the draft opens the field.
    const again = renderWithIntl(tree(undefined));
    again.rerender(tree(TAP));
    await waitFor(() => expect(field()).toHaveValue('half a thought'));
  });

  it('holds a kept draft at once, before the tap is read: the segment opens it, and typing adds to it', async () => {
    keepNoteDraft('viewer', 'c1', 'half a thought');
    const tree = (tap: CardTapBody | undefined) => (
      <SWRConfig value={{ provider: () => new Map() }}>
        <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={tap} />
      </SWRConfig>
    );
    // The card's lists still on their way (or failing): the end row is there, the tap not yet.
    const page = renderWithIntl(tree(undefined));
    await act(async () => {});
    expect(field()).toBeNull();
    await user().click(noteSegment());
    expect(field()).toHaveValue('half a thought');
    await user().type(field()!, ' x');
    expect(readNoteDraft('viewer', 'c1')).toBe('half a thought x');
    // The tap arrives: the field stays as it is, the words with it.
    page.rerender(tree(TAP));
    await act(async () => {});
    expect(field()).toHaveValue('half a thought x');
    // …or it says the notes wait: the line takes the field's place, and the words are still the draft.
    page.rerender(tree({ ...TAP, mayNote: false }));
    expect(field()).toBeNull();
    expect(screen.getByText(WAIT)).toBeInTheDocument();
    expect(readNoteDraft('viewer', 'c1')).toBe('half a thought x');
  });

  it('opens nothing by itself when the tap arrives after the reader has used the segment', async () => {
    const tree = (tap: CardTapBody | undefined) => (
      <SWRConfig value={{ provider: () => new Map() }}>
        <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={tap} />
      </SWRConfig>
    );
    let land!: (id: string) => void;
    sendNote.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)));
    const page = renderWithIntl(tree(undefined));
    await act(async () => {});
    // Written and sent before the tap was read: the words stay kept until the server has them.
    await user().click(noteSegment());
    await user().type(field()!, 'on its way');
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(field()).toBeNull();
    expect(readNoteDraft('viewer', 'c1')).toBe('on its way');
    page.rerender(tree(TAP));
    await act(async () => {});
    expect(field()).toBeNull();
    await act(async () => land('note-1'));
    expect(readNoteDraft('viewer', 'c1')).toBeNull();
  });

  it('gives the field’s place to the waiting line when the tap, read after the page opened, says the notes wait', async () => {
    keepNoteDraft('viewer', 'c1', 'half a thought');
    const page = renderPage();
    await waitFor(() => expect(field()).toHaveValue('half a thought'));
    page.rerender(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={{ ...TAP, mayNote: false }} />
      </SWRConfig>,
    );
    expect(field()).toBeNull();
    expect(screen.getByText(WAIT)).toBeInTheDocument();
    expect(readNoteDraft('viewer', 'c1')).toBe('half a thought');
  });

  it('folds away over 150 ms when it closes, out of reach at once — and goes at once under reduced motion', async () => {
    const page = renderPage();
    await act(async () => {});
    vi.useFakeTimers();
    try {
      const tap = () => fireEvent.click(noteSegment());
      tap();
      expect(field()).not.toBeNull();
      tap();
      // Still drawn, folding: out of the tab order and the accessibility tree, and not the segment's any more.
      const block = document.querySelector('[data-mode="field"]')!;
      expect(block).toHaveAttribute('data-closing');
      expect(block).toHaveAttribute('inert');
      expect(block).not.toHaveAttribute('id');
      expect(field()).toBeNull();
      act(() => void vi.advanceTimersByTime(NOTE_MOVE_MS - 20));
      expect(document.querySelector('[data-mode]')).not.toBeNull();
      act(() => void vi.advanceTimersByTime(20));
      expect(document.querySelector('[data-mode]')).toBeNull();
      // Opened again while folding: the same place, open again.
      tap();
      tap();
      const again = document.querySelector('[data-mode="field"]')!;
      tap();
      expect(document.querySelector('[data-mode="field"]')).toBe(again);
      expect(again).not.toHaveAttribute('data-closing');
      act(() => void vi.advanceTimersByTime(NOTE_MOVE_MS));
      expect(again).toBeInTheDocument();
      page.unmount();

      reduceMotion(true);
      renderPage();
      tap();
      tap();
      expect(document.querySelector('[data-mode]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lifts the field over the keyboard without a glide under reduced motion', async () => {
    reduceMotion(true);
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as typeof window.scrollBy;
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: 900, bottom: 1000, left: 0, right: 0, width: 0, height: 100, x: 0, y: 900, toJSON: () => ({}) } as DOMRect;
    });
    renderPage();
    await user().click(noteSegment());
    expect(scrollBy).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'instant' });
    rect.mockRestore();
  });

  it('signed out: the segment goes to sign-in, focus alone never navigates', async () => {
    auth.value = { user: null, loading: false };
    renderPage();
    noteSegment().focus();
    expect(push).not.toHaveBeenCalled();
    await user().click(noteSegment());
    expect(push).toHaveBeenCalledWith('/signin');
    expect(field()).toBeNull();
  });

  it('leaves no note dialog on the card page', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/ReadAfterArea.tsx'), 'utf8');
    expect(src).not.toMatch(/Modal|NoteComposer/);
  });
});

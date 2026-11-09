// @vitest-environment jsdom
import { createRef, useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import type { Card, MessageReplyQuote } from '@/lib/db/types';
import { INK } from '@/lib/design/strokes';

const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/components/providers/ToastProvider', () => ({ useToast: () => toast }));
// A picture is made ready on the device (a canvas jsdom hasn't): handed back as it came.
// How many are being made ready at once (round 22 review: one at a time).
const prep = vi.hoisted(() => ({ active: 0, most: 0 }));
vi.mock('@/lib/chat/preparePicture', () => ({
  UnsupportedImage: class extends Error {},
  preparePicture: async (file: File) => {
    prep.active++;
    prep.most = Math.max(prep.most, prep.active);
    await new Promise((r) => setTimeout(r, 2));
    prep.active--;
    return { file, width: 800, height: 600 };
  },
}));
const walk = { id: 'walk', thoughtCore: 'A shared thought', publishedAt: new Date(), visibility: 'public' } as unknown as Card;
vi.mock('@/lib/db/firestore/client/reads', () => ({ getCardById: vi.fn(async () => walk) }));
vi.mock('@/components/molecules/MarkdownEditor/InsertCardModal', () => ({
  InsertCardModal: ({ open, onPick }: { open: boolean; onPick: (c: Card) => void }) =>
    open ? (
      <button type="button" onClick={() => onPick(walk)}>
        pick-card
      </button>
    ) : null,
}));

import { STICKER_REPEAT_MS, ThreadComposer, type ThreadComposerHandle } from './ThreadComposer';

mockElementSize(320, 48);

// jsdom lays nothing out: a field's text is as tall as its lines (24 each), and it shows `shown` of it.
let shown = 120;
const proto = HTMLTextAreaElement.prototype;
const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
beforeAll(() => {
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get(this: HTMLTextAreaElement) { return this.value.split('\n').length * 24; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => shown });
});
afterAll(() => {
  if (scrollHeight) Object.defineProperty(proto, 'scrollHeight', scrollHeight);
  else delete (proto as unknown as Record<string, unknown>).scrollHeight;
  if (clientHeight) Object.defineProperty(proto, 'clientHeight', clientHeight);
  else delete (proto as unknown as Record<string, unknown>).clientHeight;
});

const realMatchMedia = window.matchMedia;
/** The window as a mouse with room for a popover (the desktop's stickers), or a phone. */
function asDesktop(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('hover: hover'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:picture');
  URL.revokeObjectURL = vi.fn();
  shown = 120;
});
afterEach(() => {
  vi.restoreAllMocks();
  toast.show.mockClear();
  window.matchMedia = realMatchMedia;
  window.localStorage.clear();
});

function composer(props: Partial<Parameters<typeof ThreadComposer>[0]> = {}) {
  return (
    <ThreadComposer
      inputRef={createRef<HTMLTextAreaElement>()}
      otherHandle="alice"
      replyingTo={null}
      replyHandle={null}
      onCancelReply={() => {}}
      send={() => true}
      ready
      {...props}
    />
  );
}

/** What rides the next message: the rows inside the capsule. */
const riding = () => screen.getByRole('group', { name: 'Sent with your message' });
/** The riding row holding `text`. */
const rowOf = (text: string) => within(riding()).getByText(text).closest('[class*="carryRow"]') as HTMLElement;
/** The pictures riding: their thumbnails, in order. */
const thumbs = () => Array.from(document.querySelectorAll<HTMLElement>('[class*="carryThumb"]'));
const field = () => screen.getByRole('textbox', { name: 'Conversation with alice' });
const photos = (n: number) => Array.from({ length: n }, (_, i) => new File([String(i)], `p${i}.png`, { type: 'image/png' }));
const pick = (files: File[]) => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files } });

// Round 23 (the owner's: 「回覆的訊息會在這個整個訊息框的 border 以內」, Telegram's way): what rides the next message
// lies inside the capsule over the text's line, a row each — its mark over the ＋, its words where the text starts,
// its ✕ over Send — and Send is the block on the last row whenever anything rides.
describe('what rides the next message', () => {
  it('shows a reply as a row inside the capsule, its ✕ at the end, Send the block on one line', async () => {
    const onCancelReply = vi.fn();
    const { container } = renderWithIntl(
      composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'See you by the river' }, replyHandle: 'alice', onCancelReply }),
    );
    const capsule = field().closest('[class*="capsule"]')!;
    expect(capsule).toContainElement(riding());
    expect(capsule).toHaveAttribute('data-block');
    const row = rowOf('Replying to alice');
    expect(row).toHaveTextContent('See you by the river');
    // The three columns: the mark, the words, the ✕.
    expect(Array.from(row.children).map((c) => c.className.match(/carry(Mark|Words|Remove)/)?.[0])).toEqual(['carryMark', 'carryWords', 'carryRemove']);
    expect(row.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(container.querySelector('[class*="slip"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  // The reply's mark drew ~18 of its 28, nearly straight (the Divider trims each end and turns twice). The apps'
  // ReplyRule: over the box's whole height (28; 20 in a short window), seed 31, ±1.1, a turn every 9 or so and 3 at
  // least, one pen (INK) with round ends, in terracotta.
  it.each([28, 20])('draws the reply’s rule over its whole box, %i tall, as the apps do', (tall) => {
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return String(this.className).includes('carryRule') ? tall : 48;
      },
    });
    try {
      renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
      const rule = rowOf('Replying to alice').querySelector('[class*="carryRule"]')!;
      expect(rule.querySelector('svg')).toHaveAttribute('viewBox', `-3 0 6 ${tall}`);
      const path = rule.querySelector('svg path')!;
      const d = path.getAttribute('d')!;
      // Top to bottom of the box, on its axis at both ends.
      expect(d.startsWith('M 0,0 ')).toBe(true);
      expect(d.endsWith(` 0,${tall}`)).toBe(true);
      expect(d.match(/C/g)).toHaveLength(Math.max(3, Math.round(tall / 9)));
      const xs = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Math.abs(Number(m[1])));
      expect(Math.max(...xs)).toBeLessThanOrEqual(1.1);
      expect(Math.max(...xs)).toBeGreaterThan(0.1);
      expect(path).toHaveAttribute('stroke', 'var(--color-terracotta)');
      expect(path).toHaveAttribute('stroke-width', String(INK));
      expect(path).toHaveAttribute('stroke-linecap', 'round');
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height);
    }
  });

  it('keeps the field’s focus through a ✕ and through a press on a row', () => {
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
    field().focus();
    // A press anywhere would move the focus; the ✕ and the rows hold it back, so a phone's keyboard stays up.
    for (const target of [screen.getByRole('button', { name: 'Cancel reply' }), within(riding()).getByText('rain')]) {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      target.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
    }
    expect(field()).toHaveFocus();
  });

  it('goes to the message a reply answers when its words are pressed', async () => {
    const onJumpToReply = vi.fn();
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice', onJumpToReply }));
    await userEvent.click(within(riding()).getByRole('button', { name: /Replying to alice/ }));
    expect(onJumpToReply).toHaveBeenCalledWith('m1');
  });

  it('puts the reply away on Escape while nothing else is open, the field writing on', async () => {
    asDesktop(false);
    const onCancelReply = vi.fn();
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice', onCancelReply }));
    // The sticker panel open: Escape closes it first, the reply stays.
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar', { name: 'Stickers' })).toBeNull();
    expect(onCancelReply).not.toHaveBeenCalled();
    expect(field()).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  it('lets Escape close the ＋’s menu first, the reply staying', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const onCancelReply = vi.fn();
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice', onCancelReply }));
    await u.click(screen.getByRole('button', { name: 'Attach a photo or a card' }));
    expect(screen.getByRole('menuitem', { name: 'Card' })).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Card' })).toBeNull();
    expect(onCancelReply).not.toHaveBeenCalled();
  });

  // Round 23 (the critic's §8): a sticker sent that takes the reply riding with it drops the capsule from 98 to 48
  // while the panel is grown: the panel is measured again, so the capsule stays under the header.
  it('measures the grown panel again when the capsule’s height changes under it', async () => {
    asDesktop(false);
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: ResizeObserverCallback) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    let stackH = 98;
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.className.includes('composerStack') ? stackH : 48;
    });
    renderWithIntl(composer({ expandRoom: () => 700, replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    const panel = document.querySelector<HTMLElement>('[class*="stickerPanel"]')!;
    // At rest: the keyboard's height (as it was last).
    const base = parseFloat(panel.style.height);
    await userEvent.click(screen.getByRole('button', { name: 'Expand stickers' }));
    expect(panel.style.height).toBe(`${700 - 98 + base - 8}px`);
    stackH = 48;
    act(() => observers.forEach((cb) => cb([], {} as ResizeObserver)));
    expect(panel.style.height).toBe(`${700 - 48 + base - 8}px`);
    offsetHeight.mockRestore();
    vi.unstubAllGlobals();
  });

  it('says a reply chosen to a screen reader once, and not one brought back with a draft', async () => {
    const quote = { id: 'm9', senderId: 'alice', text: 'rain' };
    const view = renderWithIntl(composer({ replyHandle: 'alice' }));
    const said = () => document.querySelector('[aria-live="polite"]')!;
    expect(said()).toHaveTextContent('');
    view.rerender(composer({ replyHandle: 'alice', replyingTo: quote }));
    await waitFor(() => expect(said()).toHaveTextContent('Replying to alice'));
    // The focus never left the field for it (nothing was focused).
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Cancel reply' }));
  });

  // Round 23 review: the region must change for every reply chosen, or a screen reader says nothing.
  it('says each reply chosen, the same words again too: emptied as one goes or another takes its place', async () => {
    const said = () => document.querySelector('[aria-live="polite"]')!;
    const view = renderWithIntl(composer({ replyHandle: 'alice', replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' } }));
    view.rerender(composer({ replyHandle: 'alice', replyingTo: { id: 'm2', senderId: 'alice', text: 'sun' } }));
    await waitFor(() => expect(said()).toHaveTextContent('Replying to alice'));
    // Put away at once: nothing stale stays.
    view.rerender(composer({ replyHandle: 'alice', replyingTo: null }));
    expect(said()).toHaveTextContent('');
    // Another of hers chosen: said again.
    view.rerender(composer({ replyHandle: 'alice', replyingTo: { id: 'm3', senderId: 'alice', text: 'wind' } }));
    await waitFor(() => expect(said()).toHaveTextContent('Replying to alice'));
    // And straight from one to the next: emptied first, then the same words — a change the region announces.
    view.rerender(composer({ replyHandle: 'alice', replyingTo: { id: 'm4', senderId: 'alice', text: 'snow' } }));
    expect(said()).toHaveTextContent('');
    await waitFor(() => expect(said()).toHaveTextContent('Replying to alice'));
  });

  it('says the reply a draft brought back once it is chosen again after being put away', async () => {
    const quote: MessageReplyQuote = { id: 'm7', senderId: 'alice', text: 'rain' };
    window.localStorage.setItem('resonance:draft:me:alice_me', JSON.stringify({ text: 'kept', replyTo: quote, at: Date.now() }));
    function Host() {
      const inputRef = useRef<HTMLTextAreaElement>(null);
      const [reply, setReply] = useState<MessageReplyQuote | null>(null);
      return (
        <>
          <button type="button" onClick={() => setReply(quote)}>
            reply-m7
          </button>
          <ThreadComposer
            inputRef={inputRef}
            otherHandle="alice"
            replyingTo={reply}
            replyHandle="alice"
            onCancelReply={() => setReply(null)}
            onRestoreReply={setReply}
            send={() => true}
            ready
            uid="me"
            pairId="alice_me"
          />
        </>
      );
    }
    const said = () => document.querySelector('[aria-live="polite"]')!;
    renderWithIntl(<Host />);
    // Brought back: shown, not news.
    expect(await screen.findByText('Replying to alice', { ignore: '[aria-live]' })).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(said()).toHaveTextContent('');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'reply-m7' }));
    await waitFor(() => expect(said()).toHaveTextContent('Replying to alice'));
  });

  it('draws a reply’s picture or card cover small before its words', () => {
    renderWithIntl(
      composer({ replyingTo: { id: 'p1', senderId: 'alice', text: '', image: true }, replyHandle: 'alice', replyMedia: '/api/v1/chat-images/pic?size=thumb' }),
    );
    const row = rowOf('Replying to alice');
    const media = row.querySelector('[class*="carryWords"] img')!;
    expect(media).toHaveAttribute('src', '/api/v1/chat-images/pic?size=thumb');
    expect(media.className).toMatch(/carryMedia/);
    expect(row).toHaveTextContent('A photo');
  });

  // Round 22 (the owner's notes): a picture rides as its thumbnail, its own ✕ on its corner — inside the capsule.
  it('shows a pasted picture as its thumbnail, taken back by the ✕ on its corner', async () => {
    renderWithIntl(composer());
    expect(screen.queryByRole('group', { name: 'Sent with your message' })).toBeNull();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.paste(field(), { clipboardData: { files: [file] } });

    await waitFor(() => expect(thumbs()).toHaveLength(1));
    expect(field().closest('[class*="capsule"]')).toContainElement(thumbs()[0]);
    expect(thumbs()[0].querySelector('img')).toHaveAttribute('src', 'blob:picture');
    const remove = screen.getByRole('button', { name: 'Remove photo' });
    expect(thumbs()[0]).toContainElement(remove);
    // A neat small disc (barely hand-drawn) under the ✕ glyph, each its own drawing.
    const [disc, glyph] = Array.from(remove.querySelectorAll('svg'));
    expect(disc.getAttribute('class')).toMatch(/thumbDisc/);
    expect(glyph.getAttribute('class') ?? '').not.toMatch(/thumbDisc/);
    await userEvent.click(remove);
    expect(thumbs()).toHaveLength(0);
  });

  it('stacks a reply over the pictures, the reply first', async () => {
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'me', text: 'Mine' }, replyHandle: null }));
    fireEvent.paste(field(), { clipboardData: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } });
    await waitFor(() => expect(thumbs()).toHaveLength(1));
    expect(riding().firstElementChild).toHaveTextContent('Replying to yourself');
    expect(riding().lastElementChild).toContainElement(thumbs()[0]);
  });

  it('quotes a sticker being answered by its key frame alone', () => {
    renderWithIntl(
      composer({ replyingTo: { id: 's1', senderId: 'alice', text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } }, replyHandle: 'alice' }),
    );
    const row = rowOf('Replying to alice');
    expect(row.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/stickers/twine/thanks.thumb.webp'));
    expect(row).not.toHaveTextContent('Thanks');
  });

  it('names what each ✕ takes away', async () => {
    renderWithIntl(composer({ replyNote: { noteId: 'n1', cardId: 'walk' } }));
    expect(rowOf('In reply to your note').lastElementChild).toContainElement(screen.getByRole('button', { name: 'Remove note' }));
  });
});

// Round 22 §4.2: several pictures ride as a numbered strip (up to ten), and one Send sends them as an album.
describe('several pictures', () => {
  it('lines them up in order, each with its own ✕ and nothing else, and sends them as an album with the words', async () => {
    const send = vi.fn(() => true);
    renderWithIntl(composer({ send }));
    pick(photos(3));
    await waitFor(() => expect(thumbs()).toHaveLength(3));
    // No numbers, no count, no ✕ for them all (round 22, the owner's notes).
    expect(riding().textContent).toBe('');
    expect(screen.queryByText('3 photos')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Remove photo \d$/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(thumbs()).toHaveLength(2);

    fireEvent.change(field(), { target: { value: 'rain' } });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledTimes(1);
    const draft = (send.mock.calls[0] as unknown[])[0] as { text: string; images: { file: File }[]; image?: unknown };
    expect(draft.text).toBe('rain');
    expect(draft.image).toBeUndefined();
    expect(draft.images.map((p) => p.file.name)).toEqual(['p0.png', 'p2.png']);
    expect(thumbs()).toHaveLength(0);
  });

  it('makes the pictures ready one at a time, a later pick waiting for the ones before it', async () => {
    prep.most = 0;
    renderWithIntl(composer());
    pick(photos(4));
    fireEvent.paste(field(), { clipboardData: { files: photos(2) } });
    await waitFor(() => expect(thumbs()).toHaveLength(6));
    expect(prep.most).toBe(1);
  });

  it('takes ten at most, and says so past that', async () => {
    renderWithIntl(composer());
    pick(photos(8));
    await waitFor(() => expect(thumbs()).toHaveLength(8));
    pick(photos(4));
    await waitFor(() => expect(thumbs()).toHaveLength(10));
    expect(toast.show).toHaveBeenCalledWith({ message: 'Up to 10 photos at a time' });
    toast.show.mockClear();
    fireEvent.paste(field(), { clipboardData: { files: photos(1) } });
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ message: 'Up to 10 photos at a time' }));
    expect(thumbs()).toHaveLength(10);
  });

  it('asks before a card takes the pictures’ place, and before pictures take the card’s', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithIntl(composer());
    pick(photos(2));
    await waitFor(() => expect(thumbs()).toHaveLength(2));
    await u.click(screen.getByRole('button', { name: 'Attach a photo or a card' }));
    await u.click(screen.getByRole('menuitem', { name: 'Card' }));
    await u.click(await screen.findByRole('button', { name: 'pick-card' }));

    // Kept as they are until the viewer says so.
    let ask = await screen.findByRole('dialog', { name: 'Use this card instead?' });
    await u.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(thumbs()).toHaveLength(2);
    expect(screen.queryByText('A shared thought')).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Attach a photo or a card' }));
    await u.click(screen.getByRole('menuitem', { name: 'Card' }));
    await u.click(await screen.findByRole('button', { name: 'pick-card' }));
    ask = await screen.findByRole('dialog', { name: 'Use this card instead?' });
    await u.click(within(ask).getByRole('button', { name: 'Use card' }));
    expect(await screen.findByText('A shared thought')).toBeInTheDocument();
    expect(thumbs()).toHaveLength(0);

    // And the other way round.
    pick(photos(1));
    ask = await screen.findByRole('dialog', { name: 'Use photos instead?' });
    await u.click(within(ask).getByRole('button', { name: 'Use photos' }));
    await waitFor(() => expect(thumbs()).toHaveLength(1));
    expect(screen.queryByText('A shared thought')).not.toBeInTheDocument();
  });
});

// Round 22 §4.1: the ☺ inside the capsule; on a phone the stickers take the keyboard's place, with a mouse they
// hang over the ☺. A sticker picked is previewed; picked again (or its preview tapped) it goes.
describe('the stickers', () => {
  it('opens the panel in the keyboard’s place on a phone, ↑ growing it only while there is nothing to send', async () => {
    asDesktop(false);
    renderWithIntl(composer());
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    expect(screen.getByRole('toolbar', { name: 'Stickers' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Stickers' })).toBeNull();
    // The ☺ is the way back to the keyboard now.
    expect(screen.getByRole('button', { name: 'Keyboard' })).toHaveAttribute('aria-expanded', 'true');

    const grow = screen.getByRole('button', { name: 'Expand stickers' });
    expect(grow).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(grow);
    expect(screen.getByRole('button', { name: 'Collapse stickers' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('[class*="stickerPanel"]')).toHaveAttribute('data-tall');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse stickers' }));

    // Something to send (a picture riding): the segment is Send again; nothing, ↑ again.
    fireEvent.paste(field(), { clipboardData: { files: photos(1) } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Expand stickers' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Send' })).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.getByRole('button', { name: 'Expand stickers' })).toBeInTheDocument();

    // Back to the keyboard: the panel goes, the field has the focus.
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard' }));
    expect(screen.queryByRole('toolbar', { name: 'Stickers' })).toBeNull();
    expect(field()).toHaveFocus();
  });

  // Round 22 (the owner's third notes): scrolling the grid only scrolls it — the panel grows from ↑ alone (and
  // shrinks from ↓), ↑ / ↓ turning on the segment that rides the capsule up with it.
  it('never grows the panel as a finger scrolls the grid: ↑ alone grows it', async () => {
    asDesktop(false);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    renderWithIntl(composer({ expandRoom: () => 700 }));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    const panel = document.querySelector<HTMLElement>('[class*="stickerPanel"]')!;
    const grid = panel.querySelector<HTMLElement>('[class*="stickerGrid"]')!;
    const touch = (type: string, y: number) => {
      const e = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches: type === 'touchend' ? [] : [{ clientY: y }] });
      act(() => void grid.dispatchEvent(e));
      return e;
    };
    expect(panel.style.height).toBe('300px');
    touch('touchstart', 500);
    const move = touch('touchmove', 200);
    touch('touchend', 200);
    // The grid had the finger; the panel stayed as it was.
    expect(move.defaultPrevented).toBe(false);
    expect(panel.style.height).toBe('300px');
    expect(panel).not.toHaveAttribute('data-tall');

    const grow = screen.getByRole('button', { name: 'Expand stickers' });
    // ˄ is the chevron turned (never an arrow, which reads as sending the sticker).
    expect(grow.querySelector('[class*="sendGlyph"]')).toHaveAttribute('data-turned');
    await userEvent.click(grow);
    expect(panel).toHaveAttribute('data-tall');
    expect(parseFloat(panel.style.height)).toBeGreaterThan(300);
    // The chevron turns to ˅ on the segment itself (a CSS turn the height's animation carries).
    expect(screen.getByRole('button', { name: 'Collapse stickers' }).querySelector('[class*="sendGlyph"]')).not.toHaveAttribute('data-turned');
  });

  // Round 23 (the owner's: 「點擊就直接傳送出去，不用點擊兩次，也不用出現上面那個框框」): a tap sends the sticker.
  it('sends a sticker on one tap with nothing else, the pictures riding staying for their own message', async () => {
    asDesktop(false);
    const send = vi.fn(() => true);
    renderWithIntl(composer({ send, uid: 'me', pairId: 'alice_me' }));
    fireEvent.paste(field(), { clipboardData: { files: photos(1) } });
    await waitFor(() => expect(thumbs()).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    const thanks = screen.getAllByRole('button', { name: 'Thanks' })[0];
    // Its name, then what a tap does.
    expect(thanks).toHaveAccessibleDescription('Send sticker');
    await userEvent.click(thanks);
    expect(send).toHaveBeenCalledWith({ text: '', sticker: { pack: 'twine', id: 'thanks' } });
    expect(screen.queryByText('Tap again to send')).toBeNull();
    expect(thumbs()).toHaveLength(1);
    // The panel stays (the keyboard's place), for the next one.
    expect(screen.getByRole('toolbar', { name: 'Stickers' })).toBeInTheDocument();
  });

  it('sends nothing more for the same sticker tapped again at once, but another goes straight after', async () => {
    asDesktop(false);
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const send = vi.fn(() => true);
    renderWithIntl(composer({ send }));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    const tap = (name: string) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
    tap('Thanks');
    now.mockReturnValue(10_000 + STICKER_REPEAT_MS - 1);
    tap('Thanks');
    expect(send).toHaveBeenCalledTimes(1);
    tap('Hug');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ text: '', sticker: { pack: 'nod', id: 'hug' } });
    now.mockReturnValue(10_000 + STICKER_REPEAT_MS * 3);
    tap('Hug');
    expect(send).toHaveBeenCalledTimes(3);
    expect(STICKER_REPEAT_MS).toBe(600);
  });

  it('holds the recent stickers still while the panel is open, and shows the new order next time', async () => {
    asDesktop(false);
    window.localStorage.setItem('resonance:stickers:recent:me', JSON.stringify([{ pack: 'twine', id: 'thanks' }]));
    renderWithIntl(composer({ uid: 'me', pairId: 'alice_me' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    const recent = () => within(document.querySelector<HTMLElement>('[data-sticker-section="recent"]')!).getAllByRole('button').map((b) => b.getAttribute('data-sticker'));
    expect(recent()).toEqual(['twine/thanks']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hug' })[0]);
    // Stored at once, shown as it was: the next tap lands where the finger expects.
    expect(JSON.parse(window.localStorage.getItem('resonance:stickers:recent:me')!)).toEqual([{ pack: 'nod', id: 'hug' }, { pack: 'twine', id: 'thanks' }]);
    expect(recent()).toEqual(['twine/thanks']);
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    expect(recent()).toEqual(['nod/hug', 'twine/thanks']);
  });

  // Round 23 review: the sheet goes on the first click, so the old habit's second click, a moment later, must not
  // fall through to the thread under where it lay (a card, a link, a picture).
  it('lets the second click of the old two-click habit land on nothing where the sheet lay', async () => {
    asDesktop(true);
    const send = vi.fn(() => true);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.getAttribute('role') === 'dialog' ? new DOMRect(500, 200, 400, 460) : new DOMRect(0, 0, 0, 0);
    });
    const underneath = vi.fn();
    renderWithIntl(<div onClick={underneath}>{composer({ send })}</div>);
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Stickers' })).getAllByRole('button', { name: 'Thanks' })[0]);
    expect(screen.queryByRole('dialog', { name: 'Stickers' })).toBeNull();
    expect(field()).toHaveFocus();
    const catcher = document.querySelector<HTMLElement>('[data-click-catcher]');
    expect(catcher).not.toBeNull();
    expect([catcher!.style.top, catcher!.style.left, catcher!.style.width, catcher!.style.height]).toEqual(['200px', '500px', '400px', '460px']);
    underneath.mockClear();
    await userEvent.click(catcher!);
    expect(underneath).not.toHaveBeenCalled();
    expect(field()).toHaveFocus();
    expect(send).toHaveBeenCalledTimes(1);
    // Only for a moment.
    await waitFor(() => expect(document.querySelector('[data-click-catcher]')).toBeNull(), { timeout: STICKER_REPEAT_MS + 400 });
  });

  it('hangs a sheet over the capsule with a mouse, which a sticker sent or Escape puts away, the field writing again', async () => {
    asDesktop(true);
    const send = vi.fn(() => true);
    renderWithIntl(composer({ send }));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    let sheet = screen.getByRole('dialog', { name: 'Stickers' });
    expect(within(sheet).getByRole('toolbar', { name: 'Stickers' })).toBeInTheDocument();
    expect(sheet.querySelector('[data-variant="popover"]')).toBeTruthy();
    // No keyboard to give way to: the ☺ stays the ☺.
    expect(screen.getByRole('button', { name: 'Stickers' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'Expand stickers' })).toBeNull();

    await userEvent.click(within(sheet).getAllByRole('button', { name: 'Thanks' })[0]);
    expect(send).toHaveBeenCalledWith({ text: '', sticker: { pack: 'twine', id: 'thanks' } });
    expect(screen.queryByRole('dialog', { name: 'Stickers' })).toBeNull();
    expect(field()).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    sheet = screen.getByRole('dialog', { name: 'Stickers' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Stickers' })).toBeNull();
    expect(field()).toHaveFocus();
  });
});

// Round 22 §4.3: from three lines a ⤢ grows the field; past five it scrolls, its edges fading where more is.
describe('a longer message', () => {
  it('offers ⤢ from the third line', () => {
    renderWithIntl(composer());
    fireEvent.change(field(), { target: { value: 'one\ntwo' } });
    expect(screen.queryByRole('button', { name: 'Expand the message field' })).toBeNull();
    fireEvent.change(field(), { target: { value: 'one\ntwo\nthree' } });
    expect(screen.getByRole('button', { name: 'Expand the message field' })).toBeInTheDocument();
  });

  // Round 22 (the owner's notes): from the second line the send segment is the block on the last row; from the
  // third ⤢ stands over it in its column (at the capsule's top-right) — the text keeps the whole width left of it.
  it('turns Send into the block on the last row from the second line, ⤢ over it from the third', () => {
    const view = renderWithIntl(composer());
    const capsule = field().closest('[class*="capsule"]')!;
    expect(capsule).not.toHaveAttribute('data-block');
    fireEvent.change(field(), { target: { value: 'one\ntwo' } });
    expect(capsule).toHaveAttribute('data-block');
    expect(screen.queryByRole('button', { name: 'Expand the message field' })).toBeNull();
    fireEvent.change(field(), { target: { value: 'one\ntwo\nthree' } });
    const grow = screen.getByRole('button', { name: 'Expand the message field' });
    const column = grow.closest('[class*="sendColumn"]')!;
    const send = screen.getByRole('button', { name: 'Send' });
    expect(column).toContainElement(send);
    // Over it, first in its column (the CSS keeps it at the column's top).
    expect(grow.closest('[class*="aboveSend"]')).toBe(column.firstElementChild);
    expect(grow.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(field(), { target: { value: 'one' } });
    expect(capsule).not.toHaveAttribute('data-block');
    // One line, a reply riding: the block all the same (round 23).
    view.rerender(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
    expect(capsule).toHaveAttribute('data-block');
  });

  // Round 23: ⤢ stands at the text's top in Send's column — under the rows, never on a row's ✕.
  it('keeps ⤢ in the text’s own column under what rides', () => {
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
    fireEvent.change(field(), { target: { value: 'one\ntwo\nthree' } });
    const grow = screen.getByRole('button', { name: 'Expand the message field' });
    expect(riding()).not.toContainElement(grow);
    const line = field().closest('[class*="fieldLine"]')!;
    expect(line).toContainElement(grow);
    expect(riding().compareDocumentPosition(grow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // A sticker isn't sent with words: the ☺ steps aside while the field holds any, and comes back when it is empty.
  it('takes the ☺ away while there are words, and closes the stickers for them', async () => {
    asDesktop(false);
    renderWithIntl(composer());
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    expect(screen.getByRole('toolbar', { name: 'Stickers' })).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: 'hello' } });
    expect(screen.queryByRole('toolbar', { name: 'Stickers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stickers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keyboard' })).toBeNull();
    fireEvent.change(field(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Stickers' })).toBeInTheDocument();
  });

  it('fades an edge only while there is text beyond it', () => {
    renderWithIntl(composer());
    const box = field();
    fireEvent.change(box, { target: { value: Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n') } });
    box.scrollTop = 0;
    fireEvent.scroll(box);
    expect([box.hasAttribute('data-fade-top'), box.hasAttribute('data-fade-bottom')]).toEqual([false, true]);
    box.scrollTop = 60;
    fireEvent.scroll(box);
    expect([box.hasAttribute('data-fade-top'), box.hasAttribute('data-fade-bottom')]).toEqual([true, true]);
    box.scrollTop = 120;
    fireEvent.scroll(box);
    expect([box.hasAttribute('data-fade-top'), box.hasAttribute('data-fade-bottom')]).toEqual([true, false]);
    // All of it in view: no fade.
    fireEvent.change(box, { target: { value: 'short' } });
    box.scrollTop = 0;
    fireEvent.scroll(box);
    expect([box.hasAttribute('data-fade-top'), box.hasAttribute('data-fade-bottom')]).toEqual([false, false]);
  });

  it('grows as tall as the thread leaves it, and shrinks back on ⤡ or once sent', async () => {
    const onExpandedChange = vi.fn();
    const expandRoom = vi.fn(() => 400);
    renderWithIntl(composer({ expandRoom, onExpandedChange }));
    const box = field();
    fireEvent.change(box, { target: { value: 'one\ntwo\nthree' } });
    await userEvent.click(screen.getByRole('button', { name: 'Expand the message field' }));
    const capsule = box.closest('[class*="capsule"]')!;
    expect(capsule).toHaveAttribute('data-expanded');
    expect(expandRoom).toHaveBeenCalledWith('field');
    // All the room: the text box's own padding runs to the capsule's pen line.
    expect(box.style.height).toBe('400px');
    // ⤡ directly above the send block, no ☺ beside words.
    const shrink = screen.getByRole('button', { name: 'Shrink the message field' });
    expect(shrink.closest('[class*="sendColumn"]')).toContainElement(screen.getByRole('button', { name: 'Send' }));
    expect(screen.queryByRole('button', { name: 'Stickers' })).toBeNull();
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    expect(box).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Shrink the message field' }));
    expect(capsule).not.toHaveAttribute('data-expanded');
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);

    await userEvent.click(screen.getByRole('button', { name: 'Expand the message field' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(capsule).not.toHaveAttribute('data-expanded');
  });

  // Round 23: the rows ride inside the capsule, so the grown field leaves them their room (the suite's boxes are 48).
  it('grows the field less the rows riding over it', async () => {
    renderWithIntl(composer({ expandRoom: () => 400, replyingTo: { id: 'm1', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
    fireEvent.change(field(), { target: { value: 'one\ntwo\nthree' } });
    await userEvent.click(screen.getByRole('button', { name: 'Expand the message field' }));
    expect(field().style.height).toBe(`${400 - 48}px`);
  });
});

// Round 22 §4.4: what is being written is the conversation's draft in this browser, until it is sent.
describe('drafts', () => {
  const props = { uid: 'me', pairId: 'alice_me' };

  it('keeps what is written, brings it back with its reply and card, and forgets it once sent', async () => {
    const first = renderWithIntl(composer({ ...props, replyingTo: { id: 'm7', senderId: 'alice', text: 'rain' }, replyHandle: 'alice' }));
    fireEvent.change(field(), { target: { value: 'half a thought' } });
    await waitFor(() => expect(window.localStorage.getItem('resonance:draft:me:alice_me')).toContain('half a thought'));
    first.unmount();

    const onRestoreReply = vi.fn();
    const send = vi.fn(() => true);
    renderWithIntl(composer({ ...props, onRestoreReply, send }));
    expect(field()).toHaveValue('half a thought');
    expect(onRestoreReply).toHaveBeenCalledWith({ id: 'm7', senderId: 'alice', text: 'rain' });

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: 'half a thought' }));
    expect(window.localStorage.getItem('resonance:draft:me:alice_me')).toBeNull();
  });

  it('keeps it at once on leaving, drops a reply to a message unsent since, and brings back the card', async () => {
    window.localStorage.setItem(
      'resonance:draft:me:alice_me',
      JSON.stringify({ text: 'kept', replyTo: { id: 'm7', senderId: 'alice', text: 'rain' }, cardId: 'walk', at: Date.now() }),
    );
    const onRestoreReply = vi.fn();
    const view = renderWithIntl(composer({ ...props, onRestoreReply, isUnsent: (id) => id === 'm7' }));
    expect(field()).toHaveValue('kept');
    expect(onRestoreReply).not.toHaveBeenCalled();
    expect(await screen.findByText('A shared thought')).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: 'kept, then more' } });
    view.unmount();
    expect(JSON.parse(window.localStorage.getItem('resonance:draft:me:alice_me')!)).toMatchObject({ text: 'kept, then more', cardId: 'walk' });
  });

  it('forgets it when emptied, and writes nothing back once the conversation is deleted', async () => {
    const handle = createRef<ThreadComposerHandle>();
    const view = renderWithIntl(composer({ ...props, handle }));
    fireEvent.change(field(), { target: { value: 'soon gone' } });
    await waitFor(() => expect(window.localStorage.getItem('resonance:draft:me:alice_me')).toContain('soon gone'));
    fireEvent.change(field(), { target: { value: '' } });
    await waitFor(() => expect(window.localStorage.getItem('resonance:draft:me:alice_me')).toBeNull());

    fireEvent.change(field(), { target: { value: 'written, then deleted' } });
    act(() => handle.current!.forgetDraft());
    view.unmount();
    expect(window.localStorage.getItem('resonance:draft:me:alice_me')).toBeNull();
  });
});

// @vitest-environment jsdom
import { createRef } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import type { Card } from '@/lib/db/types';

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

import { ThreadComposer, type ThreadComposerHandle } from './ThreadComposer';

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

/** The riding row holding `text`, as a list of what is in it from start to end. */
const rowOf = (text: string) => screen.getByText(text).closest('[class*="carryRow"]') as HTMLElement;
/** The pictures riding: their thumbnails, in order. */
const thumbs = () => Array.from(document.querySelectorAll<HTMLElement>('[class*="carryThumb"]'));
const field = () => screen.getByRole('textbox', { name: 'Conversation with alice' });
const photos = (n: number) => Array.from({ length: n }, (_, i) => new File([String(i)], `p${i}.png`, { type: 'image/png' }));
const pick = (files: File[]) => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files } });

// Round 10 §3.4: what rides the next message sits over the capsule as rows in the reply's style, with no frame —
// what it is at the start, whom or what, and its ✕ at the row's end.
describe('what rides the next message', () => {
  it('shows a reply as a row, its ✕ at the end, with no slip round it', async () => {
    const onCancelReply = vi.fn();
    const { container } = renderWithIntl(
      composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'See you by the river' }, replyHandle: 'alice', onCancelReply }),
    );
    const row = rowOf('Replying to alice');
    expect(row).toHaveTextContent('See you by the river');
    expect(row.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(container.querySelector('[class*="slip"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  // Round 22 (the owner's notes): a picture rides as its thumbnail over the capsule, its own ✕ on its corner.
  it('shows a pasted picture as its thumbnail, taken back by the ✕ on its corner', async () => {
    renderWithIntl(composer());
    expect(document.querySelector('[class*="carry"]')).toBeNull();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.paste(field(), { clipboardData: { files: [file] } });

    await waitFor(() => expect(thumbs()).toHaveLength(1));
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
    const carry = document.querySelector('[class*="carry"]')!;
    expect(carry.firstElementChild).toHaveTextContent('Replying to yourself');
    expect(carry.lastElementChild).toContainElement(thumbs()[0]);
  });

  it('quotes a sticker being answered by its key frame alone', () => {
    renderWithIntl(
      composer({ replyingTo: { id: 's1', senderId: 'alice', text: '〔貼圖：謝謝〕', sticker: { pack: 'twine', id: 'thanks' } }, replyHandle: 'alice' }),
    );
    const row = rowOf('Replying to alice');
    expect(row.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/stickers/twine/thanks.thumb.webp'));
    expect(row).not.toHaveTextContent('Thanks');
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
    expect(document.querySelector('[class*="carry"]')!.textContent).toBe('');
    expect(screen.queryByText('3 photos')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Remove photo/ })).toHaveLength(3);
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
    expect(grow.querySelector('[class*="sendGlyph"]')).not.toHaveAttribute('data-turned');
    await userEvent.click(grow);
    expect(panel).toHaveAttribute('data-tall');
    expect(parseFloat(panel.style.height)).toBeGreaterThan(300);
    // The glyph turns to ↓ on the segment itself (a CSS turn the height's animation carries).
    expect(screen.getByRole('button', { name: 'Collapse stickers' }).querySelector('[class*="sendGlyph"]')).toHaveAttribute('data-turned');
  });

  it('previews a sticker, sends it on a second tap with nothing else, and keeps it among the recent', async () => {
    asDesktop(false);
    const send = vi.fn(() => true);
    renderWithIntl(composer({ send, uid: 'me', pairId: 'alice_me' }));
    fireEvent.paste(field(), { clipboardData: { files: photos(1) } });
    await waitFor(() => expect(thumbs()).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    expect(screen.queryByRole('button', { name: 'Recent' })).toBeNull();

    await userEvent.click(screen.getAllByRole('button', { name: 'Thanks' })[0]);
    const preview = screen.getByRole('button', { name: 'Preview: Thanks, tap again to send' });
    expect(preview.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/stickers/twine/thanks.webp'));
    expect(screen.getByRole('status')).toHaveTextContent('Preview: Thanks, tap again to send');
    expect(send).not.toHaveBeenCalled();

    // Another sticker: previewed in its place. The same one again: it goes.
    await userEvent.click(screen.getAllByRole('button', { name: 'Hug' })[0]);
    expect(screen.getByRole('button', { name: 'Preview: Hug, tap again to send' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Hug' })[0]);
    expect(send).toHaveBeenCalledWith({ text: '', sticker: { pack: 'nod', id: 'hug' } });
    expect(screen.queryByRole('button', { name: /^Preview:/ })).toBeNull();
    // The picture riding stays (a sticker is its own message); the sticker leads the recent ones.
    expect(thumbs()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();

    // A tap on the preview sends it too.
    await userEvent.click(screen.getAllByRole('button', { name: 'Hi!' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Preview: Hi!, tap again to send' }));
    expect(send).toHaveBeenLastCalledWith({ text: '', sticker: { pack: 'pip', id: 'hi' } });
  });

  it('hangs a sheet over the ☺ with a mouse, which Escape puts away, the field writing again', async () => {
    asDesktop(true);
    renderWithIntl(composer());
    await userEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    const sheet = screen.getByRole('dialog', { name: 'Stickers' });
    expect(within(sheet).getByRole('toolbar', { name: 'Stickers' })).toBeInTheDocument();
    expect(sheet.querySelector('[data-variant="popover"]')).toBeTruthy();
    // No keyboard to give way to: the ☺ stays the ☺.
    expect(screen.getByRole('button', { name: 'Stickers' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'Expand stickers' })).toBeNull();

    await userEvent.click(within(sheet).getAllByRole('button', { name: 'Thanks' })[0]);
    expect(within(sheet).getByRole('button', { name: 'Preview: Thanks, tap again to send' })).toBeInTheDocument();
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
    renderWithIntl(composer());
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

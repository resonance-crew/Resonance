// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { Editor } from '@tiptap/core';
import en from '@/messages/en.json';
import { uploadImageFile } from '@/lib/images/upload';
import { MarkdownEditor } from './MarkdownEditor';

// The card picker reads the viewer's cards; it isn't opened here.
vi.mock('./InsertCardModal', () => ({
  InsertCardModal: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="card picker" /> : null),
}));
vi.mock('@/lib/images/upload', () => ({
  UnsupportedImage: class extends Error {},
  uploadImageFile: vi.fn(async (file: File) => ({ publicUrl: `https://img.example.com/${file.name}` })),
}));
// The shell's toast: what a picture that didn't go up says on the writer's page.
const toast = vi.hoisted(() => ({ show: vi.fn(() => 1), dismiss: vi.fn() }));
vi.mock('@/components/providers/ToastProvider', () => ({ useToast: () => toast }));

// jsdom lays nothing out: ProseMirror measures the caret (scrolling it into view, placing a menu) with
// ranges it can't measure.
const noRect = () => new DOMRect(0, 0, 0, 0);
Range.prototype.getBoundingClientRect ??= noRect;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Document.prototype.elementFromPoint ??= () => null;

/** The Tiptap editor behind a story field (Tiptap hangs it on its DOM). */
const editorOf = (field: HTMLElement) => (field as unknown as { editor: Editor }).editor;

/** A screen whose pointer is fine (a mouse) or not (a finger). */
const realMatchMedia = window.matchMedia;
function pointer(fine: boolean) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: fine && /pointer: fine/.test(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

// The writer sets a story with the reader's own rules (src/styles/story.css):
// the editable root is the story's root, and says how the story is set.
describe('MarkdownEditor', () => {
  it("is the story's root, set by the script and language the writer reads off the draft", async () => {
    const view = renderWithIntl(
      <MarkdownEditor value={'The first morning\n\n![postbox](https://cdn.example.com/x.webp)'} onChange={vi.fn()} ariaLabel="Story" script="latin" lang="en" />,
    );
    const story = await screen.findByRole('textbox', { name: 'Story' });
    expect(story).toHaveClass('story-prose');
    expect(story).toHaveAttribute('data-script', 'latin');
    expect(story).toHaveAttribute('lang', 'en');
    // A picture is a block the shared rules space, as the reader's is.
    await waitFor(() => expect(story.querySelector('.story-picture img')).toHaveAttribute('alt', 'postbox'));

    // A new reading of the draft re-sets it at once, with nothing typed.
    view.rerender(<MarkdownEditor value="" onChange={vi.fn()} ariaLabel="Story" script="cjk" lang="zh-TW" />);
    await waitFor(() => expect(story).toHaveAttribute('data-script', 'cjk'));
    expect(story).toHaveAttribute('lang', 'zh-TW');
  });

  it('is set as CJK, with no language of its own, until told otherwise', async () => {
    renderWithIntl(<MarkdownEditor value="" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    expect(story).toHaveClass('story-prose');
    expect(story).not.toHaveAttribute('data-script');
    expect(story).not.toHaveAttribute('lang');
  });
});

// The fixed toolbar's words are the story's Markdown: 粗體 is **, 大標 is ##.
describe('the framed editor', () => {
  it('formats the selection from its toolbar, and stores it as Markdown', async () => {
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor value="A quiet morning" onChange={onChange} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    const toolbar = screen.getByRole('toolbar', { name: en.write.editor.toolbarLabel });
    act(() => void editorOf(story).commands.setTextSelection({ from: 3, to: 8 }));

    await userEvent.click(within(toolbar).getByRole('button', { name: en.write.editor.bold }));
    expect(onChange).toHaveBeenLastCalledWith('A **quiet** morning');
    expect(within(toolbar).getByRole('button', { name: en.write.editor.bold })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(toolbar).getByRole('button', { name: en.write.editor.h2 }));
    expect(onChange).toHaveBeenLastCalledWith('## A **quiet** morning');
  });
});

// The writer's own page: no frame and no toolbar; the tools come with what the writer is doing.
describe('the canvas', () => {
  it('has no frame or fixed toolbar, and no tools before the story is written in', async () => {
    pointer(false);
    renderWithIntl(<MarkdownEditor variant="canvas" value="" onChange={vi.fn()} ariaLabel="Story" />);
    await screen.findByRole('textbox', { name: 'Story' });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  // A mouse selects words: the bubble over them formats them.
  it('offers a selection bubble to a fine pointer, a toolbar of pressed states', async () => {
    pointer(true);
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor variant="canvas" value="A quiet morning" onChange={onChange} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    const editor = editorOf(story);
    act(() => void editor.chain().focus().setTextSelection({ from: 3, to: 8 }).run());
    const bubble = await screen.findByRole('toolbar', { name: en.write.editor.toolbarLabel });
    const bold = within(bubble).getByRole('button', { name: en.write.editor.bold });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    // One tab stop; the arrows walk the rest.
    expect(bold).toHaveAttribute('tabindex', '0');
    expect(within(bubble).getByRole('button', { name: en.write.editor.italic })).toHaveAttribute('tabindex', '-1');

    await userEvent.click(bold);
    expect(onChange).toHaveBeenLastCalledWith('A **quiet** morning');
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
    // The keyboard bar is a finger's: never with a mouse.
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
  });

  it('walks the bubble with the arrows, and Escape gives the words back with the selection kept', async () => {
    pointer(true);
    renderWithIntl(<MarkdownEditor variant="canvas" value="A quiet morning" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    const editor = editorOf(story);
    act(() => void editor.chain().focus().setTextSelection({ from: 3, to: 8 }).run());
    const bubble = await screen.findByRole('toolbar', { name: en.write.editor.toolbarLabel });
    const bold = within(bubble).getByRole('button', { name: en.write.editor.bold });
    act(() => bold.focus());
    fireEvent.keyDown(bold, { key: 'ArrowRight' });
    expect(within(bubble).getByRole('button', { name: en.write.editor.italic })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(story).toHaveFocus());
    expect(editor.state.selection).toMatchObject({ from: 3, to: 8 });
  });

  // A mouse on an empty line: the "+" in the margin puts a picture or a card there.
  it('offers a fine pointer the "+" on an empty line, opening a picture or a card', async () => {
    pointer(true);
    renderWithIntl(<MarkdownEditor variant="canvas" value="" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).commands.focus('start'));
    await userEvent.click(await screen.findByRole('button', { name: en.write.editor.insert }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: en.write.editor.insertImage })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: en.write.editor.insertCard }));
    expect(await screen.findByRole('dialog', { name: 'card picker' })).toBeInTheDocument();
  });

  // A finger writes on a phone: the bar on the keyboard, only while the story has the focus.
  it('docks the keyboard bar while the story has the focus, and takes it away after', async () => {
    pointer(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithIntl(<MarkdownEditor variant="canvas" value="A quiet morning" onChange={vi.fn()} ariaLabel="Story" />);
      const story = await screen.findByRole('textbox', { name: 'Story' });
      const editor = editorOf(story);
      expect(screen.queryByRole('toolbar')).toBeNull();

      act(() => void editor.commands.focus('end'));
      const bar = await screen.findByRole('toolbar', { name: en.write.editor.toolbarLabel });
      expect(within(bar).getByRole('button', { name: en.write.editor.insertImage })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: en.write.editor.quote })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: en.write.editor.hideKeyboard })).toBeInTheDocument();

      act(() => void editor.commands.blur());
      // A moment's grace: a tap on the bar, or on the next field, lands first.
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(screen.queryByRole('toolbar')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts a picture chosen from the keyboard bar at the caret', async () => {
    pointer(false);
    const onChange = vi.fn();
    const onUploadingChange = vi.fn();
    const { container } = renderWithIntl(
      <MarkdownEditor
        variant="canvas"
        value={'First line\n\nSecond line'}
        onChange={onChange}
        onUploadingChange={onUploadingChange}
        ariaLabel="Story"
      />,
    );
    const story = await screen.findByRole('textbox', { name: 'Story' });
    const editor = editorOf(story);
    // The caret at the end of the first paragraph.
    act(() => void editor.chain().focus().setTextSelection(11).run());
    const bar = await screen.findByRole('toolbar', { name: en.write.editor.toolbarLabel });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    await userEvent.click(within(bar).getByRole('button', { name: en.write.editor.insertImage }));
    expect(click).toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [new File(['x'], 'postbox.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('![postbox.webp](https://img.example.com/postbox.webp)')));
    const md = onChange.mock.lastCall![0] as string;
    expect(md.indexOf('First line')).toBeLessThan(md.indexOf('postbox'));
    expect(md.indexOf('postbox')).toBeLessThan(md.indexOf('Second line'));
    expect(onUploadingChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(onUploadingChange).toHaveBeenLastCalledWith(false));
  });

  // On the writer's page the story may be scrolled far from where the picture was going: the toast says it in view.
  it('says a picture that didn’t go up with the shell’s toast on the writer’s page', async () => {
    pointer(false);
    vi.mocked(uploadImageFile).mockRejectedValueOnce(new Error('offline'));
    const { container } = renderWithIntl(<MarkdownEditor variant="canvas" value="A line" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).chain().focus().setTextSelection(3).run());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'lost.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ message: en.write.editor.imageUploadError }));
  });

  it('opens the card picker from the keyboard bar', async () => {
    pointer(false);
    renderWithIntl(<MarkdownEditor variant="canvas" value="A line" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).commands.focus('end'));
    const bar = await screen.findByRole('toolbar', { name: en.write.editor.toolbarLabel });
    await userEvent.click(within(bar).getByRole('button', { name: en.write.editor.insertCard }));
    expect(await screen.findByRole('dialog', { name: 'card picker' })).toBeInTheDocument();
  });
});


// The writer's link tool (round 16 §6): 連結 in the bubble, ⌘K, the "+"'s 連結, the keyboard bar's glyph —
// each opening one link editor; a link alone on its line is its card, as the reader draws it.
describe('the link tool', () => {
  const L = en.write.editor;

  // Round 17 §6: 連結 is the bubble's last tool, after a separator of its own; the link editor is the house dialog.
  it('links selected words from the bubble’s 連結 (its last tool), in the dialog, as those words — no 卡片 inside a sentence', async () => {
    pointer(true);
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor variant="canvas" value="A quiet morning" onChange={onChange} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).chain().focus().setTextSelection({ from: 3, to: 8 }).run());
    const bubble = await screen.findByRole('toolbar', { name: L.toolbarLabel });
    const tools = within(bubble).getAllByRole('button');
    expect(tools[tools.length - 1]).toHaveAccessibleName(L.link);
    // A separator (the bubble's wavy rule) stands right before it.
    expect(tools[tools.length - 1].previousElementSibling).toHaveAttribute('aria-hidden');
    await userEvent.click(within(bubble).getByRole('button', { name: L.link }));

    const sheet = await screen.findByRole('dialog', { name: L.insertLink });
    expect(within(sheet).getByRole('heading', { name: L.insertLink })).toBeInTheDocument();
    const field = within(sheet).getByRole('textbox', { name: L.linkPlaceholder });
    await waitFor(() => expect(field).toHaveFocus());
    expect(within(sheet).queryByText(L.linkShowAs)).toBeNull();
    expect(within(sheet).queryByRole('button', { name: L.linkRemove })).toBeNull();
    await userEvent.type(field, 'example.com/rain{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('A [quiet](https://example.com/rain) morning');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The story has its focus back.
    await waitFor(() => expect(story).toHaveFocus());
  });

  it('closes the dialog on its backdrop, changing nothing, the story focused again with the words still selected', async () => {
    pointer(true);
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor variant="canvas" value="A quiet morning" onChange={onChange} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).chain().focus().setTextSelection({ from: 3, to: 8 }).run());
    await userEvent.click(within(await screen.findByRole('toolbar', { name: L.toolbarLabel })).getByRole('button', { name: L.link }));
    const dialog = await screen.findByRole('dialog', { name: L.insertLink });
    // No ✕ drawn: the backdrop (and Escape) close it.
    await userEvent.click(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(story).toHaveFocus());
    const { from, to } = editorOf(story).state.selection;
    expect([from, to]).toEqual([3, 8]);
  });

  // A link in the writer is something to edit: a click selects it (the bubble's 連結 then edits it), never opens
  // the page — on the apps' island the same tap was opening it, with no way to put the caret in the link.
  it('never opens a link clicked in the story — the click is for editing it', async () => {
    pointer(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderWithIntl(<MarkdownEditor variant="canvas" value="A [quiet](https://example.com/rain) morning" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    const link = within(story).getByText('quiet');
    act(() => void editorOf(story).commands.focus());
    fireEvent.mouseDown(link);
    fireEvent.mouseUp(link);
    fireEvent.click(link);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('opens on ⌘K / Ctrl+K on an empty line with 卡片 chosen, and makes the line the address’s card', async () => {
    pointer(true);
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor variant="canvas" value="" onChange={onChange} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).commands.focus('start'));
    fireEvent.keyDown(story, { key: 'k', ctrlKey: true });

    const sheet = await screen.findByRole('dialog', { name: L.insertLink });
    expect(within(sheet).getByText(L.linkShowAs)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: L.linkAsCard })).toHaveAttribute('aria-pressed', 'true');
    const field = within(sheet).getByRole('textbox', { name: L.linkPlaceholder });
    // Not an address we link to: it stays open and says so, the story untouched.
    await userEvent.type(field, 'javascript:alert(1)');
    await userEvent.click(within(sheet).getByRole('button', { name: L.linkApply }));
    expect(within(sheet).getByText(L.linkInvalid)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.clear(field);
    await userEvent.type(field, 'https://example.com/rain');
    await userEvent.click(within(sheet).getByRole('button', { name: L.linkApply }));
    expect(onChange).toHaveBeenLastCalledWith('<https://example.com/rain>');
    // Drawn as the reader's card: its host over its address, pressable to edit.
    expect(await screen.findByRole('button', { name: L.linkCardLabel.replace('{host}', 'example.com') })).toHaveTextContent('https://example.com/rain');
  });

  it('opens on a pressed card with 卡片 chosen and its address, and turns it to words', async () => {
    pointer(true);
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor variant="canvas" value={'Before\n\n<https://www.example.com/rain>\n\nAfter'} onChange={onChange} ariaLabel="Story" />);
    await screen.findByRole('textbox', { name: 'Story' });
    await userEvent.click(await screen.findByRole('button', { name: L.linkCardLabel.replace('{host}', 'example.com') }));

    // A link already there: 「編輯連結」, its 移除連結 at the foot's start.
    const sheet = await screen.findByRole('dialog', { name: L.linkEdit });
    expect(within(sheet).getByRole('textbox', { name: L.linkPlaceholder })).toHaveValue('https://www.example.com/rain');
    expect(within(sheet).getByRole('button', { name: L.linkAsCard })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: L.linkRemove })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: L.linkAsText }));
    await userEvent.click(within(sheet).getByRole('button', { name: L.linkApply }));
    expect(onChange).toHaveBeenLastCalledWith('Before\n\n[example.com/rain](https://www.example.com/rain)\n\nAfter');
  });

  // Round 16 review S4: the picked card's corner ✕ and the editor's 移除連結 both deleted it — one remove at a time.
  it('hides a picked card’s ✕ while the link editor is open on it, and gives it back after', async () => {
    pointer(true);
    renderWithIntl(<MarkdownEditor variant="canvas" value={'Before\n\n<https://www.example.com/rain>\n\nAfter'} onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    await userEvent.click(await screen.findByRole('button', { name: L.linkCardLabel.replace('{host}', 'example.com') }));

    const sheet = await screen.findByRole('dialog', { name: L.linkEdit });
    // The editor's 移除連結 is the only remove while it is open.
    expect(screen.getAllByRole('button', { name: L.linkRemove })).toEqual([within(sheet).getByRole('button', { name: L.linkRemove })]);
    fireEvent.keyDown(within(sheet).getByRole('textbox', { name: L.linkPlaceholder }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Still picked, the card wears its ✕ again.
    expect(editorOf(story).state.selection.constructor.name).toBe('NodeSelection');
    expect(await screen.findByRole('button', { name: L.linkRemove })).toBeInTheDocument();
  });

  it('shows a live card’s stored preview on its link card', async () => {
    pointer(true);
    renderWithIntl(
      <MarkdownEditor
        variant="canvas"
        value="<https://example.com/rain>"
        onChange={vi.fn()}
        ariaLabel="Story"
        linkPreviews={[{ url: 'https://example.com/rain', title: 'Walking in the rain', image: '/api/link-image?u=x&s=y' }]}
      />,
    );
    const card = await screen.findByRole('button', { name: L.linkCardLabel.replace('{host}', 'example.com') });
    expect(card).toHaveTextContent('Walking in the rain');
    expect(card.querySelector('img')).toHaveAttribute('src', '/api/link-image?u=x&s=y');
  });

  it('offers 連結 in the "+" of an empty line', async () => {
    pointer(true);
    renderWithIntl(<MarkdownEditor variant="canvas" value="" onChange={vi.fn()} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).commands.focus('start'));
    await userEvent.click(await screen.findByRole('button', { name: L.insert }));
    // 插入連結, beside 插入圖片 · 插入卡片 (round 16 review S5).
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: L.insertLink }));
    const sheet = await screen.findByRole('dialog', { name: L.insertLink });
    expect(within(sheet).getByRole('button', { name: L.linkAsCard })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the same dialog from the keyboard bar’s link glyph — its last tool, after its divider — and gives the story back on Escape', async () => {
    pointer(false);
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor variant="canvas" value="A quiet morning" onChange={onChange} ariaLabel="Story" />);
    const story = await screen.findByRole('textbox', { name: 'Story' });
    act(() => void editorOf(story).chain().focus().setTextSelection({ from: 3, to: 8 }).run());
    const bar = await screen.findByRole('toolbar', { name: L.toolbarLabel });
    const tools = within(bar).getAllByRole('button');
    expect(tools[tools.length - 1]).toHaveAccessibleName(L.link);
    expect(tools[tools.length - 1].previousElementSibling).toHaveAttribute('aria-hidden');
    await userEvent.click(within(bar).getByRole('button', { name: L.link }));

    const sheet = await screen.findByRole('dialog', { name: L.insertLink });
    const field = within(sheet).getByRole('textbox', { name: L.linkPlaceholder });
    await waitFor(() => expect(field).toHaveFocus());
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(story).toHaveFocus());
    expect(await screen.findByRole('toolbar', { name: L.toolbarLabel })).toBeInTheDocument();
  });
});

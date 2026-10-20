// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { Editor } from '@tiptap/core';
import en from '@/messages/en.json';
import { MarkdownEditor } from './MarkdownEditor';

// The card picker reads the viewer's cards; it isn't opened here.
vi.mock('./InsertCardModal', () => ({
  InsertCardModal: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="card picker" /> : null),
}));
vi.mock('@/lib/images/upload', () => ({
  UnsupportedImage: class extends Error {},
  uploadImageFile: vi.fn(async (file: File) => ({ publicUrl: `https://img.example.com/${file.name}` })),
}));

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


// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import { MarkdownEditor } from './MarkdownEditor';

// The card picker reads the viewer's cards; it isn't opened here.
vi.mock('./InsertCardModal', () => ({ InsertCardModal: () => null }));

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

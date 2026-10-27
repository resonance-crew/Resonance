// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, renderWithIntl, screen, fireEvent, userEvent } from '@/../test/render';
import en from '@/messages/en.json';
import { TagField } from './TagField';

/** The field with its list held by a parent, as the editor holds it. */
function Harness({
  initial = [],
  onSuggest = () => undefined,
  suggesting = false,
  error = null,
}: {
  initial?: string[];
  onSuggest?: () => void;
  suggesting?: boolean;
  error?: string | null;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagField tags={tags} onChange={setTags} onSuggest={onSuggest} suggesting={suggesting} error={error} />
      <div data-testid="tags">{JSON.stringify(tags)}</div>
      {/* The model's tags arriving, merged after the ones there (as the publish step merges them). */}
      <button type="button" onClick={() => setTags((now) => [...now, ...['memory', 'rain'].filter((x) => !now.includes(x))])}>
        merge
      </button>
    </>
  );
}

const W = en.write;
const list = () => JSON.parse(screen.getByTestId('tags').textContent ?? '[]') as string[];
// The section's label names the field.
const input = () => screen.getByLabelText(W.tagsLabel);
const suggest = () => screen.getByRole('button', { name: W.tagsSuggestLabel });
const addFor = (tag: string) => screen.getByRole('button', { name: W.tagsAddLabel.replace('{tag}', tag) });

/** A screen with a hardware keyboard (a fine pointer, no on-screen keyboard) or a phone's. */
const realMatchMedia = window.matchMedia;
function keyboard(hardware: boolean) {
  window.matchMedia = vi.fn((query: string) => ({ matches: hardware && /pointer: fine/.test(query), media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
});

describe('TagField', () => {
  it('asks the model from its segment when nothing is typed, and adds the typed tag from it otherwise', async () => {
    const onSuggest = vi.fn();
    renderWithIntl(<Harness onSuggest={onSuggest} />);

    await userEvent.click(suggest());
    expect(onSuggest).toHaveBeenCalledTimes(1);

    await userEvent.click(input());
    fireEvent.change(input(), { target: { value: 'travel' } });
    expect(screen.queryByRole('button', { name: W.tagsSuggestLabel })).not.toBeInTheDocument();
    await userEvent.click(addFor('travel'));

    expect(list()).toEqual(['travel']);
    expect(onSuggest).toHaveBeenCalledTimes(1);
    // The caret stays in the field, ready for the next one.
    expect(input()).toHaveFocus();
  });

  // Round 16 review S1 / N6: 「標籤」 on its own line, as 卡片類型 is; the pills wrap under it, never under a
  // hanging indent; each ✕ says which tag it takes off; the field is named by the label, not its placeholder.
  it('shows the chosen tags under their label on its own line, each ✕ named for its tag', async () => {
    renderWithIntl(<Harness initial={['a', 'b']} />);
    const label = screen.getByText(W.tagsLabel);
    const pills = screen.getByText('a').closest('[class*="row"]') as HTMLElement;
    // The label stands alone; the pills' row holds the pills alone — none of them inside the field.
    expect(label).toHaveTextContent(/^Tags$/);
    expect(pills.contains(label)).toBe(false);
    expect(pills).toHaveTextContent(/^ab$/);
    expect(pills.contains(input())).toBe(false);
    expect(label.compareDocumentPosition(pills) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('textbox', { name: W.tagsLabel })).toHaveAttribute('aria-labelledby', label.id);

    await userEvent.click(screen.getByRole('button', { name: W.tagsRemoveLabel.replace('{tag}', 'a') }));
    expect(list()).toEqual(['b']);
    expect(screen.getByRole('button', { name: W.tagsRemoveLabel.replace('{tag}', 'b') })).toBeInTheDocument();
  });

  it('draws the chosen tags quieter than the step’s button: half the light wash, the soft pen, words at 500', () => {
    renderWithIntl(<Harness initial={['a']} />);
    const pill = screen.getByText('a').closest('[data-size]') as HTMLElement;
    expect(pill).toHaveAttribute('data-quiet');
    expect(pill.style.getPropertyValue('--shape-fill')).toBe('color-mix(in oklch, var(--color-terracotta-light) 50%, var(--color-cream))');
    expect(pill.style.getPropertyValue('--shape-ink')).toBe('var(--soft-pen)');
  });

  it('adds on Enter, trimmed, and ignores an empty or repeated tag', () => {
    renderWithIntl(<Harness initial={['travel']} />);

    fireEvent.change(input(), { target: { value: '  home ' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(list()).toEqual(['travel', 'home']);

    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.change(input(), { target: { value: 'travel' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(list()).toEqual(['travel', 'home']);
    expect(input()).toHaveValue('');
  });

  it.each([
    ['a comma', 'travel,'],
    ['a full-width comma', 'travel，'],
    ['an enumeration comma', 'travel、'],
  ])('ends a tag at %s and keeps what follows for the next one', (_name, typed) => {
    renderWithIntl(<Harness />);

    fireEvent.change(input(), { target: { value: typed } });
    expect(list()).toEqual(['travel']);
    expect(input()).toHaveValue('');

    fireEvent.change(input(), { target: { value: 'home,fa' } });
    expect(list()).toEqual(['travel', 'home']);
    expect(input()).toHaveValue('fa');
  });

  it('splits a pasted list in one go, drops the repeats, and leaves the last word to finish', () => {
    renderWithIntl(<Harness initial={['home']} />);

    fireEvent.change(input(), { target: { value: 'home, travel，family、 ,memory' } });

    expect(list()).toEqual(['home', 'travel', 'family']);
    expect(input()).toHaveValue('memory');
  });

  describe('while an input method is mid-word', () => {
    it('keeps the segment the AI one, leaves Enter and the commas to it, and flips at the composition’s end', () => {
      renderWithIntl(<Harness />);

      fireEvent.compositionStart(input());
      fireEvent.change(input(), { target: { value: 'ㄌㄩˇ' } });
      // Mid-word, the segment is still the offer: nothing is committed yet.
      expect(suggest()).toBeInTheDocument();
      // The Enter that confirms a word is the IME's, in Chrome and in Safari.
      fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
      fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
      expect(list()).toEqual([]);
      expect(input()).toHaveValue('ㄌㄩˇ');

      fireEvent.change(input(), { target: { value: '旅行' } });
      fireEvent.compositionEnd(input());
      expect(addFor('旅行')).toBeInTheDocument();

      // A comma committed with the word still ends the tag once it is done.
      fireEvent.compositionStart(input());
      fireEvent.change(input(), { target: { value: '旅行，' } });
      expect(list()).toEqual([]);
      fireEvent.compositionEnd(input());
      expect(list()).toEqual(['旅行']);
      expect(input()).toHaveValue('');
    });

    it('ends the word first on a tap of the segment, then adds it — never asks the model', async () => {
      const onSuggest = vi.fn();
      renderWithIntl(<Harness onSuggest={onSuggest} />);
      act(() => input().focus());
      fireEvent.compositionStart(input());
      fireEvent.change(input(), { target: { value: '下雨' } });
      const segment = suggest();
      // The tap takes the focus from the field, and the input method commits the word as it goes.
      const blur = vi.spyOn(input(), 'blur').mockImplementation(() => fireEvent.compositionEnd(input()));
      fireEvent.pointerDown(segment);
      expect(blur).toHaveBeenCalled();
      fireEvent.click(segment);
      expect(list()).toEqual(['下雨']);
      expect(onSuggest).not.toHaveBeenCalled();
      expect(input()).toHaveValue('');
    });
  });

  it('takes the last tag back on Backspace in an empty field, one per press — from a hardware keyboard only', () => {
    keyboard(true);
    renderWithIntl(<Harness initial={['a', 'b', 'c']} />);

    // Text in the field: Backspace is just Backspace.
    fireEvent.change(input(), { target: { value: 'x' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(list()).toEqual(['a', 'b', 'c']);

    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(list()).toEqual(['a', 'b']);

    // Holding the key does not eat the rest.
    fireEvent.keyDown(input(), { key: 'Backspace', repeat: true });
    expect(list()).toEqual(['a', 'b']);
  });

  it('never takes a tag back from a phone’s on-screen keyboard', () => {
    keyboard(false);
    renderWithIntl(<Harness initial={['a', 'b']} />);
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(list()).toEqual(['a', 'b']);
  });

  // No help line (round 8 §2.2): the field's placeholder and its segment say how; only an error is said.
  it('says nothing under the field until a suggestion fails, then why', () => {
    const { rerender } = renderWithIntl(<Harness />);
    expect(screen.queryByText(/Press Enter/)).not.toBeInTheDocument();

    rerender(<Harness error="Couldn’t suggest tags — please try again" />);
    expect(screen.getByText('Couldn’t suggest tags — please try again')).toBeInTheDocument();
  });

  it('shows the model is thinking in the segment, whose word stays the AI one', () => {
    renderWithIntl(<Harness suggesting />);

    // B6: the word stays, the sparkle's place draws the pen loop.
    const action = suggest();
    expect(action).toHaveAttribute('aria-busy', 'true');
    expect(action).toHaveTextContent(W.tagsSuggestShort);
    expect(action.querySelector('[data-button-loader]')).not.toBeNull();
  });

  it('says politely how many tags were added — one typed, or the model’s several', async () => {
    renderWithIntl(<Harness initial={['home']} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    fireEvent.change(input(), { target: { value: 'travel' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(status).toHaveTextContent('1 tag added');

    await userEvent.click(screen.getByRole('button', { name: 'merge' }));
    expect(list()).toEqual(['home', 'travel', 'memory', 'rain']);
    expect(status).toHaveTextContent('2 tags added');
  });

  // Round 16 §1: the pill row is above the field; when a tag wraps it onto a new line (or the preview card above
  // grows a line of tags) the page scrolls by as much, in the same frame, so the field stays under the caret.
  describe('when what is above the field changes height', () => {
    function measured() {
      const scrollBy = vi.fn();
      Object.defineProperty(document.documentElement, 'scrollBy', { configurable: true, value: scrollBy });
      const rect = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        // The field (the text input's capsule) sits under the row: one line for up to two pills, two past that.
        if (this.querySelector(':scope > input')) {
          const pills = document.querySelectorAll('[aria-label^="Remove tag: "]').length;
          return new DOMRect(0, pills > 2 ? 140 : 100, 300, 48);
        }
        return rect.call(this);
      });
      return scrollBy;
    }

    it('scrolls the page by the change while the field is being written in', () => {
      const scrollBy = measured();
      renderWithIntl(<Harness initial={['a', 'b']} />);
      act(() => input().focus());
      fireEvent.change(input(), { target: { value: 'c' } });
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(scrollBy).toHaveBeenCalledWith({ top: 40, behavior: 'instant' });
    });

    it('scrolls for the model’s tags asked for from the segment, though the field lost the focus', async () => {
      const scrollBy = measured();
      renderWithIntl(<Harness initial={['a']} onSuggest={() => undefined} />);
      await userEvent.click(suggest());
      act(() => (document.activeElement as HTMLElement | null)?.blur());
      await userEvent.click(screen.getByRole('button', { name: 'merge' }));
      expect(scrollBy).toHaveBeenCalledWith({ top: 40, behavior: 'instant' });
    });

    it('leaves the page alone when the field isn’t in use (a ✕ pressed)', async () => {
      const scrollBy = measured();
      renderWithIntl(<Harness initial={['a', 'b', 'c']} />);
      await userEvent.click(screen.getAllByRole('button', { name: /^Remove tag: / })[0]);
      expect(list()).toEqual(['b', 'c']);
      expect(scrollBy).not.toHaveBeenCalled();
    });
  });
});

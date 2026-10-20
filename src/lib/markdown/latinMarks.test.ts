// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { getMarkdown, storyExtensions } from './editorSchema';
import { LatinMarks } from './latinMarks';

// The writer sets an apostrophe inside a Latin word in the Latin face, as the
// reader does, without putting anything into the story it stores.
let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string) {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({ element, extensions: [...storyExtensions(), LatinMarks], content: markdown });
  return editor;
}

const marks = () => Array.from(editor!.view.dom.querySelectorAll('.story-latin-mark'), (el) => el.textContent);

describe('LatinMarks', () => {
  it('marks the apostrophes inside Latin words, and no other', () => {
    open('教練只說：don’t rush. rock’n’roll\n\n他’s ‘OK’ James’ book');
    expect(marks()).toEqual(['’', '’', '’']);
  });

  it('finds a mark whose letters an emphasis splits, and one in a heading', () => {
    open('## It’s late\n\n*don*’t');
    expect(editor!.view.dom.querySelector('em')).toHaveTextContent('don');
    expect(marks()).toEqual(['’', '’']);
  });

  it('follows the text as it is written', () => {
    open('dont');
    expect(marks()).toEqual([]);
    // "dont’": after the last letter there is nothing Latin.
    editor!.commands.insertContentAt(5, '’');
    expect(marks()).toEqual([]);
    // "don’t’"
    editor!.commands.insertContentAt(4, '’');
    expect(marks()).toEqual(['’']);
    editor!.commands.setContent('don’t and can’t');
    expect(marks()).toEqual(['’', '’']);
  });

  it('leaves the stored story exactly as it was', () => {
    const story = '## It’s late\n\ndon’t **rock’n’roll**\n\n> ‘OK’';
    const plain = new Editor({ extensions: storyExtensions(), content: story });
    const without = getMarkdown(plain);
    plain.destroy();
    expect(getMarkdown(open(story))).toBe(without);
  });
});

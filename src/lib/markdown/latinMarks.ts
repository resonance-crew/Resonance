import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { latinMarks } from '@/lib/text/script';

/** A leaf inside a text block (a hard break) reads as one character that is no letter. */
const LEAF = '\ufffc';

/** Each apostrophe inside a Latin word in the document, as an inline decoration. */
function decorate(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // One character per position inside a text block: its text, and LEAF for each leaf node in it, so an
    // index into this string is an offset into the block — and a mark whose letters an emphasis splits
    // (*don*’t) still has them on either side.
    const text = node.textBetween(0, node.content.size, undefined, LEAF);
    for (const i of latinMarks(text)) {
      found.push(Decoration.inline(pos + 1 + i, pos + 2 + i, { class: 'story-latin-mark' }));
    }
    return false;
  });
  return DecorationSet.create(doc, found);
}

const key = new PluginKey<DecorationSet>('latinMarks');

/**
 * Marks each ‘ or ’ inside a Latin word (don’t, rock’n’roll — lib/text/script
 * latinMarks) with the `story-latin-mark` class, which src/styles/story.css
 * sets in the Latin face of its element when the story is CJK: a CJK face
 * draws the mark full-width, a half-em hole inside the word. The reader wraps
 * the same characters in a span; an editor can't put one in its document
 * without changing what is stored, so this is a decoration only — the
 * document, its schema and its Markdown are untouched (it is added beside
 * storyExtensions(), never inside it, so native/fixtures/markdown-corpus.json
 * stays as it is). The web writer and the apps' editor island both add it.
 */
export const LatinMarks = Extension.create({
  name: 'latinMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => decorate(state.doc),
          apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});

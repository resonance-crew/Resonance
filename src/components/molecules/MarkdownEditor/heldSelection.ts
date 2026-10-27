import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey<DecorationSet>('heldSelection');

/**
 * The selected words, still shown as selected while something outside the
 * story has the focus — the link editor's field, whose words they are to
 * link. The browser hides a selection the story no longer has the focus
 * for; this marks the same range (`story-held-selection`, drawn as the
 * story's ::selection) until it is let go. A decoration: nothing stored.
 */
export const HeldSelection = Extension.create({
  name: 'heldSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const held = tr.getMeta(key) as { from: number; to: number } | null | undefined;
            if (held === null) return DecorationSet.empty;
            if (held) return DecorationSet.create(tr.doc, [Decoration.inline(held.from, held.to, { class: 'story-held-selection' })]);
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});

/** Holds the selection's words as selected (a range of words only), or lets them go (`null`). */
export function holdSelection(tr: Transaction, range: { from: number; to: number } | null): Transaction {
  return tr.setMeta(key, range && range.to > range.from ? range : null);
}

import { getMarkRange, type Editor } from '@tiptap/core';
import type { Mark, Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { cardableLink, linkTarget, linkWords, wordsAreTheAddress } from '../links/soleLink';
import { emptyLine, holdsLinkCard, placeLinkCard } from './editorSchema';

/**
 * The writer's link tool (round 16 §6), with no UI: what the link editor
 * shows for the selection, and what its 完成 and 移除連結 do — one set for
 * the web writer (MarkdownEditor's link editor) and the apps' editor island
 * (`exec('link' | 'unlink')`, the `state` message's `link` and `canCard`).
 *
 * A link is shown one of two ways. 卡片: alone on its line, as its page's
 * card — in the editor a `linkCard` block, stored as `<url>`. 文字: words
 * that link — the words the writer selected, else the address's host and
 * path (`linkWords`), never the address itself, so the reader keeps them as
 * words. 卡片 is offered only where the link is, or will be, alone in its
 * paragraph (`canCard`).
 */

export type LinkDisplay = 'card' | 'text';

export interface StoryLinkState {
  /** The address. */
  href: string;
  /** How the reader shows it now. */
  display: LinkDisplay;
  /** It is alone in its paragraph (a card, or a link that could be one). */
  standalone: boolean;
  /** Its words (a card's are its address). */
  words: string;
}

/** The link card picked as a whole, or null. */
function pickedCard(state: EditorState): PMNode | null {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === 'linkCard' ? selection.node : null;
}

interface MarkedLink {
  from: number;
  to: number;
  mark: Mark;
}

/** The link mark the selection is in — around the caret, or holding the whole selection — or null. */
function markedLink(state: EditorState): MarkedLink | null {
  const type = state.schema.marks.link;
  const { $from, from, to } = state.selection;
  if (!type || !$from.parent.isTextblock || !state.selection.$to.sameParent($from)) return null;
  const range = getMarkRange($from, type);
  if (!range || from < range.from || to > range.to) return null;
  const mark = state.doc.nodeAt(range.from)?.marks.find((m) => m.type === type);
  return mark ? { ...range, mark } : null;
}

/** Whether `from`…`to` is all of its paragraph's words: nothing but white space beside it, no line break or picture. */
function wholeParagraph(state: EditorState, from: number, to: number): boolean {
  const $from = state.doc.resolve(from);
  const paragraph = $from.parent;
  if (paragraph.type.name !== 'paragraph') return false;
  let others = false;
  paragraph.forEach((child) => {
    if (!child.isText) others = true;
  });
  if (others) return false;
  const start = $from.start();
  const end = $from.end();
  return state.doc.textBetween(start, from).trim() === '' && state.doc.textBetween(to, end).trim() === '';
}

/** Whether the caret's paragraph is an empty line (`emptyLine`). */
const blankLine = (state: EditorState) => emptyLine(state.selection.$from.parent);

/** The link the selection is in, as the link editor shows it — or null for none. */
export function storyLinkState(state: EditorState): StoryLinkState | null {
  const card = pickedCard(state);
  if (card) {
    const href = String(card.attrs.href);
    return { href, display: 'card', standalone: true, words: href };
  }
  const link = markedLink(state);
  if (!link) return null;
  const href = String(link.mark.attrs.href ?? '');
  const words = state.doc.textBetween(link.from, link.to);
  const standalone = wholeParagraph(state, link.from, link.to) && holdsLinkCard(state.doc.resolve(link.from));
  const asCard = standalone && wordsAreTheAddress(words, href) && cardableLink(href);
  return { href, display: asCard ? 'card' : 'text', standalone, words };
}

/**
 * Whether 卡片 is offered for the selection now: a link card picked, an
 * empty line, words that are their paragraph's all, or the caret in a link
 * that is — each where a card can stand (not a list item's first line, not in
 * a table's source).
 */
export function canCard(state: EditorState): boolean {
  if (pickedCard(state)) return true;
  const { $from, from, to, empty } = state.selection;
  if (!state.selection.$to.sameParent($from) || !holdsLinkCard($from)) return false;
  if (empty) {
    if (blankLine(state)) return true;
    const link = markedLink(state);
    return !!link && wholeParagraph(state, link.from, link.to);
  }
  return wholeParagraph(state, from, to);
}

/** Puts the link editor's words in, linking to `href`, and selects them so they can be typed over. */
function putWords(state: EditorState, from: number, to: number, words: string, href: string) {
  const mark = state.schema.marks.link.create({ href });
  const tr = state.tr.replaceWith(from, to, state.schema.text(words, [mark]));
  return tr.setSelection(TextSelection.create(tr.doc, from, from + words.length));
}

/**
 * The link editor's 完成: links the selection (or changes the caret's link,
 * or a picked card) to the address typed — shown as `display`. False, with
 * nothing changed, for an address we don't link to (`linkTarget`) or 卡片
 * where no card can stand (`canCard`). 卡片 for an address that may not be a
 * card (our own pages, an IP address) links it as words.
 */
export function applyStoryLink(editor: Editor, input: string, display: LinkDisplay): boolean {
  const href = linkTarget(input);
  const { state, view } = editor;
  if (!href || (display === 'card' && !canCard(state))) return false;
  const sel = state.selection;
  const card = pickedCard(state);
  let tr;
  if (display === 'card' && cardableLink(href)) {
    // The line becomes the card: a picked card changes its address, a paragraph gives up its words.
    const from = card ? sel.from : sel.$from.before();
    const to = card ? sel.to : sel.$from.after();
    tr = placeLinkCard(state, from, to, href);
  } else if (card) {
    // A card made words: a paragraph of its address's host and path, selected.
    const words = linkWords(href);
    const mark = state.schema.marks.link.create({ href });
    const paragraph = state.schema.nodes.paragraph.create(null, state.schema.text(words, [mark]));
    tr = state.tr.replaceWith(sel.from, sel.to, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, sel.from + 1, sel.from + 1 + words.length));
  } else {
    const link = markedLink(state);
    const type = state.schema.marks.link;
    if (!sel.empty) {
      const words = state.doc.textBetween(sel.from, sel.to);
      // Selected words that are the address itself, alone on their line, would read as its card.
      if (wholeParagraph(state, sel.from, sel.to) && wordsAreTheAddress(words, href)) tr = putWords(state, sel.from, sel.to, linkWords(href), href);
      else tr = state.tr.removeMark(sel.from, sel.to, type).addMark(sel.from, sel.to, type.create({ href }));
    } else if (link) {
      const words = state.doc.textBetween(link.from, link.to);
      const old = String(link.mark.attrs.href ?? '');
      // Words that were its address become the new address's words; words of the writer's own stay.
      if (wordsAreTheAddress(words, old) || wordsAreTheAddress(words, href)) tr = putWords(state, link.from, link.to, linkWords(href), href);
      else tr = state.tr.removeMark(link.from, link.to, type).addMark(link.from, link.to, type.create({ href }));
    } else if (blankLine(state)) {
      // An empty line takes the words in place of whatever white space it held.
      tr = putWords(state, sel.$from.start(), sel.$from.end(), linkWords(href), href);
    } else {
      tr = putWords(state, sel.from, sel.to, linkWords(href), href);
    }
  }
  view.dispatch(tr.setMeta('preventAutolink', true).scrollIntoView());
  return true;
}

/** The link editor's 移除連結: a picked card goes; a link's words stay, unlinked. False when there is no link. */
export function removeStoryLink(editor: Editor): boolean {
  const { state, view } = editor;
  if (pickedCard(state)) {
    view.dispatch(state.tr.deleteSelection().scrollIntoView());
    return true;
  }
  const link = markedLink(state);
  if (!link) return false;
  view.dispatch(state.tr.removeMark(link.from, link.to, state.schema.marks.link).setMeta('preventAutolink', true));
  return true;
}

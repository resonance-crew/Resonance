import type { Editor } from '@tiptap/react';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';

/**
 * What the story's formatting tools do — one set for the framed editor's
 * fixed toolbar, the canvas's selection bubble and its keyboard bar (and the
 * apps' island's `exec`, which names the same commands): marks, headings,
 * blocks.
 */
export type FormatCommand = 'bold' | 'italic' | 'h2' | 'h3' | 'blockquote' | 'bulletList' | 'orderedList';

/** The groups the bubble and the keyboard bar draw, a vertical pen rule between each: marks, headings, blocks. */
export const FORMAT_GROUPS: FormatCommand[][] = [
  ['bold', 'italic'],
  ['h2', 'h3'],
  ['blockquote', 'bulletList', 'orderedList'],
];

/** The command's name under `write.editor` (its accessible name and tooltip). */
export const FORMAT_LABEL_KEY: Record<FormatCommand, 'bold' | 'italic' | 'h2' | 'h3' | 'quote' | 'bulletList' | 'orderedList'> = {
  bold: 'bold',
  italic: 'italic',
  h2: 'h2',
  h3: 'h3',
  blockquote: 'quote',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
};

/** Headings show their level as their face (H2, H3); the rest their name. */
export const FORMAT_FACE: Partial<Record<FormatCommand, string>> = { h2: 'H2', h3: 'H3' };

/** A seed per command, so neighbouring buttons' washes don't wobble alike. */
export const FORMAT_SEED: Record<FormatCommand, number> = {
  bold: 21,
  italic: 28,
  h2: 35,
  h3: 42,
  bulletList: 49,
  orderedList: 56,
  blockquote: 63,
};

export type FormatStates = Record<FormatCommand, boolean>;

export const NO_FORMATS: FormatStates = {
  bold: false,
  italic: false,
  h2: false,
  h3: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
};

/** Which commands are on where the selection is. */
export function activeFormats(editor: Editor | null): FormatStates {
  if (!editor) return NO_FORMATS;
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    h2: editor.isActive('heading', { level: 2 }),
    h3: editor.isActive('heading', { level: 3 }),
    blockquote: editor.isActive('blockquote'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
  };
}

/** Runs a command on the selection, the editor keeping (or taking back) the focus. */
export function runFormat(editor: Editor, command: FormatCommand): boolean {
  const chain = editor.chain().focus();
  switch (command) {
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'h2':
      return chain.toggleHeading({ level: 2 }).run();
    case 'h3':
      return chain.toggleHeading({ level: 3 }).run();
    case 'blockquote':
      return chain.toggleBlockquote().run();
    case 'bulletList':
      return chain.toggleBulletList().run();
    case 'orderedList':
      return chain.toggleOrderedList().run();
  }
}

// The toolbar's wavy edge, the AppHeader's construction: a stretchable mask
// filling the paper up to a hand-drawn wave the full width, and the pen stroke
// along it. The framed editor's toolbar wears it as its foot; the keyboard bar
// wears it, turned over, as its top.
export const TOOLBAR_W = 800;
export const TOOLBAR_BODY_H = 42;
export const TOOLBAR_WAVE_H = 12;
export const TOOLBAR_TOTAL_H = TOOLBAR_BODY_H + TOOLBAR_WAVE_H;

/**
 * The drawing is TOOLBAR_W wide and stretched to the toolbar's width, so its
 * turn count follows the width it is shown at (ruleSteps): a phone's toolbar
 * gets a few, a desktop's more.
 */
export function buildToolbarPaths(seed: number, steps: number) {
  const baseY = TOOLBAR_BODY_H + TOOLBAR_WAVE_H * 0.35;
  const pts = wavyPoints(TOOLBAR_W, baseY, 2, seed, steps);
  const strokeD = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let maskD = `M 0,0 L ${TOOLBAR_W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    maskD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  maskD += ' Z';
  return { maskD, strokeD };
}

/** The mask image for a toolbar's paper, as a CSS url(). */
export function toolbarMask(maskD: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${TOOLBAR_W} ${TOOLBAR_TOTAL_H}' preserveAspectRatio='none'><path d='${maskD}' fill='white'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

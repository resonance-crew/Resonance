'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Divider } from '@/components/atoms/Divider/Divider';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { INK } from '@/lib/design/strokes';
import {
  activeFormats,
  FORMAT_FACE,
  FORMAT_GROUPS,
  FORMAT_LABEL_KEY,
  FORMAT_SEED,
  LINK_TOOL_SEED,
  NO_FORMATS,
  runFormat,
} from './formatting';
import { rovingKeyDown, ToolButton } from './ToolButton';
import styles from './MarkdownEditor.module.css';

/** Whether a selection is one the bubble formats: some text, not a picture or a card, not code. */
export function bubbleShows(editor: Editor): boolean {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty || !editor.isEditable) return false;
  if (state.selection instanceof NodeSelection) return false;
  if (editor.isActive('codeBlock')) return false;
  return state.doc.textBetween(from, to, ' ').trim().length > 0;
}

/**
 * Where the bubble over the story floats (floating-ui, through Tiptap's menus):
 * above the selection, flipped under it before it would go under the
 * writer's bar (below the split the story scrolls behind it — the bar's
 * height is the page's --app-header-h where the editor is), kept on screen.
 */
function useBubbleOptions(editor: Editor) {
  const [topClear, setTopClear] = useState(8);
  useEffect(() => {
    const read = () => {
      const h = parseFloat(getComputedStyle(editor.view.dom).getPropertyValue('--app-header-h')) || 0;
      setTopClear(h + 8);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [editor]);
  return useMemo(
    () => ({
      placement: 'top' as const,
      offset: 8,
      flip: { padding: { top: topClear, bottom: 8 } },
      shift: { padding: 8 },
    }),
    [topClear],
  );
}

/**
 * The canvas's formatting, where a fine pointer selects: a small toolbar
 * floating over the selected words (Tiptap's BubbleMenu, placed by
 * floating-ui: above, flipped under it near the top, kept on screen) — 粗體 ·
 * 斜體 · 連結 ┆ H2 · H3 ┆ 引言 · 清單 · 編號 — in the OrganicMenu panel's chrome (a
 * hand-drawn card on the card paper, its pen line in ink, drawn once
 * measured). Option/Alt+F10 in the story moves the focus into it (the
 * editor's own key, MarkdownEditor), ← and → walk it, Escape gives the focus
 * back to the words with the selection kept; the shortcuts (⌘B, ⌘I, ⌘⌥2…)
 * and the Markdown input rules stay the editor's. Never on a picture or a
 * card selected as a whole.
 */
export function FormatBubble({
  editor,
  seed,
  ref,
  linkActive,
  onLink,
  hidden = false,
}: {
  editor: Editor;
  seed: number;
  ref?: Ref<HTMLDivElement>;
  /** The selection is in a link: 連結 shows washed. */
  linkActive: boolean;
  /** 連結: the bubble turns into the link editor in its place. */
  onLink: () => void;
  /** The link editor stands in its place. */
  hidden?: boolean;
}) {
  const t = useTranslations('write.editor');
  const states = useEditorState({ editor, selector: (ctx) => activeFormats(ctx.editor) }) ?? NO_FORMATS;
  const panelRef = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(panelRef);
  const options = useBubbleOptions(editor);
  // Read when the menu asks (a ref: the plugin keeps the function it was given).
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const shouldShow = useCallback(({ editor: e }: { editor: Editor }) => !hiddenRef.current && bubbleShows(e), []);
  return (
    <BubbleMenu
      ref={ref}
      editor={editor}
      pluginKey="formatBubble"
      className={styles.bubble}
      shouldShow={shouldShow}
      options={options}
    >
      <div ref={panelRef} className={styles.bubblePanel}>
        {w > 0 && h > 0 && (
          <HandDrawnBorder
            w={w}
            h={h}
            R={14}
            seed={seed + 101}
            fillColor="var(--color-card-bg)"
            strokeColor="var(--modal-border)"
            strokeWidth={INK}
          />
        )}
        <div
          role="toolbar"
          aria-label={t('toolbarLabel')}
          className={styles.bubbleRow}
          onKeyDown={(e) => {
            if (rovingKeyDown(e)) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              editor.commands.focus();
            }
          }}
        >
          {FORMAT_GROUPS.map((group, g) => (
            <Fragment key={g}>
              {g > 0 && <Divider orientation="vertical" seed={seed + 3 + g * 6} amplitude={1.2} spacing={4} />}
              {group.map((command, i) => (
                <ToolButton
                  key={command}
                  label={FORMAT_FACE[command] ?? t(FORMAT_LABEL_KEY[command])}
                  aria={t(FORMAT_LABEL_KEY[command])}
                  active={states[command]}
                  seed={seed + FORMAT_SEED[command]}
                  tabIndex={g === 0 && i === 0 ? 0 : -1}
                  onClick={() => runFormat(editor, command)}
                />
              ))}
              {/* 連結 after 粗體 · 斜體: the marks' group (round 16 §6). */}
              {g === 0 && (
                <ToolButton
                  label={t('link')}
                  aria={t('link')}
                  active={linkActive}
                  seed={seed + LINK_TOOL_SEED}
                  tabIndex={-1}
                  onClick={onLink}
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </BubbleMenu>
  );
}

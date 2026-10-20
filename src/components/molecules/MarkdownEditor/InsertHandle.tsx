'use client';

import { useTranslations } from 'next-intl';
import { FloatingMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import styles from './MarkdownEditor.module.css';

/** Whether the caret stands on an empty paragraph of its own at the story's top level (not in a list or a quote). */
export function insertHandleShows(editor: Editor): boolean {
  const { state, view } = editor;
  const { $anchor, empty } = state.selection;
  if (!empty || !editor.isEditable || !view.hasFocus()) return false;
  return $anchor.depth === 1 && $anchor.parent.type.name === 'paragraph' && $anchor.parent.childCount === 0;
}

const showHandle = ({ editor }: { editor: Editor }) => insertHandleShows(editor);
const HANDLE_OPTIONS = { placement: 'left' as const, offset: 8, flip: false, shift: { padding: 8 } };

/**
 * The canvas's way to put a picture or a card in the story, where a fine
 * pointer writes: a "+" in the margin left of an empty line while the caret
 * is on it (Tiptap's FloatingMenu, kept on screen), which opens the floating
 * OrganicMenu — 插入圖片 (the file picker; the pictures land on that line)
 * or 插入卡片 (the card picker). It follows the story in the tab order.
 * Pasting or dropping a picture still works anywhere.
 */
export function InsertHandle({
  editor,
  seed,
  onInsertImage,
  onInsertCard,
}: {
  editor: Editor;
  seed: number;
  onInsertImage: () => void;
  onInsertCard: () => void;
}) {
  const t = useTranslations('write.editor');
  return (
    <FloatingMenu
      editor={editor}
      pluginKey="insertHandle"
      className={styles.insertHandle}
      shouldShow={showHandle}
      options={HANDLE_OPTIONS}
    >
      <OrganicMenu
        bare
        floating
        align="start"
        tip="above"
        triggerIcon="plus"
        label={t('insert')}
        seed={seed + 83}
        items={[
          { key: 'image', icon: 'image', label: t('insertImage') },
          { key: 'card', icon: 'cards', label: t('insertCard') },
        ]}
        onChoose={(key) => (key === 'image' ? onInsertImage() : onInsertCard())}
      />
    </FloatingMenu>
  );
}

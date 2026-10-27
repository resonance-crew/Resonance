'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { posToDOMRect } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import type { LinkDisplay } from '@/lib/markdown/storyLinkEdit';
import { LinkEditor, type LinkSession } from './LinkEditor';
import styles from './MarkdownEditor.module.css';

/** How far the sheet keeps from what it links, and from the window's edges. */
const GAP = 8;

export interface LinkBubbleProps {
  editor: Editor;
  seed: number;
  /** The link editor's session, or null while it is closed. */
  session: LinkSession | null;
  /** Bumped each time it opens, so a second open starts from the selection again. */
  sessionKey: number;
  onApply: (href: string, display: LinkDisplay) => boolean;
  onRemove: () => void;
  /** Closed with nothing changed: Escape (`refocus`, back to the words), or a press outside it. */
  onCancel: (refocus: boolean) => void;
}

/** What the link editor links, on screen: a picked card's box, else the selection's (the caret's line on an empty one). */
function targetRect(editor: Editor): DOMRect {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) {
    const dom = editor.view.nodeDOM(selection.from);
    if (dom instanceof HTMLElement) return dom.getBoundingClientRect();
  }
  return posToDOMRect(editor.view, selection.from, selection.to);
}

/**
 * The link editor where a fine pointer writes (round 16 §6): the selection
 * bubble turned into it in place — the same paper sheet (the OrganicMenu
 * panel's chrome, its pen line drawn once measured) — under what it links
 * (selected words, the caret's line, a picked link card), its start at
 * theirs and inside the story's column, over it where the window has no room
 * below, clear of the writer's bar and kept in place as the page scrolls. Placed by itself rather than by the editor's menus: the
 * sheet holds a field, and a menu hides whenever the story loses the focus.
 * A press anywhere outside it closes it, changing nothing.
 */
export function LinkBubble({ editor, seed, session, sessionKey, onApply, onRemove, onCancel }: LinkBubbleProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(sheetRef, 0, 0, [sessionKey, session != null]);
  const open = session != null;
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Under the target, flipped over it when the window's foot is too near, never under the writer's bar
  // (below the split the story scrolls behind it — its height is the page's --app-header-h where the editor is).
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const update = () => {
      const sheet = sheetRef.current;
      if (!sheet || editor.isDestroyed) return;
      const target = targetRect(editor);
      const { width, height } = sheet.getBoundingClientRect();
      const bar = parseFloat(getComputedStyle(editor.view.dom).getPropertyValue('--app-header-h')) || 0;
      const foot = window.visualViewport?.height ?? window.innerHeight;
      let top = target.bottom + GAP;
      if (top + height > foot - GAP && target.top - GAP - height >= bar + GAP) top = target.top - GAP - height;
      // Its start at the target's, kept over the story's column (the writer's pane at the split) and on screen.
      const column = editor.view.dom.getBoundingClientRect();
      const min = Math.max(GAP, column.left - GAP);
      const max = Math.min(window.innerWidth - GAP, column.right + GAP) - width;
      const left = Math.max(min, Math.min(target.left, max));
      setPlace((now) => (now && Math.abs(now.left - left) < 0.5 && Math.abs(now.top - top) < 0.5 ? now : { left, top }));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, open, sessionKey, w, h]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!sheetRef.current?.contains(e.target as Node)) cancelRef.current(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  if (!session || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={sheetRef}
      className={`${styles.bubble} ${styles.linkPanel}`}
      // Unplaced for a moment it is see-through, not hidden: its field takes the focus as it opens.
      style={{ position: 'fixed', left: place?.left ?? 0, top: place?.top ?? 0, opacity: place ? 1 : 0, pointerEvents: place ? undefined : 'none' }}
    >
      {w > 0 && h > 0 && (
        <HandDrawnBorder w={w} h={h} R={14} seed={seed + 107} fillColor="var(--color-card-bg)" strokeColor="var(--modal-border)" strokeWidth={INK} />
      )}
      <LinkEditor key={sessionKey} session={session} seed={seed} onApply={onApply} onRemove={onRemove} onCancel={() => onCancel(true)} />
    </div>,
    document.body,
  );
}

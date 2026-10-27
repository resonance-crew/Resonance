'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useEditorState, type Editor } from '@tiptap/react';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { INK_LIGHT } from '@/lib/design/strokes';
import { ruleSteps } from '@/lib/design/wavyPath';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import { useElementSize } from '@/lib/hooks/useElementSize';
import {
  activeFormats,
  buildToolbarPaths,
  FORMAT_FACE,
  FORMAT_GROUPS,
  FORMAT_LABEL_KEY,
  FORMAT_SEED,
  LINK_TOOL_SEED,
  NO_FORMATS,
  runFormat,
  TOOLBAR_TOTAL_H,
  TOOLBAR_W,
  toolbarMask,
} from './formatting';
import { LinkEditor, type LinkSession } from './LinkEditor';
import { rovingKeyDown, ToolButton } from './ToolButton';
import type { LinkDisplay } from '@/lib/markdown/storyLinkEdit';
import styles from './KeyboardFormatBar.module.css';

/** How long the bar stays after the story loses the focus — a tap on it, or on the next field, lands first. */
export const BAR_GRACE_MS = 120;

export interface KeyboardFormatBarProps {
  editor: Editor;
  /** The story has the focus. */
  focused: boolean;
  /** How far up the on-screen keyboard reaches (useKeyboardInset): the bar rides on it. */
  inset: number;
  seed: number;
  /** Pictures are on their way into the story. */
  uploading: boolean;
  onInsertImage: () => void;
  onInsertCard: () => void;
  /** The selection is in a link: the link glyph shows washed. */
  linkActive: boolean;
  /** The link glyph: the bar turns into the link editor. */
  onLink: () => void;
  /** The link editor while it is open: the bar holds it in place of its row. */
  link: {
    session: LinkSession;
    key: number;
    onApply: (href: string, display: LinkDisplay) => boolean;
    onRemove: () => void;
    onCancel: (refocus: boolean) => void;
  } | null;
}

/**
 * The canvas's tools on a touch screen: one row docked on the on-screen
 * keyboard while the story has the focus (and BAR_GRACE_MS after) — the
 * apps' StoryFormatBar on the web. Cream paper whose top edge is the
 * toolbar's pen wave turned over; 插入圖片 · 插入卡片 ┆ 粗體 · 斜體 · 🔗 ┆ H2 ·
 * H3 ┆ 引言 · 清單 · 編號, never wrapping: it scrolls sideways, fading at a side
 * where more lies, with 收起鍵盤 pinned at its end. 44px targets; a press
 * keeps the focus (and the keyboard) in the story. Over the page, under a
 * dialog (z-index 120); with no keyboard up (a hardware one) it stands on the
 * window's foot, clear of the home indicator. The link glyph turns the bar
 * into the link editor in place (its field on the keyboard, as the apps'
 * sheet), the bar staying up while the editor's field has the focus.
 */
export function KeyboardFormatBar({
  editor,
  focused,
  inset,
  seed,
  uploading,
  onInsertImage,
  onInsertCard,
  linkActive,
  onLink,
  link,
}: KeyboardFormatBarProps) {
  const t = useTranslations('write.editor');
  const states = useEditorState({ editor, selector: (ctx) => activeFormats(ctx.editor) }) ?? NO_FORMATS;

  // Shown while the story has the focus, and a moment after it goes — and all the while the link editor
  // it turned into has it.
  const held = focused || link != null;
  const [shown, setShown] = useState(held);
  useEffect(() => {
    if (held) {
      setShown(true);
      return;
    }
    const h = window.setTimeout(() => setShown(false), BAR_GRACE_MS);
    return () => window.clearTimeout(h);
  }, [held]);

  const barRef = useRef<HTMLDivElement>(null);
  // It mounts as it shows: measured again then.
  const { w } = useElementSize(barRef, 0, 0, [shown, link != null]);
  const steps = ruleSteps(w);
  const { mask, strokeD } = useMemo(() => {
    const { maskD, strokeD: d } = buildToolbarPaths(seed + 11, steps);
    return { mask: toolbarMask(maskD), strokeD: d };
  }, [seed, steps]);
  const rowRef = useEdgeFades<HTMLDivElement>(undefined, 'x');

  if (!shown || typeof document === 'undefined') return null;

  let first = true;
  const tabStop = () => {
    const stop = first;
    first = false;
    return stop ? 0 : -1;
  };

  return createPortal(
    <div
      ref={barRef}
      className={styles.bar}
      style={{ '--kb-inset': `${inset}px` } as CSSProperties}
      data-keyboard={inset > 0 || undefined}
      data-link={link ? '' : undefined}
    >
      <div aria-hidden className={styles.paper} style={{ WebkitMaskImage: mask, maskImage: mask }} />
      <svg aria-hidden className={styles.wave} viewBox={`0 0 ${TOOLBAR_W} ${TOOLBAR_TOTAL_H}`} preserveAspectRatio="none">
        <path
          d={strokeD}
          fill="none"
          stroke="color-mix(in oklch, var(--field-border-hover) 45%, transparent)"
          strokeWidth={INK_LIGHT}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {link ? (
        <div className={styles.linkInner}>
          <LinkEditor
            key={link.key}
            session={link.session}
            seed={seed}
            onApply={link.onApply}
            onRemove={link.onRemove}
            onCancel={() => link.onCancel(true)}
          />
        </div>
      ) : (
        <div className={styles.inner}>
          <div
            ref={rowRef}
            role="toolbar"
            aria-label={t('toolbarLabel')}
            className={styles.row}
            onKeyDown={(e) => void rovingKeyDown(e)}
          >
            <ToolButton
              touch
              label={
                <span className={styles.iconLabel}>
                  {uploading ? (
                    <SketchLoader size={15} seed={seed} ariaLabel={t('imageUploading')} />
                  ) : (
                    <Icon name="image" size={15} />
                  )}
                  {t('insertImage')}
                </span>
              }
              aria={t('insertImage')}
              disabled={uploading}
              seed={seed + 77}
              tabIndex={tabStop()}
              onClick={onInsertImage}
            />
            <ToolButton
              touch
              label={
                <span className={styles.iconLabel}>
                  <Icon name="cards" size={15} />
                  {t('insertCard')}
                </span>
              }
              aria={t('insertCard')}
              seed={seed + 70}
              tabIndex={tabStop()}
              onClick={onInsertCard}
            />
            {FORMAT_GROUPS.map((group, g) => (
              <Fragment key={g}>
                <Divider orientation="vertical" seed={seed + 9 + g * 6} amplitude={1.2} spacing={4} />
                {group.map((command) => (
                  <ToolButton
                    key={command}
                    touch
                    label={FORMAT_FACE[command] ?? t(FORMAT_LABEL_KEY[command])}
                    aria={t(FORMAT_LABEL_KEY[command])}
                    active={states[command]}
                    seed={seed + FORMAT_SEED[command]}
                    tabIndex={tabStop()}
                    onClick={() => runFormat(editor, command)}
                  />
                ))}
                {/* The link glyph after 粗體 · 斜體 (round 16 §6). */}
                {g === 0 && (
                  <ToolButton
                    touch
                    label={<Icon name="link" size={17} />}
                    aria={t('link')}
                    active={linkActive}
                    seed={seed + LINK_TOOL_SEED}
                    tabIndex={tabStop()}
                    onClick={onLink}
                  />
                )}
              </Fragment>
            ))}
          </div>
          <button
            type="button"
            className={styles.hide}
            aria-label={t('hideKeyboard')}
            title={t('hideKeyboard')}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.commands.blur();
              (document.activeElement as HTMLElement | null)?.blur?.();
            }}
          >
            <Icon name="chevron-down" size={20} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

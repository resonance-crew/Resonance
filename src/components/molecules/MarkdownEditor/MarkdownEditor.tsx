'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { storyLinkWaveStyle } from '@/lib/design/storyLinkWave';
import { ruleSteps } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useKeyboardInset } from '@/lib/hooks/useKeyboardInset';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { UnsupportedImage, uploadImageFile } from '@/lib/images/upload';
import type { Card } from '@/lib/db/types';
import { getMarkdown, storyExtensions } from '@/lib/markdown/editorSchema';
import { LatinMarks } from '@/lib/markdown/latinMarks';
import type { StoryScript } from '@/lib/text/script';
import '@/styles/story.css';
import { OrganicImageNode } from './OrganicImageNode';
import { CardEmbedNode } from './CardEmbedNode';
import { CurvedBlockquoteNode } from './CurvedBlockquoteNode';
import { FormatBubble } from './FormatBubble';
import { InsertHandle } from './InsertHandle';
import { KeyboardFormatBar } from './KeyboardFormatBar';
import { ToolButton } from './ToolButton';
import {
  activeFormats,
  buildToolbarPaths,
  NO_FORMATS,
  runFormat,
  TOOLBAR_TOTAL_H,
  TOOLBAR_W,
  toolbarMask,
  type FormatCommand,
} from './formatting';
import styles from './MarkdownEditor.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';

// The card picker loads when it is first opened, not with the editor.
const InsertCardModal = dynamic(() => import('./InsertCardModal').then((m) => m.InsertCardModal));

// Any picture the browser can read: compressImage turns it into one the server takes.
const ACCEPTED_IMAGES = 'image/*';

/** A fine pointer that hovers: the canvas's selection bubble and "+"; anything else gets the keyboard bar. */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
/** How far the caret keeps above the keyboard bar's row, beyond the bar itself. */
const CARET_CLEARANCE = 16;
/** The keyboard bar's row. */
const BAR_ROW_H = 44;

function imageFiles(list: FileList | undefined | null): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

/** What the writer asks of its story field. */
export interface MarkdownEditorHandle {
  /**
   * Puts the caret in the story: at its start, at its end, or where it was
   * (`keep`, the selection the writer left — coming back from the publish step).
   */
  focus(where?: 'start' | 'end' | 'keep'): void;
  /** Whether the story holds no words, pictures or cards. */
  isEmpty(): boolean;
}

export interface MarkdownEditorProps {
  /** Initial / current markdown. Used only to seed the editor — the editor then
   *  owns its content and reports changes via onChange. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  seed?: number;
  /**
   * How the story is set (src/styles/story.css, as the reader sets it): its
   * script and the language of its words, on the editable root. Absent, the
   * story is set as CJK with no `lang` of its own.
   */
  script?: StoryScript;
  lang?: string;
  /**
   * `framed` (default): the story inside the form's dashed frame, under a
   * fixed toolbar. `canvas`: the writer's own page — no frame and no toolbar,
   * the story at the reader's measure and type; formatting comes when it is
   * wanted (a selection bubble and a "+" on an empty line for a fine pointer,
   * a bar docked on the keyboard for a finger).
   */
  variant?: 'framed' | 'canvas';
  /** What the writer asks of the field (focus, emptiness). */
  editorRef?: Ref<MarkdownEditorHandle>;
  /** Pictures are on their way into the story (the publish step waits for them). */
  onUploadingChange?: (uploading: boolean) => void;
  /** The story took or lost the focus. */
  onFocusChange?: (focused: boolean) => void;
}

/**
 * Rich story editor that stores Markdown. Built on Tiptap (ProseMirror) so we
 * get markdown input rules (`## `, `**bold**`, `- list`, `> quote`), the
 * shortcuts, and pictures by paste (Ctrl+V) or drag-drop at the cursor / drop
 * point. The story's type is the reader's own (src/styles/story.css, with the
 * apostrophes inside Latin words set in the Latin face: LatinMarks, a
 * decoration beside the schema, never in it). Framed, it sits in the form's
 * wobbly dashed surface under a HackMD-style fixed toolbar; as the writer's
 * canvas it is the page itself (see `variant`).
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  seed = 17,
  script,
  lang,
  variant = 'framed',
  editorRef,
  onUploadingChange,
  onFocusChange,
}: MarkdownEditorProps) {
  const t = useTranslations('write.editor');
  const canvas = variant === 'canvas';
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const cardModalLoaded = useOpenedOnce(cardModalOpen);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The toolbar's width sets its wave's turn count (ruleSteps).
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { w: toolbarW } = useElementSize(toolbarRef);
  const toolbarSteps = ruleSteps(toolbarW);

  // The canvas's tools follow the pointer, not the width: null until hydrated (neither is drawn).
  const fine = useMediaQuery(FINE_POINTER);
  const touchBar = canvas && fine === false;
  const kbInset = useKeyboardInset(touchBar && focus);

  // editorProps handlers are captured once at editor creation, so they reach
  // the latest upload logic through a ref instead of a stale closure.
  const insertImagesRef = useRef<(files: File[], pos?: number) => void>(() => {});
  // The selection bubble's element, for Option/Alt+F10.
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  const editor = useEditor({
    immediatelyRender: false,
    // The schema and its Markdown come from editorSchema (shared with the
    // native apps' editor island); only the node views are the web's own.
    extensions: [
      ...storyExtensions({ blockquote: CurvedBlockquoteNode, image: OrganicImageNode, cardEmbed: CardEmbedNode }),
      LatinMarks,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    editorProps: {
      // Re-read on every render (useEditor applies changed options), so a new script re-sets the story at once.
      attributes: {
        class: [styles.content, canvas && styles.canvasContent, 'story-prose'].filter(Boolean).join(' '),
        ...(script ? { 'data-script': script } : {}),
        ...(lang ? { lang } : {}),
        // The pen wave every link in the story wears (one for all of them here; the reader seeds one per link).
        style: storyLinkWaveStyle('editor'),
        role: 'textbox',
        'aria-multiline': 'true',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
      // On a touch screen the caret keeps clear of the keyboard and the bar docked on it.
      ...(touchBar ? { scrollMargin: { top: 16, right: 0, left: 0, bottom: kbInset + BAR_ROW_H + CARET_CLEARANCE } } : {}),
      // Pasted screenshots / copied images land at the cursor.
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        insertImagesRef.current(files);
        return true;
      },
      // Files dragged into the story body land at the drop point. `moved` is
      // an in-editor drag of existing content — let ProseMirror handle that.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImagesRef.current(files, coords?.pos);
        return true;
      },
      // Option/Alt+F10 moves the focus into the selection bubble (WAI-ARIA's key for a toolbar of the text).
      handleKeyDown: (_view, event) => {
        if (!(event.altKey && event.key === 'F10')) return false;
        const first = bubbleRef.current?.querySelector<HTMLButtonElement>('[data-tool][tabindex="0"], [data-tool]');
        if (!first || bubbleRef.current?.style.visibility === 'hidden') return false;
        event.preventDefault();
        first.focus();
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
    onFocus: () => {
      setFocus(true);
      onFocusChangeRef.current?.(true);
    },
    onBlur: () => {
      setFocus(false);
      onFocusChangeRef.current?.(false);
    },
  });

  useImperativeHandle(
    editorRef,
    () => ({
      focus(where = 'end') {
        if (!editor) return;
        if (where === 'keep') editor.commands.focus();
        else editor.commands.focus(where);
      },
      isEmpty() {
        return editor?.isEmpty ?? true;
      },
    }),
    [editor],
  );

  // The keyboard rising over the caret: bring the caret above the bar once (typing keeps it there).
  const keyboardUp = kbInset > 0;
  useEffect(() => {
    if (keyboardUp && editor && !editor.isDestroyed && editor.isFocused) editor.commands.scrollIntoView();
  }, [keyboardUp, editor]);

  const uploading = uploadingCount > 0;
  useEffect(() => {
    onUploadingChange?.(uploading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading]);

  const activeStates =
    useEditorState({ editor, selector: (ctx) => activeFormats(ctx.editor) }) ?? NO_FORMATS;

  const { toolbarMaskUrl, toolbarStrokeD } = useMemo(() => {
    const { maskD, strokeD } = buildToolbarPaths(seed + 5, toolbarSteps);
    return { toolbarMaskUrl: toolbarMask(maskD), toolbarStrokeD: strokeD };
  }, [seed, toolbarSteps]);

  insertImagesRef.current = (files, pos) => {
    void (async () => {
      if (!editor) return;
      setImageError(null);
      setUploadingCount((c) => c + files.length);
      let insertAt = pos;
      for (const file of files) {
        try {
          const { publicUrl } = await uploadImageFile(file);
          const node = { type: 'image', attrs: { src: publicUrl, alt: file.name } };
          if (insertAt != null) {
            const max = editor.state.doc.content.size;
            editor.chain().focus().insertContentAt(Math.min(insertAt, max), node).run();
            insertAt = undefined; // subsequent files follow the cursor
          } else {
            editor.chain().focus().insertContent(node).run();
          }
        } catch (e) {
          setImageError(t(e instanceof UnsupportedImage ? 'imageUnsupported' : 'imageUploadError'));
        } finally {
          setUploadingCount((c) => c - 1);
        }
      }
    })();
  };

  if (!editor) return null;

  function insertCardLink(card: Card) {
    if (!editor) return;
    const href = `/card/${card.slug ?? card.id}`;
    editor
      .chain()
      .focus()
      .insertContent({ type: 'cardEmbed', attrs: { href, title: card.thoughtCore } })
      .run();
    setCardModalOpen(false);
  }

  const pickImages = () => fileInputRef.current?.click();
  const pickCard = () => setCardModalOpen(true);

  // What every variant keeps: the error line, the picture picker, the card picker.
  const shared = (
    <>
      {imageError && <div className={styles.imageError}>{imageError}</div>}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGES}
        multiple
        className={styles.fileInputHidden}
        onChange={(e) => {
          const files = imageFiles(e.currentTarget.files);
          if (files.length > 0) insertImagesRef.current(files);
          e.currentTarget.value = '';
        }}
      />
      {cardModalLoaded && (
        <InsertCardModal open={cardModalOpen} onClose={() => setCardModalOpen(false)} onPick={insertCardLink} />
      )}
    </>
  );

  if (canvas) {
    return (
      <div className={styles.canvas}>
        <EditorContent editor={editor} />
        {fine === true && (
          <>
            <FormatBubble ref={bubbleRef} editor={editor} seed={seed} />
            <InsertHandle editor={editor} seed={seed} onInsertImage={pickImages} onInsertCard={pickCard} />
          </>
        )}
        {touchBar && (
          <KeyboardFormatBar
            editor={editor}
            focused={focus}
            inset={kbInset}
            seed={seed}
            uploading={uploading}
            onInsertImage={pickImages}
            onInsertCard={pickCard}
          />
        )}
        {uploading && (
          <p className={styles.uploadingLine} role="status">
            <SketchLoader size={15} seed={seed} ariaLabel={t('imageUploading')} />
            {t('imageUploading')}
          </p>
        )}
        {shared}
      </div>
    );
  }

  const btn = (
    label: ReactNode,
    aria: string,
    onClick: () => void,
    opts: { active?: boolean; disabled?: boolean; seed?: number } = {}
  ) => (
    <ToolButton
      label={label}
      aria={aria}
      onClick={onClick}
      active={opts.active}
      disabled={opts.disabled}
      seed={seed + (opts.seed ?? 0)}
    />
  );
  const format = (command: FormatCommand) => () => runFormat(editor, command);

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={16}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div ref={toolbarRef} className={styles.toolbarWrap}>
          <div
            aria-hidden
            className={styles.toolbarBg}
            style={{ WebkitMaskImage: toolbarMaskUrl, maskImage: toolbarMaskUrl }}
          />
          <svg
            aria-hidden
            className={styles.toolbarWave}
            viewBox={`0 0 ${TOOLBAR_W} ${TOOLBAR_TOTAL_H}`}
            preserveAspectRatio="none"
          >
            <path
              d={toolbarStrokeD}
              fill="none"
              stroke="color-mix(in oklch, var(--field-border-hover) 45%, transparent)"
              strokeWidth={INK_LIGHT}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className={styles.toolbar} role="toolbar" aria-label={t('toolbarLabel')}>
            {btn(t('bold'), t('bold'), format('bold'), { active: activeStates.bold, seed: 21 })}
            {btn(t('italic'), t('italic'), format('italic'), { active: activeStates.italic, seed: 28 })}
            <Divider orientation="vertical" seed={seed + 3} amplitude={1.2} spacing={4} />
            {btn('H2', t('h2'), format('h2'), { active: activeStates.h2, seed: 35 })}
            {btn('H3', t('h3'), format('h3'), { active: activeStates.h3, seed: 42 })}
            <Divider orientation="vertical" seed={seed + 9} amplitude={1.2} spacing={4} />
            {btn(t('bulletList'), t('bulletList'), format('bulletList'), { active: activeStates.bulletList, seed: 49 })}
            {btn(t('orderedList'), t('orderedList'), format('orderedList'), { active: activeStates.orderedList, seed: 56 })}
            {btn(t('quote'), t('quote'), format('blockquote'), { active: activeStates.blockquote, seed: 63 })}
            <Divider orientation="vertical" seed={seed + 15} amplitude={1.2} spacing={4} />
            {btn(
              <span className={styles.toolBtnIconLabel}>
                <Icon name="cards" size={15} />
                {t('insertCard')}
              </span>,
              t('insertCard'),
              pickCard,
              { seed: 70 }
            )}
            {btn(
              <span className={styles.toolBtnIconLabel}>
                {uploading ? (
                  <SketchLoader size={15} seed={seed} ariaLabel={t('imageUploading')} />
                ) : (
                  <Icon name="image" size={15} />
                )}
                {t('insertImage')}
              </span>,
              t('insertImage'),
              pickImages,
              { disabled: uploading, seed: 77 }
            )}
          </div>
        </div>

        <EditorContent editor={editor} />
        {shared}
      </div>
    </HandDrawnDashedSurface>
  );
}

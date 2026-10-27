'use client';

import { createContext, useContext } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import { useStoryBlock } from '@/components/molecules/StoryLinkCard/useStoryBlock';
import cardStyles from '@/components/molecules/StoryLinkCard/StoryLinkCard.module.css';
import type { LinkPreview } from '@/lib/db/types';
import { normalizeLink } from '@/lib/links/url';
import { LinkCard } from '@/lib/markdown/editorSchema';
import { NodeRemoveButton } from './NodeRemoveButton';
import styles from './MarkdownEditor.module.css';

/** What a link card in the writer does when it is pressed: opens the link editor on it (卡片 chosen). */
export const LinkCardActionContext = createContext<(() => void) | null>(null);

/** The stored preview of an address (the server keyed it normalized), or undefined. */
export function previewOf(previews: readonly LinkPreview[] | null, href: string): LinkPreview | undefined {
  if (!previews?.length) return undefined;
  const key = normalizeLink(href);
  const bare = (u: string) => u.replace(/\/$/, '');
  return previews.find((p) => p.url === key || (key != null && bare(p.url) === bare(key)));
}

/** An address's host for the card, without `www.`. */
function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

function LinkCardView({ node, selected, deleteNode, editor, getPos }: NodeViewProps) {
  const t = useTranslations('write.editor');
  const href = String(node.attrs.href ?? '');
  const preview = previewOf(useContext(StoryLinkPreviewsContext), href);
  const openEditor = useContext(LinkCardActionContext);
  const block = useStoryBlock<HTMLButtonElement>(href);
  const host = hostOf(href);

  /** Picks the card and opens the link editor on it (whose field takes the focus). */
  const edit = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
    openEditor?.();
  };

  return (
    <NodeViewWrapper className={`${styles.linkCardNode} story-embed`} data-selected={selected || undefined} data-drag-handle="">
      <button
        ref={block.ref}
        type="button"
        {...block.rootProps}
        className={`${block.rootProps.className} ${styles.linkCardFace}`}
        aria-label={t('linkCardLabel', { host })}
        title={t('linkEdit')}
        contentEditable={false}
        // The story keeps its selection while the card is pressed; the press picks the card.
        onMouseDown={(e) => e.preventDefault()}
        onClick={edit}
      >
        {block.layers}
        {preview?.image && (
          <span className={cardStyles.picture} style={block.d ? { clipPath: `path('${block.d}')` } : undefined} data-clipped={block.d ? '' : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- our own /api/link-image route, as the reader's card */}
            <img className={cardStyles.image} src={preview.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </span>
        )}
        <span className={cardStyles.text}>
          <span className={cardStyles.title}>{preview?.title ?? host}</span>
          <span className={cardStyles.host}>
            <Icon name="link" size={15} />
            <span className={cardStyles.hostName}>{preview ? host : href}</span>
          </span>
        </span>
      </button>
      {selected && <NodeRemoveButton onClick={() => deleteNode()} label={t('linkRemove')} />}
    </NodeViewWrapper>
  );
}

/**
 * A link standing alone on its line, in the writer as the reader will show
 * it (see LinkCard for its Markdown): the reader's link card, quiet — its
 * fill and wobble (useStoryBlock), the stored preview's picture and title
 * when the live card has one for it (StoryLinkPreviewsContext, provided by
 * the editor from the card being edited), else the address's host over the
 * address. Pressing it picks it and opens the link editor with 卡片 chosen
 * (LinkCardActionContext); picked, it wears the ✕ that takes it away, and
 * Backspace deletes it as any block.
 */
export const LinkCardNode = LinkCard.extend({
  addNodeView() {
    return ReactNodeViewRenderer(LinkCardView);
  },
});

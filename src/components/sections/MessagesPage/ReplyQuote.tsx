'use client';

import { useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { stickerName, stickerPath } from '@/lib/stickers/catalog';
import { QUOTE_RADIUS, bubbleStandInRadius, seedFromId } from '@/lib/design/bubble';
import type { MessageReplyQuote } from '@/lib/db/types';
import { useBubbleClip } from './MessageBubble';
import styles from './Thread.module.css';

export interface ReplyQuoteProps {
  quote: MessageReplyQuote;
  /** The reply itself is the viewer's. */
  own: boolean;
  viewerId: string;
  otherHandle: string;
  /** A click goes to the original (null: the long-press copy, which only shows it). */
  onJump: ((messageId: string) => void) | null;
  /**
   * The answer has no bubble to lie over the quote's foot (a sticker, round 22): the quote keeps no room for it —
   * as much under its content as over it, its content centred.
   */
  apart?: boolean;
}

/**
 * What a reply answers, over it (Messenger's): the quoted words as a quieter
 * bubble of their own (`--bubble-quote`, two lines at most) whose foot the
 * reply's bubble lies over. A card-only original reads「一張卡片」. A click
 * goes to the original, reading older pages for it when it isn't loaded.
 *
 * Who answered whom goes without saying in a one-to-one thread (the reply
 * stands on its sender's side), so it is not shown — only read out, before
 * the quote, as it always was (「{handle} 回覆了你」, …).
 */
export function ReplyQuote({ quote, own, viewerId, otherHandle, onJump, apart = false }: ReplyQuoteProps) {
  const t = useTranslations('messages');
  const quotesViewer = quote.senderId === viewerId;
  const caption = own
    ? quotesViewer
      ? t('youRepliedToYourself')
      : t('youRepliedTo', { handle: otherHandle })
    : quotesViewer
      ? t('repliedToYou', { handle: otherHandle })
      : t('repliedToThemselves', { handle: otherHandle });
  const locale = useLocale();
  // A sticker's quote is its key frame (round 22); one this build doesn't know, its fallback words.
  const sticker = !quote.unsent && quote.sticker ? quote.sticker : null;
  const stickerWords = sticker ? stickerName(sticker, locale) : null;
  // A quote of a message since unsent says so, and nothing of what it said.
  const words = quote.unsent
    ? t('unsentQuote')
    : stickerWords
      ? t('stickerLabel', { name: stickerWords })
      : quote.text || (sticker ? t('stickerUnknown') : quote.image ? t('replyImage') : t('replyCard'));
  const ref = useRef<HTMLButtonElement>(null);
  const clip = useBubbleClip(ref, seedFromId(quote.id, 19), { maxRadius: QUOTE_RADIUS });

  return (
    <div className={styles.quote} data-own={own || undefined} data-apart={apart || undefined}>
      <span className={styles.quoteSpoken}>{caption}</span>
      <button
        ref={ref}
        type="button"
        className={styles.quoteBubble}
        style={clip ? { clipPath: clip } : { borderRadius: bubbleStandInRadius({ maxRadius: QUOTE_RADIUS }) }}
        data-shaped={clip ? '' : undefined}
        data-sticker={sticker && stickerWords ? '' : undefined}
        aria-label={words}
        tabIndex={onJump ? undefined : -1}
        onClick={() => onJump?.(quote.id)}
      >
        {sticker && stickerWords ? (
          // A sticker's quote is its key frame alone (round 22, the owner's notes); its name is said, not shown.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.quoteSticker} src={stickerPath(sticker, 'thumb')} alt="" draggable={false} />
        ) : (
          <span className={styles.quoteText} data-unsent={quote.unsent || undefined}>
            {words}
          </span>
        )}
      </button>
    </div>
  );
}

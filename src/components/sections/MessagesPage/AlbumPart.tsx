'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { useSessionReady } from '@/components/providers/AuthProvider';
import { ALBUM_GAP, albumRows } from '@/lib/chat/album';
import { localPicture } from '@/lib/chat/localPictures';
import { reactionCounts, type ChatMessage } from '@/lib/chat/message';
import { seedFromId } from '@/lib/design/bubble';
import { chatImageUrl } from '@/lib/db/firestore/client/messages';
import type { MessageImage } from '@/lib/db/types';
import { PICTURE_MAX_W, PictureViewer } from './PicturePart';
import { ReactionChips } from './ReactionChips';
import styles from './Thread.module.css';

/** An album's grid is as wide as the widest picture a bubble holds. */
export const ALBUM_W = PICTURE_MAX_W;

export interface AlbumPartProps {
  /** The album's pictures in its order (2 to 10), each a message of its own. */
  members: readonly ChatMessage[];
  own: boolean;
  viewerId: string;
  otherHandle: string;
  /** False for the lifted copy: it shows the grid, nothing in it answers. */
  interactive: boolean;
  /** The picture the hover tools act on (a mouse's), marked while they are open. */
  active?: string;
  toolsOpen?: boolean;
  /** A mouse came onto a picture, or the keyboard to it: the tools beside the grid act on it. */
  onActive?: (key: string) => void;
  /** A tap on a picture's reactions: the overlay for that picture's message. */
  onChips?: (member: ChatMessage, el: HTMLElement, byKeyboard: boolean) => void;
}

/**
 * Several pictures sent together, drawn as one grid inside one bubble (round
 * 22 §3): two side by side, three as one big and two under it, four two by
 * two, five to ten in rows of three — each picture still a message of its
 * own: a tap opens it whole, holding it lifts that picture with its menu
 * (`data-album-member`, read by the row's long press), and its reactions sit
 * on its own corner. Its place is known before any picture comes.
 */
export function AlbumPart({ members, own, viewerId, otherHandle, interactive, active, toolsOpen, onActive, onChips }: AlbumPartProps) {
  const rows = albumRows(members.length, ALBUM_W);
  let at = 0;
  return (
    <div className={styles.album} style={{ gap: ALBUM_GAP, width: `calc(100% + 8px)` }}>
      {rows.map((row, r) => {
        const cells = members.slice(at, at + row.count);
        at += row.count;
        return (
          <div key={r} className={styles.albumRow} style={{ height: row.height, gap: ALBUM_GAP } as CSSProperties}>
            {cells.map((m) => (
              <AlbumCell
                key={m.key}
                member={m}
                own={own}
                viewerId={viewerId}
                otherHandle={otherHandle}
                interactive={interactive}
                marked={!!toolsOpen && active === m.key}
                onActive={onActive}
                onChips={onChips}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AlbumCell({
  member,
  own,
  viewerId,
  otherHandle,
  interactive,
  marked,
  onActive,
  onChips,
}: {
  member: ChatMessage;
  own: boolean;
  viewerId: string;
  otherHandle: string;
  interactive: boolean;
  marked: boolean;
  onActive?: (key: string) => void;
  onChips?: (member: ChatMessage, el: HTMLElement, byKeyboard: boolean) => void;
}) {
  const t = useTranslations('messages');
  const sessionReady = useSessionReady();
  const image = member.image as MessageImage;
  const local = localPicture(image.id);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const remote = sessionReady ? chatImageUrl(image.id, 'thumb') : null;
  const src = local ?? (remote && attempt ? `${remote}&try=${attempt}` : remote);
  const counts = reactionCounts(member.reactions, viewerId);
  return (
    <span className={styles.albumCell} data-album-member={member.key} data-marked={marked || undefined} onPointerEnter={() => onActive?.(member.key)}>
      <button
        type="button"
        className={styles.albumPicture}
        aria-label={t('openImage')}
        tabIndex={interactive ? undefined : -1}
        data-failed={failed || undefined}
        onFocus={() => onActive?.(member.key)}
        onClick={(e) => {
          e.stopPropagation();
          if (!interactive) return;
          if (failed) {
            setFailed(false);
            setAttempt((a) => a + 1);
          } else setOpen(true);
        }}
      >
        {src && !failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} />
        )}
        {failed && (
          <span className={styles.sentPictureGlyph}>
            <Icon name="image" size={20} />
          </span>
        )}
      </button>
      {counts.length > 0 && (
        <span className={styles.albumChips}>
          <ReactionChips
            counts={counts}
            own={own}
            otherHandle={otherHandle}
            seed={seedFromId(member.key, 37)}
            onOpen={interactive && onChips ? (el, byKeyboard) => onChips(member, el, byKeyboard) : null}
          />
        </span>
      )}
      {open && <PictureViewer image={image} onClose={() => setOpen(false)} />}
    </span>
  );
}

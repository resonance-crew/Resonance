'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { AvatarGroup, type AvatarGroupMember } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { PaperSheet, sheetPath } from '@/components/atoms/PaperSheet/PaperSheet';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { listTaps } from '@/lib/db/firestore/client/taps';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { TapPeople, TapPeopleSkeleton } from './TapPeople';
import styles from './TapFaces.module.css';

/** A face as AvatarGroup draws it. */
export function memberOf(a: AuthorBody): AvatarGroupMember {
  return { id: a.id, initials: a.initials, accentColor: a.accentColor, avatarSeed: a.avatarSeed ?? '', avatarUrl: a.avatarUrl ?? undefined };
}

/** The names a screen reader hears for the faces: everyone but the viewer, then 還有其他人 when there are more. */
export function facesNames(faces: AuthorBody[], viewerId: string | undefined, locale: string): string {
  return faces
    .filter((f) => f.id !== viewerId)
    .map((f) => f.handle)
    .join(locale === 'en' ? ', ' : '、');
}

/** Where the list opens as a dialog rather than a popover under the faces: a phone (layout.md: the web ≤ 720). */
export const TAP_LIST_DIALOG_QUERY = '(max-width: 720px)';

export interface TapFacesProps {
  cardId: string;
  tap: CardTapBody;
  viewerId: string;
  /** The viewer's face, just turned on: it slides in first. */
  arriving?: string;
  /** The viewer's face, just turned off: drawn once more as it slides out. */
  leaving?: AuthorBody;
}

/**
 * The faces at the start of the end row's second line (round 26 §U2): the viewer first when they resonated, then
 * the people they are connected with who did — no words on screen, ever (the owner: 「不要寫這樣的文字，直接放那個頭像就好」).
 * The whole group is one button opening who they are — a dialog on a phone, a popover under the faces wider —
 * except when the only face is the viewer's own: then it is a picture that says 你共振了, not in the tab order.
 */
export function TapFaces({ cardId, tap, viewerId, arriving, leaving }: TapFacesProps) {
  const t = useTranslations('card.tap');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const dialog = useMediaQuery(TAP_LIST_DIALOG_QUERY) !== false;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const faces = tap.faces;
  const group = (
    <AvatarGroup members={faces.map(memberOf)} more={tap.more} size={28} arriving={arriving} leaving={leaving ? memberOf(leaving) : undefined} />
  );
  if (!faces.length && !leaving) return null;
  const onlyMine = !tap.more && faces.length === 1 && faces[0].id === viewerId;
  if (onlyMine || !faces.length) {
    return (
      <span className={styles.faces} role="img" aria-label={faces.length ? t('selfOnly') : undefined} aria-hidden={faces.length ? undefined : true}>
        {group}
      </span>
    );
  }
  const names = facesNames(faces, viewerId, locale);
  const label = `${t('facesReader', { names })}${tap.more ? (locale === 'en' ? `, ${t('more')}` : `，${t('more')}`) : ''}`;
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  return (
    <span className={styles.anchor}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.faces}
        data-tap-faces=""
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open && !dialog ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {group}
      </button>
      {open &&
        (dialog ? (
          <Modal
            open
            onClose={() => close()}
            maxWidth="min(400px, calc(100vw - 32px))"
            seed={43}
            padding="22px 22px 22px"
            // No visible title (S2): a reader sees only their connections, and a title would claim everyone.
            ariaLabel={label}
            closeButton
          >
            <DialogScroll>
              <ReaderList cardId={cardId} size="dialog" onPick={() => close(false)} />
            </DialogScroll>
          </Modal>
        ) : (
          <Popover id={listId} label={label} onClose={close}>
            <ReaderList cardId={cardId} size="popover" onPick={() => close(false)} />
          </Popover>
        ))}
    </span>
  );
}

/** The reader's one page of people (themselves, then their connections), read as the list opens. */
function ReaderList({ cardId, size, onPick }: { cardId: string; size: 'dialog' | 'popover'; onPick: () => void }) {
  const { data } = useSWR(['taps', cardId], () => listTaps(cardId), { revalidateOnFocus: false });
  if (!data) return <TapPeopleSkeleton size={size} />;
  return <TapPeople people={data.people} size={size} onPick={onPick} />;
}

/**
 * The faces' list on a wide screen (§U2.5): a popover 8 under them, at their start, 280 wide, on the one menu sheet
 * (PaperSheet: its paper, its grey pen line, no shadow), its rows banded and cut to its outline; six rows, then it
 * scrolls inside. Escape or a press outside closes it, and the focus goes back to the faces.
 */
function Popover({ id, label, onClose, children }: { id: string; label: string; onClose: (refocus?: boolean) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const seed = 59;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose(true);
    };
    const onDown = (e: PointerEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);
  const clip = w && h ? `path('${sheetPath(w, h, 20, seed)}')` : undefined;
  return (
    <div ref={ref} id={id} role="dialog" aria-label={label} className={styles.popover}>
      <PaperSheet w={w} h={h} seed={seed} />
      <div className={styles.popoverBody} style={clip ? { clipPath: clip } : undefined}>
        {children}
      </div>
    </div>
  );
}

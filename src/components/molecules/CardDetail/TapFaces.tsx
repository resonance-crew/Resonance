'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { AvatarGroup, type AvatarGroupMember } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import { TAP_FACES_MAX, type AuthorBody, type CardTapBody } from '@/lib/api/v1/schemas';
import { listTaps } from '@/lib/db/firestore/client/taps';
import { TapPeople, TapPeopleSkeleton } from './TapPeople';
import styles from './TapFaces.module.css';

/** A face as AvatarGroup draws it. */
export function memberOf(a: AuthorBody): AvatarGroupMember {
  return { id: a.id, initials: a.initials, accentColor: a.accentColor, avatarSeed: a.avatarSeed ?? '', avatarUrl: a.avatarUrl ?? undefined };
}

/**
 * The faces drawn (at most three) and whether the blank disc follows them: the server's `more`, or a face past the
 * three — the viewer's own, turned on, puts the third one there (lib/data/taps keeps the list whole).
 */
export function shownFaces(tap: CardTapBody): { faces: AuthorBody[]; more: boolean } {
  return { faces: tap.faces.slice(0, TAP_FACES_MAX), more: tap.more || tap.faces.length > TAP_FACES_MAX };
}

/** The names a screen reader hears for the faces: everyone but the viewer. */
export function facesNames(faces: AuthorBody[], viewerId: string | undefined, locale: string): string {
  return faces
    .filter((f) => f.id !== viewerId)
    .map((f) => f.handle)
    .join(locale === 'en' ? ', ' : '、');
}

/**
 * What a screen reader says of a reader's faces (§U2.4), as the apps say it: what is seen — the faces drawn, then
 * 還有其他人 for the blank disc — and, when the first face is the viewer's own, 你共振了 before it:
 * 「你共振了，你連結的人裡，與這張卡片共振的：小安、阿明，還有其他人」.
 */
export function readerFacesLabel(
  shown: { faces: AuthorBody[]; more: boolean },
  mine: boolean,
  viewerId: string | undefined,
  locale: string,
  words: { selfOnly: string; more: string; reader: (names: string) => string },
): string {
  const and = locale === 'en' ? ', ' : '，';
  const others = facesNames(shown.faces, viewerId, locale);
  const said = words.reader(`${others}${shown.more ? `${others ? and : ''}${words.more}` : ''}`);
  return mine && shown.faces.some((f) => f.id === viewerId) ? `${words.selfOnly}${and}${said}` : said;
}

/**
 * The list's dialog at its widest: a phone's column less 16 on each side (as it was), and on a tablet, the Mac and
 * the desktop 480, as the author's list and the app's other one-exit dialogs there.
 */
export const TAP_LIST_DIALOG_WIDTH = 'min(480px, calc(100vw - 32px))';

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
 * The whole group is one button opening who they are — a centred dialog on every screen (the owner, 2026-11-19:
 * 「我在想这个直接做成这个 model 会不会好一点呢」; on a wide screen it was a popover under the faces) — except when
 * the only face is the viewer's own: then it is a picture that says 你共振了, not in the tab order.
 */
export function TapFaces({ cardId, tap, viewerId, arriving, leaving }: TapFacesProps) {
  const t = useTranslations('card.tap');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const faces = tap.faces;
  // At most three drawn, the blank disc after them for the rest (the list itself stays whole: lib/data/taps).
  const shown = shownFaces(tap);
  const group = (
    <AvatarGroup members={shown.faces.map(memberOf)} more={shown.more} size={28} arriving={arriving} leaving={leaving ? memberOf(leaving) : undefined} />
  );
  if (!faces.length && !leaving) return null;
  const onlyMine = !shown.more && faces.length === 1 && faces[0].id === viewerId;
  if (onlyMine || !faces.length) {
    return (
      <span className={styles.faces} role="img" aria-label={faces.length ? t('selfOnly') : undefined} aria-hidden={faces.length ? undefined : true}>
        {group}
      </span>
    );
  }
  const label = readerFacesLabel(shown, tap.mine, viewerId, locale, {
    selfOnly: t('selfOnly'),
    more: t('more'),
    reader: (names) => t('facesReader', { names }),
  });
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
        onClick={() => setOpen(true)}
      >
        {group}
      </button>
      {open && (
        <Modal
          open
          onClose={() => close()}
          maxWidth={TAP_LIST_DIALOG_WIDTH}
          seed={43}
          padding="22px 22px 22px"
          // No visible title (S2): a reader sees only their connections, and a title would claim everyone.
          ariaLabel={label}
          closeButton
        >
          <DialogScroll>
            <ReaderList cardId={cardId} viewerId={viewerId} onPick={() => close(false)} />
          </DialogScroll>
        </Modal>
      )}
    </span>
  );
}

/**
 * The reader's one page of people (themselves, then their connections), read as the list opens. Keyed by the viewer
 * too, as every answer about who someone is connected with: another account in this tab (signed in from another
 * one) never sees the last one's people.
 */
function ReaderList({ cardId, viewerId, onPick }: { cardId: string; viewerId: string; onPick: () => void }) {
  const { data } = useSWR(['taps', cardId, viewerId], () => listTaps(cardId), { revalidateOnFocus: false });
  if (!data) return <TapPeopleSkeleton />;
  return <TapPeople people={data.people} onPick={onPick} />;
}

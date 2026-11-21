'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { AvatarGroup, type AvatarGroupMember } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import { TAP_FACES_MAX, type AuthorBody, type CardTapBody } from '@/lib/api/v1/schemas';
import { listTaps } from '@/lib/db/firestore/client/taps';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { TapPeople, TapPeopleSkeleton, type TapOwnRow } from './TapPeople';
import styles from './TapFaces.module.css';

/** A face as AvatarGroup draws it. */
export function memberOf(a: AuthorBody): AvatarGroupMember {
  return { id: a.id, initials: a.initials, accentColor: a.accentColor, avatarSeed: a.avatarSeed ?? '', avatarUrl: a.avatarUrl ?? undefined };
}

/**
 * The faces drawn (at most three) and whether there are others than them — the server's `more`, or a face past the
 * three (the viewer's own, turned on, puts the third one there; lib/data/taps keeps the list whole). Nothing is drawn
 * for the others (round 29 §S5: no blank disc); the faces' spoken label says 還有其他人.
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
 * What a screen reader says of a reader's faces (§U2.4), as the apps say it: the faces drawn, then 還有其他人 when
 * there are others (nothing on screen says it since round 29 §S5) — and, when the first face is the viewer's own, 你共振了 before it:
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

/** A phone (layout.md: the web ≤ 720): there the list keeps the width it always had. */
export const TAP_LIST_PHONE_QUERY = '(max-width: 720px)';

/**
 * The list's dialog at its widest: on a phone what it always was, 400 or the column less 16 a side (the owner,
 * 2026-11-19: 「手机上已经是这个 model 的设计了，所以可能只有平板和电脑网页和 Mac APP 需要更改哦」); on a tablet, the Mac
 * and the desktop 480, as the author's list and the app's other one-exit dialogs there.
 */
export const TAP_LIST_DIALOG_WIDTH = { phone: 'min(400px, calc(100vw - 32px))', wide: 480 } as const;

export interface TapFacesProps {
  cardId: string;
  tap: CardTapBody;
  viewerId: string;
  /** The viewer's face, just turned on: it slides in first. */
  arriving?: string;
  /** The viewer's face, just turned off: drawn once more as it slides out. */
  leaving?: AuthorBody;
  /**
   * The card offers passages and the viewer's tap is on (round 27 §U3): their own row in the list quotes their pick
   * (or says 選一段) and opens the passages' dialog through this — and the faces are a button even when theirs is the
   * only one.
   */
  onOwnRow?: () => void;
}

/**
 * The faces at the start of the end row's second line (round 26 §U2): the viewer first when they resonated, then
 * the people they are connected with who did — no words on screen, ever (the owner: 「不要寫這樣的文字，直接放那個頭像就好」).
 * The whole group is one button opening who they are — a centred dialog on every screen (the owner, 2026-11-19:
 * 「我在想这个直接做成这个 model 会不会好一点呢」; on a wide screen it was a popover under the faces) — except when
 * the only face is the viewer's own: then it is a picture that says 你共振了, not in the tab order.
 */
export function TapFaces({ cardId, tap, viewerId, arriving, leaving, onOwnRow }: TapFacesProps) {
  const t = useTranslations('card.tap');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const onPhone = useMediaQuery(TAP_LIST_PHONE_QUERY) !== false;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const faces = tap.faces;
  // At most three drawn and nothing after them (round 29 §S5); `more` is still spoken (the list stays whole: lib/data/taps).
  const shown = shownFaces(tap);
  const group = (
    <AvatarGroup members={shown.faces.map(memberOf)} size={28} arriving={arriving} leaving={leaving ? memberOf(leaving) : undefined} />
  );
  if (!faces.length && !leaving) return null;
  const onlyMine = !shown.more && faces.length === 1 && faces[0].id === viewerId && !onOwnRow;
  if (onlyMine || !faces.length) {
    return (
      <span className={styles.faces} role="img" aria-label={faces.length ? t('selfOnly') : undefined} aria-hidden={faces.length ? undefined : true}>
        {group}
      </span>
    );
  }
  // Theirs alone, a button only for their own row (§U3): it says 你共振了, as the picture would.
  const selfAlone = !shown.more && faces.length === 1 && faces[0].id === viewerId;
  const label = selfAlone ? t('selfOnly') : readerFacesLabel(shown, tap.mine, viewerId, locale, {
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
          maxWidth={onPhone ? TAP_LIST_DIALOG_WIDTH.phone : TAP_LIST_DIALOG_WIDTH.wide}
          seed={43}
          padding="22px 22px 22px"
          // No visible title (S2): a reader sees only their connections, and a title would claim everyone.
          ariaLabel={label}
          closeButton
        >
          <DialogScroll>
            <ReaderList cardId={cardId} viewerId={viewerId} own={ownRow(tap, viewerId, onOwnRow)} onPick={() => close(false)} />
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
function ReaderList({ cardId, viewerId, own, onPick }: { cardId: string; viewerId: string; own: TapOwnRow; onPick: () => void }) {
  const { data } = useSWR(['taps', cardId, viewerId], () => listTaps(cardId), { revalidateOnFocus: false });
  if (!data) return <TapPeopleSkeleton />;
  return <TapPeople people={data.people} own={own} onPick={onPick} />;
}

/**
 * The reader's own row (round 27 §U3): on a card with passages its quote is the card page's pick, which a pick
 * changes at once (lib/data/taps); without passages, whatever the list says it was.
 */
export function ownRow(tap: CardTapBody, viewerId: string, onPress?: () => void): TapOwnRow {
  const passages = tap.passages ?? [];
  if (!passages.length) return { id: viewerId, offer: false };
  const quote = passages.find((p) => p.id === tap.passage)?.text ?? null;
  return { id: viewerId, quote, offer: !!onPress, onPress };
}

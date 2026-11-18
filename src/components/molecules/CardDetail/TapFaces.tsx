'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { AvatarGroup, type AvatarGroupMember } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { PaperSheet, sheetPath } from '@/components/atoms/PaperSheet/PaperSheet';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import { TAP_FACES_MAX, type AuthorBody, type CardTapBody } from '@/lib/api/v1/schemas';
import { listTaps } from '@/lib/db/firestore/client/taps';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
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
              <ReaderList cardId={cardId} viewerId={viewerId} size="dialog" onPick={() => close(false)} />
            </DialogScroll>
          </Modal>
        ) : (
          <Popover id={listId} label={label} onClose={close}>
            <ReaderList cardId={cardId} viewerId={viewerId} size="popover" onPick={() => close(false)} />
          </Popover>
        ))}
    </span>
  );
}

/**
 * The reader's one page of people (themselves, then their connections), read as the list opens. Keyed by the viewer
 * too, as every answer about who someone is connected with: another account in this tab (signed in from another
 * one) never sees the last one's people.
 */
function ReaderList({ cardId, viewerId, size, onPick }: { cardId: string; viewerId: string; size: 'dialog' | 'popover'; onPick: () => void }) {
  const { data } = useSWR(['taps', cardId, viewerId], () => listTaps(cardId), { revalidateOnFocus: false });
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

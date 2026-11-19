'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { Icon } from '@/components/atoms/Icon';
import { SegmentedActionBar, type SegmentSpec } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useRouter } from '@/i18n/navigation';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { usePrefillCard } from '@/lib/data/cardPrefill';
import { useMyProfile, useMyResonance } from '@/lib/data/hooks';
import { faceOf, useTapToggle } from '@/lib/data/taps';
import { isBookmarked, toggleBookmark } from '@/lib/db/firestore/client/bookmarks';
import { cardShareKey } from '@/lib/share/links';
import { NoteInPlace, useNoteInPlace } from './NoteInPlace';
import { TapFaces } from './TapFaces';
import styles from './CardViewerActions.module.css';

// Loaded on the first 用卡片回應: most readers never open it.
const ResonatePicker = dynamic(() => import('./ResonatePicker').then((m) => m.ResonatePicker));

/** The note's block id (the 寄小紙條 segment's `aria-controls`). */
export const NOTE_FIELD_ID = 'card-note';

export interface CardViewerActionsProps {
  cardId: string;
  /** The original card's title. */
  cardTitle: string;
  /** The card this one itself replies to: never offered in the picker. */
  referenceCardId?: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
  /** The resonance tap as the server answers this reader (`CardDetail.tap`): undefined while it loads or signed out. */
  tap?: CardTapBody | null;
  /** What ends the second line (round 8 §10.2, round 26 §U1.2): the card's share and ⋯ after a long story at ≥ 1200. */
  trailing?: ReactNode;
}

/** How the capsule's words fit (§U1.3): in full, short (寫卡片 / Card), or the short ones on two lines (共振 alone first). */
type Fit = 'full' | 'short' | 'split';

/** At this content width or less the capsule says its short words (§U1.3: 寫卡片), whether the full ones squeeze in or not — as Android. */
export const NARROW_ROW = 340;

/**
 * The end of a story, for a reader (round 26 §U1): the three answers in one capsule — 共振 (the tap: a switch, so
 * all three are tonal at rest and only a tap that is on is solid, `wave-pair`, 已共振), 寄小紙條 (the note, written in
 * place under the row, never in a dialog) and 用卡片回應 (a card of one's own; 修改 with a draft, 已回應 once
 * published) — then, right under it and as wide, the second line: the faces of who resonated at its start, 收藏 at
 * its end (and, after a long story at the desktop's width, the card's share and ⋯). The note opens 12 under that.
 * Tapping 共振 opens nothing: the segment fills and the viewer's face slides in. Nothing here is the author's.
 */
export function CardViewerActions({ cardId, referenceCardId, author, tap, trailing }: CardViewerActionsProps) {
  const t = useTranslations('card');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const { data: mine } = useMyResonance(cardId);
  const { data: me } = useMyProfile();
  const prefill = usePrefillCard();
  const [picking, setPicking] = useState(false);
  const toggleTap = useTapToggle(cardId, user?.id);
  // Still being read (undefined): a kept draft waits for it before it opens anything.
  const note = useNoteInPlace({ cardId, uid: user?.id, mayNote: tap === undefined ? undefined : (tap?.mayNote ?? true) });
  // The viewer's face as it slides in (their id) or out (their face, drawn once more).
  const [arriving, setArriving] = useState<string | undefined>(undefined);
  const [leaving, setLeaving] = useState<AuthorBody | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const { data: saved, mutate: mutateSaved } = useSWR(user ? `bookmark:${cardId}:${user.id}` : null, () => isBookmarked(cardId));

  // --- How the capsule's words fit -------------------------------------------------------------------------------
  const [room, setRoom] = useState(0);
  // English, or a narrow row (≤ 340 of content: a 360 browser, a 375 phone's 335), starts from the short words.
  const base: Fit = locale === 'en' || (room > 0 && room <= NARROW_ROW) ? 'short' : 'full';
  const [fit, setFit] = useState<Fit>(base);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstBar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Its width now (before the first paint), then as it changes.
    setRoom(Math.round(el.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRoom(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The webfonts settling change the words' widths (a fallback's are wider): weigh them again then.
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFonts((n) => n + 1)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const tapOn = !!tap?.mine;
  const replyState = mine?.publishedAt ? 'done' : mine ? 'draft' : 'none';
  // A new width, new words (已共振, 已回應) or the fonts in: weigh them again from the full words.
  useLayoutEffect(() => setFit(base), [room, base, tapOn, replyState, fonts]);
  useLayoutEffect(() => {
    if (fit === 'split') return;
    // The segments' own widths against the row's room — never the bar's scrollWidth, which its drawn backdrop (still
    // at the old size for a moment after the words got shorter) would inflate.
    const box = containerRef.current;
    const buttons = firstBar.current?.querySelectorAll<HTMLElement>('[role="group"] > button');
    if (!box || !buttons?.length) return;
    const need = [...buttons].reduce((w, b) => w + Math.max(b.offsetWidth, b.scrollWidth), 0);
    if (need > box.clientWidth + 1) setFit(fit === 'full' ? 'short' : 'split');
  }, [fit, room, tapOn, replyState, fonts]);

  const onTap = useCallback(async () => {
    if (!user) return router.push('/signin');
    // Still being read (the tap, or the reader's own profile — not yet "no pen name"): nothing to flip yet.
    if (tap === undefined || me === undefined) return;
    if (!me?.handle) return router.push('/signup');
    const face = faceOf(me);
    const on = !tap?.mine;
    window.clearTimeout(leaveTimer.current);
    if (on) {
      setLeaving(undefined);
      setArriving(face.id);
    } else {
      setArriving(undefined);
      setLeaving(face);
      leaveTimer.current = window.setTimeout(() => setLeaving(undefined), 160);
    }
    const failed = await toggleTap(on, face);
    if (failed === 'penName') router.push('/signup');
    else if (failed) toast.show({ message: t('tap.failed') });
  }, [user, tap, me, router, toggleTap, toast, t]);

  const onNote = useCallback(() => {
    if (!user) return router.push('/signin');
    // No pen name yet: asked for one before a word is written (SETTLED 4). A profile still being read opens the
    // field — the send's 403 asks then, the words kept.
    if (me !== undefined && !me?.handle) return router.push('/signup');
    note.toggle();
  }, [user, me, router, note]);

  const onReply = useCallback(() => {
    if (!user) return router.push('/signin');
    // The viewer's own reply is still being read: wait, so a second one isn't started in passing.
    if (mine === undefined) return;
    if (mine) {
      if (mine.publishedAt) {
        prefill(mine, me ?? undefined);
        router.push(`/card/${cardShareKey(mine)}`);
      } else router.push(`/write/${mine.id}`);
      return;
    }
    // Write a new card, or pick one already written.
    setPicking(true);
  }, [user, mine, me, router, prefill]);

  const onSave = useCallback(() => {
    if (!user) return;
    const saving = !saved;
    void mutateSaved(async () => toggleBookmark(cardId), { optimisticData: saving, revalidate: false }).catch(() => {});
    if (saving) toast.show({ message: t('saved') });
  }, [user, saved, mutateSaved, cardId, toast, t]);

  if (loading) return null;
  // The author of the card has nothing to answer it with (their own line is AuthorTaps).
  if (user && user.id === author.id) return null;

  const short = fit !== 'full';
  const tapSegment: SegmentSpec = {
    key: 'tap',
    icon: <Icon name={tapOn ? 'wave-pair' : 'wave'} size={16} />,
    label: tapOn ? t('tap.on') : t('tap.label'),
    pressed: tapOn,
    ...(tapOn
      ? { fill: 'var(--button-fill)', textColor: 'var(--color-cream)', hoverOverlay: 'color-mix(in oklch, var(--toward-ink) 14%, transparent)' }
      : { hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' }),
    onClick: () => void onTap(),
  };
  const noteOpen = note.mode !== 'closed';
  const noteSegmentSpec: SegmentSpec = {
    key: 'note',
    icon: <Icon name="note" size={16} />,
    label: t('note.short'),
    expanded: user ? noteOpen : undefined,
    controls: user && noteOpen ? NOTE_FIELD_ID : undefined,
    held: noteOpen,
    hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)',
    onClick: onNote,
  };
  const replySegment: SegmentSpec = {
    key: 'reply',
    icon: <Icon name={replyState === 'done' ? 'check' : replyState === 'draft' ? 'pen' : 'cards'} size={16} />,
    label: replyState === 'done' ? t('reply.done') : replyState === 'draft' ? t('modify') : short ? t('reply.short') : t('reply.label'),
    hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)',
    onClick: onReply,
  };

  // The second line holds only what needs no account for someone signed out (§U1.4): their faces and 收藏 need one.
  const faces = user && tap ? <TapFaces cardId={cardId} tap={tap} viewerId={user.id} arriving={arriving} leaving={leaving} /> : null;
  const save = user ? (
    <BareIconButton
      icon="bookmark"
      label={saved ? t('bookmark.remove') : t('bookmark.add')}
      pressed={!!saved}
      onClick={onSave}
      iconSize={20}
      tipAlign="end"
      seed={67}
    />
  ) : null;
  const secondLine = faces || save || trailing;

  return (
    <div ref={containerRef} className={styles.container} data-end-row="">
      <div className={styles.end} data-fit={fit}>
        <div ref={firstBar} className={styles.bars}>
          {fit === 'split' ? (
            <>
              <div className={styles.bar}>
                <SegmentedActionBar segments={[tapSegment]} seed={71} />
              </div>
              <div className={styles.bar}>
                <SegmentedActionBar segments={[noteSegmentSpec, replySegment]} seed={73} />
              </div>
            </>
          ) : (
            <div className={styles.bar}>
              <SegmentedActionBar segments={[tapSegment, noteSegmentSpec, replySegment]} />
            </div>
          )}
        </div>
        {secondLine && (
          <div className={styles.second}>
            <span className={styles.faces}>{faces}</span>
            <span className={styles.ends}>
              {save}
              {trailing && <span className={styles.trailing}>{trailing}</span>}
            </span>
          </div>
        )}
      </div>

      {user && (
        <NoteInPlace
          id={NOTE_FIELD_ID}
          note={note}
          onClosedByKey={() => containerRef.current?.querySelector<HTMLButtonElement>(`button[aria-controls="${NOTE_FIELD_ID}"]`)?.focus()}
        />
      )}

      {picking && <ResonatePicker open onClose={() => setPicking(false)} targetId={cardId} targetReferenceId={referenceCardId} />}
    </div>
  );
}

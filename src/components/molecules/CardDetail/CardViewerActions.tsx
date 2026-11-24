'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { FACE_SLIDE_MS } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { Icon } from '@/components/atoms/Icon';
import { SegmentedActionBar, type SegmentSpec } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useRouter } from '@/i18n/navigation';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { usePrefillCard } from '@/lib/data/cardPrefill';
import { useMyProfile, useMyResonance } from '@/lib/data/hooks';
import { faceOf, useTapPassage, useTapToggle, type TapFailure } from '@/lib/data/taps';
import { cardShareKey } from '@/lib/share/links';
import type { StoryScript } from '@/lib/text/script';
import { NoteInPlace, useNoteInPlace } from './NoteInPlace';
import { TAP_FACE_SIZE, TapFaces } from './TapFaces';
import { reducedMotion } from './tapMotion';
import { useVisualTap } from './visualTap';
import styles from './CardViewerActions.module.css';

// Loaded on the first 用卡片回應: most readers never open it.
const ResonatePicker = dynamic(() => import('./ResonatePicker').then((m) => m.ResonatePicker));
// Loaded on the first press that turns 共振 on over a card with passages (round 27 §U1).
const TapPassages = dynamic(() => import('./TapPassages').then((m) => m.TapPassages));

/** How long after a press that turns 共振 on the passages' dialog opens (§U1.1): the segment has filled, the face slid in. */
export const PASSAGES_AFTER_TAP_MS = 240;

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
  /**
   * The card's passive actions, at the end of the capsule's row: 收藏 and, after a long story, its share and ⋯ (the
   * owner, 2026-11-21: 「把它移到這個 segmented buttons 的右邊」). A phone's page keeps them at the end of its tags
   * instead and passes nothing: its capsule spans the column.
   */
  trailing?: ReactNode;
  /** The story is on screen in translation (round 25 §F): the passages, the author's own words, are not offered then. */
  translated?: boolean;
  /** In translation, each pick's words as the translation says them, keyed by the author's own (translatedPassages quoteWords; round 35). */
  quoteWords?: ReadonlyMap<string, string>;
  /** The story's script (src/lib/text/script.ts): the passages' dialog sets its rows in the story's own type (§U1.3). */
  script?: StoryScript;
}

/** How the capsule's words fit (§U1.3): in full, short (寫卡片 / Card), or the short ones on two lines (共振 alone first). */
type Fit = 'full' | 'short' | 'split';

/** At this content width or less the capsule says its short words (§U1.3: 寫卡片), whether the full ones squeeze in or not — as Android. */
export const NARROW_ROW = 340;

/** Between the capsule and what ends its row, at least (CardViewerActions.module.css `.row`'s gap). */
export const ENDS_GAP = 12;

/**
 * The end of a story, for a reader (round 26 §U1): the three answers in one capsule — 共振 (the tap: a switch, so
 * all three are tonal at rest and only a tap that is on is solid with `wave-pair` — its words stay 共振, so nothing in
 * the capsule moves (the owner, 2026-11-20) —), 寄小紙條 (the note, written in
 * place under the row, never in a dialog) and 用卡片回應 (a card of one's own; 修改 with a draft, 已回應 once
 * published) — its row ended, at the column's end, by the card's passive actions (`trailing`: 收藏, and its share
 * and ⋯ after a long story) wherever the capsule stands at its own width. Right above it (0 between) the faces' line:
 * the faces of who resonated, centred on the 共振 segment (round 29 §S11) and over it — above the capsule since round
 * 30 (the owner, 2026-11-22: 「把共振…使用者头像，把它移到共振按钮的上方」), so that the note opens right under its own
 * button, 12 under the capsule.
 * Tapping 共振 fills the segment and slides the viewer's face in; on a card with passages (round 27 §U1) a press that
 * turns it on also asks, 240 ms later, which part stayed with them — a small centred dialog the tap never waits on.
 * Nothing here is the author's.
 */
export function CardViewerActions({ cardId, referenceCardId, author, tap, trailing, translated = false, script = 'cjk', quoteWords }: CardViewerActionsProps) {
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
  const pickPassage = useTapPassage(cardId, user?.id);
  // The passages' dialog (§U1), the timer that opens it after a press, and the tap's own PUT the pick waits for.
  const [passagesOpen, setPassagesOpen] = useState(false);
  const passagesTimer = useRef<number | undefined>(undefined);
  const tapAnswer = useRef<Promise<TapFailure | null>>(Promise.resolve(null));
  useEffect(() => () => window.clearTimeout(passagesTimer.current), []);
  const passages = tap?.passages ?? [];
  const offersPassages = passages.length >= 2 && !translated;
  const openPassages = useCallback(() => setPassagesOpen(true), []);
  // The dialog can't be offered any more (a translation arrived — the auto-translate one included — or the tap went
  // off): it closes for good and its timer stops, so it never comes back on its own once the original is on screen
  // again (§U1.1: it opens only from a press that turns 共振 on, or from the reader's own row).
  const offerable = offersPassages && !!tap?.mine;
  const wasOfferable = useRef(offerable);
  useEffect(() => {
    if (wasOfferable.current && !offerable) {
      window.clearTimeout(passagesTimer.current);
      setPassagesOpen(false);
    }
    wasOfferable.current = offerable;
  }, [offerable]);
  // The screenshots' hold opened it (no press came before): the dialog then rings no row (TapPassages `focusRow`).
  const [heldOpen, setHeldOpen] = useState(false);
  const openHeld = useCallback(() => {
    setHeldOpen(true);
    openPassages();
  }, [openPassages]);
  useVisualTap(cardId, user?.id, tap, me?.handle ? faceOf(me) : null, openHeld);
  // Still being read (undefined): a kept draft waits for it before it opens anything.
  const note = useNoteInPlace({ cardId, uid: user?.id, mayNote: tap === undefined ? undefined : (tap?.mayNote ?? true) });
  // The viewer's face as it slides in (their id) or out (their face, drawn once more).
  const [arriving, setArriving] = useState<string | undefined>(undefined);
  const [leaving, setLeaving] = useState<AuthorBody | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  // --- How the capsule's words fit -------------------------------------------------------------------------------
  const [room, setRoom] = useState(0);
  // English, or a narrow row (≤ 340 of content: a 360 browser, a 375 phone's 335), starts from the short words.
  const base: Fit = locale === 'en' || (room > 0 && room <= NARROW_ROW) ? 'short' : 'full';
  const [fit, setFit] = useState<Fit>(base);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstBar = useRef<HTMLDivElement>(null);
  const endsRef = useRef<HTMLSpanElement>(null);
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
  // A new width, new words (已回應) or the fonts in: weigh them again from the full words.
  useLayoutEffect(() => setFit(base), [room, base, tapOn, replyState, fonts]);
  useLayoutEffect(() => {
    if (fit === 'split') return;
    // The segments' own widths against the row's room — never the bar's scrollWidth, which its drawn backdrop (still
    // at the old size for a moment after the words got shorter) would inflate.
    const box = containerRef.current;
    const buttons = firstBar.current?.querySelectorAll<HTMLElement>('[role="group"] > button');
    if (!box || !buttons?.length) return;
    const need = [...buttons].reduce((w, b) => w + Math.max(b.offsetWidth, b.scrollWidth), 0);
    // What ends the row takes its width and the 12 before it: the words shorten before it would ever wrap.
    const ends = endsRef.current ? endsRef.current.offsetWidth + ENDS_GAP : 0;
    if (need > Math.max(box.clientWidth - ends, 0) + 1) setFit(fit === 'full' ? 'short' : 'split');
  }, [fit, room, tapOn, replyState, fonts]);

  // The faces over 共振 stand centred on its segment (round 29 §S11; the owner, 2026-11-22: 「这三个圈圈可不可以中点帮我
  // 对齐这个共振按钮的中间呢」): the segment's centre, from the faces' line's start, set as `--tap-centre` there.
  const facesLineRef = useRef<HTMLDivElement>(null);
  const [tapCentre, setTapCentre] = useState<number | null>(null);
  // How far below a face's top the 共振 segment's top edge lies (round 34 §9): the viewer's own face rises out of
  // the segment from there, cut by that edge (AvatarGroup's --avatar-rise).
  const [tapRise, setTapRise] = useState<number | null>(null);
  useLayoutEffect(() => {
    const line = facesLineRef.current;
    const segment = firstBar.current?.querySelector<HTMLElement>('[role="group"] > button');
    if (!line || !segment) return;
    const measure = () => {
      const s = segment.getBoundingClientRect();
      const l = line.getBoundingClientRect();
      const centre = Math.round((s.left + s.width / 2 - l.left) * 10) / 10;
      setTapCentre(Number.isFinite(centre) && s.width > 0 ? centre : null);
      // The faces stand centred in their line: a face's top is half a face over the line's middle.
      const rise = Math.round((s.top - (l.top + l.height / 2) + TAP_FACE_SIZE / 2) * 10) / 10;
      // Never a cut inside a face (round 34 §12: it would cut its press too): the edge at least a face below its top.
      setTapRise(Number.isFinite(rise) && s.height > 0 && rise >= TAP_FACE_SIZE ? rise : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(segment);
    ro.observe(line);
    return () => ro.disconnect();
    // (the faces' line comes with the viewer and their tap; the segment changes with the words' fit)
  }, [fit, room, fonts, tapOn, loading, user, tap]);

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
      leaveTimer.current = window.setTimeout(() => setLeaving(undefined), FACE_SLIDE_MS + 10);
    }
    window.clearTimeout(passagesTimer.current);
    // On, over a card with passages and its own words on screen: which part, a moment after the press (§U1.1).
    if (on && offersPassages) {
      if (reducedMotion()) setPassagesOpen(true);
      else passagesTimer.current = window.setTimeout(() => setPassagesOpen(true), PASSAGES_AFTER_TAP_MS);
    } else setPassagesOpen(false);
    const answer = toggleTap(on, face);
    tapAnswer.current = answer;
    const failed = await answer;
    if (failed) {
      // The tap was put back: nothing to pick on (§U1.6).
      window.clearTimeout(passagesTimer.current);
      setPassagesOpen(false);
    }
    if (failed === 'penName') router.push('/signup');
    else if (failed) toast.show({ message: t('tap.failed') });
  }, [user, tap, me, router, toggleTap, toast, t, offersPassages]);

  // A row of the dialog: sent once the tap's own PUT has answered (§U1.5), the row shown chosen at once. A 400 or 409
  // (the passages or the tap changed) reads the card again and says nothing (S12); anything else says so.
  const onPickPassage = useCallback(
    async (passage: string | null) => {
      if (await tapAnswer.current) return;
      const failed = await pickPassage(passage);
      if (failed === 'failed') toast.show({ message: t('tap.failed') });
    },
    [pickPassage, toast, t],
  );

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

  if (loading) return null;
  // The author of the card has nothing to answer it with (their own line is AuthorTaps).
  if (user && user.id === author.id) return null;

  const short = fit !== 'full';
  const tapSegment: SegmentSpec = {
    key: 'tap',
    icon: <Icon name={tapOn ? 'wave-pair' : 'wave'} size={16} />,
    // The same words on and off (the owner, 2026-11-20: 已共振 moved the wave beside it): the solid face, the two waves
    // and aria-pressed say it is on.
    label: t('tap.label'),
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

  // The faces' line is the faces' alone, and a signed-in reader's (§U1.4): there with no face on it too, so the
  // reader's own slides in without moving the capsule under it.
  const faces =
    user && tap ? (
      <TapFaces
        quoteWords={quoteWords}
        cardId={cardId}
        tap={tap}
        viewerId={user.id}
        arriving={arriving}
        leaving={leaving}
        // The reader's own row reopens the dialog with their pick marked (§U3), while the tap is on.
        onOwnRow={offersPassages && tapOn ? () => setPassagesOpen(true) : undefined}
      />
    ) : null;

  return (
    <div ref={containerRef} className={styles.container} data-end-row="" data-faces-line={user ? '' : undefined}>
      <div className={styles.end} data-fit={fit}>
        {user && (
          <div ref={facesLineRef} className={styles.facesLine} data-end-faces-line="">
            {/* Marked for the paper puppets (lib/mascots/reading/measure): no peek rises over the bar in front of them. */}
            <span
              className={styles.faces}
              data-end-faces=""
              data-tap-centred={tapCentre != null ? '' : undefined}
              style={
                tapCentre != null || tapRise != null
                  ? ({
                      ...(tapCentre != null ? { '--tap-centre': `${tapCentre}px` } : null),
                      ...(tapRise != null ? { '--avatar-rise': `${tapRise}px` } : null),
                    } as CSSProperties)
                  : undefined
              }
            >
              {faces}
            </span>
          </div>
        )}
        <div className={styles.row}>
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
          {trailing && <span ref={endsRef} className={styles.ends}>{trailing}</span>}
        </div>
      </div>

      {user && (
        <NoteInPlace
          id={NOTE_FIELD_ID}
          note={note}
          onClosedByKey={() => containerRef.current?.querySelector<HTMLButtonElement>(`button[aria-controls="${NOTE_FIELD_ID}"]`)?.focus()}
        />
      )}

      {passagesOpen && offersPassages && tapOn && (
        <TapPassages passages={passages} script={script} picked={tap?.passage ?? null} onPick={(p) => void onPickPassage(p)} onClose={() => { setPassagesOpen(false); setHeldOpen(false); }} focusRow={!heldOpen} />
      )}

      {picking && <ResonatePicker open onClose={() => setPicking(false)} targetId={cardId} targetReferenceId={referenceCardId} />}
    </div>
  );
}

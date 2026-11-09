'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { seedFromString } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { timeOfDay } from '@/lib/chat/time';
import { useConversations } from '@/lib/data/hooks';
import { useChatDrafts } from '@/lib/data/chatDrafts';
import { conversationId } from '@/lib/db/firestore/client/messages';
import { Icon } from '@/components/atoms/Icon';
import type { Conversation, User } from '@/lib/db/types';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { BandWash, bandHost, useBandPress } from '@/components/atoms/BandWash/BandWash';
import { BAND_END_KEY, bandsBelow } from '@/lib/design/listBands';
import { RowWash } from './RowWash';
import { ThreadView } from './ThreadView';
import styles from './MessagesPage.module.css';

export interface MessagesPageProps {
  /** The handle of the open thread's other participant, when one is open. */
  activeHandle?: string;
  /** A note being replied to (from the note notification's「回覆」exit). */
  replyNote?: { noteId: string; cardId: string };
  /** Whose thread the link meant, by id (a bell row's): see ThreadView. */
  userId?: string;
}

/**
 * 私訊 — a Messenger-style two-pane surface: the people you're connected with
 * on the left (avatar, name, last-message time), the open thread on the right,
 * split 3:7 by a hand-drawn vertical rule that runs from the header to the
 * bottom of the viewport. The page title lives in the AppHeader brand slot, so
 * the panes get the full height. Phones show one pane at a time. The list's
 * bar is drawn and shows only while wanted (pointed at, scrolling); at rest its
 * edges fade where more is.
 */
export function MessagesPage({ activeHandle, replyNote, userId }: MessagesPageProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data } = useConversations();
  const drafts = useChatDrafts(user?.id);
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/signin');
  }, [loading, user, router]);

  if (loading || !user) return null;

  const conversations = data?.conversations ?? [];
  const people = data?.people ?? {};
  const starters = data?.connectedWithoutConversation ?? [];
  const empty = data && conversations.length === 0 && starters.length === 0;

  const dayFmt = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' });
  // Today's in the chat's one time of day (lib/chat/time: 「下午6:29」, as a message's menu says it).
  const timeFmt = timeOfDay(locale);
  const formatWhen = (d: Date) =>
    d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);

  // A phone's rows are bands (round 23 §5): the curve under each is the next row's key's — the starters' label under
  // the last conversation, the list's end under the last row (lib/design/listBands; Android's ConversationsScreen).
  const shown = conversations.filter((c) => people[c.participants.find((p) => p !== user.id) ?? '']);
  const conversationKeys = shown.map((c) => `c:${c.id}`);
  const starterKeys = starters.map((p) => `s:${p.id}`);
  const below = new Map<string, string>([
    ...bandsBelow(conversationKeys, starterKeys.length ? STARTERS_KEY : BAND_END_KEY).map((k, i) => [conversationKeys[i], k] as const),
    ...bandsBelow(starterKeys, BAND_END_KEY).map((k, i) => [starterKeys[i], k] as const),
  ]);

  const rowFor = (person: User, convo?: Conversation) => {
    const unread = convo ? (convo.unread[user.id] ?? 0) : 0;
    const last = convo?.lastMessage;
    // An unsent last message reads as its line in the thread does (round 16 §3); a sticker or an album says
    // so (round 22) — never the sticker's fallback words, which are for builds that can't draw it.
    const said = last?.sticker
      ? t('stickerShared')
      : last?.album
        ? last.text || t('albumShared', { count: last.album.count })
        : last?.text || (last?.image ? t('imageShared') : '');
    const preview = last?.unsent
      ? last.senderId === user.id
        ? t('unsentByYou')
        : t('unsentByThem', { handle: person.handle })
      : last
      ? (last.senderId === user.id ? t('youPrefix') : '') + said
      : t('noMessagesYet');
    // What the viewer left unsent to them (round 22 §4.4): its words after a pen, in terracotta — never the word
    // 草稿 — until it is sent; not on the row of the thread open beside the list, whose composer shows it.
    const draft = person.handle === activeHandle ? null : drafts[convo?.id ?? conversationId(user.id, person.id)];
    const draftWords = draft ? draft.text.trim().replace(/\s+/g, ' ') || (draft.cardId ? t('attachCardShort') : '') : '';
    const key = convo ? `c:${convo.id}` : `s:${person.id}`;
    return (
      <ConversationRow
        key={person.id}
        href={`/messages/${person.handle}?u=${encodeURIComponent(person.id)}`}
        active={person.handle === activeHandle}
        washSeed={seedFromString(person.id)}
        band={{ top: key, bottom: below.get(key) ?? BAND_END_KEY }}
      >
        <HandDrawnAvatar
          src={person.avatarUrl}
          initials={person.initials}
          size={40}
          color={person.accentColor}
          seed={Number(person.avatarSeed) || 5}
        />
        <span className={styles.rowBody}>
          <span className={styles.rowHandle}>{person.handle}</span>
          {draftWords ? (
            <span className={styles.rowPreview} data-draft="" aria-label={t('draftLabel', { text: draftWords })}>
              <Icon name="pen" size={13} color="currentColor" />
              <span className={styles.rowDraft}>{draftWords}</span>
            </span>
          ) : (
            <span className={styles.rowPreview}>{preview}</span>
          )}
        </span>
        <span className={styles.rowMeta}>
          {convo?.lastMessage && (
            <span className={styles.rowTime}>{formatWhen(convo.lastMessage.sentAt)}</span>
          )}
          {unread > 0 && <UnreadBadge count={unread} />}
        </span>
      </ConversationRow>
    );
  };

  return (
    <div className={styles.page} data-thread-open={activeHandle || undefined}>
      <div className={styles.listCol}>
        <aside ref={listRef} className={`${styles.listPane} ${organicScrollTarget}`}>
          {/* Nothing at all yet: said here on a phone; beside a two-pane list (which stays empty), the
              detail pane says it. */}
          {empty && (
            <EmptyState
              className={styles.listEmpty}
              fills
              icon="chat"
              seed={23}
              title={t('emptyTitle')}
              line={t('empty')}
            />
          )}

          {shown.map((c) => rowFor(people[c.participants.find((p) => p !== user.id) ?? ''], c))}

          {starters.length > 0 && (
            <>
              <p className={styles.startSectionTitle}>{t('startSection')}</p>
              {starters.map((person) => rowFor(person))}
            </>
          )}
        </aside>
        <OrganicScrollbar targetRef={listRef} seed={53} autoHide />
      </div>

      <div className={styles.vRule} aria-hidden>
        <Divider orientation="vertical" seed={71} amplitude={2} strokeWidth={INK} spacing={0} color="var(--split-pen)" />
      </div>

      <section className={styles.threadPane}>
        {activeHandle ? (
          <ThreadView key={activeHandle} handle={activeHandle} replyNote={replyNote} userId={userId} />
        ) : empty ? (
          <EmptyState fills icon="chat" seed={23} title={t('emptyTitle')} line={t('empty')} />
        ) : data ? (
          <EmptyState fills icon="chat" seed={23} line={t('pickOne')} />
        ) : null}
      </section>
    </div>
  );
}

/** The label over the people to start a conversation with, and the key the band above it ends on. */
const STARTERS_KEY = 'starters';

/**
 * One conversation's row, a link to its thread: on a phone (≤ 720, the module CSS) a band — the list's width between
 * its curve and the one under it (`band`), washed under a pointer or a press, as the bell's rows are (round 23 §5);
 * wider, and beside the thread pane, a faint hand-drawn wash under the pointer (RowWash) and the chosen row's
 * terracotta. Both are in the HTML, CSS showing one.
 */
function ConversationRow({
  href,
  active,
  washSeed,
  band,
  children,
}: {
  href: string;
  active: boolean;
  washSeed: number;
  band: { top: string; bottom: string };
  children: ReactNode;
}) {
  const press = useBandPress();
  return (
    <Link href={href} className={`${styles.row} ${bandHost}`} data-active={active || undefined} {...press}>
      <RowWash seed={washSeed} />
      <BandWash topKey={band.top} bottomKey={band.bottom} className={styles.rowBand} />
      {children}
    </Link>
  );
}

/** Same wobbly badge chip as the header's NotificationBell. */
function UnreadBadge({ count }: { count: number }) {
  const h = 18;
  const w = count > 9 ? 26 : 19;
  return (
    <span
      style={{
        position: 'relative',
        width: w,
        height: h,
        color: 'var(--color-cream)',
        fontSize: 10,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={h * 0.4}
        seed={9}
        mag={1.3}
        segmentsH={1}
        segmentsV={1}
        curve={1.5}
        cornerJitter={3}
        cornerOffset={h * 0.06}
        fillColor="var(--button-fill)"
      />
      <span style={{ position: 'relative' }}>{count}</span>
    </span>
  );
}

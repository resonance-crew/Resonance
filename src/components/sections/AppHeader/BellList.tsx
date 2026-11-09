'use client';

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { useModalPaper } from '@/components/molecules/Modal/Modal';
import type { Notification } from '@/lib/db/types';
import { useBellExtras, useNotifications, type BellExtras } from '@/lib/data/hooks';
import { markNotificationRead } from '@/lib/db/firestore/client/notifications';
import { BAND_END_KEY, bandsBelow, translatePath } from '@/lib/design/listBands';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import { bellHref } from './bellLink';
import { BellRowContent } from './BellRow';
import { bellGroup, bellWhen, type BellGroup } from './bellTime';
import styles from './NotificationBell.module.css';

/**
 * Where the bell opens its list as a page of its own (`/notifications`, as the apps' 通知 tab) rather than a dialog
 * over the page: a phone's header (AppHeader's 720) and a phone held sideways, whose dialog would leave the list
 * a strip of ~250 px (round 23 §4).
 */
export const BELL_PAGE_QUERY = '(max-width: 720px), (pointer: coarse) and (max-height: 500px)';

/** Whether this window opens the bell's page (asked at the click: nothing to hydrate first). */
export function bellOpensPage(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(BELL_PAGE_QUERY).matches;
}

// Rows tapped here count as read at once, before the listener hears the write — the header's badge and the list
// alike, wherever the row was tapped (the page, or the dialog).
const readHere = new Set<string>();
let readVersion = 0;
const readListeners = new Set<() => void>();
const subscribeRead = (fn: () => void) => {
  readListeners.add(fn);
  return () => readListeners.delete(fn);
};

/** Forgets what was read here (tests: each starts from the listener's word alone). */
export function forgetBellReadHere() {
  readHere.clear();
  readVersion++;
  readListeners.forEach((fn) => fn());
}

function markReadHere(n: Notification) {
  if (n.readAt !== null || readHere.has(n.id)) return;
  readHere.add(n.id);
  readVersion++;
  readListeners.forEach((fn) => fn());
  markNotificationRead(n.id).catch(() => {});
}

export interface BellState {
  /** The viewer's newest notifications, live, the ones tapped here already read. */
  items: Notification[];
  /** The first answer is in (or the listener failed): until then the list draws its skeleton. */
  fetched: boolean;
  unreadCount: number;
  /** Each row's face and card, once read (only while the list is shown). */
  extras: BellExtras | undefined;
  /** A row was tapped: it is read (here at once). */
  pick: (n: Notification) => void;
}

/**
 * The bell's list and badge on the viewer's newest notifications (live: a new one rings the badge while the page
 * is open, one read elsewhere stops counting). `shown`: the list is on screen, so its faces and cards are read.
 */
export function useBell(shown: boolean): BellState {
  const live = useNotifications(20);
  const version = useSyncExternalStore(subscribeRead, () => readVersion, () => 0);
  const items = useMemo(
    () => (live.data ?? []).map((n) => (n.readAt === null && readHere.has(n.id) ? { ...n, readAt: new Date() } : n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is what says readHere changed
    [live.data, version],
  );
  const extras = useBellExtras(shown ? items : undefined);
  const unreadCount = useMemo(() => items.filter((n) => n.readAt === null).length, [items]);
  return { items, fetched: live.data !== undefined || live.error !== null, unreadCount, extras, pick: markReadHere };
}

/** A part's title, and the key the band above it ends its bottom curve on. */
export function bellPartKey(group: BellGroup): string {
  return `part:${group}`;
}

interface BellPart {
  group: BellGroup;
  rows: { n: Notification; below: string }[];
}

/** The parts of the list — today, the week before, earlier — each row with the key of the curve under it. */
export function bellParts(items: Notification[], now: Date): BellPart[] {
  const parts: { group: BellGroup; items: Notification[] }[] = [];
  for (const n of items) {
    const group = bellGroup(n.createdAt, now);
    if (parts.at(-1)?.group !== group) parts.push({ group, items: [] });
    parts.at(-1)!.items.push(n);
  }
  return parts.map((p, i) => {
    const after = parts[i + 1] ? bellPartKey(parts[i + 1].group) : BAND_END_KEY;
    const below = bandsBelow(p.items.map((n) => n.id), after);
    return { group: p.group, rows: p.items.map((n, k) => ({ n, below: below[k] })) };
  });
}

export interface BellListProps {
  bell: BellState;
  /** A row was opened (the dialog closes). */
  onPicked?: () => void;
  /** In the bell's dialog (its body scrolls, its bands end on the dialog's wobble), or on the page (the page scrolls). */
  variant: 'dialog' | 'page';
}

/**
 * The bell's rows in parts by time (round 21), each a band (round 23 §4): the rows touch, parted by hand-drawn
 * curves seen only as the edge of a row's wash — a pointer over it, a finger's press — the parts' titles on bare
 * paper between them. In the dialog its body scrolls (the drawn bar in its gutter) and the bands run to the paper's
 * edges, cut by its wobble; on the page they run the window's width, the content in the reading column.
 */
export function BellList({ bell, onPicked, variant }: BellListProps) {
  const tApp = useTranslations('app.notifications');
  const locale = useLocale();
  // Each row's time, as of this render (the parts too).
  const now = new Date();
  const parts = useMemo(() => bellParts(bell.items, new Date()), [bell.items]);

  const list = parts.map((p) => (
    <section key={p.group} aria-labelledby={`bell-${variant}-${p.group}`}>
      <h4 id={`bell-${variant}-${p.group}`} className={styles.groupTitle}>
        <span className={styles.column}>{tApp(p.group)}</span>
      </h4>
      <ul className={styles.list}>
        {p.rows.map(({ n, below }) => {
          // Where the row leads (as its push does): a note on an anonymous card opens the card, never a thread
          // with its writer — see bellLink.
          const href = bellHref(n);
          const from = typeof n.payload.fromUserId === 'string' ? n.payload.fromUserId : '';
          const cardId = typeof n.payload.cardId === 'string' ? n.payload.cardId : '';
          const inner = (
            <BellRowContent
              n={n}
              band={{ top: n.id, bottom: below }}
              person={bell.extras?.people[from]}
              card={bell.extras?.cards[cardId]}
              settled={bell.extras !== undefined}
              when={bellWhen(n.createdAt, now, locale, tApp('justNow'))}
            />
          );
          return (
            <li
              key={n.id}
              onClick={() => {
                bell.pick(n);
                onPicked?.();
              }}
            >
              {href ? (
                <Link href={href} className={styles.rowLink}>
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  ));

  return variant === 'dialog' ? <DialogScroll>{list}</DialogScroll> : <div className={styles.pageList}>{list}</div>;
}

/**
 * The dialog's scrolling body: capped, its native bar hidden for the drawn one, its edges fading where more is —
 * and clipped to the dialog's own wobble (its outline moved into the body's coordinates), so a band ends on the
 * paper's pen line, never a straight cut short of it. The body reaches past the dialog's box on both sides for that
 * (`--bell-bleed`); the drawn bar stays in the content's gutter, over the bands.
 */
function DialogScroll({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollEdges = useEdgeFades(scrollRef);
  const paper = useModalPaper();
  const [clip, setClip] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    const body = scrollRef.current;
    const dialog = paper?.dialog.current;
    if (!paper || !body || !dialog) return;
    // Layout offsets, not the boxes on screen: the dialog pops in under a transform.
    let x = 0;
    let y = 0;
    let el: HTMLElement | null = body;
    while (el && el !== dialog) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    const next = el === dialog ? `path('${translatePath(paper.outline, -x, -y)}')` : undefined;
    setClip((now) => (now === next ? now : next));
  }, [paper]);
  return (
    <div className={styles.scrollArea}>
      <div ref={scrollEdges} className={`${styles.scrollBody} ${organicScrollTarget}`} style={clip ? { clipPath: clip } : undefined}>
        {children}
      </div>
      <OrganicScrollbar targetRef={scrollRef} seed={31} />
    </div>
  );
}

/** The skeleton's lines, as the apps' NotificationsSkeleton draws them. */
const SKELETON_LINES = [0.82, 0.64, 0.9, 0.58, 0.76, 0.7];

/**
 * The bell's rows still on their way (the apps' NotificationsSkeleton): six of a row's measures — the 40 face, two
 * lines of words, and on two of them the 46 card — touching as the bands do, no rules between them.
 */
export function BellSkeleton() {
  const t = useTranslations('home');
  return (
    <div className={styles.pageList} role="status" aria-label={t('moreLoading')}>
      <ul className={styles.list} aria-hidden>
        {SKELETON_LINES.map((line, i) => (
          <li key={i}>
            <span className={`${styles.row} ${styles.skeletonRow}`}>
              <span className={styles.rowInner}>
                <Skeleton width={40} height={40} radius={13} />
                <span className={styles.skeletonWords}>
                  <Skeleton width={`${line * 100}%`} height={14} />
                  <Skeleton width="32%" height={11} />
                </span>
                {(i === 0 || i === 2) && <Skeleton width={46} height={46} radius={12} />}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

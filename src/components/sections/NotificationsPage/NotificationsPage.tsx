'use client';

import { useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { BellList, BellSkeleton, useBell } from '@/components/sections/AppHeader/BellList';
import styles from './NotificationsPage.module.css';

// Back from a row (a card, a thread) finds the list where it was left: the page remembers how far it was scrolled
// as it goes, and a return through the browser's history (a popstate just before it mounts) puts it back once the
// rows are there — the browser's own restoring can come before them.
let kept: number | null = null;
let poppedAt = -Infinity;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    poppedAt = performance.now();
  });
}

/** Whether a page mounting now came back through history (and so should find its scroll where it was). */
export function cameBack(now = performance.now()): boolean {
  return now - poppedAt < 1500;
}

/**
 * 通知 as a page of its own (round 23 §4, the owner: the web phone's bell 「改成像 App 一樣的整頁」): what a phone's
 * bell opens — the header's brand slot names it, the bell wears its solid twin — the bell's list drawn as the apps'
 * notifications screen draws it: parts by time, each row a band edge to edge, the first part's title 16 under the
 * header's pen line; the rows' shapes while they are read, the shared empty state when there are none. A wide
 * window reaching it directly gets the same page (the bell opens its dialog there).
 */
export function NotificationsPage() {
  const tNav = useTranslations('app.nav');
  const tApp = useTranslations('app.notifications');
  const bell = useBell(true);
  const { fetched, items } = bell;

  // Came back through history with a place to return to: until the rows are there and it is back there, what the
  // window scrolls meanwhile (the browser trying on a page still short) is not where the reader was.
  const restoring = useRef<number | null | undefined>(undefined);
  if (restoring.current === undefined) restoring.current = typeof window !== 'undefined' && cameBack() ? kept : null;

  // Remembered as it scrolls, and kept as the page goes (a layout cleanup: before the next page scrolls to its top).
  useLayoutEffect(() => {
    if (restoring.current == null) kept = null;
    const onScroll = () => {
      if (restoring.current == null) kept = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Back again: once the rows are there, where it was.
  const ready = fetched && items.length > 0;
  useLayoutEffect(() => {
    const to = restoring.current;
    if (!ready || to == null) return;
    restoring.current = null;
    window.scrollTo(0, to);
    kept = to;
  }, [ready]);

  return (
    <div className={styles.page}>
      {/* The header's brand slot says 通知 (as it says 私訊 on Messages): the page's heading is for screen readers. */}
      <h1 className={styles.srOnly}>{tNav('notifications')}</h1>
      {!fetched ? (
        <BellSkeleton />
      ) : items.length === 0 ? (
        <EmptyState fills icon="bell" seed={37} title={tApp('emptyTitle')} line={tApp('empty')} />
      ) : (
        <BellList bell={bell} variant="page" />
      )}
    </div>
  );
}

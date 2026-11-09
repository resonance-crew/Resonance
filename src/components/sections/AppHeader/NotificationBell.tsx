'use client';

import { useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { BellList, bellOpensPage, useBell } from './BellList';

/**
 * The header's bell: its badge counts the viewer's unread notifications, live. It is a link to the bell's page
 * (`/notifications`, round 23 §4) — what a phone opens, as the apps' 通知 tab, and what works before the page has
 * hydrated or in a new tab — and wider (`BELL_PAGE_QUERY` failing) a click opens the list in a dialog over the page
 * instead. On its own page it wears its solid twin.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const onPage = pathname === '/notifications';
  // The list's faces and cards are read only while the dialog shows it (the badge needs neither); the page reads its own.
  const bell = useBell(open);
  const { items, fetched, unreadCount } = bell;

  const tApp = useTranslations('app.notifications');
  const tNav = useTranslations('app.nav');

  function onBell(e: MouseEvent<HTMLAnchorElement>) {
    // A new tab or window, or the page itself: the link's own way.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || onPage) return;
    if (bellOpensPage()) return;
    e.preventDefault();
    setOpen(true);
  }

  // Wobbly badge chip — same hand-drawn curve language as the avatar frame.
  const badgeH = 18;
  const badgeW = unreadCount > 9 ? 26 : 19;

  return (
    <>
      <Link
        href="/notifications"
        onClick={onBell}
        aria-label={tNav('notifications')}
        aria-current={onPage ? 'page' : undefined}
        style={{
          position: 'relative',
          display: 'inline-flex',
          padding: 6,
          color: 'var(--color-text)',
          textDecoration: 'none',
          // The badge hangs off the top-right corner; sit the bell a touch
          // lower so the pair reads vertically centered in the header row.
          transform: 'translateY(3px)',
        }}
      >
        <Icon name={onPage ? 'bell-fill' : 'bell'} size={22} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -3,
              width: badgeW,
              height: badgeH,
              color: 'var(--color-cream)',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            <HandDrawnBorder
              w={badgeW}
              h={badgeH}
              R={badgeH * 0.4}
              seed={9}
              mag={1.3}
              segmentsH={1}
              segmentsV={1}
              curve={1.5}
              cornerJitter={3}
              cornerOffset={badgeH * 0.06}
              // The count in the paper's colour on the verb's fill: 4.6:1 in light (plain terracotta was 3.5), the bright accent in dark.
              fillColor="var(--button-fill)"
            />
            <span style={{ position: 'relative' }}>{unreadCount}</span>
          </span>
        )}
      </Link>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        // Round 21: room for a face, the words and the card's picture side by side (a phone takes its own width).
        maxWidth={480}
        seed={29}
        padding="24px 22px 22px"
        ariaLabel={tNav('notifications')}
        // A list with nothing to do at its foot: the close lies there.
        closeButton
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, marginBottom: 14 }}>
          {tNav('notifications')}
        </h3>
        {fetched && items.length === 0 ? (
          <EmptyState icon="bell" seed={37} titleAs="p" title={tApp('emptyTitle')} line={tApp('empty')} />
        ) : (
          <BellList bell={bell} variant="dialog" onPicked={() => setOpen(false)} />
        )}
      </Modal>
    </>
  );
}

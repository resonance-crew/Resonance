'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import styles from './NotificationBell.module.css';
import type { Notification } from '@/lib/db/types';
import { useBellExtras, useNotifications } from '@/lib/data/hooks';
import { markNotificationRead } from '@/lib/db/firestore/client/notifications';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import { bellHref } from './bellLink';
import { BellRowContent } from './BellRow';
import { bellGroup, bellWhen, type BellGroup } from './bellTime';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  // The viewer's newest notifications, live: a new one rings the badge while
  // the page is open, and one read elsewhere stops counting.
  const live = useNotifications(20);
  // Rows clicked here count as read at once, before the listener hears the write.
  const [readHere, setReadHere] = useState<ReadonlySet<string>>(() => new Set());
  const items = useMemo(
    () => (live.data ?? []).map((n) => (n.readAt === null && readHere.has(n.id) ? { ...n, readAt: new Date() } : n)),
    [live.data, readHere],
  );
  const fetched = live.data !== undefined || live.error !== null;
  // Long lists scroll inside the modal (hidden native bar + hand-drawn rail).
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollEdges = useEdgeFades(scrollRef);

  const tApp = useTranslations('app.notifications');
  const tNav = useTranslations('app.nav');
  const locale = useLocale();
  // Each row's face and card, read once the list is open (the badge needs neither).
  const extras = useBellExtras(open ? items : undefined);
  // The parts of the list — today, the week before, earlier — and each row's time, as of this render.
  const now = new Date();
  const groups = useMemo(() => {
    const out: { group: BellGroup; items: Notification[] }[] = [];
    const at = new Date();
    for (const n of items) {
      const group = bellGroup(n.createdAt, at);
      if (out.at(-1)?.group !== group) out.push({ group, items: [] });
      out.at(-1)!.items.push(n);
    }
    return out;
  }, [items]);

  const unreadCount = useMemo(
    () => items.filter((n) => n.readAt === null).length,
    [items],
  );

  function handleClickItem(n: Notification) {
    if (n.readAt === null) {
      setReadHere((prev) => new Set(prev).add(n.id));
      markNotificationRead(n.id).catch(() => {});
    }
    setOpen(false);
  }

  // Wobbly badge chip — same hand-drawn curve language as the avatar frame.
  const badgeH = 18;
  const badgeW = unreadCount > 9 ? 26 : 19;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={tNav('notifications')}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          color: 'var(--color-text)',
          // The badge hangs off the top-right corner; sit the bell a touch
          // lower so the pair reads vertically centered in the header row.
          transform: 'translateY(3px)',
        }}
      >
        <Icon name="bell" size={22} />
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
      </button>

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
        {fetched && items.length === 0 && (
          <EmptyState icon="bell" seed={37} titleAs="p" title={tApp('emptyTitle')} line={tApp('empty')} />
        )}
        <div className={styles.scrollArea}>
          <div ref={scrollEdges} className={`${styles.scrollBody} ${organicScrollTarget}`}>
            {groups.map((g) => (
              <section key={g.group} aria-labelledby={`bell-${g.group}`}>
                <h4 id={`bell-${g.group}`} className={styles.groupTitle}>
                  {tApp(g.group)}
                </h4>
                <ul className={styles.list}>
                  {g.items.map((n) => {
                    // Where the row leads (as its push does): a note on an anonymous card opens the card, never a
                    // thread with its writer — see bellLink.
                    const href = bellHref(n);
                    const from = typeof n.payload.fromUserId === 'string' ? n.payload.fromUserId : '';
                    const cardId = typeof n.payload.cardId === 'string' ? n.payload.cardId : '';
                    const inner = (
                      <BellRowContent
                        n={n}
                        person={extras?.people[from]}
                        card={extras?.cards[cardId]}
                        settled={extras !== undefined}
                        when={bellWhen(n.createdAt, now, locale, tApp('justNow'))}
                      />
                    );
                    return (
                      <li key={n.id} onClick={() => handleClickItem(n)}>
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
            ))}
          </div>
          <OrganicScrollbar targetRef={scrollRef} seed={31} />
        </div>
      </Modal>
    </>
  );
}

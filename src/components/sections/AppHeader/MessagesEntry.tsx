'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useUnreadMessages } from '@/lib/data/hooks';
import styles from './AppHeader.module.css';

/**
 * Header entry to 私訊: the chat icon beside the notification bell, wearing
 * the same wobbly unread badge: the viewer's unread counters, summed over one
 * live listener on their conversations — the bell stays about events, this
 * badge is about waiting words. On 私訊 (the list or a conversation) it is the
 * current page; the phone's header shows it in its solid twin there, as the
 * bell on its own page — wider headers keep the outline.
 */
export function MessagesEntry() {
  const t = useTranslations('app.nav');
  const unread = useUnreadMessages();
  const pathname = usePathname();
  const onPage = pathname === '/messages' || pathname.startsWith('/messages/');

  const badgeH = 18;
  const badgeW = unread > 9 ? 26 : 19;

  return (
    <Link
      href="/messages"
      aria-label={t('messages')}
      aria-current={onPage ? 'page' : undefined}
      title={t('messages')}
      style={{
        position: 'relative',
        display: 'inline-flex',
        padding: 6,
        color: 'var(--color-text)',
        textDecoration: 'none',
        // Optically centered against the bell: the chat icon's own glyph
        // sits lower in its box than the bell's, so it needs less of a
        // downward nudge to land on the same visual line.
        transform: 'translateY(1.25px)',
      }}
    >
      {onPage ? (
        <>
          <span className={styles.glyphPhone}>
            <Icon name="chat-fill" size={22} />
          </span>
          <span className={styles.glyphWide}>
            <Icon name="chat" size={22} />
          </span>
        </>
      ) : (
        <Icon name="chat" size={22} />
      )}
      {unread > 0 && (
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
            fillColor="var(--button-fill)"
          />
          <span style={{ position: 'relative' }}>{unread}</span>
        </span>
      )}
    </Link>
  );
}

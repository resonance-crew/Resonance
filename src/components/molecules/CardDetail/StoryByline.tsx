'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { AuthorRegionFlag, CardPublishedDate, type CardPublished } from '@/components/molecules/CardDetail/CardAuthorAside';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import styles from './StoryByline.module.css';

export interface StoryBylineProps {
  /** The author as the page shows them (unused on an anonymous card, which names no one). */
  author: Pick<User, 'handle' | 'avatarUrl' | 'initials' | 'accentColor' | 'avatarSeed' | 'region' | 'verified'>;
  anonymous?: boolean;
  /** The story's read time, in minutes (lib/readTime). */
  minutes: number;
  /** When the card was published, as the page formats it; null for a draft, which shows its read time alone. */
  published: CardPublished | null;
  /**
   * What the row ends with — the card page's ShareMenu, then its ⋯. Never
   * shrinks; nothing when the page offers nothing (a signed-out reader of a
   * card that can't be shared).
   */
  actions?: ReactNode;
  className?: string;
}

/**
 * The line under a card page's title: who wrote it, how long it takes to
 * read and when it was published, and the card's actions at its end.
 *
 * Up to 900px it is the byline — the author's avatar, pen name (a link to
 * their profile), region flag and verified mark over the meta line — since
 * the author rail is hidden there; from 901px the rail names the author, and
 * the row keeps the meta line alone. Both are in the server's HTML and CSS
 * picks one. An anonymous card shows the neutral「·」and 匿名 in muted ink,
 * linking nowhere, to everyone — its owner too.
 *
 * At 320px the pen name stays on one line (an ellipsis), the meta line may
 * wrap, and the row grows rather than clips (min-height, never height).
 */
export function StoryByline({ author, anonymous = false, minutes, published, actions, className }: StoryBylineProps) {
  const t = useTranslations('card');
  const tApp = useTranslations('app');
  return (
    <div className={[styles.byline, className].filter(Boolean).join(' ')}>
      <span className={styles.avatar}>
        {anonymous ? (
          <HandDrawnAvatar initials="·" size={40} color="var(--color-cream-dark)" seed={97} />
        ) : (
          <HandDrawnAvatar
            src={author.avatarUrl}
            initials={author.initials}
            size={40}
            color={author.accentColor}
            seed={Number(author.avatarSeed)}
          />
        )}
      </span>
      <div className={styles.text}>
        <div className={styles.name}>
          {anonymous ? (
            <span className={`${styles.handle} ${styles.anonymous}`}>{t('anonymousAuthor')}</span>
          ) : (
            <>
              <Link href={`/u/${author.handle}`} className={styles.handle}>
                {author.handle}
              </Link>
              <AuthorRegionFlag region={author.region} size={14} />
              {author.verified && <HandDrawnCheckmark size={13} title={t('verified')} />}
            </>
          )}
        </div>
        <p className={styles.meta}>
          {tApp('readMinutes', { count: minutes })}
          {published && (
            <>
              {' · '}
              <CardPublishedDate published={published} />
            </>
          )}
        </p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

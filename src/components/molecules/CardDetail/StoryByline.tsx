'use client';

import type { ReactNode, Ref } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { Icon } from '@/components/atoms/Icon';
import { INK } from '@/lib/design/strokes';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import { regionCode, regionDisplayName, squareFlagCode } from '@/lib/regionName';
import styles from './StoryByline.module.css';

export interface CardPublished {
  /** ISO 8601, for `<time dateTime>`. */
  dateTime: string;
  /** The date in the reader's language, with its year (2026年10月10日, Oct 10, 2026). */
  label: string;
}

/**
 * The author's region as a small square flag right after the pen name — a quiet
 * mark, not a line of its own; its name is the tooltip and the accessible name.
 * Nothing for a region without vendored flag art.
 */
export function AuthorRegionFlag({ region, size = 15 }: { region?: string | null; size?: number }) {
  const locale = useLocale();
  const code = region ? squareFlagCode(region) : null;
  if (!region || !code) return null;
  const name = regionDisplayName(regionCode(region), locale);
  return (
    <span title={name} style={{ display: 'inline-flex' }}>
      <SquareFlag code={code} size={size} label={name} />
    </span>
  );
}

/** The card's published date, as the meta line under its title shows it (StoryByline). */
export function CardPublishedDate({ published, className }: { published?: CardPublished | null; className?: string }) {
  if (!published) return null;
  return (
    <time dateTime={published.dateTime} className={className}>
      {published.label}
    </time>
  );
}

export interface StoryBylineProps {
  /** The author as the page shows them (unused on an anonymous card, which names no one). */
  author: Pick<User, 'handle' | 'avatarUrl' | 'initials' | 'accentColor' | 'avatarSeed' | 'region' | 'verified'>;
  anonymous?: boolean;
  /** The story's read time, in minutes (lib/readTime). */
  minutes: number;
  /** When the card was published, as the page formats it; null for one never published, which shows its read time alone. */
  published: CardPublished | null;
  /**
   * A 私人卡 (round 9 §1), on its owner's page: the meta line ends with a lock and 私人卡, muted — no one
   * else sees this card.
   */
  privateCard?: boolean;
  /**
   * What the row ends with — the card page's ShareMenu, then its ⋯. Never
   * shrinks; nothing when the page offers nothing (a signed-out reader of a
   * card that can't be shared).
   */
  actions?: ReactNode;
  className?: string;
  /** The row itself (the card page measures from it whether the story's end is out of its view). */
  ref?: Ref<HTMLDivElement>;
}

/**
 * The line under a card page's title: who wrote it, how long it takes to
 * read and when it was published, and the card's actions at its end.
 *
 * At every width it is the byline (round 8 §10.1) — the author's avatar and pen
 * name (each a link to their profile), region flag and verified mark over the
 * meta line, the card's share and ⋯ at its end; the side rail holds only the
 * story's contents. An anonymous card shows the neutral「·」and 匿名 in muted
 * ink, linking nowhere, to everyone — its owner too.
 *
 * At 320px the pen name stays on one line (an ellipsis), the meta line may
 * wrap, and the row grows rather than clips (min-height, never height).
 */
export function StoryByline({ author, anonymous = false, minutes, published, privateCard = false, actions, className, ref }: StoryBylineProps) {
  const t = useTranslations('card');
  const tApp = useTranslations('app');
  return (
    <div ref={ref} className={[styles.byline, className].filter(Boolean).join(' ')}>
      {anonymous ? (
        <span className={styles.avatar}>
          <HandDrawnAvatar initials="·" size={40} color="var(--avatar-wait)" seed={97} />
        </span>
      ) : (
        // The avatar leads to the profile as the pen name does; the name is the one link a keyboard
        // or a screen reader meets, so this one stays out of both.
        <Link href={`/u/${author.handle}`} className={styles.avatar} tabIndex={-1} aria-hidden="true">
          <HandDrawnAvatar
            src={author.avatarUrl}
            initials={author.initials}
            size={40}
            color={author.accentColor}
            seed={Number(author.avatarSeed)}
          />
        </Link>
      )}
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
          {privateCard && (
            <>
              {' · '}
              <span className={styles.private}>
                <Icon name="lock" size={14} strokeWidth={INK} />
                {t('private')}
              </span>
            </>
          )}
        </p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

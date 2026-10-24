import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import pageStyles from '@/app/[locale]/(app)/card/[slug]/page.module.css';
import styles from './CardDetailSkeleton.module.css';

/**
 * Loading state for the card detail page. Reuses the real article layout —
 * the grid (the story's column, centred: whether a contents rail stands
 * beside it is the story's, unknown yet) and the head's order and gaps
 * (cover → title → byline → story → tags) — so the head doesn't move when
 * the card arrives; only the avatar, picture, text and tags are grey blocks,
 * at the title's and the story's own line heights (36 and 18 tall; 28 and 17
 * on a phone). The byline holds the author's avatar and pen name at every
 * width, as the real one does (round 8 §10.1).
 */
export function CardDetailSkeleton() {
  return (
    <div className={pageStyles.layout} role="status" aria-label="Loading">
      <article className={pageStyles.article}>
        {/* The cover. */}
        <Skeleton height="auto" radius={18} className={`${pageStyles.heroImage} ${styles.cover}`} />

        {/* The title — two lines at its own size. */}
        <div className={styles.lines} data-kind="title">
          <Skeleton height="var(--sk-line)" width="90%" />
          <Skeleton height="var(--sk-line)" width="55%" />
        </div>

        {/* The byline / meta row. */}
        <div className={`${pageStyles.byline} ${styles.byline}`}>
          <Skeleton width={40} circle className={styles.avatar} />
          <div className={styles.bylineText}>
            <Skeleton width={120} height={15} className={styles.name} />
            <Skeleton width={160} height={14} />
          </div>
        </div>

        {/* The story. */}
        <div className={`${pageStyles.story} ${styles.lines}`} data-kind="body">
          <Skeleton height="var(--sk-line)" />
          <Skeleton height="var(--sk-line)" />
          <Skeleton height="var(--sk-line)" />
          <Skeleton height="var(--sk-line)" width="65%" />
        </div>

        {/* Tags. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
          <Skeleton width={64} height={26} radius={13} />
          <Skeleton width={84} height={26} radius={13} />
          <Skeleton width={56} height={26} radius={13} />
        </div>
      </article>

    </div>
  );
}

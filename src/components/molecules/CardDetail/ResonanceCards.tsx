'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import type { CardsWithAuthors } from '@/lib/data/hooks';
import { storyLinkWaveVars } from '@/lib/design/storyLinkWave';
import { useLinkWaveInk } from '@/lib/design/useAppearance';
import styles from './ResonanceCards.module.css';

/** How many resonances show before 查看全部 (round 9 C1): a full card is twice a mini's height on a phone. */
export const RESONANCES_SHOWN = 3;

/**
 * The resonance relationships around a card, rendered as clean centered sections
 * (matching the home page's section rhythm) rather than a framed, tinted block.
 *
 * Resonance is bidirectional — the original this card resonates from (when it
 * is itself a response), then every public card resonating with it. The page
 * hands both over as one list (useCardPageLists), each card once, and they
 * render as the same full cards as 延伸的卡片 ({@link CardLinkGrid}: cover,
 * excerpt, tags — round 9 C1), at every width: the first three, then
 * 查看全部 {count} 篇, which shows the rest in place. Renders nothing when there
 * is nothing to show.
 */
export function ResonanceCards({ cards, authors }: CardsWithAuthors) {
  const t = useTranslations('card');
  const [all, setAll] = useState(false);
  // The wave 查看全部 wears under a pointer, as the feed's Load more.
  const wave = storyLinkWaveVars('resonances-more', useLinkWaveInk()) as CSSProperties;
  if (cards.length === 0) return null;
  const shown = all ? cards : cards.slice(0, RESONANCES_SHOWN);

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t('resonanceSection.title')}</h2>
      <CardLinkGrid cards={shown} authors={authors} />
      {!all && cards.length > RESONANCES_SHOWN && (
        <div className={styles.foot}>
          {/* The way on, as the feed's Load more: its words alone, in the tonal label's ink. */}
          <button type="button" className={styles.more} onClick={() => setAll(true)}>
            <span className={styles.moreLabel} style={wave}>
              {t('resonanceSection.showAll', { count: cards.length })}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { DriftingBlobs, type DriftPaint } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { StorytellerProof } from '@/components/molecules/StorytellerProof/StorytellerProof';
import { DOWNLOAD_ANCHOR } from '@/lib/appStores';
import styles from './HeroSection.module.css';
import { INK_STRONG } from '@/lib/design/strokes';

/** The small blob that comes in a moment after and melts into the larger. */
const VISITOR: DriftPaint = { color: '--color-sage', alpha: 0.22 };

/** The still blobs' grain, light like the live blobs' sand they hand over to. */
const STAND_IN_GRAIN = 0.2;

export function HeroSection() {
  const t = useTranslations('hero');
  return (
    <section id="about" className={styles.hero} data-mascot-zone="hero">
      {/* Still here as the server draws the page; on the client they come alive, stray a little
          (data-drift is each one's way), a small one melts into the larger, and they rest where they were. */}
      <DriftingBlobs visitor={VISITOR} responsive>
        <div className={styles.blob1} data-drift="1,0.12" data-drift-color="--color-terracotta-light">
          <OrganiBlob variant={1} fill="var(--color-terracotta-light)" size={380} grain={STAND_IN_GRAIN} />
        </div>
        <div className={styles.blob2} data-drift="-1,-0.08" data-drift-color="--color-lavender" data-drift-phone="off">
          <OrganiBlob variant={3} fill="var(--color-lavender)" size={300} grain={STAND_IN_GRAIN} />
        </div>
      </DriftingBlobs>

      <div className={styles.content}>
        <div className={styles.tagWrap} data-mascot="pill">
          <TagPill color="var(--color-terracotta-light)">{t('tag')}</TagPill>
        </div>

        <h1 className={styles.headline} data-mascot="headline">
          {t('headlinePrefix')}<span className={styles.accentWrap}><span className={styles.accent}>{t('headlineAccent')}</span><svg viewBox="0 0 200 12" className={styles.squiggle}><path d="M2,8 C30,2 60,12 90,6 C120,0 150,10 198,6" stroke="var(--color-terracotta)" strokeWidth={INK_STRONG} fill="none" strokeLinecap="round" opacity="0.6" /></svg></span>{t('headlineSuffix')}
        </h1>

        <p className={styles.description} data-mascot="hero-text">{t('description')}</p>

        <GetTheApp id={DOWNLOAD_ANCHOR} className={styles.download} />

        <StorytellerProof className={styles.proof} />
      </div>
    </section>
  );
}

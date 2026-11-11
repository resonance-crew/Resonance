'use client';

import { useRef } from 'react';
import { Clauses } from './Clauses';
import { copyFor } from './copy';
import { BlankPal } from './BlankPal';
import { Flats } from './Flats';
import { FLOOR_SEED } from './floor';
import { PalAt } from './PalAt';
import { Paper } from './Paper';
import { PillLink } from './PillLink';
import type { Stills } from './tiles';
import { stagedAttrs, useScene } from './useScene';
import styles from './oneday.module.css';

/**
 * Dusk · 換你上台. The call to write, on the warm paper of the late day: the two ways on (write — a sign-in comes first
 * — or read first), and on the floor beside them the blank sixth, under a blank card: the last page is yours. It looks
 * up at the write button when it is hovered or focused. 牽牽, the gift tag whose "To:" is still blank, walks in from the
 * wings to the gap between the words and the page, faces the write button, points at it and beckons.
 */
export function Dusk({ locale, stills }: { locale: string; stills: Pick<Stills, 'tag'> }) {
  const c = copyFor(locale).dusk;
  const root = useRef<HTMLElement>(null);
  const scene = useScene(root, () => import('./scenes').then((m) => m.duskScene()));
  return (
    <section ref={root} className={styles.dusk} data-scene="dusk" aria-labelledby="oneday-dusk" {...stagedAttrs(scene)}>
      <div className={styles.duskGrid}>
        <div className={styles.duskText} data-dusk-text="">
          <h2 id="oneday-dusk" className={styles.h2}>{c.title}</h2>
          <p className={styles.duskLine}><Clauses text={c.line} /></p>
          <div className={styles.duskButtons}>
            <PillLink href="/write" face="solid" dataWrite>{c.write}</PillLink>
            <PillLink href="/home" face="tonal">{c.read}</PillLink>
          </div>
        </div>
        {/* one set on the floor: 牽牽 facing the write button, the blank last page, the blank sixth leaning on it */}
        <div className={styles.duskSet}>
          <span className={styles.duskTag} data-spot="tag" aria-hidden="true">
            <PalAt still={stills.tag} live={scene.live.has('tag')} waveArm="l" phase={0.8} managed />
          </span>
          <Paper seed={433} fill="var(--color-card-bg)" pen="var(--soft-pen)" dashed radius={18} grain={0.14} className={styles.blankCard} outline="blank">
            <span className={styles.blankWords}>{c.blank}</span>
          </Paper>
          <span className={styles.blankStand} aria-hidden="true">
            <BlankPal />
          </span>
        </div>
      </div>
      <Flats seed={FLOOR_SEED.dusk} from="var(--paper-dusk)" to="var(--paper-night)" tint="var(--color-terracotta)" pen="var(--terracotta-ink)" />
    </section>
  );
}

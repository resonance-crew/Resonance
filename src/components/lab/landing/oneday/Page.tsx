import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { stillOf } from '@/lib/mascots/pals/still';
import type { LabLandingProps } from '../types';
import { Answer } from './Answer';
import { Dusk } from './Dusk';
import { Hero } from './Hero';
import { Night } from './Night';
import { Stories } from './Stories';
import { tilesOf, type Stills } from './tiles';
import styles from './oneday.module.css';

/** The five standing still, worked out here so the cast's data stays out of the first paint's scripts. */
const STILLS = Object.fromEntries(MASCOT_CAST.map((c) => [c.slug, stillOf(c)])) as Stills;

/**
 * C · 一天的戲 (One Day). The landing page directed for the 小紙團 from top to bottom, playing one day as it scrolls:
 * morning (the cover plate) → noon (the real stories) → late afternoon (the answer, in three beats) → dusk (your turn)
 * → night (the curtain call, the footer). Every scene is content, then a puppet lane, then a floor; the puppets stand
 * only on floors and on what the scene drew (card tops, a frame), never on words. Each floor is also a scene change:
 * paper flats in the colours between the two scenes slide past each other as the page scrolls. All of it is in this
 * HTML; the puppets come alive once the page is up, scene by scene.
 */
export default function Page({ cards, authors, locale }: LabLandingProps) {
  const tiles = tilesOf(cards, authors);
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <Hero locale={locale} stills={{ tuck: STILLS.tuck, dot: STILLS.dot }} />
        <Stories locale={locale} tiles={tiles} stills={{ card: STILLS.card, dot: STILLS.dot }} />
        <Answer locale={locale} stills={{ card: STILLS.card, tuck: STILLS.tuck }} />
        <Dusk locale={locale} stills={{ tag: STILLS.tag }} />
      </main>
      <Night locale={locale} stills={STILLS} />
    </div>
  );
}

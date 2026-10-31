import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import type { DriftPaint } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CTASection } from '@/components/sections/CTASection/CTASection';
import { INK_LIGHT } from '@/lib/design/strokes';
import type { EdgeSpec } from '@/lib/design/sectionEdge';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { PHOTO_ORDER, stillOf, type PalSlug, type Still } from '@/lib/mascots/pals/still';
import { BandDrift } from './BandDrift';
import { PalsReunion, type ReunionPal } from './PalsReunion';
import { PalsTitleScene, type ScenePal } from './PalsTitleScene';
import { PalStrip } from './PalStrip';
import styles from './PaperPalsPage.module.css';

const STILLS = Object.fromEntries(MASCOT_CAST.map((c) => [c.slug, stillOf(c)])) as Record<PalSlug, Still>;

/** At the end, huddled: the arm each one waves with (the one on the group's outside), and 悄悄 there half asleep. */
const POSE: Record<PalSlug, { waveArm: 'l' | 'r'; eyes?: 'sleepy' }> = {
  dot: { waveArm: 'l' },
  tuck: { waveArm: 'l' },
  tag: { waveArm: 'l' },
  night: { waveArm: 'r', eyes: 'sleepy' },
  card: { waveArm: 'r' },
};

/** Where each one stands on its own strip (a fraction of its width): off centre, away from the text beside it. */
const HOME: Record<PalSlug, number> = { dot: 0.56, tuck: 0.42, tag: 0.58, night: 0.42, card: 0.56 };

interface Drift {
  /** Where the server draws them, where they rest: one or two, big, in the band's emptier corners, some bleeding off
   *  its edge; a second one is left out on a phone. */
  blobs: { color: string; size: number; variant: number; drift: string; at: CSSProperties; opacity: number; phone?: false }[];
  /** A small blob of another colour that comes in and melts into the larger. */
  visitor?: DriftPaint;
}

/** Each band's blobs, as the landing hero's: placed differently on each, so no two bands repeat. */
const DRIFT: Record<PalSlug, Drift> = {
  dot: {
    blobs: [
      { color: '--color-yellow', size: 460, variant: 1, drift: '-1,0.3', at: { top: '6%', right: '-150px' }, opacity: 0.34 },
      { color: '--color-terracotta-light', size: 200, variant: 3, drift: '1,-0.4', at: { bottom: '2%', left: '5%' }, opacity: 0.22, phone: false },
    ],
    visitor: { color: '--color-terracotta-light', alpha: 0.24 },
  },
  tuck: {
    blobs: [
      { color: '--color-sage', size: 500, variant: 2, drift: '1,0.3', at: { top: '16%', left: '-210px' }, opacity: 0.3 },
      { color: '--color-yellow', size: 190, variant: 0, drift: '-1,-0.3', at: { top: '10%', right: '8%' }, opacity: 0.2, phone: false },
    ],
  },
  tag: {
    blobs: [{ color: '--color-sky', size: 440, variant: 3, drift: '-1,-0.4', at: { bottom: '-40px', right: '3%' }, opacity: 0.3 }],
    visitor: { color: '--color-lavender', alpha: 0.22 },
  },
  night: {
    blobs: [
      { color: '--color-lavender', size: 460, variant: 2, drift: '1,-0.3', at: { bottom: '-120px', left: '-140px' }, opacity: 0.16 },
      { color: '--color-yellow', size: 220, variant: 0, drift: '-1,0.3', at: { top: '10%', right: '6%' }, opacity: 0.13, phone: false },
    ],
  },
  card: {
    blobs: [
      { color: '--color-lavender', size: 480, variant: 1, drift: '1,0.3', at: { top: '-30px', right: '-170px' }, opacity: 0.3 },
      { color: '--color-sky', size: 210, variant: 2, drift: '-1,0.2', at: { bottom: '4%', left: '3%' }, opacity: 0.18, phone: false },
    ],
  },
};

/** The hero's two, in its emptier corners: behind the card's left foot and off the right edge. */
const HERO_DRIFT: Drift = {
  blobs: [
    { color: '--color-sage', size: 300, variant: 1, drift: '1,0.3', at: { top: '90px', left: '-110px' }, opacity: 0.28 },
    { color: '--color-lavender', size: 240, variant: 3, drift: '-1,-0.2', at: { top: '46%', right: '-80px' }, opacity: 0.26, phone: false },
  ],
};

const EDGE_PEN = 'color-mix(in oklch, var(--soft-pen) 30%, transparent)';

/** The wave at the top of each one's band, and of the meeting's. */
const edgeOf = (i: number): EdgeSpec => ({ seed: 443 + i * 29, height: 80, amplitude: 0.14, steps: 14 });
const MEET_EDGE: EdgeSpec = { seed: 601, height: 80, amplitude: 0.14, steps: 14 };

function Blobs({ drift, top, next }: { drift: Drift; top: EdgeSpec | null; next: EdgeSpec | null }) {
  return (
    <BandDrift top={top} next={next} visitor={drift.visitor}>
      {drift.blobs.map((b) => (
        <span
          key={b.color + b.size}
          style={{ ...b.at, opacity: b.opacity }}
          data-drift={b.drift}
          data-drift-color={b.color}
          data-drift-phone={b.phone === false ? 'off' : undefined}
        >
          <OrganiBlob variant={b.variant} fill={`var(${b.color})`} size={b.size} grain={0.2} />
        </span>
      ))}
    </BandDrift>
  );
}

/** The paper a band sits on, for the wave of the band after it: the hero's cream, or each one's own. */
const bandOf = (s: PalSlug | 'hero') => (s === 'hero' ? 'var(--color-cream)' : `var(--band-${s})`);

/**
 * /paper-pals: the five Paper Pals (小紙團) introduced as characters are, in few words (the owner's ask: no captions,
 * kickers, numbers or labelled lists — the puppets show the rest). The title on a card with the five busy round it;
 * then each one in turn (the order the reunion stands in), on a band of its own paper (悄悄's is the page's one night), its name, paper, words and story beside a strip
 * where it lives; two at a time meeting; and the five back together with a place left empty, under what they stand
 * for. Every one of them is drawn in this HTML standing still; the strips come alive once the page is up.
 */
export function PaperPalsPage() {
  const t = useTranslations('pals');
  const name = (s: PalSlug) => t(`${s}.name`);
  const huddle: ReunionPal[] = PHOTO_ORDER.map((s, i) => ({ still: STILLS[s], ...POSE[s], phase: i * 1.37 }));
  const scene = Object.fromEntries(
    PHOTO_ORDER.map((s, i) => [s, { still: STILLS[s], line: t(`${s}.line`), eyes: s === 'night' ? 'sleepy' : 'open', phase: i * 1.1 }]),
  ) as Record<PalSlug, ScenePal>;
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="pals-title">
        <Blobs drift={HERO_DRIFT} top={null} next={edgeOf(0)} />
        <PalsTitleScene pals={scene}>
          <h1 id="pals-title" className={styles.heroTitle}>
            {t('hero.title')}
            <span className={styles.alias}>{t('hero.alias')}</span>
          </h1>
          <p className={styles.lead}>{t('hero.lead')}</p>
        </PalsTitleScene>
      </section>

      {PHOTO_ORDER.map((s, i) => (
        <section
          key={s}
          id={s}
          className={`${styles.band} ${styles.profile}`}
          data-pal={s}
          data-night={s === 'night' ? '' : undefined}
          aria-labelledby={`pal-${s}`}
        >
          <SectionEdge
            topColor={bandOf(i ? PHOTO_ORDER[i - 1] : 'hero')}
            {...edgeOf(i)}
            stroke={EDGE_PEN}
            strokeWidth={INK_LIGHT}
          />
          <Blobs drift={DRIFT[s]} top={edgeOf(i)} next={i < PHOTO_ORDER.length - 1 ? edgeOf(i + 1) : MEET_EDGE} />
          <div className={styles.profileGrid} data-flip={i % 2 ? '' : undefined}>
            <PalStrip
              spec={{ kind: 'solo', slug: s, homeX: HOME[s] }}
              stills={[{ still: STILLS[s], x: HOME[s], phase: i * 0.9 }]}
              className={styles.profileStrip}
            />
            <div className={styles.profileText}>
              <h2 id={`pal-${s}`} className={styles.palName}>
                {name(s)}
                <span className={styles.alias}>{t(`${s}.other`)}</span>
              </h2>
              <p className={styles.paper}>{t(`${s}.paper`)}</p>
              <p className={styles.line}>{t(`${s}.line`)}</p>
              <p className={styles.prose}>{t(`${s}.story`)}</p>
              <div className={styles.traits}>
                {(['a', 'b', 'c'] as const).map((k) => (
                  <TagPill key={k} size="md" color="var(--pal-wash)">
                    {t(`${s}.traits.${k}`)}
                  </TagPill>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className={`${styles.band} ${styles.dark}`} aria-labelledby="pals-meet">
        <SectionEdge
          topColor={bandOf(PHOTO_ORDER[PHOTO_ORDER.length - 1])}
          {...MEET_EDGE}
          stroke={EDGE_PEN}
          strokeWidth={INK_LIGHT}
        />
        <div className={styles.wide}>
          <h2 id="pals-meet" className={styles.title}>
            {t('meet.title')}
          </h2>
          <PalStrip
            spec={{ kind: 'meet' }}
            stills={[
              { still: STILLS.tuck, x: 0.3, waveArm: 'r' },
              { still: STILLS.dot, x: 0.68, waveArm: 'l', phase: 2.1 },
            ]}
            className={styles.meetStrip}
          />
        </div>
      </section>

      {/* The same paper as the meeting: the ending runs straight on from it, and the CTA band's wave starts from it. */}
      <section className={`${styles.band} ${styles.dark} ${styles.vision}`} aria-labelledby="pals-vision">
        <div className={styles.wide}>
          <PalsReunion pals={huddle} />
          <h2 id="pals-vision" className={styles.title}>
            {t('vision.title')}
          </h2>
          <p className={styles.visionText}>
            {t('vision.p1')}
            <br />
            {t('vision.p2')}
          </p>
        </div>
      </section>

      <CTASection />
    </main>
  );
}

'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import { pointsToBezier } from '@/lib/design/wavyPath';
import { Clauses } from './Clauses';
import { copyFor } from './copy';
import { FictionCard, LinkWaves } from './FictionCard';
import { Flats } from './Flats';
import { FLOOR_SEED, VIEW_H, VIEW_W, floorPoints } from './floor';
import { PalAt } from './PalAt';
import { Paper } from './Paper';
import { useResting } from './rest';
import type { Director } from './scenes';
import type { Stills } from './tiles';
import { stagedAttrs, useScene } from './useScene';
import styles from './oneday.module.css';

/** The like everyone expects: a hand-drawn heart, about to become a card. */
export function Heart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 92" aria-hidden="true">
      <path
        d="M50 86 C38 76 9 58 7 33 C5 15 18 5 31 6 C41 7 47 14 50 22 C53 14 60 6 70 6 C84 6 96 17 93 35 C90 58 62 76 50 86 Z"
        fill="var(--color-terracotta-light)"
        stroke="var(--color-terracotta)"
        strokeWidth={INK_STRONG}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A folded note, for the comic's last panel (the stage's own note is the engine's). */
function Note({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 22" aria-hidden="true">
      <path d="M2 4 L26 2 L28 19 L4 20 Z" fill="var(--color-card-bg)" stroke="var(--soft-pen)" strokeWidth={INK_LIGHT} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d="M3 4 L15 12 L27 2" fill="none" stroke="var(--soft-pen)" strokeWidth={INK_LIGHT} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The stage's floor: the same hand-straight line every scene's puppets stand on. */
function StageFloor() {
  const pts = floorPoints(FLOOR_SEED.stage);
  return (
    <svg className={styles.stageFloor} data-stage-floor="" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={pointsToBezier(pts)} fill="none" stroke="color-mix(in oklch, var(--soft-pen) 70%, transparent)" strokeWidth={INK_LIGHT}
        strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Late afternoon · 這裡沒有讚，只有回應. A stage that stays (native sticky: nothing pinned, nothing taken from the wheel)
 * while three beats scroll past it: ① 聆聆 climbs onto a story and reads; ② a heart appears where a like would go and
 * unfolds into a blank card, and 聆聆 writes; ③ the answer slides beside the story, the logo's three waves draw between
 * them, the two puppets meet at the gutter, a note changes hands, and shy 摺摺 lifts its folded corner. Scroll scrubs
 * only the paper (the heart, the slide, the waves); the puppets are cued — a beat must stay in view 400 ms — and play in
 * their own time. JS off, reduced motion and short screens get the same three beats as a printed three-panel comic.
 */
export function Answer({ locale, stills }: { locale: string; stills: Pick<Stills, 'card' | 'tuck'> }) {
  const c = copyFor(locale).answer;
  const setRef = useRef<HTMLDivElement>(null);
  const beatsRef = useRef<HTMLOListElement>(null);
  const beatRef = useRef(0);
  const [beat, setBeat] = useState(0);
  const [wrote, setWrote] = useState(false);
  const director = useRef<Director | null>(null);
  const scene = useScene(
    setRef,
    () =>
      import('./scenes').then((m) => {
        const d = new m.Director((on) => setWrote(on));
        director.current = d;
        return m.answerScene(d);
      }),
    (h) => director.current?.attach(h, beatRef.current),
  );

  // Which beat is being read: the one crossing a line across the view (on a phone, low in the part under the stage).
  useEffect(() => {
    const list = beatsRef.current;
    if (!list) return;
    const sticky = window.matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-height: 520px)');
    if (!sticky.matches) return;
    const phone = window.matchMedia('(max-width: 899px)').matches;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target, e.isIntersecting));
        const items = Array.from(list.children);
        let n = 0;
        items.forEach((el, i) => {
          if (seen.get(el)) n = i + 1;
        });
        if (!n) {
          // past the last one keeps it; above the first, none
          const first = items[0]?.getBoundingClientRect();
          if (first && first.top > window.innerHeight * 0.5) n = 0;
          else return;
        }
        beatRef.current = n;
        setBeat(n);
        director.current?.set(n);
      },
      { rootMargin: phone ? '-60% 0px -37% 0px' : '-46% 0px -46% 0px' },
    );
    Array.from(list.children).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const resting = useResting();
  const written = beat >= 2 && (scene.staged !== 'staged' || wrote || resting);

  return (
    <section
      className={styles.answer}
      data-scene="answer"
      aria-labelledby="oneday-answer"
      {...stagedAttrs(scene)}
    >
      <header className={styles.sectionHead}>
        <h2 id="oneday-answer" className={styles.h2}>{c.title}</h2>
        <p className={styles.sectionSub}><Clauses text={c.sub} /></p>
      </header>

      <div className={styles.play}>
        <div className={styles.stageWrap}>
          <Paper seed={313} fill="var(--stage-paper)" pen="var(--stage-pen)" radius={26} grain={0.16} className={styles.stage}>
            <div
              ref={setRef}
              className={styles.stageSet}
              data-stage=""
              data-beat={beat}
              data-written={written ? '' : undefined}
              role="img"
              aria-label={c.stage}
            >
              <FictionCard family={2} seed={7} className={styles.stageA} outline="a" />
              <div className={styles.stageB}>
                <Heart className={styles.stageHeart} />
                <FictionCard family={1} seed={19} lines={4} blank className={styles.stageBCard} outline="b" />
                <FictionCard family={1} seed={19} lines={4} className={styles.stageBDone} />
              </div>
              <LinkWaves className={styles.stageWaves} />
              <StageFloor />
              {/* where nothing will come alive (Save-Data): each beat's picture, standing still */}
              <PalAt still={stills.card} className={`${styles.beatStill} ${styles.beatStill1}`} phase={0.5} />
              <PalAt still={stills.card} className={`${styles.beatStill} ${styles.beatStill2}`} phase={0.5} />
              <PalAt still={stills.tuck} className={`${styles.beatStill} ${styles.beatStill3a}`} waveArm="r" phase={1.1} />
              <PalAt still={stills.card} className={`${styles.beatStill} ${styles.beatStill3b}`} waveArm="l" phase={0.5} />
            </div>
          </Paper>
        </div>

        <ol ref={beatsRef} className={styles.beats}>
          {c.beats.map((b, i) => (
            <li key={i} className={styles.beat} data-n={i + 1} data-on={beat === i + 1 ? '' : undefined}>
              {/* the printed comic: each beat's picture (JS off, reduced motion, short screens) */}
              <div className={styles.panel} data-panel={i + 1} aria-hidden="true">
                <Paper seed={500 + i * 11} fill="var(--stage-paper)" pen="var(--stage-pen)" radius={22} grain={0.12} className={styles.panelSet} style={{ '--unit': '58px' } as CSSProperties}>
                  {i === 0 && (
                    <>
                      <FictionCard family={2} seed={7} className={styles.panelCardMid} />
                      <PalAt still={stills.card} className={styles.panelOnCard} phase={0.5} />
                    </>
                  )}
                  {i === 1 && (
                    <>
                      <Heart className={styles.panelHeart} />
                      <span className={styles.panelArrow} aria-hidden="true">→</span>
                      <FictionCard family={1} seed={19} lines={4} blank className={styles.panelCardRight} />
                      <PalAt still={stills.card} className={styles.panelWriter} phase={0.5} />
                    </>
                  )}
                  {i === 2 && (
                    <>
                      <FictionCard family={2} seed={7} className={styles.panelCardL} />
                      <LinkWaves className={styles.panelWaves} />
                      <FictionCard family={1} seed={19} lines={4} className={styles.panelCardR} />
                      <PalAt still={stills.tuck} className={styles.panelTuck} waveArm="r" phase={1.1} />
                      <Note className={styles.panelNote} />
                      <PalAt still={stills.card} className={styles.panelNod} waveArm="l" phase={0.5} />
                    </>
                  )}
                  <svg className={styles.panelFloor} viewBox="0 0 400 10" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M4,5 C80,3 140,7 200,5 C260,3 320,7 396,5" fill="none" stroke="var(--soft-pen)" strokeWidth={INK_LIGHT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                </Paper>
              </div>
              <div className={styles.beatText}>
                <h3 className={styles.beatTitle}>{b.title}</h3>
                <p className={styles.beatLine}><Clauses text={b.line} /></p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Flats seed={FLOOR_SEED.answer} from="var(--paper-answer)" to="var(--paper-dusk)" tint="var(--color-terracotta-light)" />
    </section>
  );
}

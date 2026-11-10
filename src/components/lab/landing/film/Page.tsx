/**
 * D · 一張卡片，一整天 (One Card, One Day) — the landing page as a short film of paper (SPEC, film/): 摺摺 writes a card
 * at the blue hour, the wind carries it across the world, 聆聆 reads it and answers with a card of its own, the two
 * meet on a bridge of waves at dusk, and by night the next story is yours. The scroll drives the scenery; the acting
 * plays on its own clock. Server component: the world's paper, frame 0's light, every word and card and the end are
 * all in this HTML; the runtime loads right after hydration (Film.tsx).
 */
import { copyFor } from './copy';
import { End } from './End';
import { Film } from './Film';
import { FilmHeader } from './FilmHeader';
import { CtaCard, DrawnCard, FilmStoryCard } from './FilmCard';
import { Hero } from './Hero';
import type { FilmModel } from './model';
import { Narration } from './Book';
import { PairWave } from './PairWave';
import { Player } from './Player';
import { paletteAt, paletteCss, hourAt } from './script/palette';
import { FILM_END } from './script/timeline';
import { SKY_CARDS } from './script/marks';
import { ActorStill, Clouds, Disc, Particles, Sets, Sky, WorldDefs } from './World';
import { WATCH_STILLS_SCRIPT } from './whole';
import styles from './film.module.css';

/** Before the first paint: the film — always (round 4, the owner: 「全部都是…進入到首頁，它就是點擊播放而已…就不會有兩種
 *  行為」; the picture book is gone) — except in a short landscape window, which has no room for its stage and shows
 *  the opening still (`book`). No script: the still too. And the lab's comparisons: `?b=drawn` (聆聆's answer drawn, not
 *  the nearest story), `?b=kin` (the note saying B is the nearest story, over the film), `?depth=blur` (the farther,
 *  the blurrier). */
const MODE_SCRIPT = `(function(){try{var d=document.currentScript&&document.currentScript.parentElement;if(!d)return;var q=new URLSearchParams(location.search);var mm=function(x){return !!(window.matchMedia&&matchMedia(x).matches)};d.setAttribute('data-film',mm('(max-height: 500px)')?'book':'film');var b=q.get('b');if(b==='kin'||b==='drawn')d.setAttribute('data-b',b);if(q.get('depth')==='blur')d.setAttribute('data-depth','blur')}catch(e){}})();`;

/** The night's ground, where the stage's foot stands as it lets go: the page after the film fades from it. */
const endGround = (dim: boolean) => {
  const night = paletteAt(hourAt(FILM_END), { dim });
  // the night's ground (the end fade starts from it) and its sky's top (the header's band between the stage letting go
  // and the page's paper coming up under it: the night's own colour over the night, FilmHeader.module.css)
  return `;--film-end-ground:${night['--film-c-ground']};--film-end-sky:${night['--film-sky-0']};`;
};

/** Frame 0's light (s = 0, the blue hour), light and dim. */
function lightCss(): string {
  const h = hourAt(0);
  const scope = '[data-film-page]';
  return [
    `${scope}{${paletteCss(paletteAt(h))}${endGround(false)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-scheme='light']) ${scope}{${paletteCss(paletteAt(h, { dim: true }))}${endGround(true)}}}`,
    `:root[data-scheme='dark'] ${scope}{${paletteCss(paletteAt(h, { dim: true }))}${endGround(true)}}`,
  ].join('');
}

function Slots({ model, locale }: { model: FilmModel; locale: string }) {
  const sky = model.sky.slice(0, SKY_CARDS);
  // the same card, story and a: the one 摺摺 wrote, and the one the wind carries (the hand-over is invisible)
  const written = (id: 'story' | 'a') => (model.a ? <FilmStoryCard tile={model.a} locale={locale} id={id} index={0} tags={3} /> : <DrawnCard />);
  return (
    <div className={styles.ui} data-ui="">
      <div className={styles.slot} data-slot="story">
        {written('story')}
      </div>
      <div className={styles.slot} data-slot="a" inert>
        {written('a')}
      </div>
      <div className={styles.slot} data-slot="b" inert>
        {model.b ? (
          model.relation === 'kin' ? (
            <>
              {/* the nearest story by default; 聆聆's drawing in the lab's ?b=drawn */}
              <div className={styles.bKin}>
                <FilmStoryCard tile={model.b} locale={locale} id="b" index={1} tags={3} defer />
              </div>
              <div className={styles.bDrawn}>
                <DrawnCard />
              </div>
            </>
          ) : (
            <FilmStoryCard tile={model.b} locale={locale} id="b" index={1} tags={3} defer />
          )
        ) : (
          <DrawnCard />
        )}
      </div>
      <div className={styles.slot} data-slot="wave" aria-hidden="true" inert>
        <PairWave />
      </div>
      <div className={styles.slot} data-slot="wave2" aria-hidden="true" inert>
        <PairWave />
      </div>
      {sky.map((t, i) => (
        <div key={t.id} className={styles.slot} data-slot={`sky${i}`} inert>
          <FilmStoryCard tile={t} locale={locale} id="sky" index={i + 2} tags={2} defer />
        </div>
      ))}
      <div className={styles.slot} data-slot="cta" inert>
        <CtaCard locale={locale} />
      </div>
    </div>
  );
}

export default function Page({ model, locale }: { model: FilmModel; locale: string }) {
  const c = copyFor(locale);
  return (
    <div className={styles.page} data-film-page="">
      <style dangerouslySetInnerHTML={{ __html: lightCss() }} />
      <WorldDefs />
      <FilmHeader />
      <main>
        <div className={styles.film} data-film-root="" suppressHydrationWarning>
          <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
          <a className={styles.skipLink} href="#stories">
            {c.lip.skipLink}
          </a>
          <p className={styles.kinBanner} role="note">
            {c.end.kinBanner}
          </p>
          <section className={styles.stage} data-stage="" aria-label={c.end.region}>
            <span className={`${styles.probe} ${styles.probeU}`} data-probe="u" />
            <span className={`${styles.probe} ${styles.probePal}`} data-probe="pal" />
            <span className={`${styles.probe} ${styles.probeU2}`} data-probe="u2" />
            <span className={`${styles.probe} ${styles.probePal4}`} data-probe="pal4" />
            <span className={`${styles.probe} ${styles.probeLip}`} data-probe="lip" />
            <span className={`${styles.probe} ${styles.probeSvh}`} data-probe="svh" />
            <span className={`${styles.probe} ${styles.probeLvh}`} data-probe="lvh" />
            <Sky />
            <Disc />
            <Clouds />
            <Sets />
            <Particles />
            <Hero locale={locale} />
            <Slots model={model} locale={locale} />
            <div className={styles.carrier} aria-hidden="true">
              <ActorStill slug="dot" scene="carrier" at={{ wide: [0, 0], tall: [0, 0] }} x0={0} phase={0.6} carrier />
            </div>
            {/* the paper's grain: a bitmap tile (grain.png), never a live filter — WebKit redraws an feTurbulence on
                every frame of a change */}
            <div className={styles.grain} aria-hidden="true" />
          </section>
          <Player locale={locale} />
          <Narration locale={locale} />
          {/* every still shows whole or not at all, from the first paint (whole.ts) */}
          <script dangerouslySetInnerHTML={{ __html: WATCH_STILLS_SCRIPT }} />
          <Film model={model} />
        </div>
        <End model={model} locale={locale} />
      </main>
    </div>
  );
}

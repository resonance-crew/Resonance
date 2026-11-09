import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { INK_LIGHT } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import '@/styles/story.css';
import type { LabLandingProps } from '../types';
import { BackCover } from './BackCover';
import { Colophon } from './Colophon';
import { Contents } from './Contents';
import { copyFor } from './copy';
import { Cover } from './Cover';
import { bylines, issueStory, lastStory, pairOf } from './data';
import { LastPage } from './LastPage';
import { RestToggle } from './RestToggle';
import { ScrollArm } from './ScrollArm';
import { Spread } from './Spread';
import s from './issue.module.css';

/**
 * Landing prototype B · 對頁 Facing Pages (branch landing-lab only): the landing page as today's issue of a small
 * literary magazine — real stories set as words in big Ming type, a story printed facing the story that answered it,
 * and the 小紙團 as the issue's staff, working in the room the grid leaves for them: the title's empty fourth cell,
 * the sidenote's edge, the spread's foot rule, the blank last page's first rule.
 *
 * Everything is in the server's HTML (the puppets as stills where they belong); each section that has live puppets
 * starts its own small stage once it comes near the view and the browser is idle — never the old LandingStage.
 */
export default function Page({ cards, authors, locale }: LabLandingProps) {
  const t = copyFor(locale);
  const stories = cards.map((c) => issueStory(c, authors));
  const { names, unsigned } = bylines(stories);
  const pair = pairOf(cards, stories);
  const newest = stories[0] ?? null;
  // no passage printed twice: the last page's story is one the cover and the spread don't print
  const last = lastStory(stories, new Set(pair ? [pair.a.story.id, pair.b.story.id] : []));
  return (
    <div className={s.issue} data-issue="">
      <ScrollArm />
      <SiteHeader />
      <main>
        <div className={s.runningHead}>
          <div className={s.sheet}>
            <Hairline seed={3} />
            <div className={s.runningRow}>
              <span className={s.runningBrand}>{t.runningHead.brand}</span>
              <Squiggle />
              <span>{t.runningHead.issue(stories.length)}</span>
              <span className={s.runningSpacer} />
              <RestToggle locale={locale} />
            </div>
            <Hairline seed={11} />
          </div>
        </div>
        <Cover locale={locale} story={newest} />
        <Contents locale={locale} stories={stories} names={names} unsigned={unsigned} />
        {pair && <Spread locale={locale} a={pair.a} b={pair.b} faked={pair.faked} />}
        <LastPage locale={locale} story={last} />
        <Colophon locale={locale} />
      </main>
      <BackCover locale={locale} />
    </div>
  );
}

function Hairline({ seed }: { seed: number }) {
  return (
    <svg className={s.hairline} viewBox="0 -3 1000 6" preserveAspectRatio="none" aria-hidden="true">
      <path d={wavyLine(1000, seed, 1.1, 22)} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

function Squiggle() {
  return (
    <svg className={s.runningSep} viewBox="0 -4 34 8" preserveAspectRatio="none" aria-hidden="true">
      <path d={wavyLine(34, 7, 1.8, 4)} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

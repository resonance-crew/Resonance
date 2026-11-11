import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import type { Card, User } from '@/lib/db/types';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';
import { storyType } from '@/lib/text/script';
import { cardPalettes } from '@/lib/design/cardColours';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { stillOf, type PalSlug, type Still } from '@/lib/mascots/pals/still';
import type { LabLandingProps } from '../types';
import { Desk } from './Desk';
import { Shelf } from './Shelf';
import { NightBand, NightFooter } from './NightEnd';
import { PalsRestProvider } from './rest';
import type { LabStory } from './story';
import styles from './answer.module.css';
import '@/styles/story.css';

/** The opening a card shows: its plain text, cut where a reader would pause. */
const OPENING_CHARS = 300;
/** A featured story needs at least this much to read (the critique's selection rule). */
const FEATURE_MIN_CHARS = 120;

function toStory(card: Card, author: User | undefined, palette: number): LabStory {
  const text = plainText(card.story);
  const t = storyType(card.thoughtCore, card.story);
  const anonymous = !!card.anonymous || !author;
  return {
    id: card.id,
    // an anonymous card is shared by its id, never a slug that may carry a pen name (lib/share/links)
    href: `/card/${anonymous ? card.id : card.slug ?? card.id}`,
    title: card.thoughtCore,
    opening: excerpt(text, OPENING_CHARS),
    long: text.length,
    author: anonymous ? null : author!.handle,
    minutes: card.summary?.readMinutes ?? readMinutes(card.story),
    script: t.script,
    lang: t.lang,
    palette,
    cover: card.media?.type === 'image' ? card.media.url : undefined,
  };
}

/**
 * The featured story: one with enough to read, a named author preferred (an anonymous one is fine, never its author),
 * else the newest. The rest follow in their order.
 */
function feature(stories: LabStory[]): LabStory[] {
  const enough = stories.filter((s) => s.long >= FEATURE_MIN_CHARS);
  const pick = enough.find((s) => s.author) ?? enough[0] ?? stories[0];
  return pick ? [pick, ...stories.filter((s) => s !== pick)] : stories;
}

const STILLS = Object.fromEntries(MASCOT_CAST.map((c) => [c.slug, stillOf(c)])) as Record<PalSlug, Still>;

/**
 * Prototype A · 換你說 (Your Turn): the visitor answers a real story on the first screen — a story on the left page,
 * a blank card of their own on the right; a starter, 回應, and the line becomes a card linked to the story by the pen
 * thread while 聆聆 hands it to 牽牽, who carries it over. Nothing is stored or sent. Then the other stories, waiting
 * for an answer, and the night: write it for real, or get the app.
 */
export default function Page({ cards, authors, locale }: LabLandingProps) {
  const palettes = cardPalettes(cards.map((c) => c.accentHue));
  const stories = feature(cards.map((c, i) => toStory(c, authors[c.authorId], palettes[i])));
  return (
    <PalsRestProvider>
      <div className={styles.page} data-answer-page="">
        <SiteHeader />
        <main>
          <Desk stories={stories} locale={locale} stills={{ card: STILLS.card, tag: STILLS.tag }} />
          <Shelf stories={stories.slice(1)} locale={locale} still={STILLS.dot} />
          <NightBand locale={locale} still={STILLS.tuck} />
        </main>
        <NightFooter locale={locale} still={STILLS.night} />
      </div>
    </PalsRestProvider>
  );
}

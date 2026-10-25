'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardDetailSkeleton } from '@/components/molecules/CardDetail/CardDetailSkeleton';
import { LoadError } from '@/components/molecules/LoadError/LoadError';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { publishedDate } from '@/lib/publishedDate';
import { readMinutes } from '@/lib/readTime';
import { storyType } from '@/lib/text/script';
import { CardToc, storyHasContents, tocHeadings, type TocHeading } from '@/components/molecules/CardDetail/CardToc';
import { LatinMarkText } from '@/components/molecules/CardDetail/LatinMarkText';
import { StoryByline } from '@/components/molecules/CardDetail/StoryByline';
import { ShareMenu } from '@/components/molecules/ShareMenu/ShareMenu';
import { CardActionsMenu } from '@/components/molecules/CardActionsMenu/CardActionsMenu';
import { TrashedCardBanner } from '@/components/molecules/CardDetail/TrashedCardBanner';
import { RestoredAloneNotice } from '@/components/molecules/TrashActionsMenu/RestoredAloneNotice';
import { CardSafetyMenu } from '@/components/molecules/CardDetail/CardSafetyMenu';
import { ReadAfterArea } from '@/components/molecules/CardDetail/ReadAfterArea';
import { ResonanceCards } from '@/components/molecules/CardDetail/ResonanceCards';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { ReadingProgress } from '@/components/molecules/CardDetail/ReadingProgress';
import { CardEmbedSourceContext } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import { useSWRConfig } from 'swr';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { hasSessionMark } from '@/lib/auth/firebase/client';
import { cardKey } from '@/lib/data/cardPrefill';
import type { CardSeed } from '@/lib/data/cardSeed';
import { useCard, useCardPageLists, useMyBlockedIds } from '@/lib/data/hooks';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { HEADER_TOTAL_H } from '@/components/sections/AppHeader/HeaderChrome';
import { useEndsApart } from '@/lib/hooks/useEndsApart';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { CARD_HOLD_ATTR } from './cardHold';
import styles from './page.module.css';

/** The end row the card's share · ⋯ would add under the tags (a bar button's height), counted when deciding. */
const END_ROW_H = 44;

const wrapStyle = {
  maxWidth: 'var(--page-max-w-wide)',
  margin: '0 auto',
  padding:
    'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
} as const;


/**
 * Whether the card may show yet, for a reader who may have blocked its author.
 * Blocks are the viewer's own, so the cached, viewer-independent server HTML
 * can't apply them; the browser does, and a signed-in reader never sees a
 * blocked author's card, not even for a moment:
 *
 * - `unknown` — the server render and hydration, which can't know the reader.
 *   The markup carries `data-card-hold`, which the page's pre-hydration script
 *   hides in a browser someone is signed in in (cardHold.ts); a signed-out
 *   reader sees the server's HTML at once.
 * - `hold` — someone is signed in in this browser, and their block list (or,
 *   for an anonymous card from the server render, the answer of the browser's
 *   own read) isn't known yet. Someone else's anonymous card never names its
 *   author here, and a block never hides one (one that vanished when the
 *   reader blocked someone would tell them who wrote it): it shows once that
 *   read answers.
 * - `blocked` — the viewer blocked the author: the page reads as not found.
 */
export type StoryGate = 'show' | 'hold' | 'unknown' | 'blocked';

export function storyGate(s: {
  /** Someone is signed in in this browser (the session mark); null: can't tell yet (server, hydration). */
  signedInHere: boolean | null;
  authLoading: boolean;
  viewerId: string | undefined;
  blocked: Set<string> | undefined;
  /** The card's author; empty on someone else's anonymous card (the server never names them). */
  authorId: string;
  /** The browser's own read of the card failed: nothing more is coming. */
  failed: boolean;
  /** The browser's own read has answered (not the server render's copy any more). */
  answered?: boolean;
}): StoryGate {
  const { signedInHere, authLoading, viewerId, blocked, authorId, failed, answered = false } = s;
  if (viewerId && authorId === viewerId) return 'show';
  if (viewerId && authorId && blocked?.has(authorId)) return 'blocked';
  if (signedInHere === null) return 'unknown';
  // Nobody signed in in this browser: no block list to wait for. (A viewer
  // restored without the mark still loses the card once their list arrives.)
  if (!signedInHere) return 'show';
  if (authLoading) return 'hold';
  if (!viewerId) return 'show';
  if (!blocked) return 'hold';
  // An anonymous card: its read answered (a block never hides one), or failed.
  if (!authorId) return failed || answered ? 'show' : 'hold';
  return 'show';
}

const subscribeNever = () => () => {};
const isBrowser = () => true;
const notBrowser = () => false;

export interface CardDetailClientProps {
  /** The URL segment: a slug, or a legacy doc id. */
  slug: string;
  /** What the server render found (see CardSeed); null when it couldn't tell. */
  seed: CardSeed | null;
}

export function CardDetailClient({ slug, seed }: CardDetailClientProps) {
  const locale = useLocale();
  const t = useTranslations('card');
  const tShare = useTranslations('share');
  const tMe = useTranslations('me.actions');

  const { user, loading } = useAuth();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data, isLoading, error, fromServer, mutate: readAgain } = useCard(slug, seed);
  const { data: blocked } = useMyBlockedIds();
  // False for the server render and hydration (which must draw the same
  // markup), true from then on.
  const inBrowser = useSyncExternalStore(subscribeNever, isBrowser, notBrowser);
  const gate = storyGate({
    signedInHere: inBrowser ? hasSessionMark() : null,
    authLoading: loading,
    viewerId: user?.id,
    blocked,
    authorId: data?.card?.authorId ?? '',
    failed: !!error,
    answered: !!data && !fromServer,
  });
  const isOwner = !!user && !!data?.card && user.id === data.card.authorId;
  // The owner's card in the trash: its banner heads the article, and nothing around the card shows.
  const trashed = isOwner && !!data?.card?.trashedAt;
  const [trashedHere, setTrashedHere] = useState(false);
  // The lists around the card (resonances, related, the author's linking
  // cards) and its story's embedded cards: signed in, one request beside the
  // card's own read, keyed by the id the server render found; signed out,
  // public reads once the card is in hand.
  const lists = useCardPageLists(data?.card?.id ?? seed?.id ?? undefined, data?.card?.referenceCardId);

  const storyRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const story = data?.card?.story;

  // The card's share · ⋯ come twice — under the title and at the story's end — only when the two can't be in
  // view at once (round 12 §5–6): at ≥ 1200 at the end of the response row, below it at the end of the tags.
  const [bylineEl, setBylineEl] = useState<HTMLDivElement | null>(null);
  const [tagsEl, setTagsEl] = useState<HTMLDivElement | null>(null);
  const wide = useMediaQuery('(min-width: 1200px)');
  const endsApart = useEndsApart(bylineEl, tagsEl, { header: HEADER_TOTAL_H, extra: END_ROW_H });

  // Derive the ToC from the rendered headings so the anchor ids match the ones
  // rehype-slug generated exactly.
  useEffect(() => {
    const root = storyRef.current;
    if (!root) {
      setHeadings([]);
      return;
    }
    setHeadings(tocHeadings(root));
  }, [story]);

  // The article's box (page.module.css .articleWrap): the reading head from the header's pen line. The
  // skeleton draws a cover, so it stands at a cover's depth.
  if (isLoading) {
    return (
      <div className={styles.articleWrap} data-head="cover">
        <CardDetailSkeleton />
      </div>
    );
  }

  // The read failed (offline, the server unavailable): that says nothing
  // about the card, so not "not found" — try again (SWR retries on its own too).
  if (data === undefined && error) {
    return (
      <div style={wrapStyle}>
        <LoadError onRetry={() => void readAgain()} />
      </div>
    );
  }

  // Loaded but no visible card (missing, private, or not permitted by rules),
  // or one by someone the viewer blocked.
  if (!data || !data.card || !data.author || gate === 'blocked') {
    return (
      <div style={{ ...wrapStyle, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-text)', marginBottom: 20 }}>
          {t('notFound.title')}
        </p>
        {/* The way on is a button, and every button has a fill: the tonal pill. */}
        <OrganicButton variant="tonal" onClick={() => router.push('/home')}>
          {t('notFound.back')}
        </OrganicButton>
      </div>
    );
  }

  const { card, author } = data;
  const related = lists.related?.cards ?? [];
  const relatedAuthors = lists.related?.authors ?? {};
  const linked = isOwner ? lists.links : undefined;
  const hue = card.accentHue ?? 55;
  const published = publishedDate(card.publishedAt, locale, inBrowser ? undefined : 'UTC');

  const resonances = lists.resonances ?? { cards: [], authors: {} };
  const hasResonance = resonances.cards.length > 0;
  // How the title and story are set (src/styles/story.css), read off both together, the same on the server and here.
  const type = storyType(card.thoughtCore, card.story);
  // Whether the story has a contents list beside it, read off its Markdown: the column is laid out once, in the
  // server's HTML too — centred alone, or beside the rail.
  const contents = storyHasContents(card.story);
  // Only a published, public card can be opened by whoever gets its link; an
  // anonymous one as well (its link names no one). Never by the viewer, a
  // connection or a block: sharing must not tell anyone anything.
  const shareable = !!card.publishedAt && card.visibility === 'public';
  // A 私人卡 (round 9 §1): a card only its author sees — never published, or published and kept private.
  // Its page is its owner's reader of it: the meta line says so, and its pen (where share would be) edits it.
  const privateCard = isOwner && (!card.publishedAt || card.visibility === 'private');

  // The card's share and ⋯: under its title (the byline's end) and again at its story's end (round 8 §10.2).
  const cardActions = (
    <>
      {shareable && !trashed && (
        <ShareMenu
          target={{
            kind: 'card',
            id: card.id,
            slug: card.slug,
            title: card.thoughtCore,
            anonymous: !!card.anonymous,
            handle: card.anonymous ? undefined : author.handle,
          }}
          seed={hue + 5}
          // Its owner, sharing it from their own account, may give away that it is theirs.
          hint={isOwner && card.anonymous ? tShare('anonymousHint') : undefined}
        />
      )}
      {privateCard && !trashed && (
        <BareIconButton
          icon="pen"
          label={tMe('edit')}
          href={`/write/${card.id}`}
          iconSize={22}
          tipAlign="end"
          seed={hue + 7}
        />
      )}
      {isOwner && !trashed && (
        <CardActionsMenu
          card={{
            id: card.id,
            visibility: card.visibility,
            slug: card.slug,
            referenceCardId: card.referenceCardId,
            title: card.thoughtCore,
            published: !!card.publishedAt,
            anonymous: card.anonymous === true,
          }}
          // The card it resonates with heads the resonance list, when the viewer may read it.
          referenceTitle={resonances.cards.find((c) => c.id === card.referenceCardId)?.thoughtCore}
          referenceAnonymous={resonances.cards.find((c) => c.id === card.referenceCardId)?.anonymous}
          seed={hue + 3}
          bare
          // A 私人卡's pen stands beside it: its ⋯ leads with 公開發表 instead of a second 編輯.
          editShown={privateCard && !trashed}
          // Re-read this card so the visibility chip/state reflects the change.
          onChanged={() => void mutate(cardKey(slug, user!.id))}
          // Moved to the trash: the page stays, and shows its banner (the card read again).
          trashFeedback="page"
          onTrashed={() => {
            setTrashedHere(true);
            void mutate(cardKey(slug, user!.id));
          }}
        />
      )}
      {/* Someone else's anonymous card names no author: it can be reported, not its author blocked. */}
      {user && !isOwner && (card.authorId || (card.anonymous && !fromServer)) && (
        <CardSafetyMenu
          card={{ id: card.id, authorId: card.authorId, anonymous: card.anonymous }}
          authorHandle={author.handle}
          seed={hue + 3}
          bare
        />
      )}
    </>
  );
  const held = gate === 'hold';
  return (
    <div
      className={styles.pageContainer}
      // Pending (`unknown`, `hold`): hidden in a signed-in browser until its
      // blocks are known — by the pre-hydration style first, then here.
      {...(held || gate === 'unknown' ? { [CARD_HOLD_ATTR]: '' } : {})}
      style={held ? { visibility: 'hidden' } : undefined}
      aria-busy={held || undefined}
    >
      <ReadingProgress targetRef={storyRef} />
      <div className={styles.articleWrap} data-head={card.media?.url && !trashed ? 'cover' : 'title'}>
        <div className={styles.layout} data-contents={contents || undefined}>
          <article className={styles.article}>
            {trashed && <TrashedCardBanner card={card} focusTitle={trashedHere} />}
            {card.media?.url && (
              <OrganicImage
                src={card.media.url}
                alt={card.media.label ?? card.thoughtCore}
                seed={hue + 11}
                ratio={0.52}
                className={styles.heroImage}
                priority
              />
            )}

            {/* The title has the column to itself; its language is the story's (never the page's around it). */}
            <h1 className={`story-title ${styles.title}`} data-script={type.script} lang={type.lang}>
              {type.script === 'cjk' ? <LatinMarkText text={card.thoughtCore} /> : card.thoughtCore}
            </h1>

            <StoryByline
              ref={setBylineEl}
              className={styles.byline}
              author={author}
              anonymous={card.anonymous}
              minutes={readMinutes(card.story)}
              published={published}
              privateCard={privateCard}
              actions={cardActions}
            />

            <div ref={storyRef} className={styles.story}>
              {/* Signed in, the embedded cards came with the lists; the link previews come with the card. */}
              <CardEmbedSourceContext.Provider value={lists.embeds}>
                <StoryLinkPreviewsContext.Provider value={card.linkPreviews ?? null}>
                  <StoryMarkdown source={card.story} script={type.script} lang={type.lang} />
                </StoryLinkPreviewsContext.Provider>
              </CardEmbedSourceContext.Provider>
            </div>

            {/* The tags; below 1200, when the story is long, the card's share · ⋯ again at their end (round 12 §6):
                the tags wrap in their own column, the two stay at the row's end on the tags' first line. */}
            <div ref={setTagsEl} className={styles.tagsRow}>
              {card.tags.length > 0 && (
                <div className={styles.tagList}>
                  {/* Tags are app furniture, not card content — they stay in the
                      theme color even when the card carries its own accent hue. */}
                  {card.tags.map((tag) => (
                    <TagPill key={tag} color="var(--color-terracotta-light)">
                      {tag}
                    </TagPill>
                  ))}
                </div>
              )}
              {endsApart && wide === false && <div className={styles.tagsActions}>{cardActions}</div>}
            </div>

            {/* The story's end: the response row, the card's share and ⋯ at its end — at ≥ 1200, and only when the
                story is long enough that the byline's are out of view (round 12 §5); its author's alone. */}
            {isOwner ? (
              endsApart && wide === true && <div className={styles.endActions}>{cardActions}</div>
            ) : (
              <ReadAfterArea
                cardId={card.id}
                cardTitle={card.thoughtCore}
                referenceCardId={card.referenceCardId}
                author={{
                  id: author.id,
                  handle: author.handle,
                  initials: author.initials,
                  accentColor: author.accentColor,
                }}
                coreInsight={card.signature?.coreInsight}
                trailing={endsApart && wide === true ? cardActions : undefined}
              />
            )}

            {!trashed && linked && linked.cards.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h3 className={styles.linkedHeading}>{t('linkedCards')}</h3>
                <MiniCardGrid cards={linked.cards} authors={linked.authors} />
              </section>
            )}

          </article>

          {/* The rail holds the story's contents alone (the byline names the author): only a story with headings has one. */}
          {contents && (
            <aside className={styles.aside}>
              <CardToc headings={headings} title={t('toc')} />
            </aside>
          )}
        </div>
      </div>
      {isOwner && <RestoredAloneNotice />}

      {hasResonance && !trashed && (
        <section className={styles.resonanceSection}>
          <div className={styles.sectionEdgeDesktop}>
            <SectionEdge
              topColor="var(--color-cream)"
              seed={41}
              height={90}
              amplitude={0.14}
              steps={14}
              stroke="oklch(55% 0.05 60 / 0.28)"
              strokeWidth={1.2}
            />
          </div>
          <div className={styles.sectionContainer}>
            <ResonanceCards cards={resonances.cards} authors={resonances.authors} />
          </div>
        </section>
      )}

      {related.length > 0 && !trashed && (
        <section className={hasResonance ? styles.relatedSectionSecondary : styles.relatedSectionPrimary}>
          <div className={styles.sectionEdgeDesktop}>
            <SectionEdge
              topColor={hasResonance ? "var(--color-cream-dark)" : "var(--color-cream)"}
              seed={137}
              height={90}
              amplitude={0.14}
              steps={14}
              stroke="oklch(55% 0.05 60 / 0.28)"
              strokeWidth={1.2}
            />
          </div>
          <div className={styles.sectionContainer}>
            <h2 className={styles.relatedHeading}>{t('related')}</h2>
            <CardLinkGrid cards={related} authors={relatedAuthors} />
          </div>
        </section>
      )}
    </div>
  );
}

'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { useToast } from '@/components/providers/ToastProvider';
import { penWave } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { storyLinkWaveVars } from '@/lib/design/storyLinkWave';
import { useLinkWaveInk } from '@/lib/design/useAppearance';
import { useFeed, useRecommendedFeed } from '@/lib/data/hooks';
import type { Card } from '@/lib/db/types';
import styles from './page.module.css';

/** Which stream opened the page — fixed the moment the first cards show. */
type Lead = 'recommended' | 'latest';

const NO_CARDS: Card[] = [];

export default function HomeFeedPage() {
  const t = useTranslations('home');
  const tNav = useTranslations('app.nav');
  const toast = useToast();
  const { data, isLoading, isLoadingMore, hasMore, loadMore } = useFeed();
  const { data: rec, isLoading: recLoading } = useRecommendedFeed();
  const recCards = rec?.cards ?? NO_CARDS;
  const hasRec = recCards.length > 0;
  const latestCards = data?.cards ?? NO_CARDS;

  // One feed, two streams: today's picks head it, then the latest public
  // cards deduped against them. Whichever reaches the reader first shows
  // first (decided once, adjusting state during render, so no frame shows the
  // other order; never back to the skeleton after):
  //  - picks ready by then: picks first (no section header, no page title),
  //    and「載入更多」reveals the latest cards under them;
  //  - otherwise the latest cards, the moment they arrive — and picks that
  //    come in after them go on top at once (no pill to ask for them). A
  //    reader still at the top sees them; one who has scrolled into the feed
  //    keeps what they are looking at where it is, the picks above it — and
  //    the shell's toast says they came (今天的推薦來了 · 往上看), taking them
  //    up there on a tap.
  const [lead, setLead] = useState<Lead | null>(null);
  const nextLead: Lead | null = lead ?? (hasRec ? 'recommended' : latestCards.length > 0 ? 'latest' : null);
  if (nextLead !== lead) setLead(nextLead);

  const [showLatest, setShowLatest] = useState(false);

  const latestVisible = !hasRec || nextLead === 'latest' || showLatest;
  // Made again only when a stream changes (the page renders for its toast,
  // its lead and the reader's session too), so the grid's cards stay as drawn.
  const feedCards = useMemo(() => {
    if (!hasRec) return latestCards;
    if (!latestVisible) return recCards;
    const recIds = new Set(recCards.map((c) => c.id));
    return [...recCards, ...latestCards.filter((c) => !recIds.has(c.id))];
  }, [hasRec, latestVisible, recCards, latestCards]);
  const latestAuthors = data?.authors;
  const recAuthors = rec?.authors;
  const feedAuthors = useMemo(() => ({ ...(latestAuthors ?? {}), ...(recAuthors ?? {}) }), [latestAuthors, recAuthors]);

  // Picks landing over cards already on screen: where the card the reader is
  // looking at stood, taken before the picks go in (read during this render,
  // while the page still shows the old order), and put back after.
  const picksShown = useRef(hasRec);
  const keepInView = useRef<{ id: string; top: number } | null>(null);
  if (hasRec !== picksShown.current) {
    picksShown.current = hasRec;
    if (hasRec && lead === 'latest' && typeof window !== 'undefined') keepInView.current = cardInView();
  }
  // The toast saying the picks came above the reader, while it shows.
  const picksToast = useRef<number | null>(null);
  useLayoutEffect(() => {
    const kept = keepInView.current;
    keepInView.current = null;
    if (!kept) return;
    const el = [...document.querySelectorAll<HTMLElement>('[data-card-grid] [data-card-id]')].find((c) => c.dataset.cardId === kept.id);
    const moved = el ? el.getBoundingClientRect().top - kept.top : 0;
    // A browser that anchors scrolling itself has kept it already (moved is 0).
    if (Math.abs(moved) >= 1) window.scrollBy(0, moved);
    // Out of sight above them: said, with the way up.
    const arrived = t('recommended.arrived');
    const up = t('recommended.arrivedAction');
    picksToast.current = toast.show({
      message: arrived,
      action: {
        label: up,
        ariaLabel: `${arrived} · ${up}`,
        icon: 'arrow-up',
        onAction: () => {
          picksToast.current = null;
          const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRec]);
  // Up at the picks by hand, the toast has said what it had to; leaving the feed, it has nothing to point at.
  useEffect(() => {
    const atTop = () => {
      if (picksToast.current == null || window.scrollY > 4) return;
      toast.dismiss(picksToast.current);
      picksToast.current = null;
    };
    window.addEventListener('scroll', atTop, { passive: true });
    return () => {
      window.removeEventListener('scroll', atTop);
      if (picksToast.current != null) toast.dismiss(picksToast.current);
    };
  }, [toast]);

  // Nothing to show yet: the skeleton, until either stream has cards — or
  // both have answered with none (the empty state).
  const loading = nextLead === null && (isLoading || recLoading);
  const isEmpty = nextLead === null && !loading;

  return (
    <div className={styles.page}>
      {/* No page title: the bar's wordmark says where this is, and the first card sits right under it.
          The heading stays for a screen reader's outline. */}
      <h1 className={styles.srOnly}>{tNav('home')}</h1>

      {loading ? (
        <FeedSkeleton count={6} seamTop />
      ) : isEmpty ? (
        <EmptyState
          icon="pen"
          seed={31}
          titleAs="h2"
          title={t('empty.title')}
          line={t('empty.subtitle')}
          action={
            <Link href="/write" style={{ textDecoration: 'none' }}>
              <OrganicButton variant="primary" size="sm">{t('empty.cta')}</OrganicButton>
            </Link>
          }
        />
      ) : (
        <>
          {/* The recommender's reasons are deliberately not shown — an
              unexplained pick keeps the surprise of opening the card. */}
          {feedCards.length > 0 && <CardLinkGrid cards={feedCards} authors={feedAuthors} seamTop />}

          <footer className={styles.foot}>
            {(!latestVisible || hasMore) ? (
              <FeedMore
                label={t('moreBtn')}
                loading={!!isLoadingMore}
                onClick={() => (latestVisible ? loadMore() : setShowLatest(true))}
              />
            ) : (
              // Nothing more can load: a small end mark and one quiet line, not a heading.
              <FeedEnd label={t('feedEnd')} />
            )}
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * The card the reader is looking at — the first one reaching below the bar —
 * and where it stands; none while the page is at its top (the picks then show
 * where the reader is).
 */
function cardInView(): { id: string; top: number } | null {
  if (window.scrollY <= 4) return null;
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 0;
  for (const el of document.querySelectorAll<HTMLElement>('[data-card-grid] [data-card-id]')) {
    const box = el.getBoundingClientRect();
    if (box.bottom > bar) return { id: el.dataset.cardId!, top: box.top };
  }
  return null;
}

/**
 * The feed's way on: the label alone, in the tonal label's ink with no face of
 * its own — not a form's button. While the next page is on its way the pen
 * loop draws itself before the label (as a button's does); the button keeps
 * its focus, takes no click and says it is busy. The apps' FeedMoreButton.
 */
function FeedMore({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  // The wave the label wears under a pointer: a story link's, in the page's wave ink.
  const wave = storyLinkWaveVars('feed-more', useLinkWaveInk()) as CSSProperties;
  return (
    <button
      type="button"
      className={styles.more}
      onClick={loading ? undefined : onClick}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
    >
      {loading && <ButtonLoader size={15} />}
      <span className={styles.moreLabel} style={wave}>
        {label}
      </span>
    </button>
  );
}

/** The feed's end: a short pen wave with a dot after it, and one quiet line under them. */
function FeedEnd({ label }: { label: string }) {
  const d = useMemo(() => penWave(40, 307, 1.2, 4.5), []);
  return (
    <div className={styles.end}>
      <svg className={styles.endMark} width={49} height={8} viewBox="0 -4 49 8" aria-hidden>
        <path
          d={d}
          fill="none"
          stroke="var(--field-border-hover)"
          strokeOpacity={0.7}
          strokeWidth={INK}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={46.6} cy={0} r={1.6} fill="var(--color-terracotta)" />
      </svg>
      <p className={styles.endLine}>{label}</p>
    </div>
  );
}

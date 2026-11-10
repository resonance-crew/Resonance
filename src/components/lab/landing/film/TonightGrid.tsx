'use client';

/**
 * Tonight's stories, as the landing page lists its cards (CardLinkGrid's layout, its CSS, its column count): the
 * StoryCard each, bands on a phone, a masonry of two or three columns wider, filled row by row. Six recommended
 * stories, best first (the owner, round 4: 「直接顯示現在推薦的…五六篇就好」) — whole rows on two columns and on three;
 * the film's two cards have no place of their own here. The server's list is the one for everyone; a signed-in
 * reader's own picks take its place once they arrive (usePersonalPicks).
 */
import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import grid from '@/components/molecules/CardLinkGrid/CardLinkGrid.module.css';
import { useFeedColumns } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { Link } from '@/i18n/navigation';
import { storyOf } from './FilmCard';
import type { FilmTile } from './model';
import { usePersonalPicks } from './usePersonalPicks';

function Item({ tile, index, locale, isLast }: { tile: FilmTile; index: number; locale: string; isLast: boolean }) {
  return (
    <div className={grid.item} data-card-id={tile.id} style={{ position: 'relative' }}>
      <Link href={tile.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }} data-film-card="tile">
        <StoryCard story={storyOf(tile, locale)} index={index} palette={tile.family} isLast={isLast} />
      </Link>
    </div>
  );
}

export function TonightGrid({ picks, locale }: { picks: FilmTile[]; locale: string }) {
  const cols = useFeedColumns();
  const list = usePersonalPicks(picks);
  const item = (t: FilmTile, i: number) => <Item key={t.id} tile={t} index={i} locale={locale} isLast={i === list.length - 1} />;
  // One column (a phone), and before the columns are known, is the server's grid as it is (CardLinkGrid's own rule)
  if (cols === null || cols === 1) {
    return (
      <div data-card-grid className={grid.grid}>
        {list.map(item)}
      </div>
    );
  }
  return (
    <div data-card-grid className={grid.cols} style={{ '--feed-cols': cols } as React.CSSProperties}>
      {Array.from({ length: cols }, (_, k) => (
        <div key={k} className={grid.col}>
          {list.map((t, i) => (i % cols === k ? item(t, i) : null))}
        </div>
      ))}
    </div>
  );
}

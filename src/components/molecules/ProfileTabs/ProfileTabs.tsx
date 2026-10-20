'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CardActionsMenu } from '@/components/molecules/CardActionsMenu/CardActionsMenu';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { Select } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { Link, useRouter } from '@/i18n/navigation';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { CARD_HUES } from '@/components/molecules/StoryCard/StoryCard';
import { RestoredAloneNotice } from '@/components/molecules/TrashActionsMenu/RestoredAloneNotice';
import type { Card, User } from '@/lib/db/types';
import { TrashShelf } from './TrashShelf';

export type TabKey =
  | 'published'
  | 'private'
  | 'draft'
  | 'resonated'
  | 'linked'
  | 'bookmarks'
  | 'trash'
  | 'thoughtMap';

/** Tabs whose cards belong to the viewer and therefore carry the「⋯」menu. */
const OWNED_TABS: ReadonlySet<TabKey> = new Set(['published', 'private', 'draft']);

export interface ProfileTabsProps {
  tabs: TabKey[];
  data?: Partial<Record<TabKey, Card[]>>;
  authors?: Record<string, User>;
  loading?: boolean;
  /**
   * Card-box mode: the viewer owns the published/private/draft cards, so they
   * get the edit / visibility / delete menu, and draft cards link straight to
   * the editor instead of a detail page.
   */
  manageable?: boolean;
  /**
   * When set, the「thoughtMap」tab is a navigation jump rather than an in-page
   * panel: clicking it routes here (the full-screen map editor) instead of
   * switching the active tab.
   */
  thoughtMapHref?: string;
  /**
   * sessionStorage key remembering the active tab across a leave-and-return
   * (e.g. profile → edit a draft → ✕ back): the viewer lands on the tab they
   * left, not the first one.
   */
  persistKey?: string;
  /**
   * Told the tab on screen: once on mount (after the remembered one is
   * restored, never the first tab before it) and on every change — for a page
   * that reads only the shelf being shown.
   */
  onActiveChange?: (key: TabKey) => void;
}

export function ProfileTabs({
  tabs,
  data = {},
  authors = {},
  loading = false,
  manageable = false,
  thoughtMapHref,
  persistKey,
  onActiveChange,
}: ProfileTabsProps) {
  const [active, setActiveState] = useState<TabKey>(tabs[0]);
  // Whether the remembered tab has been looked for (at once without a key).
  const [restored, setRestored] = useState(!persistKey);
  const t = useTranslations('me');
  const router = useRouter();
  const isMobile = useIsMobile(640);

  // Restore after mount (not in the initializer) so SSR and the first client
  // render agree; write-through on every change.
  useEffect(() => {
    if (!persistKey) return;
    let saved: TabKey | null = null;
    try {
      saved = window.sessionStorage.getItem(persistKey) as TabKey | null;
    } catch {
      // Storage blocked: start on the first tab.
    }
    if (saved && saved !== 'thoughtMap' && tabs.includes(saved)) setActiveState(saved);
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);
  useEffect(() => {
    if (restored) onActiveChange?.(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, restored]);
  const setActive = (key: TabKey) => {
    setActiveState(key);
    if (!persistKey) return;
    try {
      window.sessionStorage.setItem(persistKey, key);
    } catch {
      // Not remembered across a visit — nothing else changes.
    }
  };

  const shown = data[active];
  const list = useMemo(() => shown ?? [], [shown]);
  const managed = manageable && OWNED_TABS.has(active);

  // Focus after a card leaves the shelf on screen (to the trash, restored
  // from it, deleted for good): on to the next card, else the one before it,
  // else the shelf's own control — and onto a card the toast's 復原 brought
  // back. Only when focus went with what left (never into the toast, never
  // away from wherever the viewer has gone since).
  const controls = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState<{ gone: string; next: string | null } | { back: string } | null>(null);
  const leave = (id: string) => {
    const i = list.findIndex((c) => c.id === id);
    setRefocus({ gone: id, next: list[i + 1]?.id ?? list[i - 1]?.id ?? null });
  };
  useEffect(() => {
    if (!refocus) return;
    const waiting = 'gone' in refocus ? list.some((c) => c.id === refocus.gone) : !list.some((c) => c.id === refocus.back);
    if (waiting) return;
    setRefocus(null);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (!lost) return;
    const id = 'gone' in refocus ? refocus.next : refocus.back;
    const target = id
      ? document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"] a`)
      : controls.current?.querySelector<HTMLElement>('[aria-selected="true"], select, button');
    target?.focus();
  }, [list, refocus]);

  // The thought map opens as its own full-screen editor; selecting that tab is
  // a jump, not an in-place panel switch, so the active tab never lands on it.
  const handleChange = (key: TabKey) => {
    if (key === 'thoughtMap' && thoughtMapHref) {
      router.push(thoughtMapHref);
      return;
    }
    setActive(key);
  };

  // The tabs are two different kinds of control: *filters* over the card box
  // (the trash last among them), and the thought map, which is a jump to its
  // own page. On phones a flat strip of them all hid that difference and left
  // the off-screen filters undiscoverable — so there the filters collapse into
  // one dropdown and the thought map sits beside it as its own button.
  const filterKeys = tabs.filter((k) => k !== 'thoughtMap');
  const showThoughtMap = tabs.includes('thoughtMap') && Boolean(thoughtMapHref);

  return (
    <div>
      {/* The shelf's own control: where focus goes when the last card leaves it. */}
      <div ref={controls}>
        {isMobile ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                seed={23}
                value={active}
                onChange={(v) => setActive(v as TabKey)}
                ariaLabel={t('filterLabel')}
              >
                {filterKeys.map((key) => (
                  <option key={key} value={key}>
                    {t(`tabs.${key}`)}
                  </option>
                ))}
              </Select>
            </div>
            {showThoughtMap && (
              <Link href={thoughtMapHref!} style={{ textDecoration: 'none', flexShrink: 0 }}>
                <OrganicButton variant="outline">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="frame" size={16} ariaLabel={t('tabs.thoughtMap')} />
                    {t('tabs.thoughtMap')}
                  </span>
                </OrganicButton>
              </Link>
            )}
          </div>
        ) : (
          <OrganicTabs
            aria-label={t('tabs.published')}
            seed={23}
            tabs={tabs.map((key) => ({ key, label: t(`tabs.${key}`) }))}
            active={active}
            onChange={handleChange}
            className="profile-tabs"
            variant="surface"
            scrollable
          />
        )}
      </div>
      <div style={{ marginBottom: 28 }} />
      {loading ? (
        <FeedSkeleton count={6} />
      ) : active === 'trash' ? (
        <TrashShelf cards={list} authors={authors} onLeft={leave} />
      ) : list.length === 0 ? (
        active === 'bookmarks' ? (
          <EmptyState icon="bookmark" seed={59} line={t('emptyBookmarks')} />
        ) : (
          <EmptyState
            icon="cards"
            seed={53}
            title={t(
              active === 'published'
                ? 'emptyPublished'
                : active === 'private'
                ? 'emptyPrivate'
                : active === 'draft'
                ? 'emptyDraft'
                : active === 'linked'
                ? 'emptyLinked'
                : 'emptyResonated'
            )}
            // The empty card box is the teaching moment (ux §4) — point it at
            // the first story instead of leaving a dead end.
            action={
              manageable && active === 'published' ? (
                <Link href="/write" style={{ textDecoration: 'none' }}>
                  <OrganicButton variant="primary" size="sm">{t('emptyPublishedCta')}</OrganicButton>
                </Link>
              ) : undefined
            }
          />
        )
      ) : active === 'linked' ? (
        <MiniCardGrid cards={list} authors={authors} />
      ) : (
        <CardLinkGrid
          cards={list}
          authors={authors}
          // An anonymous card wears the anonymous byline here too, exactly as
          // everyone sees it — the owner's ⋯ is what marks it as theirs.
          // A draft has no public page yet — clicking it resumes writing.
          cardHref={managed && active === 'draft' ? (c) => `/write/${c.id}` : undefined}
          renderActions={
            managed
              ? (c, _i, palette) => {
                  // Match the family the card wears (the list's choice).
                  const cardHue = CARD_HUES[palette];
                  return (
                    <CardActionsMenu
                      card={{
                        id: c.id,
                        visibility: c.visibility,
                        slug: c.slug,
                        referenceCardId: c.referenceCardId,
                        title: c.thoughtCore,
                        published: !!c.publishedAt,
                        anonymous: c.anonymous === true,
                      }}
                      seed={cardHue}
                      hue={cardHue}
                      onTrashed={leave}
                      onRestored={(r) => setRefocus({ back: r.id })}
                    />
                  );
                }
              : undefined
          }
        />
      )}
      {/* A resonance the toast's 復原 (or the trash's 還原) brought back on its own says so here. */}
      {manageable && <RestoredAloneNotice />}
    </div>
  );
}


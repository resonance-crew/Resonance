'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import { cardKey } from '@/lib/data/cardPrefill';
import { useMyProfile } from '@/lib/data/hooks';
import type { Card, CardMedia, LinkPreview, Locale, Visibility } from '@/lib/db/types';

/** What the writer holds of the card it has just published or kept (CardEditor's values). */
export interface OwnCardWritten {
  id: string;
  /** Its URL segment as the publish answered it (null: it lives at its id). */
  slug?: string | null;
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  anonymous: boolean;
  media?: CardMedia;
  accentHue: number | null;
  originalLocale: Locale;
  referenceCardId?: string | null;
  linkPreviews?: LinkPreview[];
  /** Published now (the publish answered), or kept unpublished (a 私人卡 never shared). */
  published: boolean;
}

/**
 * Seeds the card page's cache with the card its author has just published or kept (round 32 §P6): the page's
 * server render carries public cards only, so a 連結的人, 匿名公開 or 私人卡 card opened on a skeleton until the
 * browser's own `GET /api/v1/cards/{key}` answered. With this the page draws the writer's own words at once, and
 * its own read (SWR revalidates on mount) replaces them quietly.
 *
 * Only ever the signed-in author's own card, under their own key (`cardKey(…, uid)`), in their own browser, with
 * their own profile as its byline — what that read answers its author for their anonymous card too (they are its
 * author: hooks' fetchCardView). Nothing here reaches anyone else, so it tells no one who wrote an anonymous card.
 */
export function usePrefillOwnCard(): (written: OwnCardWritten) => void {
  const { user, loading } = useAuth();
  const { data: me } = useMyProfile();
  const { mutate } = useSWRConfig();
  const uid = user?.id;
  return useCallback(
    (w) => {
      // The author's own profile, read for their own account, or nothing: never someone else's byline.
      if (loading || !uid || !me || me.id !== uid) return;
      const card: Card = {
        id: w.id,
        authorId: uid,
        ...(w.slug ? { slug: w.slug } : {}),
        thoughtCore: w.thoughtCore,
        story: w.story,
        tags: w.tags,
        ...(w.media ? { media: w.media } : {}),
        originalLocale: w.originalLocale,
        translations: {},
        visibility: w.visibility,
        ...(w.referenceCardId ? { referenceCardId: w.referenceCardId } : {}),
        publishedAt: w.published ? new Date() : null,
        readCount: 0,
        resonanceCount: 0,
        inviteCount: 0,
        ...(w.accentHue != null ? { accentHue: w.accentHue } : {}),
        anonymous: w.anonymous,
        ...(w.linkPreviews ? { linkPreviews: w.linkPreviews } : {}),
      };
      // Laid over whatever the cache held for that key (an older read of this draft): the writer's words are newer.
      void mutate(cardKey(w.slug ?? w.id, uid), { card, author: me }, { revalidate: false });
    },
    [loading, me, mutate, uid],
  );
}

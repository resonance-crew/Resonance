'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { isBookmarked, toggleBookmark } from '@/lib/db/firestore/client/bookmarks';

/**
 * 收藏, a signed-in reader's (round 26 §U1.2): a glyph alone, filled while saved, flipped at once; saving says
 * 「收藏到卡片盒了」. It leads the card's passive actions wherever the page stands them at a story's end — the end of
 * the capsule's row, or of the tags' row on a phone — and both places read one answer (the SWR key), so the page
 * may move it between them without asking again. Nothing for someone signed out.
 */
export function CardBookmark({ cardId }: { cardId: string }) {
  const t = useTranslations('card');
  const toast = useToast();
  const { user } = useAuth();
  const { data: saved, mutate } = useSWR(user ? `bookmark:${cardId}:${user.id}` : null, () => isBookmarked(cardId));

  const onSave = useCallback(() => {
    if (!user) return;
    const saving = !saved;
    void mutate(async () => toggleBookmark(cardId, saving), { optimisticData: saving, revalidate: false }).catch(() => {});
    if (saving) toast.show({ message: t('saved') });
  }, [user, saved, mutate, cardId, toast, t]);

  if (!user) return null;
  return (
    <BareIconButton
      icon="bookmark"
      label={saved ? t('bookmark.remove') : t('bookmark.add')}
      pressed={!!saved}
      onClick={onSave}
      iconSize={20}
      tipAlign="end"
      seed={67}
    />
  );
}

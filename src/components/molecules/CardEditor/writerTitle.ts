import type { Card } from '@/lib/db/types';

/**
 * The writer's title for a card it opens (round 8 §1.3): 編輯卡片 for one
 * readers have, 編輯草稿 for a 草稿 — never published, or published and kept
 * private, which is a draft to its author.
 */
export function editTitleKey(card: Pick<Card, 'publishedAt' | 'visibility'>): 'editPublishedTitle' | 'editTitle' {
  return card.publishedAt && card.visibility !== 'private' ? 'editPublishedTitle' : 'editTitle';
}

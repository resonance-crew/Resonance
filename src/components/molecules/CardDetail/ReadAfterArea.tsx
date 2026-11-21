'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CardViewerActions } from './CardViewerActions';
import { useAuth } from '@/components/providers/AuthProvider';
import type { CardTapBody } from '@/lib/api/v1/schemas';

export interface ReadAfterAreaProps {
  cardId: string;
  cardTitle: string;
  /** The card this one replies to, if any (the picker never offers it). */
  referenceCardId?: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
  /** The resonance tap as the server answers this reader (`CardDetail.tap`). */
  tap?: CardTapBody | null;
  /** What ends the second line, aligned right: the card's share and ⋯ after a long story at ≥ 1200 (round 8 §10.2). */
  trailing?: ReactNode;
  /** The story is on screen in translation: the passages' dialog is not offered (round 27 §U1.1). */
  translated?: boolean;
}

/**
 * The「讀後區」— everything a reader can do after finishing a story (round 26 §U1): the three answers in one capsule
 * (共振, 寄小紙條, 用卡片回應), the faces and 收藏 under it, and the note written in place under those — never a
 * dialog over the story (SETTLED, the owner's: 「不要做成 pop ups，因為它會擋住這個畫面上其他東西」). It fades in only
 * when scrolled to, so reading itself carries no pressure. The paper puppets stand on the capsule alone (its
 * `role="group"`, lib/mascots/reading): the second line and the note never move their ground.
 */
export function ReadAfterArea({ cardId, cardTitle, referenceCardId, author, tap, trailing, translated }: ReadAfterAreaProps) {
  const { user, loading } = useAuth();

  // Fade in on first viewport entry (IntersectionObserver; shows immediately
  // where the API is unavailable, e.g. jsdom).
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (loading) return null;
  // The author sees their own line instead (AuthorTaps): resonating with, writing to, or saving yourself mean nothing.
  if (user && user.id === author.id) return null;

  return (
    <div
      ref={ref}
      data-mascot="respond"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      {/* Keyed by the account: one signed in from another tab gets its own end row — never the last one's unsent
          note, its open field or its picker (the note's words leave with the account, lib/auth signOut). */}
      <CardViewerActions
        key={user?.id ?? ''}
        cardId={cardId}
        cardTitle={cardTitle}
        referenceCardId={referenceCardId}
        author={author}
        tap={tap}
        trailing={trailing}
        translated={translated}
      />
    </div>
  );
}

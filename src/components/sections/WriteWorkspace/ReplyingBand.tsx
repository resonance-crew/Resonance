'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { useCard } from '@/lib/data/hooks';
import { cardVar, previewPalette } from '@/lib/design/cardColours';
import { seedFromString } from '@/lib/design/prng';
import { wobRect } from '@/lib/design/wobRect';
import { OriginalCardPanel } from './LazyOriginalCardPanel';
import styles from './ReplyingBand.module.css';

const THUMB = 36;

/** The original's cover at 36 in a small hand-drawn tile with no pen line (the bell's thumbnail, smaller). */
function OriginalThumb({ id, cover, hue, title }: { id: string; cover?: string; hue: number | null; title: string }) {
  const clip = useMemo(() => {
    const d = wobRect(THUMB, THUMB, THUMB * 0.26, seedFromString(id) % 97, THUMB * 0.05, {
      segmentsH: 2,
      segmentsV: 2,
      curve: 1.4,
      cornerJitter: 2.6,
      cornerOffset: THUMB * 0.07,
    });
    return `path('${d}')`;
  }, [id]);
  const family = previewPalette(hue, id);
  return (
    <span
      className={styles.thumb}
      // The card's own colours, as the variables its thumbnail is drawn with.
      style={{ clipPath: clip, '--thumb-paper': cardVar(cover ? 'skeleton' : 'fill', family), '--thumb-word': cardVar('border-deep', family) } as CSSProperties}
      aria-hidden
    >
      <span className={styles.thumbFace}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.thumbWord}>
            {Array.from(title.trim())[0] ?? ''}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * What a reply is answering, below the split (round 26 §U6): there the writer shows nothing of the story being
 * answered (at the split the original stands beside it), so a 44 band above the title holds the original's cover at
 * 36 and 「回應〈一場雨後的散步〉」; tapping it opens the original in a centred dialog — the writing stays under it.
 * Its room is kept while the original is read (the title doesn't drop under someone typing); an original that can't
 * be read — deleted, trashed, hidden by a block, or the read failing — or that has no title leaves no band at all,
 * as on iOS and Android.
 */
export function ReplyingBand({ cardId }: { cardId: string }) {
  const t = useTranslations('card');
  const tWrite = useTranslations('write');
  const { data, error } = useCard(cardId);
  const [open, setOpen] = useState(false);
  const card = data?.card;
  if (!card) return data === undefined && !error ? <div className={styles.band} aria-hidden data-pending="" /> : null;
  if (!card.thoughtCore.trim()) return null;
  const label = t('replying', { title: card.thoughtCore });
  return (
    <>
      <button type="button" className={styles.band} onClick={() => setOpen(true)} aria-haspopup="dialog" data-replying-band="">
        <OriginalThumb id={card.id} cover={card.media?.type === 'image' ? card.media.url : undefined} hue={card.accentHue ?? null} title={card.thoughtCore} />
        <span className={styles.words}>{label}</span>
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} maxWidth={600} seed={61} ariaLabel={tWrite('referenceCard')} closeButton>
          <div className={styles.original}>
            <OriginalCardPanel cardId={cardId} />
          </div>
        </Modal>
      )}
    </>
  );
}

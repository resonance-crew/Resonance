'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import type { GenerateImageEvent } from '@/app/api/generate-image/route';
import type { CardMedia } from '@/lib/db/types';
import { CARD_BORDERS, CARD_FILLS } from '@/lib/design/cardColours';
import { CARD_HUES } from '@/lib/design/dominantHue';
import { extractAccentHue } from '@/lib/images/accentHue';
import { UnsupportedImage, uploadImageFile } from '@/lib/images/upload';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { ndjsonValues } from '@/lib/streams/ndjson';
import styles from './PublishStep.module.css';

export interface CoverEditor {
  media?: CardMedia;
  uploading: boolean;
  generating: boolean;
  /** The model's in-progress pass (a data URL), shown as the cover while it paints. */
  partial: string | null;
  error: string | null;
  dragOver: boolean;
  /** Whether there is a story to draw from. */
  canGenerate: boolean;
  setDragOver: (over: boolean) => void;
  upload: (file: File) => void;
  generate: () => void;
  remove: () => void;
  /** Opens the file picker. */
  pick: () => void;
  /** The hidden file input the picker is (rendered once, by CoverFrame). */
  input: ReactNode;
}

/**
 * The card's cover, edited where it is seen: uploading a picture (its hue
 * read from the file), drawing one from the story (/api/generate-image's
 * NDJSON stream: rough passes, then the stored picture), taking it away. The
 * picture and its hue are the editor's values (`onChange`); what is on its way
 * is the step's.
 */
export function useCoverEditor({
  media,
  story,
  onChange,
}: {
  media?: CardMedia;
  story: string;
  onChange: (media: CardMedia | undefined, accentHue: number | null) => void;
}): CoverEditor {
  const t = useTranslations('write');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [partial, setPartial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || generating;
  const canGenerate = story.trim().length > 0;

  async function upload(file: File) {
    if (busy) return;
    setError(null);
    setUploading(true);
    try {
      const { publicUrl } = await uploadImageFile(file);
      // Read the hue from the local file — no extra fetch, no CORS involved.
      onChange({ type: 'image', url: publicUrl, label: file.name }, await extractAccentHue(file));
    } catch (e) {
      setError(t(e instanceof UnsupportedImage ? 'mediaUnsupported' : 'mediaUploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (busy || !canGenerate) return;
    setError(null);
    setGenerating(true);
    setPartial(null);
    try {
      // The story body lives only in editor state here (the draft may be
      // unsaved), so send it to the server, which distills it into an imagery
      // prompt, renders the doodle, stores it in R2, and returns the URL. The
      // response is an NDJSON stream: in-progress previews arrive as `partial`
      // events while the model paints, then `done` carries the stored URL.
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      if (!res.ok || !res.body) {
        setError(t('mediaGenerateError'));
        return;
      }
      let finalUrl: string | null = null;
      for await (const event of ndjsonValues<GenerateImageEvent>(res.body)) {
        if (event.type === 'partial') setPartial(`data:image/png;base64,${event.b64}`);
        else if (event.type === 'done') finalUrl = event.publicUrl;
        else if (event.type === 'error') {
          setError(t('mediaGenerateError'));
          return;
        }
      }
      if (!finalUrl) {
        setError(t('mediaGenerateError'));
        return;
      }
      onChange({ type: 'image', url: finalUrl, label: t('mediaGeneratedLabel') }, await extractAccentHue(finalUrl));
    } catch {
      setError(t('mediaGenerateError'));
    } finally {
      setGenerating(false);
      setPartial(null);
    }
  }

  return {
    media,
    uploading,
    generating,
    partial,
    error,
    dragOver,
    canGenerate,
    setDragOver,
    upload: (file) => void upload(file),
    generate: () => void generate(),
    remove: () => {
      setError(null);
      onChange(undefined, null);
    },
    pick: () => inputRef.current?.click(),
    input: (
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
          e.currentTarget.value = '';
        }}
      />
    ),
  };
}

/**
 * What lies in the preview's picture: with no cover the two ways to one
 * (加一張圖片 · 生成圖片, the second waiting for a story), a dashed frame while
 * a file is dragged over (dropped, it uploads), the pen's loader while one is
 * on its way — over the model's blurred, washed rough pass while it paints —
 * and once there is one, one chip on it that says so (更換封面), whose menu
 * holds everything a cover can become: another picture, one drawn from the
 * story, none. The picture is where it is changed — no second control for it
 * under the preview — and where it is said that it couldn't be (round 8 §3):
 * under the two pills while there is no cover, on a paper chip at the
 * picture's top-left over one that stays; the next try takes it away.
 */
export function CoverFrame({ cover, palette = 0 }: { cover: CoverEditor; palette?: number }) {
  const t = useTranslations('write');
  const { media, uploading, generating, partial, dragOver, canGenerate } = cover;
  const colors = coverColors(palette);
  const busy = uploading || generating;
  const menu: OrganicMenuItem[] = [
    { key: 'replace', icon: 'image', label: t('mediaReplace') },
    ...(canGenerate ? [{ key: 'generate', icon: 'sparkle' as const, label: t('mediaGenerate') }] : []),
    { key: 'remove', icon: 'trash', label: t('mediaRemove'), danger: true },
  ];
  return (
    <div
      className={styles.cover}
      data-busy={busy || undefined}
      onDragOver={(e) => {
        if (busy) return;
        e.preventDefault();
        cover.setDragOver(true);
      }}
      onDragLeave={() => cover.setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        cover.setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) cover.upload(file);
      }}
    >
      {cover.input}
      {busy ? (
        <span className={styles.coverBusy} data-partial={(generating && partial != null) || undefined}>
          <SketchLoader size={64} seed={31} ariaLabel={generating ? t('mediaGenerating') : t('mediaUploading')} />
          <span className={styles.coverBusyText}>{generating ? t('mediaGenerating') : t('mediaUploading')}</span>
        </span>
      ) : media ? (
        <>
          {cover.error && <CoverErrorChip message={cover.error} />}
          <span className={styles.coverMenu}>
          <OrganicMenu
            items={menu}
            label={t('coverChange')}
            triggerLabel={t('coverChange')}
            triggerIcon="image"
            triggerSize={34}
            triggerColors={colors.chip}
            hue={colors.hue}
            seed={41}
            floating
            onChoose={(key) => {
              if (key === 'replace') cover.pick();
              else if (key === 'generate') cover.generate();
              else if (key === 'remove') cover.remove();
            }}
          />
          </span>
        </>
      ) : (
        <span className={styles.coverEmpty}>
          <span className={styles.coverPills}>
            <OrganicButton variant="solid" size="sm" className={styles.coverPill} style={colors.pill} onClick={cover.pick}>
              <span className={styles.pillIcon}>
                <Icon name="image" size={16} />
              </span>
              {t('mediaPlaceholder')}
            </OrganicButton>
            <OrganicButton
              variant="solid"
              size="sm"
              className={styles.coverPill}
              style={canGenerate ? colors.pill : colors.pillResting}
              disabled={!canGenerate}
              onClick={cover.generate}
            >
              <span className={styles.pillIcon}>
                <Icon name="sparkle" size={16} />
              </span>
              {t('mediaGenerate')}
            </OrganicButton>
          </span>
          {cover.error ? (
            <span className={styles.coverFailed} role="alert">
              {cover.error}
            </span>
          ) : (
            !canGenerate && <span className={styles.coverNeed}>{t('mediaGenerateNeedStory')}</span>
          )}
        </span>
      )}
      {dragOver && !busy && (
        <HandDrawnDashedSurface
          seed={31}
          R={16}
          state="focus"
          className={styles.coverDrop}
          // Laid over the frame (the surface is position: relative of its own).
          style={{ position: 'absolute', inset: 8 }}
        >
          <span />
        </HandDrawnDashedSurface>
      )}
    </div>
  );
}

/**
 * The cover's controls in the card's own colours (round 9 §8), from its family
 * (the preview's: its cover's, else its id's): 加一張圖片 / 生成圖片 on the
 * striped placeholder are the family's deep pen with its paper for words (the
 * solid's black wash under a pointer); 生成圖片 waiting for a story, the
 * family's tonal step with muted words — never faded. 更換封面 over a picture
 * is the family's fill, opaque, with its pen line and its deep pen for words;
 * its menu takes the family's hue.
 */
export function coverColors(palette: number) {
  const hue = CARD_HUES[palette] ?? CARD_HUES[0];
  const [pen, deep] = CARD_BORDERS[palette] ?? CARD_BORDERS[0];
  const paper = `oklch(97.5% 0.012 ${hue})`;
  return {
    hue,
    pill: { fillColor: deep, color: paper },
    pillResting: { fillColor: `oklch(90% 0.06 ${hue})`, color: `oklch(50% 0.04 ${hue})` },
    chip: { fill: CARD_FILLS[palette] ?? CARD_FILLS[0], pen, ink: deep },
  };
}

/** Why the last try at a cover didn't work, over the cover that stays: the 更換封面 chip's paper, in the error's ink. */
function CoverErrorChip({ message }: { message: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref, 0, 0, [message]);
  return (
    <span ref={ref} className={styles.coverErrorChip} role="alert">
      <HandDrawnBorder
        w={w}
        h={h}
        R={Math.min(h * 0.42, 16)}
        seed={43}
        mag={Math.min(h, 34) * 0.03}
        fillColor="color-mix(in oklch, var(--color-cream) 94%, transparent)"
        segmentsH={2}
        segmentsV={1}
        curve={1.4}
        cornerJitter={2.4}
      />
      <span className={styles.coverErrorText}>{message}</span>
    </span>
  );
}
